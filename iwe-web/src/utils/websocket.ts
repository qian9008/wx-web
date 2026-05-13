import ReconnectingWebSocket from 'reconnecting-websocket';
import { messageApi } from '@/api/modules/im';

export class IMService {
  private ws: ReconnectingWebSocket | null = null;
  private url: string;
  private onMessageCallback: (msg: any) => void;
  private isSyncing = false;
  private pendingQueue: any[] = [];
  private accountUuid: string;

  constructor(accountUuid: string, url: string, onMessage: (msg: any) => void) {
    this.accountUuid = accountUuid;
    this.url = url;
    this.onMessageCallback = onMessage;
  }

  public connect(key: string) {
    this.ws = new ReconnectingWebSocket(`${this.url}?key=${key}`);

    this.ws.onopen = async () => {
      console.log(`[${this.accountUuid}] 连接成功，开启同步锁...`);
      this.isSyncing = true;
      this.pendingQueue = [];

      try {
        // 1. 同步补录 - 尝试多次同步直到没有更多消息
        console.log(`[${this.accountUuid}] 开始同步历史消息...`);
        let hasMore = true;
        let syncCount = 0;
        while (hasMore && syncCount < 5) { // 最多连续同步5次防止死循环
          const res: any = await messageApi.syncMsg(key, 0);
          const msgList = res?.AddMsgList || res?.Data?.AddMsgList || [];
          if (msgList.length > 0) {
            console.log(`[${this.accountUuid}] 同步到 ${msgList.length} 条消息`);
            msgList.forEach((m: any) => this.onMessageCallback(m));
            syncCount++;
          } else {
            hasMore = false;
          }
        }
        console.log(`[${this.accountUuid}] 历史消息同步完成`);
      } catch (err) {
        console.error('同步失败', err);
      } finally {
        // 2. 释放缓冲区
        this.isSyncing = false;
        console.log(`[${this.accountUuid}] 同步锁释放，清空缓冲区: ${this.pendingQueue.length}`);
        while (this.pendingQueue.length > 0) {
          const m = this.pendingQueue.shift();
          this.onMessageCallback(m);
        }
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (this.isSyncing) {
          this.pendingQueue.push(data);
        } else {
          this.onMessageCallback(data);
        }
      } catch (e) {
        // 忽略非 JSON 消息
      }
    };
  }

  public close() {
    this.ws?.close();
  }
}
