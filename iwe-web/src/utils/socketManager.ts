import { IMService } from './websocket';
import { useAccountStore } from '@/store/account';
import { messageApi } from '@/api/modules/im';
import { MessageDispatcher } from './messageDispatcher';
import { debugLog, isDebug } from '@/utils/debug';

class GlobalSocketManager {
  private connections: Map<string, IMService> = new Map();
  private pollingTimers: Map<string, any> = new Map();
  private lastPollOnceTime: Map<string, number> = new Map();
  private registeredKeys: Map<string, string> = new Map(); // 存储最新注册的账号 Token Key
  private isListenerInited = false;

  private initGlobalListeners() {
    if (this.isListenerInited) return;
    this.isListenerInited = true;

    debugLog('socket', '[SocketManager] 初始化全局链路自愈监听');

    window.addEventListener('online', () => {
      debugLog('socket', '🌐 [SocketManager] 网络已恢复，触发全账号重连检查');
      this.connections.forEach((service, wxid) => {
        const lastKey = this.registeredKeys.get(wxid);
        if (!service.isConnected && lastKey) {
          service.connect(lastKey);
        }
      });
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        debugLog('socket', '👀 [SocketManager] 页面激活，触发强制同步与链路检查');
        let delay = 0;
        this.connections.forEach((service, wxid) => {
          // 引入 Jitter 机制消峰，随机延时触发，防止服务器惊群效应
          setTimeout(() => {
            // 1. 强制同步一次消息，防止刚才没收到推送
            const lastKey = this.registeredKeys.get(wxid);
            if (lastKey) {
              this.pollOnce(wxid, lastKey);
            }

            // 2. 检查链路
            if (!service.isConnected) {
              debugLog('socket', '🔄 [SocketManager] 账号 {} 处于断开状态，尝试重连', wxid);
              service.reconnectWithLastKey();
            } else {
              // 如果是在线状态，主动触发一次 PING 探测假死
              service.sendPing();
            }
          }, delay);
          delay += Math.floor(Math.random() * 80) + 40; // 递增且随机，打散并发
        });
      }
    });
  }

  public async registerAccount(userName: string, key: string) {
    if (!userName) return;

    // 只需要初始化一次全局监听
    this.initGlobalListeners();

    const accountStore = useAccountStore();
    if (accountStore.isDemoMode) {
      debugLog('socket', '[SocketManager:Demo] 演示模式拦截账号 WebSocket 注册: {}', userName);
      return;
    }
    const realWxid = userName;

    // 始终更新注册的密钥以解决备份轮询中的闭包过期失效隐患
    this.registeredKeys.set(realWxid, key);

    const existing = this.connections.get(realWxid);
    if (existing && existing.isConnected) {
      if (isDebug('socket')) console.log(`[SocketManager] 账号 ${realWxid} 已存在活跃连接，跳过`);
      return;
    }

    if (existing && (existing as any).isConnecting) {
      return;
    }

    if (existing) {
      // 规避连接销毁时的回调噪音：断开与重连回调置空，防多余轮询
      (existing as any).onDisconnectCallback = null;
      (existing as any).onReconnectCallback = null;
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
      () => this.handleDisconnect(realWxid, key),
      () => {
        if (isDebug('socket')) console.log(`[SocketManager] 账号 ${realWxid} 重连成功，触发补位轮询`);
        const lastKey = this.registeredKeys.get(realWxid) || key;
        this.pollOnce(realWxid, lastKey);
      }
    );

    service.connect(key);
    this.connections.set(realWxid, service);

    this.syncHistory(realWxid, key);
    this.startPolling(realWxid, key);
  }

  private async pollOnce(uuid: string, key: string) {
    const currentKey = this.registeredKeys.get(uuid) || key;
    const now = Date.now();
    const lastTime = this.lastPollOnceTime.get(uuid) || 0;
    if (now - lastTime < 10000) return;
    this.lastPollOnceTime.set(uuid, now);

    try {
      const res: any = await messageApi.syncMsg(currentKey, 0);
      const msgList = this.extractMsgList(res);
      if (msgList.length > 0) {
        msgList.forEach((m: any) => MessageDispatcher.dispatch(uuid, m));
      }
    } catch (e) {
      if (isDebug('socket')) console.warn(`[PollOnce:${uuid}] 补位轮询失败:`, e);
    }
  }

  private async handleDisconnect(uuid: string, key: string) {
    const currentKey = this.registeredKeys.get(uuid) || key;
    this.pollOnce(uuid, currentKey);
    const accountStore = useAccountStore();
    try {
      await accountStore.checkSingleAccountStatus(currentKey);
    } catch (e) {}
  }

  private startPolling(uuid: string, key: string) {
    this.registeredKeys.set(uuid, key); // 确保定时器启动时存入新密钥
    if (this.pollingTimers.has(uuid)) return;

    const poll = async () => {
      try {
        const service = this.connections.get(uuid);
        if (!service?.isConnected) {
          const currentKey = this.registeredKeys.get(uuid) || key;
          const res: any = await messageApi.syncMsg(currentKey, 0);
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
    this.registeredKeys.delete(wxid);
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
        const currentKey = this.registeredKeys.get(userName) || key;
        const historyRes: any = await messageApi.syncHistoryMsg(currentKey);
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
