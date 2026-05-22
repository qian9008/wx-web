import { defineStore } from 'pinia';
import { useAccountStore } from './account';
import { contactCache } from '@/utils/contactCache';
import { isDebug } from '@/utils/debug';
import request from '@/utils/request';

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
  statusNotifyData?: any;
  voiceBufId?: string;
  voiceLength?: number;
  voiceUrl?: string;
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

  clear(): void {
    this.set.clear();
    this.queue = [];
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
    updateMessageImageUrl(userName: string, partnerId: string, msgId: string, newUrl: string) {
      if (this.accountMessages[userName]?.[partnerId]) {
        const msgs = this.accountMessages[userName][partnerId];
        const found = msgs.find(m => String(m.id) === String(msgId));
        if (found) {
          found.imageUrl = newUrl;
        }
      }
    },
    async addParsedMessage(userName: string, msg: AppMessage, isHistorical = false) {
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

      // 1. 持久化消息到 DB（Redis 极速模式下跳过 IndexedDB 写入）
      const accountStore = useAccountStore();
      if (!accountStore.isRedisMode(userName)) {
        const msgWithPartner = { ...msg, partnerId };
        const config = accountStore.getEffectiveAvatarConfig(userName);
        await contactCache.saveMessage(userName, msgWithPartner, config.maxMessagesPerConv || 500);
      }

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

      // 3. 更新会话列表镜像 (upsert)
      try {
        await this.updateConversation(userName, partnerId, msg, isHistorical);
      } catch (err) {
        console.error(`[ChatStore] updateConversation 异常:`, err);
      }
    },

    async updateConversation(userName: string, wxid: string, msg: any, isHistorical = false) {
      if (!this.accountConversations[userName]) {
        this.accountConversations = { ...this.accountConversations, [userName]: [] };
      }

      // Fix #5: 置顶而非全量 sort
      const list = [...this.accountConversations[userName]];
      const existingIdx = list.findIndex(c => c.wxid === wxid);

      let conv: Conversation;
      if (existingIdx === -1) {
        const accountStore = useAccountStore();
        const contact = accountStore.accountContactMaps[userName]?.[wxid];
        
        // 优先级：备注 > 昵称 > wxid
        const displayName = contact?.remark?.str || contact?.Remark?.str || contact?.remark || contact?.Remark 
                        || contact?.nickName?.str || contact?.NickName?.str || contact?.nickName || contact?.NickName 
                        || wxid;
        const avatarUrl = contact?.smallHeadImgUrl || contact?.SmallHeadImgUrl || contact?.headImgUrl || contact?.avatar || '';

        conv = {
          wxid,
          nickname: displayName,
          avatar: avatarUrl,
          lastMsg: msg.content,
          time: msg.time,
          unread: (msg.isSelf || isHistorical) ? 0 : 1
        };
        list.unshift(conv); // 新会话直接置顶
        
        // 1. 触发详情补录 (如果当前是原始 ID)
        if (displayName === wxid) {
          accountStore.enqueueContactDetails(wxid, userName);
        }

        // 2. 立即触发头像预下载
        if (avatarUrl) {
          accountStore.getAvatarUrl(avatarUrl);
        }
      } else {
        conv = { ...list[existingIdx] };
        conv.lastMsg = msg.content;
        conv.time = msg.time;
        if (!msg.isSelf && wxid !== this.activeId && !isHistorical) {
          conv.unread = (conv.unread || 0) + 1;
        }
        // 从原位置移除，插入头部（置顶）
        list.splice(existingIdx, 1);
        list.unshift(conv);
      }

      this.accountConversations[userName] = list;

      // 持久化会话到 DB（Redis 极速模式下跳过 IndexedDB 写入）
      const accountStore = useAccountStore();
      if (!accountStore.isRedisMode(userName)) {
        await contactCache.saveConversation(userName, JSON.parse(JSON.stringify(conv)));
      }
    },

    async loadHistory(userName: string, partnerId: string) {
      if (!userName || !partnerId) return;

      const accountStore = useAccountStore();
      if (accountStore.isDemoMode) {
        return;
      }
      if (accountStore.isRedisMode(userName)) return;

      // 🚀 优化：如果内存中已缓存了该联系人的消息，直接跳过 IndexedDB 历史加载
      if (this.accountMessages[userName]?.[partnerId] && this.accountMessages[userName][partnerId].length > 0) {
        return;
      }

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

      const accountStoreRef = useAccountStore();
      if (accountStoreRef.isDemoMode) {
        return;
      }
      if (accountStoreRef.isRedisMode(userName)) return;

      // 🚀 优化：如果内存中已有当前账号的会话列表，直接使用，跳过 IndexedDB 读取
      if (this.accountConversations[userName] && this.accountConversations[userName].length > 0) {
        return;
      }

      const accountStore = useAccountStore();
      const dbConvs = await contactCache.getConversations(userName);
      this.accountConversations[userName] = dbConvs;
      console.log(`[ChatStore] 已为账号 ${userName} 加载 ${dbConvs.length} 个历史会话`);

      if (dbConvs.length === 0) return;

      // 批量查询 contacts DB，避免逐条读取
      const allWxids = dbConvs.map(c => c.wxid);
      const cachedContacts = await contactCache.getMultiple(allWxids, userName);

      // 三重校验：只有三者都无数据时，才真正需要请求 API
      const needFetch: string[] = [];
      const convUpdates: Array<{ idx: number; nickname: string; avatar: string }> = [];

      dbConvs.forEach((c, idx) => {
        // 辅助函数：从联系人对象中提取昵称（备注 > 昵称）
        const extractName = (contact: any): string => {
          return contact?.remark?.str || contact?.Remark?.str || contact?.remark || contact?.Remark
              || contact?.nickName?.str || contact?.NickName?.str || contact?.nickName || contact?.NickName
              || '';
        };
        const extractAvatar = (contact: any): string => {
          return contact?.smallHeadImgUrl || contact?.SmallHeadImgUrl
              || contact?.headImgUrl || contact?.HeadImgUrl || contact?.avatar || '';
        };

        // 校验1：会话记录本身是否已有完整数据
        const convHasName   = c.nickname && c.nickname !== c.wxid;
        const convHasAvatar = !!c.avatar;
        if (convHasName && convHasAvatar) return; // 完整，跳过

        // 校验2：contacts DB 是否已有该联系人
        const dbContact = cachedContacts[c.wxid];
        const dbName    = dbContact ? extractName(dbContact) : '';
        const dbAvatar  = dbContact ? extractAvatar(dbContact) : '';
        if (dbName) {
          // DB 里有数据但会话记录未同步，回写内存以修正显示
          if (!convHasName || !convHasAvatar) {
            convUpdates.push({
              idx,
              nickname: dbName || c.nickname,
              avatar:   dbAvatar || c.avatar
            });
          }
          return; // DB 有数据，不请求 API
        }

        // 校验3：内存 contactMap 是否已有（可能尚未写入 DB）
        const memContact = accountStore.accountContactMaps[userName]?.[c.wxid];
        if (memContact && !memContact.isPlaceholder && extractName(memContact)) return;

        // 三重校验均无数据，才加入请求队列
        needFetch.push(c.wxid);
      });

      // 回写：修正会话列表中昵称仍为 wxid 的记录（用 DB 数据补全）
      if (convUpdates.length > 0) {
        const convsCopy = [...(this.accountConversations[userName] || [])];
        convUpdates.forEach(({ idx, nickname, avatar }) => {
          convsCopy[idx] = { ...convsCopy[idx], nickname, avatar };
          contactCache.saveConversation(userName, JSON.parse(JSON.stringify(convsCopy[idx])));
        });
        this.accountConversations[userName] = convsCopy;
        console.log(`[ChatStore] 已用本地 DB 数据回写 ${convUpdates.length} 条会话昵称`);
      }

      if (needFetch.length > 0) {
        console.log(`[ChatStore] ${needFetch.length}/${dbConvs.length} 个联系人需请求 API 补全详情`);
        accountStore.enqueueContactDetails(needFetch, userName);
      } else {
        console.log(`[ChatStore] 所有 ${dbConvs.length} 个会话联系人详情完整，跳过 API`);
      }

      // 预下载头像（仅有 URL 的）
      dbConvs.forEach(c => {
        if (c.avatar) accountStore.getAvatarUrl(c.avatar);
      });
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
    },

    clearMemoryAll(userName?: string) {
      if (userName) {
        if (this.accountMessages[userName]) {
          this.accountMessages[userName] = {};
        }
        if (this.accountConversations[userName]) {
          this.accountConversations[userName] = [];
        }
      } else {
        this.accountMessages = {};
        this.accountConversations = {};
      }
      this._msgIdDedup.clear();
    },

    async saveAllMessagesToRedis(userName: string) {
      const accountStore = useAccountStore();
      if (accountStore.isDemoMode) {
        console.log('[ChatStore:Demo] 演示模式拦截 Redis 备份');
        return;
      }
      const writeBackUrl = accountStore.resolveRedisUrl(userName, '/other/SaveMsgToRedis');
      if (!writeBackUrl) throw new Error('未配置新 Redis 地址');
      
      // 过滤聊天记录：排除群聊和公众号/系统特殊账号，只备份个人单聊的聊天数据
      const filteredMessages: Record<string, any> = {};
      const msgs = this.accountMessages[userName] || {};
      Object.keys(msgs).forEach(partnerId => {
        if (partnerId.endsWith('@chatroom')) return;
        const specialIds = ['fmessage', 'medianote', 'floatbottle', 'newsapp', 'helper_entry', 'filehelper'];
        if (partnerId.startsWith('gh_') || specialIds.includes(partnerId)) return;
        filteredMessages[partnerId] = msgs[partnerId];
      });

      const filteredConversations = (this.accountConversations[userName] || []).filter((conv: any) => {
        const wxid = conv.wxid || '';
        if (wxid.endsWith('@chatroom')) return false;
        const specialIds = ['fmessage', 'medianote', 'floatbottle', 'newsapp', 'helper_entry', 'filehelper'];
        if (wxid.startsWith('gh_') || specialIds.includes(wxid)) return false;
        return true;
      });

      const payload = {
        accountMessages: filteredMessages,
        accountConversations: filteredConversations
      };
      
      console.log(`[ChatStore:Redis] 手动备份聊天记录到 Redis: ${writeBackUrl}`);
      await request.post(writeBackUrl, payload);
    },

    async loadAllMessagesFromRedis(userName: string) {
      const accountStore = useAccountStore();
      if (accountStore.isDemoMode) {
        console.log('[ChatStore:Demo] 演示模式拦截 Redis 恢复');
        return true;
      }
      const readUrl = accountStore.resolveRedisUrl(userName, '/other/SaveMsgToRedis');
      if (!readUrl) throw new Error('未配置新 Redis 地址');
      
      console.log(`[ChatStore:Redis] 手动从新 Redis 读回聊天记录 (URL: ${readUrl})`);
      let res: any = null;
      try {
        // 先尝试 GET 请求读取
        res = await request.get(readUrl);
        console.log('[ChatStore:Redis] 读回聊天记录响应 (GET):', res);
      } catch (getErr) {
        console.warn('[ChatStore:Redis] 读回聊天记录 GET 失败，尝试 POST:', getErr);
      }
      
      // 如果 GET 没拿到，尝试用 POST 空对象读回
      if (!res || (typeof res === 'object' && Object.keys(res).length === 0)) {
        res = await request.post(readUrl, {});
        console.log('[ChatStore:Redis] 读回聊天记录响应 (POST):', res);
      }
      
      if (res) {
        if (typeof res === 'string') {
          try {
            res = JSON.parse(res);
          } catch (e) {}
        }
        
        const data = res.Data !== undefined ? res.Data : (res.data !== undefined ? res.data : res);
        
        if (data && (data.accountMessages || data.accountConversations)) {
          this.accountMessages[userName] = data.accountMessages || {};
          this.accountConversations[userName] = data.accountConversations || [];
          
          // 重新把读回的消息 ID 塞入去重 Set 中，防止收到重复消息
          Object.values(this.accountMessages[userName]).forEach((msgs: any) => {
            if (Array.isArray(msgs)) {
              msgs.forEach(m => {
                if (m.id) {
                  this._msgIdDedup.add(String(m.id));
                }
              });
            }
          });
          return true;
        }
      }
      throw new Error('未在 Redis 中找到有效的聊天记录');
    },

    // 独立清理并持久化未读数
    async clearUnread(userName: string, wxid: string) {
      if (!this.accountConversations[userName]) return;
      const list = [...this.accountConversations[userName]];
      const idx = list.findIndex(c => c.wxid === wxid);
      if (idx > -1) {
        list[idx] = { ...list[idx], unread: 0 };
        this.accountConversations[userName] = list;
        // Redis 极速模式下跳过 IndexedDB 持久化
        const accountStore = useAccountStore();
        if (!accountStore.isRedisMode(userName)) {
          await contactCache.saveConversation(userName, JSON.parse(JSON.stringify(list[idx])));
        }
      }
    }
  }
});
