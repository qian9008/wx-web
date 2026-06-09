import { defineStore } from 'pinia';
import { useAccountStore } from './account';
import { contactCache } from '@/utils/contactCache';
import { isDebug } from '@/utils/debug';
import request from '@/utils/request';
import type { AppMessage, Conversation } from '@/types/chat';
import { BoundedSet, binaryInsert } from '@/utils/structures';

export const useChatStore = defineStore('chat', {
  state: () => ({
    accountMessages: {} as Record<string, Record<string, AppMessage[]>>,
    accountConversations: {} as Record<string, Conversation[]>,
    activeId: '',
    // Fix #1: 使用有界集合替代无限增长的 Set
    _msgIdDedup: new BoundedSet(2000) as BoundedSet,
    // 保留 msgIdSet 引用以兼容外部访问
    get msgIdSet(): BoundedSet { return (this as any)._msgIdDedup; },
  }),
  actions: {
    updateMessageImageUrl(userName: string, partnerId: string, msgId: string, newUrl: string, isBigImage = false) {
      if (this.accountMessages[userName]?.[partnerId]) {
        const msgs = this.accountMessages[userName][partnerId];
        const found = msgs.find(m => String(m.id) === String(msgId));
        if (found) {
          found.imageUrl = newUrl;
          if (isBigImage) {
            found.isBigImageLoaded = true;
          }
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

      // 2. 更新内存 Store
      if (!this.accountMessages[userName]) {
        this.accountMessages[userName] = {};
      }

      const messagesForAccount = { ...this.accountMessages[userName] };
      const current = messagesForAccount[partnerId] || [];

      // 使用二分插入保持有序
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

      const list = [...this.accountConversations[userName]];
      const existingIdx = list.findIndex(c => c.wxid === wxid);

      let conv: Conversation;
      if (existingIdx === -1) {
        const accountStore = useAccountStore();
        const contact = accountStore.accountContactMaps[userName]?.[wxid];

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

        if (displayName === wxid) {
          accountStore.enqueueContactDetails(wxid, userName);
        }

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
        list.splice(existingIdx, 1);
        list.unshift(conv);
      }

      this.accountConversations[userName] = list;

      const accountStore = useAccountStore();
      if (!accountStore.isRedisMode(userName)) {
        await contactCache.saveConversation(userName, JSON.parse(JSON.stringify(conv)));
      }
    },

    async loadHistory(userName: string, partnerId: string) {
      if (!userName || !partnerId) return;

      const accountStore = useAccountStore();
      if (accountStore.isDemoMode) return;
      if (accountStore.isRedisMode(userName)) return;

      if (this.accountMessages[userName]?.[partnerId] && this.accountMessages[userName][partnerId].length > 0) {
        return;
      }

      const localMsgs = await contactCache.getMessages(userName, partnerId, 50);

      if (localMsgs.length > 0) {
        if (!this.accountMessages[userName]) {
          this.accountMessages[userName] = {};
        }

        const existing = this.accountMessages[userName][partnerId] || [];
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
      if (accountStoreRef.isDemoMode) return;
      if (accountStoreRef.isRedisMode(userName)) return;

      if (this.accountConversations[userName] && this.accountConversations[userName].length > 0) {
        return;
      }

      const dbConvs = await contactCache.getConversations(userName);
      this.accountConversations[userName] = dbConvs;

      if (dbConvs.length === 0) return;

      const allWxids = dbConvs.map(c => c.wxid);
      const cachedContacts = await contactCache.getMultiple(allWxids, userName);

      const needFetch: string[] = [];
      const convUpdates: Array<{ idx: number; nickname: string; avatar: string }> = [];

      dbConvs.forEach((c, idx) => {
        const extractName = (contact: any): string => {
          return contact?.remark?.str || contact?.Remark?.str || contact?.remark || contact?.Remark
              || contact?.nickName?.str || contact?.NickName?.str || contact?.nickName || contact?.NickName
              || '';
        };
        const extractAvatar = (contact: any): string => {
          return contact?.smallHeadImgUrl || contact?.SmallHeadImgUrl
              || contact?.headImgUrl || contact?.HeadImgUrl || contact?.avatar || '';
        };

        const convHasName = c.nickname && c.nickname !== c.wxid;
        const convHasAvatar = !!c.avatar;
        if (convHasName && convHasAvatar) return;

        const dbContact = cachedContacts[c.wxid];
        const dbName = dbContact ? extractName(dbContact) : '';
        const dbAvatar = dbContact ? extractAvatar(dbContact) : '';
        if (dbName) {
          if (!convHasName || !convHasAvatar) {
            convUpdates.push({
              idx,
              nickname: dbName || c.nickname,
              avatar: dbAvatar || c.avatar
            });
          }
          return;
        }

        const memContact = accountStoreRef.accountContactMaps[userName]?.[c.wxid];
        if (memContact && !memContact.isPlaceholder && extractName(memContact)) return;

        needFetch.push(c.wxid);
      });

      if (convUpdates.length > 0) {
        const convsCopy = [...(this.accountConversations[userName] || [])];
        convUpdates.forEach(({ idx, nickname, avatar }) => {
          convsCopy[idx] = { ...convsCopy[idx], nickname, avatar };
          contactCache.saveConversation(userName, JSON.parse(JSON.stringify(convsCopy[idx])));
        });
        this.accountConversations[userName] = convsCopy;
      }

      if (needFetch.length > 0) {
        accountStoreRef.enqueueContactDetails(needFetch, userName);
      }

      dbConvs.forEach(c => {
        if (c.avatar) accountStoreRef.getAvatarUrl(c.avatar);
      });
    },

    async clearGroupMessages(userName: string) {
      await contactCache.clearGroupMessages(userName);
      if (this.accountMessages[userName]) {
        const messagesForAccount = { ...this.accountMessages[userName] };
        Object.keys(messagesForAccount).forEach(partnerId => {
          if (partnerId.endsWith('@chatroom')) {
            delete messagesForAccount[partnerId];
          }
        });
        this.accountMessages = { ...this.accountMessages, [userName]: messagesForAccount };
      }
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
      await contactCache.clearOfficialMessages(userName);
      if (this.accountMessages[userName]) {
        const messagesForAccount = { ...this.accountMessages[userName] };
        Object.keys(messagesForAccount).forEach(partnerId => {
          if (partnerId.startsWith('gh_') || ['fmessage', 'medianote', 'floatbottle'].includes(partnerId)) {
            delete messagesForAccount[partnerId];
          }
        });
        this.accountMessages = { ...this.accountMessages, [userName]: messagesForAccount };
      }
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

    migrateData(oldUuid: string, newUuid: string) {
      if (oldUuid === newUuid) return;
      if (this.accountMessages[oldUuid]) {
        this.accountMessages[newUuid] = {
          ...this.accountMessages[newUuid],
          ...this.accountMessages[oldUuid]
        };
        delete this.accountMessages[oldUuid];
      }
      if (this.accountConversations[oldUuid]) {
        this.accountConversations[newUuid] = this.accountConversations[oldUuid];
        delete this.accountConversations[oldUuid];
      }
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
      if (accountStore.isDemoMode) return;
      const writeBackUrl = accountStore.resolveRedisUrl(userName, '/other/SaveMsgToRedis');
      if (!writeBackUrl) throw new Error('未配置新 Redis 地址');

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

      await request.post(writeBackUrl, payload);
    },

    async loadAllMessagesFromRedis(userName: string) {
      const accountStore = useAccountStore();
      if (accountStore.isDemoMode) return true;
      const readUrl = accountStore.resolveRedisUrl(userName, '/other/SaveMsgToRedis');
      if (!readUrl) throw new Error('未配置新 Redis 地址');

      let res: any = null;
      try {
        res = await request.get(readUrl);
      } catch (getErr) {
        console.warn('[ChatStore:Redis] 读回聊天记录 GET 失败，尝试 POST:', getErr);
      }

      if (!res || (typeof res === 'object' && Object.keys(res).length === 0)) {
        res = await request.post(readUrl, {});
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

    async clearUnread(userName: string, wxid: string) {
      if (!this.accountConversations[userName]) return;
      const list = [...this.accountConversations[userName]];
      const idx = list.findIndex(c => c.wxid === wxid);
      if (idx > -1) {
        list[idx] = { ...list[idx], unread: 0 };
        this.accountConversations[userName] = list;
        const accountStore = useAccountStore();
        if (!accountStore.isRedisMode(userName)) {
          await contactCache.saveConversation(userName, JSON.parse(JSON.stringify(list[idx])));
        }
      }
    }
  }
});
