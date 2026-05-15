import { defineStore } from 'pinia';
import { useAccountStore } from './account';
import { contactCache } from '@/utils/contactCache';
import { isDebug } from '@/utils/debug';

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

      const myWxid = accountUuid.trim(); // 移除 toLowerCase 以防止与原始大小写不一致
      const fromId = msg.from.trim();
      const toId = msg.to.trim();
      
      // 判定谁是聊天对象
      let partnerId = fromId === myWxid ? toId : fromId;
      
      // 兜底逻辑：处理公众号、系统消息等特殊情况
      // 如果 partnerId 依然和自己一样，那说明这是一个类似于文件传输助手，或者自己发给自己的消息
      if (!partnerId || partnerId === myWxid) {
        if (fromId !== myWxid && toId === myWxid) {
          partnerId = fromId;
        } else if (fromId === myWxid && toId !== myWxid) {
          partnerId = toId;
        } else {
          // 如果真的是自己发给自己，或者实在解析不出来
          partnerId = fromId || toId;
        }
      }

      // 核心拦截：如果 partnerId 依然为空，或者解析出来的 ID 显然无效，禁止存储
      if (!partnerId || partnerId === 'undefined' || partnerId === 'null') {
        if (isDebug('socket')) console.warn(`[ChatStore] 拦截到无效 partnerId 消息，已舍弃:`, msg);
        return;
      }

      if (isDebug('socket')) console.log(`[Debug:ChatStore] 消息归类判定: myWxid=${myWxid}, from=${fromId}, to=${toId} -> partnerId=${partnerId}`);

      // 1. 持久化消息到 DB
      const msgWithPartner = { ...msg, partnerId };
      await contactCache.saveMessage(accountUuid, msgWithPartner);

      // 2. 更新内存 Store
      if (!this.accountMessages[accountUuid]) {
        this.accountMessages[accountUuid] = {};
      }
      
      // Pinia 对于深层嵌套的响应式对象，直接修改内层可能无法触发视图更新
      // 必须浅拷贝外层触发 reactivity
      const messagesForAccount = { ...this.accountMessages[accountUuid] };
      
      if (!messagesForAccount[partnerId]) {
        messagesForAccount[partnerId] = [];
      }
      
      messagesForAccount[partnerId] = [...messagesForAccount[partnerId], msg];
      messagesForAccount[partnerId].sort((a, b) => a.time - b.time);
      
      this.accountMessages = { ...this.accountMessages, [accountUuid]: messagesForAccount };

      // 3. 更新会话列表镜像 (upsert)
      try {
        await this.updateConversation(accountUuid, partnerId, msg);
      } catch (err) {
        console.error(`[ChatStore] updateConversation 异常:`, err);
      }
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
      if (!accountUuid || !partnerId) return;
      
      // 1. 从 IndexedDB 加载最近的 50 条本地缓存
      const localMsgs = await contactCache.getMessages(accountUuid, partnerId, 50);
      
      if (localMsgs.length > 0) {
        console.log(`[ChatStore] 从本地加载了 ${localMsgs.length} 条历史消息`);
        
        if (!this.accountMessages[accountUuid]) {
          this.accountMessages[accountUuid] = {};
        }
        
        const existing = this.accountMessages[accountUuid][partnerId] || [];
        // 合并去重
        const merged = [...existing];
        localMsgs.forEach(m => {
          if (!merged.find(em => em.id === m.id)) {
            merged.push(m);
            this.msgIdSet.add(String(m.id));
          }
        });
        
        merged.sort((a, b) => a.time - b.time);
        
        const messagesForAccount = { ...this.accountMessages[accountUuid] };
        messagesForAccount[partnerId] = merged;
        this.accountMessages = { ...this.accountMessages, [accountUuid]: messagesForAccount };
      }
    },

    async loadConversations(accountUuid: string) {
      if (!accountUuid) return;
      
      const dbConvs = await contactCache.getConversations(accountUuid);
      this.accountConversations[accountUuid] = dbConvs;
      console.log(`[ChatStore] 已为账号 ${accountUuid} 加载 ${dbConvs.length} 个历史会话`);
      
      // 不再从本地 DB 加载消息 ID 去重，Redis 消息将通过 Redis 接口自身的逻辑处理
    },

    async clearGroupMessages(accountUuid: string) {
      // 1. 清理本地 DB
      await contactCache.clearGroupMessages();

      // 2. 清理内存消息记录
      if (this.accountMessages[accountUuid]) {
        const messagesForAccount = { ...this.accountMessages[accountUuid] };
        Object.keys(messagesForAccount).forEach(partnerId => {
          if (partnerId.endsWith('@chatroom')) {
            delete messagesForAccount[partnerId];
          }
        });
        this.accountMessages = { ...this.accountMessages, [accountUuid]: messagesForAccount };
      }

      // 3. 更新会话列表中的预览（可选，通常群消息被清理后，会话列表仍保留但最后一条消息可能需要更新，
      // 这里为了简单直接保留会话，或者如果用户需要彻底清理也可以清理会话预览）
      if (this.accountConversations[accountUuid]) {
        const list = [...this.accountConversations[accountUuid]];
        list.forEach(conv => {
          if (conv.wxid.endsWith('@chatroom')) {
            conv.lastMsg = '[消息已清理]';
            conv.unread = 0;
          }
        });
        this.accountConversations[accountUuid] = list;
      }
    },

    async clearOfficialMessages(accountUuid: string) {
      // 1. 清理本地 DB
      await contactCache.clearOfficialMessages();

      // 2. 清理内存消息记录
      if (this.accountMessages[accountUuid]) {
        const messagesForAccount = { ...this.accountMessages[accountUuid] };
        Object.keys(messagesForAccount).forEach(partnerId => {
          if (partnerId.startsWith('gh_') || ['fmessage', 'medianote', 'floatbottle'].includes(partnerId)) {
            delete messagesForAccount[partnerId];
          }
        });
        this.accountMessages = { ...this.accountMessages, [accountUuid]: messagesForAccount };
      }

      // 3. 更新会话列表预览
      if (this.accountConversations[accountUuid]) {
        const list = [...this.accountConversations[accountUuid]];
        list.forEach(conv => {
          if (conv.wxid.startsWith('gh_') || ['fmessage', 'medianote', 'floatbottle'].includes(conv.wxid)) {
            conv.lastMsg = '[消息已清理]';
            conv.unread = 0;
          }
        });
        this.accountConversations[accountUuid] = list;
      }
    },

    setConversations(accountUuid: string, conversations: Conversation[]) {
      this.accountConversations[accountUuid] = conversations;
    }
  }
});
