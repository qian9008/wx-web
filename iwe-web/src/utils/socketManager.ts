import { IMService } from './websocket';
import { useChatStore } from '@/store/chat';
import { useAccountStore } from '@/store/account';
import { messageApi } from '@/api/modules/im';
import { MessageParser } from '@/utils/parser';

const isDebug = (module: 'socket' | 'request' | 'cache') => {
  const configStr = localStorage.getItem('debug_config');
  if (!configStr) return false;
  try {
    const config = JSON.parse(configStr);
    return config.all || config[module];
  } catch (e) {
    return false;
  }
};

class GlobalSocketManager {
  private connections: Map<string, IMService> = new Map();
  private pollingTimers: Map<string, any> = new Map();

  public async registerAccount(uuid: string, key: string, currentWxid: string) {
    if (!uuid) return;
    
    const existing = this.connections.get(uuid);
    if (existing && existing.isConnected) {
      if (isDebug('socket')) console.log(`[SocketManager] 账号 ${uuid} 已存在活跃连接`);
      return;
    }

    // 正在连接中也跳过，防止 watch 快速连击
    if (existing && (existing as any).isConnecting) {
      return;
    }

    if (existing) {
      existing.close();
    }

    const accountStore = useAccountStore();
    
    // 鲁棒的 URL 转换
    let wsBaseUrl = accountStore.baseUrl;
    if (wsBaseUrl.startsWith('http')) {
      wsBaseUrl = wsBaseUrl.replace('http', 'ws');
    } else {
      wsBaseUrl = `ws://${wsBaseUrl}`;
    }
    
    // 获取真实的微信号，如果还没同步到就先用 uuid 兜底
    const realWxid = accountStore.accounts.find(a => a.uuid === uuid)?.nickname || uuid;

    const service = new IMService(
      uuid,
      `${wsBaseUrl}/ws/GetSyncMsg`,
      (msg) => this.handleMessage(uuid, msg, uuid) // 这里必须传 uuid，作为 Pinia 的第一级索引
    );

    service.connect(key);
    this.connections.set(uuid, service);
    
    // 初始化同步 (不再阻塞主流程，采用并行静默同步策略)
    this.syncHistory(uuid, key, uuid);
    this.syncRedisMsg(uuid, key, uuid);

    // 开启低频 HTTP 轮询补位
    this.startPolling(uuid, key, uuid);
  }

  private async syncRedisMsg(uuid: string, key: string, currentWxid: string) {
    try {
      if (isDebug('socket')) console.log(`[SocketManager:${uuid}] 正在同步 Redis 极速快照...`);
      const res: any = await messageApi.getRedisSyncMsg(key);
      
      // 特殊处理：如果是字符串，尝试解析 JSON (Redis返回的可能是 JSON 字符串)
      let dataToExtract = res;
      if (typeof res === 'string') {
        try {
          dataToExtract = JSON.parse(res);
        } catch (e) {
          // ignore
        }
      }
      
      const msgList = this.extractMsgList(dataToExtract);
      if (msgList.length > 0) {
        if (isDebug('socket')) console.log(`[SocketManager:${uuid}] 从 Redis 恢复了 ${msgList.length} 条最近消息`);
        msgList.forEach((m: any) => this.handleMessage(uuid, m, currentWxid));
      } else {
        if (isDebug('socket')) console.log(`[SocketManager:${uuid}] Redis 中没有最近消息记录`);
      }
    } catch (e) {
      if (isDebug('socket')) console.warn(`[SocketManager:${uuid}] Redis 快照同步跳过或失败:`, e);
    }
  }

  private startPolling(uuid: string, key: string, currentWxid: string) {
    if (this.pollingTimers.has(uuid)) return;

    const poll = async () => {
      try {
        const service = this.connections.get(uuid);
        if (service?.isConnected) {
          // WS 正常连接时跳过轮询
        } else {
          const res: any = await messageApi.syncMsg(key, 0);
          const msgList = this.extractMsgList(res);
          if (msgList.length > 0) {
            if (isDebug('socket')) console.log(`[Polling:${uuid}] 拉取到 ${msgList.length} 条新消息`);
            msgList.forEach((m: any) => this.handleMessage(uuid, m, currentWxid));
          }
        }
      } catch (e) {
        if (isDebug('socket')) console.error(`[Polling:${uuid}] 轮询出错:`, e);
      }
      this.pollingTimers.set(uuid, setTimeout(poll, 30000));
    };

    poll();
  }

