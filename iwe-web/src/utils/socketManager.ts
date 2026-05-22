import { IMService } from './websocket';
import { useChatStore } from '@/store/chat';
import { useAccountStore } from '@/store/account';
import { messageApi } from '@/api/modules/im';
import { MessageParser } from '@/utils/parser';
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
      // WS 断开时立即发起补位轮询，并触发离线状态校验判定
      () => this.handleDisconnect(realWxid, key)
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
    const now = Date.now();
    const lastTime = this.lastPollOnceTime.get(uuid) || 0;
    // 限制单次轮询触发频率，防止重连期间过度频繁请求（10秒节流）
    if (now - lastTime < 10000) {
      if (isDebug('socket')) console.log(`[SocketManager:${uuid}] pollOnce 触发过于频繁，已拦截`);
      return;
    }
    this.lastPollOnceTime.set(uuid, now);

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

  // WS 断开时触发：执行立即轮询补位 + 调用 GetLoginStatus 进行真实离线状态校验与判定
  private async handleDisconnect(uuid: string, key: string) {
    // 1. 触发即时轮询补位
    this.pollOnce(uuid, key);
    
    // 2. 调用 /login/GetLoginStatus 检测是否离线并更新 UI 状态
    const accountStore = useAccountStore();
    if (isDebug('socket')) {
      console.log(`[SocketManager:${uuid}] WebSocket 连接断开，立即调用 /login/GetLoginStatus 校验离线状态...`);
    }
    try {
      await accountStore.checkSingleAccountStatus(key);
    } catch (e) {
      if (isDebug('socket')) {
        console.warn(`[SocketManager:${uuid}] 离线状态校验失败:`, e);
      }
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
    const accountStore = useAccountStore();
    if (accountStore.isDemoMode) {
      console.log(`[SocketManager:Demo] 演示模式拦截账号 WebSocket 卸载: ${wxid}`);
      return;
    }
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
    if (!msg) return;

    const chatStore = useChatStore();
    const accountStore = useAccountStore();

    // 【核心拦截】如果是一个独立的联系人/群聊信息更新（并非消息结构），更新联系人缓存并拦截，不作为消息展示
    const isContactUpdate = (msg.userName || msg.UserName) && 
                            (msg.pyinitial || msg.pyInitial || msg.quanPin || msg.imgFlag !== undefined || msg.contactType !== undefined);
    if (isContactUpdate) {
      const wxid = msg.userName?.str || msg.UserName?.str || msg.wxid || msg.userName || msg.UserName;
      if (wxid && typeof wxid === 'string') {
        if (isDebug('socket')) {
          console.log(`[Socket:${userName}] 收到独立的联系人/群聊属性变更: ${wxid} (${msg.nickName?.str || ''})`);
        }
        accountStore.updateContact(wxid, msg, userName);
      }
      return;
    }

    const msgId = msg.NewMsgId || msg.MsgId || msg.msg_id || msg.new_msg_id || msg.UUID;

    const rawType = Number(msg.Type || msg.MsgType || msg.msg_type || 0);

    // 1. 拦截并处理联系人同步与删除消息 (Type 10001)
    if (rawType === 10001) {
      // 1.1 修改/更新联系人
      const modContacts = msg.ModContacts || msg.modContacts || msg.ModContactList || msg.modContactList;
      if (modContacts && Array.isArray(modContacts)) {
        if (isDebug('socket')) console.log(`[Socket:${userName}] 收到联系人同步/修改 (Type 10001)，更新内存与 DB`);
        modContacts.forEach((contact: any) => {
          const wxid = contact.userName?.str || contact.UserName?.str || contact.wxid || contact.userName;
          if (wxid) accountStore.updateContact(wxid, contact, userName);
        });
      }

      // 1.2 删除联系人 (重要！客户端/手机端删除好友时，微信服务器推送 DelContacts，这里标记为“被删”关系)
      const delContacts = msg.DelContacts || msg.delContacts || msg.DelContactList || msg.delContactList;
      if (delContacts && Array.isArray(delContacts)) {
        if (isDebug('socket')) console.log(`[Socket:${userName}] 收到联系人删除通知 (Type 10001)，开始标记状态`);
        delContacts.forEach(async (contact: any) => {
          const wxid = contact.userName?.str || contact.UserName?.str || contact.wxid || contact.userName;
          if (wxid) {
            console.log(`[Socket:${userName}] 监听到客户端删除好友事件，自动标记为“被删”关系: ${wxid}`);
            
            // 将关系修改为 3 (被删)，并写入 isDeleted 标记，保留数据供用户查看或在齿轮控制台批量清理
            await accountStore.updateContact(wxid, {
              friendRelation: 3,
              isDeleted: true
            }, userName, false);
          }
        });
      }
      return;
    }

    if (msgId && chatStore._msgIdDedup.has(String(msgId))) {
      if (isDebug('socket')) console.log(`[Socket:${userName}] 消息 ID ${msgId} 已存在，跳过处理`);
      return;
    }

    const parsedMsg = MessageParser.parse(msg, userName);

    // 2. 拦截状态通知和其他非显示类消息
    if (parsedMsg.type === 'status_notify' || (!parsedMsg.content && parsedMsg.type === 'unsupported')) {
      if (parsedMsg.type === 'status_notify' && parsedMsg.statusNotifyData?.username) {
        const targetWxid = parsedMsg.statusNotifyData.username;
        if (isDebug('socket')) {
          console.log(`[Socket:${userName}] 收到状态同步消息，自动清除会话已读数: ${targetWxid}, lastMessageSvrId: ${parsedMsg.statusNotifyData.lastMessageSvrId}`);
        }
        chatStore.clearUnread(userName, targetWxid).catch(err => {
          console.error(`[Socket:${userName}] 自动清除已读数失败:`, err);
        });
      }
      if (isDebug('socket')) console.log(`[Socket:${userName}] 消息类型为 ${parsedMsg.type} 且无内容，拦截显示`);
      return;
    }

    chatStore.addParsedMessage(userName, parsedMsg).catch(err => {
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
