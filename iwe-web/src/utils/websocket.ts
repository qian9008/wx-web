import ReconnectingWebSocket from 'reconnecting-websocket';

export class IMService {
  private ws: ReconnectingWebSocket | null = null;
  private url: string;
  private onMessageCallback: (msg: any) => void;
  public accountUuid: string;
  public isConnected = false;
  private heartbeatTimer: any = null;

  constructor(accountUuid: string, url: string, onMessage: (msg: any) => void) {
    this.accountUuid = accountUuid;
    this.url = url;
    this.onMessageCallback = onMessage;
  }

  public connect(key: string) {
    const wsUrl = `${this.url}?key=${key}`;
    console.log(`[${this.accountUuid}] 正在建立 WebSocket 连接...`);
    
    this.ws = new ReconnectingWebSocket(wsUrl);

    this.ws.onopen = () => {
      this.isConnected = true;
      console.log(`[${this.accountUuid}] WebSocket 连接成功`);
      this.startHeartbeat();
    };

    this.ws.onclose = (event) => {
      this.isConnected = false;
      this.stopHeartbeat();
      // 保留断开原因日志，便于后续排查稳定性问题
      console.warn(`[${this.accountUuid}] WebSocket 连接断开:`, {
        code: event.code,
        reason: event.reason
      });
    };

    this.ws.onerror = (event) => {
      this.isConnected = false;
      this.stopHeartbeat();
      console.error(`[${this.accountUuid}] WebSocket 发生错误:`, event);
    };

    this.ws.onmessage = (event) => {
      try {
        // 移除高频消息日志，仅保留解析和回调
        const data = JSON.parse(event.data);
        this.onMessageCallback(data);
      } catch (e) {
        // 忽略心跳回包或非 JSON 数据
      }
    };
  }

  public close() {
    this.stopHeartbeat();
    this.ws?.close();
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send('ping');
      }
    }, 25000);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
