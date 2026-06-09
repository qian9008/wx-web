import ReconnectingWebSocket from 'reconnecting-websocket';
import { debugLog, isDebug } from '@/utils/debug';

export class IMService {
  private ws: ReconnectingWebSocket | null = null;
  private url: string;
  private onMessageCallback: (msg: any) => void;
  // Fix #7: 断开时回调，用于通知 SocketManager 立即发起一次轮询补位
  private onDisconnectCallback: (() => void) | null = null;
  private onReconnectCallback: (() => void) | null = null;
  public accountUuid: string;
  public isConnected = false;
  public isConnecting = false;
  private heartbeatTimer: any = null;
  private heartbeatTimeoutTimer: any = null;
  private lastKey: string = '';

  private readonly PING_INTERVAL = 15000; // 缩短至 15 秒发送一次 ping
  private readonly PONG_TIMEOUT = 10000;  // 10秒内未收到 pong 则视为超时

  constructor(
    accountUuid: string,
    url: string,
    onMessage: (msg: any) => void,
    onDisconnect?: () => void,
    onReconnect?: () => void
  ) {
    this.accountUuid = accountUuid;
    this.url = url;
    this.onMessageCallback = onMessage;
    this.onDisconnectCallback = onDisconnect || null;
    this.onReconnectCallback = onReconnect || null;
    // 不再在这里 init，改由 socketManager 统一管理
  }

  public reconnectWithLastKey() {
    if (this.lastKey) {
      debugLog('socket', '🔄 [{}] 使用最后一次 Key 尝试重连...', () => this.accountUuid);
      this.ws?.reconnect();
    }
  }

  public connect(key: string) {
    this.lastKey = key;
    const wsUrl = `${this.url}?key=${key}`;
    debugLog('socket', '[{}] 正在建立 WebSocket 连接...', () => this.accountUuid);
    this.isConnecting = true;

    this.ws = new ReconnectingWebSocket(wsUrl, [], {
      connectionTimeout: 5000,
      maxRetries: 10
    });

    this.ws.onopen = () => {
      const wasDisconnected = !this.isConnected;
      this.isConnected = true;
      this.isConnecting = false;
      debugLog('socket', '✅ [{}] WebSocket 成功建立连接', () => this.accountUuid);
      this.startHeartbeat();

      if (wasDisconnected) {
        this.onReconnectCallback?.();
      }
    };

    this.ws.onclose = (event) => {
      this.isConnected = false;
      this.isConnecting = false;
      this.stopHeartbeat();
      this.clearPongTimeout();
      console.warn(`❌ [${this.accountUuid}] WebSocket 连接已断开:`, {
        code: event.code,
        reason: event.reason || '无明确原因',
        wasClean: event.wasClean
      });
      // Fix #7: 通知 SocketManager 断开，触发立即轮询补位
      this.onDisconnectCallback?.();
    };

    this.ws.onerror = (event: any) => {
      this.isConnected = false;
      this.isConnecting = false;
      this.stopHeartbeat();
      this.clearPongTimeout();
      console.error(`[${this.accountUuid}] WebSocket 发生错误! 详细信息:`, {
        url: this.ws?.url,
        readyState: this.ws?.readyState,
        event
      });
    };

    this.ws.onmessage = (event) => {
      // 收到任何消息（包括 pong 或业务数据），都说明连接活跃，清除心跳超时
      this.clearPongTimeout();

      if (event.data === 'pong') {
        if (isDebug('socket')) console.log(`[${this.accountUuid}] 收到心跳 pong`);
        return; 
      }
      try {
        const data = JSON.parse(event.data);
        this.onMessageCallback(data);
      } catch (e) {
        // 忽略非 JSON 数据
      }
    };
  }

  public close() {
    this.stopHeartbeat();
    this.clearPongTimeout();
    this.ws?.close();
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.clearPongTimeout();
    this.heartbeatTimer = setInterval(() => {
      this.sendPing();
    }, this.PING_INTERVAL);
  }

  public sendPing() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      if (isDebug('socket')) console.log(`[${this.accountUuid}] 发送心跳 ping...`);
      this.ws.send('ping');
      this.startPongTimeout();
    }
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private startPongTimeout() {
    this.clearPongTimeout();
    this.heartbeatTimeoutTimer = setTimeout(() => {
      console.warn(`⚠️ [${this.accountUuid}] 心跳超时（未在 ${this.PONG_TIMEOUT / 1000} 秒内收到 pong），判定为假死连接，开始强制重连...`);
      this.handleHeartbeatTimeout();
    }, this.PONG_TIMEOUT);
  }

  private clearPongTimeout() {
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  private handleHeartbeatTimeout() {
    this.stopHeartbeat();
    this.clearPongTimeout();
    try {
      // 强制重新连接
      this.ws?.reconnect();
    } catch (e) {
      console.error(`[${this.accountUuid}] 强制重连失败，尝试直接关闭连接以触发重连:`, e);
      this.ws?.close();
    }
  }
}
