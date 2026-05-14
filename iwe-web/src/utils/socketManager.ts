import { IMService } from './websocket';
import { useChatStore } from '@/store/chat';
import { useAccountStore } from '@/store/account';
import { messageApi } from '@/api/modules/im';
import { MessageParser } from '@/utils/parser';

class GlobalSocketManager {
  private connections: Map<string, IMService> = new Map();
  private pollingTimers: Map<string, any> = new Map();

  public async registerAccount(uuid: string, key: string, currentWxid: string) {
    if (!uuid) return;
    
    const existing = this.connections.get(uuid);
    if (existing && existing.isConnected) {
      console.log(`[SocketManager] 账号 ${uuid} 已存在活跃连接`);
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
      console.log(`[SocketManager:${uuid}] 正在同步 Redis 极速快照...`);
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
        console.log(`[SocketManager:${uuid}] 从 Redis 恢复了 ${msgList.length} 条最近消息`);
        msgList.forEach((m: any) => this.handleMessage(uuid, m, currentWxid));
      } else {
        console.log(`[SocketManager:${uuid}] Redis 中没有最近消息记录`);
      }
    } catch (e) {
      console.warn(`[SocketManager:${uuid}] Redis 快照同步跳过或失败:`, e);
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
            console.log(`[Polling:${uuid}] 拉取到 ${msgList.length} 条新消息`);
            msgList.forEach((m: any) => this.handleMessage(uuid, m, currentWxid));
          }
        }
      } catch (e) {
        console.error(`[Polling:${uuid}] 轮询出错:`, e);
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
        console.log(`[Socket:${uuid}] 收到联系人同步，更新内存镜像`);
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
    if (parsedMsg.type === 'status_notify' || !parsedMsg.content && parsedMsg.type === 'unsupported') {
      return;
    }

    console.log(`[Socket:${uuid}] 转发有效消息到 Store: ${msgId}, 类型: ${parsedMsg.type}`);
    chatStore.addParsedMessage(uuid, parsedMsg).catch(err => {
      console.error(`[Socket:${uuid}] 存储消息时发生异常:`, err);
    });
  }

  private async syncHistory(uuid: string, key: string, currentWxid: string) {
    try {
      console.log(`[SocketManager:${uuid}] 正在同步历史消息...`);
      
      // 1. 调用补录历史消息接口 (NewSyncHistoryMessage)
      const historyRes: any = await messageApi.syncHistoryMsg(key);
      const historyList = this.extractMsgList(historyRes);
      if (historyList.length > 0) {
        console.log(`[SocketManager:${uuid}] 补录到 ${historyList.length} 条历史消息`);
        historyList.forEach((m: any) => this.handleMessage(uuid, m, currentWxid));
      }

      // 2. 调用增量同步消息接口 (HttpSyncMsg)
      const res: any = await messageApi.syncMsg(key, 0);
      const msgList = this.extractMsgList(res);
      if (msgList.length > 0) {
        console.log(`[SocketManager:${uuid}] 同步到 ${msgList.length} 条增量消息`);
        msgList.forEach((m: any) => this.handleMessage(uuid, m, currentWxid));
      }
    } catch (e) {
      console.error(`[SocketManager:${uuid}] 历史同步失败:`, e);
    }
  }

  private extractMsgList(res: any): any[] {
    if (!res) return [];
    if (Array.isArray(res)) return res;
    
    // 兼容 Data 结构
    const data = res.Data || res.data || res;
    if (Array.isArray(data)) return data;
    
    // 兼容多种列表键名
    return data.AddMsgList || data.addMsgList || data.List || data.list || [];
  }
}

export const socketManager = new GlobalSocketManager();
