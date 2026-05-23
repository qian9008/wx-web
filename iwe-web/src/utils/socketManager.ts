import { IMService } from './websocket';
import { useAccountStore } from '@/store/account';
import { messageApi } from '@/api/modules/im';
import { MessageDispatcher } from './messageDispatcher';
import { isDebug } from '@/utils/debug';

class GlobalSocketManager {
  private connections: Map<string, IMService> = new Map();
  private pollingTimers: Map<string, any> = new Map();
  private lastPollOnceTime: Map<string, number> = new Map();

  public async registerAccount(userName: string, key: string) {
    if (!userName) return;

    const accountStore = useAccountStore();
    if (accountStore.isDemoMode) {
      console.log(`[SocketManager:Demo] 演示模式拦截账号 WebSocket 注册: ${userName}`);
      return;
    }
    const realWxid = userName;

    const existing = this.connections.get(realWxid);
    if (existing && existing.isConnected) {
      if (isDebug('socket')) console.log(`[SocketManager] 账号 ${realWxid} 已存在活跃连接，跳过`);
      return;
    }

    if (existing && (existing as any).isConnecting) {
      return;
    }

    if (existing) {
      existing.close();
    }

    let wsBaseUrl = accountStore.baseUrl;
    if (wsBaseUrl.startsWith('http')) {
      wsBaseUrl = wsBaseUrl.replace('http', 'ws');
    } else {
      wsBaseUrl = `ws://${wsBaseUrl}`;
    }

    const service = new IMService(
      realWxid,
      `${wsBaseUrl}/ws/GetSyncMsg`,
      (msg) => MessageDispatcher.dispatch(realWxid, msg),
      () => this.handleDisconnect(realWxid, key)
    );

    service.connect(key);
    this.connections.set(realWxid, service);

    this.syncHistory(realWxid, key);
    this.startPolling(realWxid, key);
  }

  private async pollOnce(uuid: string, key: string) {
    const now = Date.now();
    const lastTime = this.lastPollOnceTime.get(uuid) || 0;
    if (now - lastTime < 10000) return;
    this.lastPollOnceTime.set(uuid, now);

    try {
      const res: any = await messageApi.syncMsg(key, 0);
      const msgList = this.extractMsgList(res);
      if (msgList.length > 0) {
        msgList.forEach((m: any) => MessageDispatcher.dispatch(uuid, m));
      }
    } catch (e) {
      if (isDebug('socket')) console.warn(`[PollOnce:${uuid}] 补位轮询失败:`, e);
    }
  }

  private async handleDisconnect(uuid: string, key: string) {
    this.pollOnce(uuid, key);
    const accountStore = useAccountStore();
    try {
      await accountStore.checkSingleAccountStatus(key);
    } catch (e) {}
  }

  private startPolling(uuid: string, key: string) {
    if (this.pollingTimers.has(uuid)) return;

    const poll = async () => {
      try {
        const service = this.connections.get(uuid);
        if (!service?.isConnected) {
          const res: any = await messageApi.syncMsg(key, 0);
          const msgList = this.extractMsgList(res);
          if (msgList.length > 0) {
            msgList.forEach((m: any) => MessageDispatcher.dispatch(uuid, m));
          }
        }
      } catch (e) {}
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

  private async syncHistory(userName: string, key: string) {
    try {
      let hasMore = true;
      let syncCount = 0;
      const MAX_SYNC = 5;

      while (hasMore && syncCount < MAX_SYNC) {
        const historyRes: any = await messageApi.syncHistoryMsg(key);
        const historyList = this.extractMsgList(historyRes);

        if (historyList.length > 0) {
          historyList.forEach((m: any) => MessageDispatcher.dispatch(userName, m));
          syncCount++;
        } else {
          hasMore = false;
        }
      }
    } catch (e) {}
  }

  private extractMsgList(data: any): any[] {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    let list = data.AddMsgs || data.add_msgs || data.List || data.list || data.ModMsgs || data.mod_msgs || data.AddMsgList;
    if (!list && data.Data && typeof data.Data === 'object') {
      list = data.Data.AddMsgs || data.Data.List || data.Data.list || data.Data.add_msgs || data.Data.AddMsgList;
    }
    return Array.isArray(list) ? list : [];
  }
}

export const socketManager = new GlobalSocketManager();
