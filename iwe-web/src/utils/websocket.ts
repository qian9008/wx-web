import ReconnectingWebSocket from 'reconnecting-websocket';

export class IMService {
  private ws: ReconnectingWebSocket | null = null;
  private url: string;
  private onMessageCallback: (msg: any) => void;
  public accountUuid: string;
  public isConnected = false;
  public isConnecting = false;
  private heartbeatTimer: any = null;

  constructor(accountUuid: string, url: string, onMessage: (msg: any) => void) {
    this.accountUuid = accountUuid;
    this.url = url;
    this.onMessageCallback = onMessage;
  }

  public connect(key: string) {
    const wsUrl = `${this.url}?key=${key}`;
    console.log(`[${this.accountUuid}] 正在建立 WebSocket 连接...`);
    this.isConnecting = true;
    
    this.ws = new ReconnectingWebSocket(wsUrl);

    this.ws.onopen = () => {
      this.isConnected = true;
      this.isConnecting = false;
      console.log(`✅ [${this.accountUuid}] WebSocket 成功建立连接`);
      this.startHeartbeat();
    };

    this.ws.onclose = (event) => {
      this.isConnected = false;
      this.isConnecting = false;
      this.stopHeartbeat();
      // 这里的 code 是排查问题的核心
      console.warn(`❌ [${this.accountUuid}] WebSocket 连接已断开:`, {
        code: event.code,
        reason: event.reason || '无明确原因',
        wasClean: event.wasClean
      });
    };

    this.ws.onerror = (event: any) => {
      this.isConnected = false;
      this.isConnecting = false;
      this.stopHeartbeat();
      console.error(`[${this.accountUuid}] WebSocket 发生错误! 详细信息:`, {
        url: this.ws?.url,
        readyState: this.ws?.readyState,
        event
      });
    };

    this.ws.onmessage = (event) => {
      if (event.data === 'pong') return; // 忽略心跳回包
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
