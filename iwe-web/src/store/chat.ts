import { defineStore } from 'pinia';
import { useAccountStore } from './account';
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

      const accountStore = useAccountStore();
      const currentAccount = accountStore.accounts.find(a => a.uuid === accountUuid);
      // 核心修复：使用真实的微信号进行身份判定，而不是 UUID
      const myWxid = (currentAccount?.nickname || accountUuid).trim().toLowerCase();
      
      const fromId = msg.from.trim().toLowerCase();
      const toId = msg.to.trim().toLowerCase();
      
      // 判定谁是聊天对象
      let partnerId = fromId === myWxid ? toId : fromId;
      
      // 兜底逻辑：处理公众号、系统消息等特殊情况
      if (!partnerId || partnerId === myWxid) {
        partnerId = fromId === toId ? fromId : (fromId === myWxid ? toId : fromId);
      }

      // 核心拦截：如果 partnerId 依然为空，或者解析出来的 ID 显然无效，禁止存储
      if (!partnerId || partnerId === 'undefined' || partnerId === 'null') {
        console.warn(`[ChatStore] 拦截到无效 partnerId 消息，已舍弃:`, msg);
        return;
      }

      // 1. 持久化消息到 DB (dev 分支已在 contactCache 中禁用实际写入)
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
      // 抛弃本地消息化，不再从本地 DB 加载历史，完全依赖 Redis 获取的最近消息
      return;
    },

    async loadConversations(accountUuid: string) {
      const dbConvs = await contactCache.getConversations(accountUuid);
      this.accountConversations[accountUuid] = dbConvs;
      // 不再从本地 DB 加载消息 ID 去重，Redis 消息将通过 Redis 接口自身的逻辑处理
    },

    setConversations(accountUuid: string, conversations: Conversation[]) {
      this.accountConversations[accountUuid] = conversations;
    }
  }
});