  public stopAccount(uuid: string) {
    if (this.pollingTimers.has(uuid)) {
      clearTimeout(this.pollingTimers.get(uuid));
      this.pollingTimers.delete(uuid);
    }
    const conn = this.connections.get(uuid);
    if (conn) {
      conn.close();
      this.connections.delete(uuid);
    }
  }

  private handleMessage(uuid: string, msg: any, currentWxid: string) {
    const chatStore = useChatStore();
    const accountStore = useAccountStore();
    const msgId = msg.NewMsgId || msg.MsgId || msg.msg_id || msg.new_msg_id || msg.UUID;
    
    const rawType = Number(msg.Type || msg.MsgType || msg.msg_type || 0);
    
    // 1. 拦截并处理联系人同步消息 (Type 10001)
    if (rawType === 10001) {
      if (msg.ModContacts) {
        if (isDebug('socket')) console.log(`[Socket:${uuid}] 收到联系人同步，更新内存镜像`);
        msg.ModContacts.forEach((contact: any) => {
          const wxid = contact.userName?.str || contact.UserName?.str || contact.wxid || contact.userName;
          if (wxid) accountStore.updateContact(wxid, contact);
        });
      }
      return; // 协议消息，不进入聊天流
    }

    if (msgId && chatStore.msgIdSet.has(String(msgId))) return;
    
    const parsedMsg = MessageParser.parse(msg, uuid); // 强制使用 uuid (即 qian9008) 作为 myWxid 传入解析器
    
    // 2. 拦截状态通知和其他非显示类消息
    // 注意：放宽过滤条件，对于 unsupported 类型的消息，只要有 content 就放行显示
    if (parsedMsg.type === 'status_notify' || (!parsedMsg.content && parsedMsg.type === 'unsupported')) {
      return;
    }

    if (isDebug('socket')) console.log(`[Socket:${uuid}] 转发有效消息到 Store: ${msgId}, 类型: ${parsedMsg.type}${parsedMsg.type === 'unsupported' ? ` (MsgType: ${rawType})` : ''}`);
    chatStore.addParsedMessage(uuid, parsedMsg).catch(err => {
      if (isDebug('socket')) console.error(`[Socket:${uuid}] 存储消息时发生异常:`, err);
    });
  }

  private async syncHistory(uuid: string, key: string, currentWxid: string) {
    try {
      if (isDebug('socket')) console.log(`[SocketManager:${uuid}] 正在通过 syncHistory 尝试补全新消息...`);
      
      // 1. 调用补录历史消息接口 (NewSyncHistoryMessage)
      const historyRes: any = await messageApi.syncHistoryMsg(key);
      const historyList = this.extractMsgList(historyRes);
      
      if (historyList.length > 0) {
        if (isDebug('socket')) console.log(`[SocketManager:${uuid}] syncHistory 补全了 ${historyList.length} 条消息`);
        historyList.forEach((m: any) => this.handleMessage(uuid, m, currentWxid));
      } else {
        if (isDebug('socket')) console.log(`[SocketManager:${uuid}] syncHistory 未拉取到更多新消息`);
      }
    } catch (e) {
      if (isDebug('socket')) console.warn(`[SocketManager:${uuid}] syncHistory 失败:`, e);
    }
  }

  private extractMsgList(data: any): any[] {
    if (!data) return [];
    
    // 微信协议中常见的几个消息容器
    // 根据你的日志反馈，响应中包含 'List'，这可能就是消息列表
    let list = data.AddMsgs || data.add_msgs || data.List || data.list || data.ModMsgs || data.mod_msgs;
    
    // 深度搜索逻辑：如果外层没有，尝试找 Data 内部
    if (!list && data.Data && typeof data.Data === 'object') {
      list = data.Data.AddMsgs || data.Data.List || data.Data.list || data.Data.add_msgs;
    }

    if (Array.isArray(list)) {
      if (list.length > 0) {
        if (isDebug('socket')) console.log(`[Debug:Redis] 成功提取到 ${list.length} 条原始消息记录`);
      }
      return list;
    }
    
    return [];
  }
}

export const socketManager = new GlobalSocketManager();
