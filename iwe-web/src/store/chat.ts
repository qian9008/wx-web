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

// Fix #1: 有界去重集合，避免 msgIdSet 无限增长（内存泄漏）
const MAX_DEDUP_SIZE = 2000;

class BoundedSet {
  private set = new Set<string>();
  private queue: string[] = []; // 保序队列，用于淘汰最旧 ID

  has(id: string): boolean {
    return this.set.has(id);
  }

  add(id: string): void {
    if (this.set.has(id)) return;
    this.set.add(id);
    this.queue.push(id);
    if (this.queue.length > MAX_DEDUP_SIZE) {
      const oldest = this.queue.shift()!;
      this.set.delete(oldest);
    }
  }

  get size(): number {
    return this.set.size;
  }
}

// Fix #2: 二分插入，O(log n) 代替全量 sort O(n log n)
function binaryInsert(arr: AppMessage[], msg: AppMessage): AppMessage[] {
  if (arr.length === 0) return [msg];
  // 如果已有序且新消息最新（常见场景），直接 push，O(1)
  if (msg.time >= arr[arr.length - 1].time) {
    return [...arr, msg];
  }
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].time <= msg.time) lo = mid + 1;
    else hi = mid;
  }
  const result = [...arr];
  result.splice(lo, 0, msg);
  return result;
}

