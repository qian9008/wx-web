import { IMService } from './websocket';
import { useChatStore } from '@/store/chat';
import { useAccountStore } from '@/store/account';
import { messageApi } from '@/api/modules/im';
import { MessageParser } from '@/utils/parser';

class GlobalSocketManager {
  private connections: Map<string, IMService> = new Map();
  private pollingTimers: Map<string, any> = new Map();

  public async registerAccount(uuid: string, key: string, currentWxid: string) {
    const existing = this.connections.get(uuid);
    if (existing && existing.isConnected) {
      console.log(`[SocketManager] 账号 ${uuid} 已存在活跃连接`);
      return;
    }

    if (existing) {
      existing.close();
    }

    const accountStore = useAccountStore();
    const service = new IMService(
      uuid,
      `${accountStore.baseUrl.replace('http', 'ws')}/ws/GetSyncMsg`,
      (msg) => this.handleMessage(uuid, msg, currentWxid)
    );

    service.connect(key);
    this.connections.set(uuid, service);
    
    // 初始化同步历史消息
    await this.syncHistory(uuid, key, currentWxid);
    
    // 开启低频 HTTP 轮询补位
    this.startPolling(uuid, key, currentWxid);
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
    const msgId = msg.NewMsgId || msg.MsgId || msg.msg_id || msg.new_msg_id;
    if (msgId && chatStore.msgIdSet.has(String(msgId))) return;
    
    const parsedMsg = MessageParser.parse(msg, currentWxid);
    
    // 过滤掉状态通知类消息，不显示在聊天窗口
    if (parsedMsg.type === 'status_notify') {
      console.log(`[Socket:${uuid}] 收到状态通知(51)，已跳过显示`);
      return;
    }

    console.log(`[Socket:${uuid}] 收到消息 ID: ${msgId}, 类型: ${parsedMsg.type}`);
    chatStore.addParsedMessage(uuid, parsedMsg);
  }

  private async syncHistory(uuid: string, key: string, currentWxid: string) {
    try {
      console.log(`[SocketManager:${uuid}] 正在同步历史消息...`);
      const res: any = await messageApi.syncMsg(key, 0);
      const msgList = this.extractMsgList(res);
      
      if (msgList.length > 0) {
        console.log(`[SocketManager:${uuid}] 同步到 ${msgList.length} 条消息`);
        msgList.forEach((m: any) => this.handleMessage(uuid, m, currentWxid));
      }
    } catch (e) {
      console.error(`[SocketManager:${uuid}] 历史同步失败:`, e);
    }
  }

  private extractMsgList(res: any): any[] {
    if (!res) return [];
    if (Array.isArray(res)) return res;
    if (res.AddMsgList) return res.AddMsgList;
    if (res.Data) {
      if (Array.isArray(res.Data)) return res.Data;
      if (res.Data.AddMsgList) return res.Data.AddMsgList;
    }
    return [];
  }
}

export const socketManager = new GlobalSocketManager();
