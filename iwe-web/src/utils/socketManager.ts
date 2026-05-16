import { IMService } from './websocket';
import { useChatStore } from '@/store/chat';
import { useAccountStore } from '@/store/account';
import { messageApi } from '@/api/modules/im';
import { MessageParser } from '@/utils/parser';
import { isDebug } from '@/utils/debug';

class GlobalSocketManager {
  private connections: Map<string, IMService> = new Map();
  private pollingTimers: Map<string, any> = new Map();

  public async registerAccount(userName: string, key: string) {
    if (!userName) return;

    const accountStore = useAccountStore();
    const realWxid = userName;

    const existing = this.connections.get(realWxid);
    if (existing && existing.isConnected) {
      if (isDebug('socket')) console.log(`[SocketManager] 账号 ${realWxid} 已存在活跃连接，跳过`);
      return;
    }

    // 正在连接中也跳过，防止 watch 快速连击
    if (existing && (existing as any).isConnecting) {
      return;
    }

    if (existing) {
      existing.close();
    }

    // 鲁棒的 URL 转换
    let wsBaseUrl = accountStore.baseUrl;
    if (wsBaseUrl.startsWith('http')) {
      wsBaseUrl = wsBaseUrl.replace('http', 'ws');
    } else {
      wsBaseUrl = `ws://${wsBaseUrl}`;
    }

    const service = new IMService(
      realWxid,
      `${wsBaseUrl}/ws/GetSyncMsg`,
      (msg) => this.handleMessage(realWxid, msg),
      // Fix #7: WS 断开时立即发起一次轮询补位，不等待下一个 30s 周期
      () => this.pollOnce(realWxid, key)
    );

    service.connect(key);
    this.connections.set(realWxid, service);

    // 初始化历史同步
    this.syncHistory(realWxid, key);

    // 开启低频 HTTP 轮询补位（WS 正常时自动跳过）
    this.startPolling(realWxid, key);
  }

  // Fix #7: 单次即时轮询（WS 断开时触发）
  private async pollOnce(uuid: string, key: string) {
    try {
      if (isDebug('socket')) console.log(`[SocketManager:${uuid}] WS 断开，立即发起一次补位轮询`);
      const res: any = await messageApi.syncMsg(key, 0);
      const msgList = this.extractMsgList(res);
      if (msgList.length > 0) {
        if (isDebug('socket')) console.log(`[PollOnce:${uuid}] 补位拉取到 ${msgList.length} 条新消息`);
        msgList.forEach((m: any) => this.handleMessage(uuid, m));
      }
    } catch (e) {
      if (isDebug('socket')) console.warn(`[PollOnce:${uuid}] 补位轮询失败:`, e);
    }
  }

  private startPolling(uuid: string, key: string) {
    if (this.pollingTimers.has(uuid)) return;

    const poll = async () => {
      try {
        const service = this.connections.get(uuid);
        if (service?.isConnected) {
          // WS 正常连接时跳过常规轮询
        } else {
          const res: any = await messageApi.syncMsg(key, 0);
          const msgList = this.extractMsgList(res);
          if (msgList.length > 0) {
            if (isDebug('socket')) console.log(`[Polling:${uuid}] 拉取到 ${msgList.length} 条新消息`);
            msgList.forEach((m: any) => this.handleMessage(uuid, m));
          }
        }
      } catch (e) {
        if (isDebug('socket')) console.error(`[Polling:${uuid}] 轮询出错:`, e);
      }
      this.pollingTimers.set(uuid, setTimeout(poll, 30000));
    };

    poll();
  }

  public stopAccount(wxid: string) {
    if (this.pollingTimers.has(wxid)) {
      clearTimeout(this.pollingTimers.get(wxid));
      this.pollingTimers.delete(wxid);
    }
    const conn = this.connections.get(wxid);
    if (conn) {
      conn.close();
      this.connections.delete(wxid);
    }
  }