export const useChatStore = defineStore('chat', {
  state: () => ({
    accountMessages: {} as Record<string, Record<string, AppMessage[]>>,
    accountConversations: {} as Record<string, Conversation[]>,
    activeId: '',
    // Fix #1: 使用有界集合替代无限增长的 Set
    _msgIdDedup: new BoundedSet() as BoundedSet,
    // 保留 msgIdSet 引用以兼容外部访问（指向同一个 BoundedSet）
    get msgIdSet(): BoundedSet { return (this as any)._msgIdDedup; },
  }),
  actions: {
    async addParsedMessage(userName: string, msg: AppMessage) {
      if (this._msgIdDedup.has(String(msg.id))) {
        if (isDebug('socket')) console.log(`[ChatStore] 消息 ID ${msg.id} 已在去重集合中`);
        return;
      }
      this._msgIdDedup.add(String(msg.id));

      const myWxid = userName.trim();
      const fromId = msg.from.trim();
      const toId = msg.to.trim();

      // Fix #10: 简化 partnerId 判定逻辑
      let partnerId: string;
      if (fromId === myWxid) {
        partnerId = toId || fromId;
      } else {
        partnerId = fromId || toId;
      }

      if (!partnerId || partnerId === 'undefined' || partnerId === 'null') {
        if (isDebug('socket')) console.warn(`[ChatStore] 拦截到无效 partnerId 消息，已舍弃:`, msg);
        return;
      }

      if (isDebug('socket')) console.log(`[ChatStore] 消息归类判定: myWxid=${myWxid}, partnerId=${partnerId}`);

      // 1. 持久化消息到 DB
      const msgWithPartner = { ...msg, partnerId };
      await contactCache.saveMessage(userName, msgWithPartner);

      // 2. 更新内存 Store（Fix #2: 二分插入 + Fix #8: 删除冗余的内存层 find 去重）
      if (!this.accountMessages[userName]) {
        this.accountMessages[userName] = {};
      }

      const messagesForAccount = { ...this.accountMessages[userName] };
      const current = messagesForAccount[partnerId] || [];

      // 使用二分插入保持有序，避免全量 sort
      messagesForAccount[partnerId] = binaryInsert(current, msg);

      // 强制触发响应式更新
      this.accountMessages[userName] = messagesForAccount;
      if (isDebug('socket')) console.log(`[ChatStore] 内存更新完成，当前 ${partnerId} 会话消息数: ${messagesForAccount[partnerId].length}`);

      // 3. 更新会话列表镜像 (upsert)
      try {
        await this.updateConversation(userName, partnerId, msg);
        if (isDebug('socket')) console.log(`[ChatStore] 会话列表已更新: ${partnerId}`);
      } catch (err) {
        console.error(`[ChatStore] updateConversation 异常:`, err);
      }
    },

    async updateConversation(userName: string, wxid: string, msg: any) {
      if (!this.accountConversations[userName]) {
        this.accountConversations = { ...this.accountConversations, [userName]: [] };
      }

      // Fix #5: 置顶而非全量 sort
      const list = [...this.accountConversations[userName]];
      const existingIdx = list.findIndex(c => c.wxid === wxid);

      let conv: Conversation;
      if (existingIdx === -1) {
        conv = {
          wxid,
          nickname: wxid,
          avatar: '',
          lastMsg: msg.content,
          time: msg.time,
          unread: msg.isSelf ? 0 : 1
        };
        list.unshift(conv); // 新会话直接置顶
      } else {
        conv = { ...list[existingIdx] };
        conv.lastMsg = msg.content;
        conv.time = msg.time;
        if (!msg.isSelf && wxid !== this.activeId) {
          conv.unread = (conv.unread || 0) + 1;
        }
        // 从原位置移除，插入头部（置顶）
        list.splice(existingIdx, 1);
        list.unshift(conv);
      }

      this.accountConversations[userName] = list;

      // 持久化会话到 DB (强制克隆为纯对象，避免 DataCloneError)
      await contactCache.saveConversation(userName, JSON.parse(JSON.stringify(conv)));
    },

    async loadHistory(userName: string, partnerId: string) {
      if (!userName || !partnerId) return;

      // 从 IndexedDB 加载最近的 50 条本地缓存
      const localMsgs = await contactCache.getMessages(userName, partnerId, 50);

      if (localMsgs.length > 0) {
        console.log(`[ChatStore] 从本地加载了 ${localMsgs.length} 条历史消息`);

        if (!this.accountMessages[userName]) {
          this.accountMessages[userName] = {};
        }

        const existing = this.accountMessages[userName][partnerId] || [];
        // 合并去重（加入 BoundedSet）
        const merged = [...existing];
        localMsgs.forEach(m => {
          if (!this._msgIdDedup.has(String(m.id))) {
            merged.push(m);
            this._msgIdDedup.add(String(m.id));
          }
        });

        merged.sort((a, b) => a.time - b.time);

        const messagesForAccount = { ...this.accountMessages[userName] };
        messagesForAccount[partnerId] = merged;
        this.accountMessages = { ...this.accountMessages, [userName]: messagesForAccount };
      }
    },

    async loadConversations(userName: string) {
      if (!userName) return;

      const dbConvs = await contactCache.getConversations(userName);
      this.accountConversations[userName] = dbConvs;
      console.log(`[ChatStore] 已为账号 ${userName} 加载 ${dbConvs.length} 个历史会话`);
    },

    async clearGroupMessages(userName: string) {
      // 1. 清理本地 DB
      await contactCache.clearGroupMessages(userName);

      // 2. 清理内存消息记录
      if (this.accountMessages[userName]) {
        const messagesForAccount = { ...this.accountMessages[userName] };
        Object.keys(messagesForAccount).forEach(partnerId => {
          if (partnerId.endsWith('@chatroom')) {
            delete messagesForAccount[partnerId];
          }
        });
        this.accountMessages = { ...this.accountMessages, [userName]: messagesForAccount };
      }

      // 3. 更新会话列表预览
      if (this.accountConversations[userName]) {
        const list = [...this.accountConversations[userName]];
        list.forEach(conv => {
          if (conv.wxid.endsWith('@chatroom')) {
            conv.lastMsg = '[消息已清理]';
            conv.unread = 0;
          }
        });
        this.accountConversations[userName] = list;
      }
    },

    async clearOfficialMessages(userName: string) {
      // 1. 清理本地 DB
      await contactCache.clearOfficialMessages(userName);

      // 2. 清理内存消息记录
      if (this.accountMessages[userName]) {
        const messagesForAccount = { ...this.accountMessages[userName] };
        Object.keys(messagesForAccount).forEach(partnerId => {
          if (partnerId.startsWith('gh_') || ['fmessage', 'medianote', 'floatbottle'].includes(partnerId)) {
            delete messagesForAccount[partnerId];
          }
        });
        this.accountMessages = { ...this.accountMessages, [userName]: messagesForAccount };
      }

      // 3. 更新会话列表预览
      if (this.accountConversations[userName]) {
        const list = [...this.accountConversations[userName]];
        list.forEach(conv => {
          if (conv.wxid.startsWith('gh_') || ['fmessage', 'medianote', 'floatbottle'].includes(conv.wxid)) {
            conv.lastMsg = '[消息已清理]';
            conv.unread = 0;
          }
        });
        this.accountConversations[userName] = list;
      }
    },

    setConversations(userName: string, conversations: Conversation[]) {
      this.accountConversations[userName] = conversations;
    },

    // 数据迁移：将旧 ID 下的内存数据迁移到新 ID
    migrateData(oldUuid: string, newUuid: string) {
      if (oldUuid === newUuid) return;

      // 迁移消息
      if (this.accountMessages[oldUuid]) {
        this.accountMessages[newUuid] = {
          ...this.accountMessages[newUuid],
          ...this.accountMessages[oldUuid]
        };
        delete this.accountMessages[oldUuid];
      }

      // 迁移会话
      if (this.accountConversations[oldUuid]) {
        this.accountConversations[newUuid] = this.accountConversations[oldUuid];
        delete this.accountConversations[oldUuid];
      }

      console.log(`[ChatStore] 数据已从 ${oldUuid} 迁移至 ${newUuid}`);
    }
  }
});
