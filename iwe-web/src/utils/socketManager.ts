import { IMService } from './websocket';
import { useChatStore } from '@/store/chat';
import { useAccountStore } from '@/store/account';
import { messageApi } from '@/api/modules/im';
import { MessageParser } from '@/utils/parser';

class GlobalSocketManager {
  private connections: Map<string, IMService> = new Map();
  private pendingQueues: Map<string, any[]> = new Map();

  public async registerAccount(uuid: string, key: string, currentWxid: string) {
    if (this.connections.has(uuid) && !this.pendingQueues.has(uuid)) return;

    const accountStore = useAccountStore();
    const service = new IMService(
      uuid,
      `${accountStore.baseUrl.replace('http', 'ws')}/ws/GetSyncMsg`,
      (msg) => this.handleMessage(uuid, msg, currentWxid, true)
    );

    this.pendingQueues.set(uuid, []);
    service.connect(key);
    this.connections.set(uuid, service);
    
    await this.syncHistory(uuid, key, currentWxid);
  }

  private handleMessage(uuid: string, msg: any, currentWxid: string, isFromWs: boolean) {
    const queue = this.pendingQueues.get(uuid);
    if (isFromWs && queue) {
      queue.push(msg);
      return;
    }

    const chatStore = useChatStore();
    const msgId = msg.NewMsgId || msg.MsgId;
    if (msgId && chatStore.msgIdSet.has(String(msgId))) return;
    
    // 调试日志：查看原始消息
    console.log(`[Socket] 收到消息: From=${msg.FromUserName?.str || msg.FromUserName}, To=${msg.ToUserName?.str || msg.ToUserName}, Content=${msg.Content}`);

    const parsedMsg = MessageParser.parse(msg, currentWxid);
    console.log(`[Socket] 解析后消息: isSelf=${parsedMsg.isSelf}, PartnerId=${parsedMsg.isSelf ? parsedMsg.to : parsedMsg.from}`);
    
    chatStore.addParsedMessage(uuid, parsedMsg);
  }

  private async syncHistory(uuid: string, key: string, currentWxid: string) {
    try {
      console.log(`[${uuid}] 开始同步历史消息, key: ${key}`);
      const res: any = await messageApi.syncMsg(key, 0);
      console.log(`[${uuid}] 同步接口返回数据:`, res);
      
      if (res && res.AddMsgList) {
        console.log(`[${uuid}] 收到 ${res.AddMsgList.length} 条同步消息`);
        res.AddMsgList.forEach((m: any) => this.handleMessage(uuid, m, currentWxid, false));
      } else {
        console.warn(`[${uuid}] 同步接口未返回 AddMsgList`, res);
      }

      // 2. 处理 WS 建立期间缓冲的消息
      const queue = this.pendingQueues.get(uuid) || [];
      queue.forEach(m => this.handleMessage(uuid, m, currentWxid, false));
      
      // 3. 切换状态：删除队列
      this.pendingQueues.delete(uuid);
      
      console.log(`[${uuid}] 历史消息同步与缓冲区合并完成`);
    } catch (e) {
      console.error('同步历史失败:', e);
    }
  }
}

export const socketManager = new GlobalSocketManager();
