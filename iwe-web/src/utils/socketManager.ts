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
    
    const service = new IMService(
      uuid,
      `${wsBaseUrl}/ws/GetSyncMsg`,
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
    const accountStore = useAccountStore();
    const msgId = msg.NewMsgId || msg.MsgId || msg.msg_id || msg.new_msg_id || msg.UUID;
    
    // 特殊处理 10001 类型：联系人更新同步
    const rawType = Number(msg.Type || msg.MsgType || msg.msg_type || 0);
    if (rawType === 10001 && msg.ModContacts) {
      console.log(`[Socket:${uuid}] 收到联系人更新(10001)，正在同步到内存镜像`);
      msg.ModContacts.forEach((contact: any) => {
        const wxid = contact.userName?.str || contact.UserName?.str || contact.wxid || contact.userName;
        if (wxid) accountStore.updateContact(wxid, contact);
      });
    }

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
