import { defineStore } from 'pinia';
import { contactCache } from '@/utils/contactCache';

export interface AppMessage {
  id: string;
  msgId: number;
  from: string;
  to: string;
  time: number;
  type: string;
  content: string;
  isSelf: boolean;
  isRevoked: boolean;
  imageUrl?: string;
}

export interface Conversation {
  wxid: string;
  nickname: string;
  avatar: string;
  lastMsg: string;
  time: number;
  unread: number;
}

export const useChatStore = defineStore('chat', {
  state: () => ({
    accountMessages: {} as Record<string, Record<string, AppMessage[]>>,
    accountConversations: {} as Record<string, Conversation[]>,
    activeId: '',
    msgIdSet: new Set<string>(),
  }),
  actions: {
    async addParsedMessage(accountUuid: string, msg: AppMessage) {
      if (this.msgIdSet.has(String(msg.id))) return;
      this.msgIdSet.add(String(msg.id));

      const myId = accountUuid.trim().toLowerCase();
      const fromId = msg.from.trim().toLowerCase();
      const toId = msg.to.trim().toLowerCase();
      let partnerId = fromId === myId ? toId : fromId;
      if (!partnerId || partnerId === myId) {
        partnerId = fromId === toId ? fromId : (fromId === myId ? toId : fromId);
      }

      // 1. 持久化消息到 DB
      await contactCache.saveMessage(accountUuid, msg);

      // 2. 更新内存 Store (消息)
      if (!this.accountMessages[accountUuid]) {
        this.accountMessages = { ...this.accountMessages, [accountUuid]: {} };
      }
      const messagesForAccount = { ...this.accountMessages[accountUuid] };
      if (!messagesForAccount[partnerId]) {
        messagesForAccount[partnerId] = [];
      }
      messagesForAccount[partnerId] = [...messagesForAccount[partnerId], msg];
      this.accountMessages[accountUuid] = messagesForAccount;
      
      // 3. 更新并持久化会话
      await this.updateConversation(accountUuid, partnerId, msg);
    },

    async updateConversation(accountUuid: string, wxid: string, msg: any) {
      if (!this.accountConversations[accountUuid]) {
        this.accountConversations = { ...this.accountConversations, [accountUuid]: [] };
      }
      const list = [...this.accountConversations[accountUuid]];
      let conv = list.find(c => c.wxid === wxid);
      
      if (!conv) {
        conv = { 
          wxid, 
          nickname: wxid, 
          avatar: '', 
          lastMsg: msg.content, 
          time: msg.time, 
          unread: msg.isSelf ? 0 : 1 
        };
        list.push(conv);
      } else {
        conv.lastMsg = msg.content;
        conv.time = msg.time;
        if (!msg.isSelf && wxid !== this.activeId) {
          conv.unread = (conv.unread || 0) + 1;
        }
      }

      // 排序并置顶
      list.sort((a, b) => b.time - a.time);
      this.accountConversations[accountUuid] = list;

      // 持久化会话到 DB (强制克隆为纯对象，避免 DataCloneError)
      await contactCache.saveConversation(accountUuid, JSON.parse(JSON.stringify(conv)));
    },

    async loadHistory(accountUuid: string, partnerId: string) {
      const history: any = await contactCache.getMessages(accountUuid, partnerId);
      if (history && history.length > 0) {
        if (!this.accountMessages[accountUuid]) {
          this.accountMessages = { ...this.accountMessages, [accountUuid]: {} };
        }
        const msgs = history.map((m: any) => ({ ...m })); // 浅拷贝一份
        this.accountMessages[accountUuid] = {
          ...this.accountMessages[accountUuid],
          [partnerId]: msgs
        };
        // 同步已读消息 ID 防止重复
        msgs.forEach((m: any) => this.msgIdSet.add(String(m.id)));
      }
    },

    async loadConversations(accountUuid: string) {
      const dbConvs = await contactCache.getConversations(accountUuid);
      this.accountConversations[accountUuid] = dbConvs;
      
      // 同时把所有消息 ID 存入 Set
      dbConvs.forEach(async (c) => {
        const msgs = await contactCache.getMessages(accountUuid, c.wxid);
        msgs.forEach(m => this.msgIdSet.add(String(m.id)));
      });
    },

    setConversations(accountUuid: string, conversations: Conversation[]) {
      this.accountConversations[accountUuid] = conversations;
    }
  }
});