  private handleMessage(userName: string, msg: any) {
    const chatStore = useChatStore();
    const accountStore = useAccountStore();
    if (isDebug('socket')) console.log(`[SocketManager:${userName}] 收到原始消息内容:`, JSON.stringify(msg).slice(0, 500));

    const msgId = msg.NewMsgId || msg.MsgId || msg.msg_id || msg.new_msg_id || msg.UUID;

    const rawType = Number(msg.Type || msg.MsgType || msg.msg_type || 0);

    // 1. 拦截并处理联系人同步消息 (Type 10001)
    if (rawType === 10001) {
      if (msg.ModContacts) {
        if (isDebug('socket')) console.log(`[Socket:${userName}] 收到联系人同步 (Type 10001)，更新内存镜像`);
        msg.ModContacts.forEach((contact: any) => {
          const wxid = contact.userName?.str || contact.UserName?.str || contact.wxid || contact.userName;
          if (wxid) accountStore.updateContact(wxid, contact, userName);
        });
      }
      return;
    }

    if (msgId && chatStore._msgIdDedup.has(String(msgId))) {
      if (isDebug('socket')) console.log(`[Socket:${userName}] 消息 ID ${msgId} 已存在，跳过处理`);
      return;
    }

    const parsedMsg = MessageParser.parse(msg, userName);
    if (isDebug('socket')) console.log(`[Socket:${userName}] 消息解析完成:`, parsedMsg);

    // 2. 拦截状态通知和其他非显示类消息
    if (parsedMsg.type === 'status_notify' || (!parsedMsg.content && parsedMsg.type === 'unsupported')) {
      if (isDebug('socket')) console.log(`[Socket:${userName}] 消息类型为 ${parsedMsg.type} 且无内容，拦截显示`);
      return;
    }

    if (isDebug('socket')) console.log(`[Socket:${userName}] 准备转发有效消息到 ChatStore...`);
    chatStore.addParsedMessage(userName, parsedMsg).then(() => {
      if (isDebug('socket')) console.log(`[Socket:${userName}] ChatStore 已成功处理并存储消息: ${msgId}`);
    }).catch(err => {
      console.error(`[Socket:${userName}] 存储消息时发生严重异常:`, err);
    });
  }

  // Fix #6: syncHistory 阈值修正 —— 返回空列表才停止，而非消息数 < 5
  private async syncHistory(userName: string, key: string) {
    try {
      if (isDebug('socket')) console.log(`[SocketManager:${userName}] 正在通过 syncHistory 尝试补全新消息...`);

      let hasMore = true;
      let syncCount = 0;
      const MAX_SYNC = 5;

      while (hasMore && syncCount < MAX_SYNC) {
        const historyRes: any = await messageApi.syncHistoryMsg(key);
        const historyList = this.extractMsgList(historyRes);

        if (historyList.length > 0) {
          if (isDebug('socket')) console.log(`[SocketManager:${userName}] syncHistory 第 ${syncCount + 1} 次同步，补全了 ${historyList.length} 条消息`);
          historyList.forEach((m: any) => this.handleMessage(userName, m));
          syncCount++;
          // Fix #6: 只有返回空才停止，不用消息数猜测是否还有更多
        } else {
          if (isDebug('socket')) console.log(`[SocketManager:${userName}] syncHistory 无更多新消息，停止补录`);
          hasMore = false;
        }
      }

      if (syncCount >= MAX_SYNC) {
        if (isDebug('socket')) console.log(`[SocketManager:${userName}] syncHistory 已达最大轮次 ${MAX_SYNC}，停止`);
      }
    } catch (e) {
      if (isDebug('socket')) console.warn(`[SocketManager:${userName}] syncHistory 失败:`, e);
    }
  }

  private extractMsgList(data: any): any[] {
    if (!data) return [];

    if (Array.isArray(data)) {
      return data;
    }

    let list = data.AddMsgs || data.add_msgs || data.List || data.list || data.ModMsgs || data.mod_msgs || data.AddMsgList;

    if (!list && data.Data && typeof data.Data === 'object') {
      list = data.Data.AddMsgs || data.Data.List || data.Data.list || data.Data.add_msgs || data.Data.AddMsgList;
    }

    if (Array.isArray(list)) {
      return list;
    }

    return [];
  }
}

export const socketManager = new GlobalSocketManager();
