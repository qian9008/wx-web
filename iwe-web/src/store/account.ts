import { defineStore } from 'pinia';
import { useChatStore } from './chat';
import { syncDebugConfig } from '@/utils/debug';

// 引入垂直业务外部解耦模块
import {
  extractAvatarString,
  getAvatarUrl,
  getContactAvatar,
  getAccountAvatar
} from './account/utils';

import {
  autoSave62Data,
  syncAccountsFromServer,
  checkSingleAccountStatus,
  fetchProfileAndFixUuid,
  preloadOfflineAccountAvatars,
  getEffectiveAvatarConfig,
  isRedisMode,
  resolveRedisUrl
} from './account/profile';

import {
  loadContactsFromCache,
  updateContact,
  checkFriendRelation,
  forceUpdateContactDetails,
  deleteContact,
  syncFullContactList,
  enqueueContactDetails,
  processDetailsQueue
} from './account/contacts';

import {
  fillContactsFromRedis,
  syncViaRedis,
  triggerDebouncedRedisSync,
  triggerDebouncedRedisWriteback,
  saveAllContactsToRedis
} from './account/redis';

interface Account {
  uuid: string;
  sessionKey: string;
  nickname: string;
  avatar: string;
  status: 'online' | 'offline';
  alias?: string;
  initialized?: boolean;
}

interface DebugConfig {
  all: boolean;
  request: boolean;
  socket: boolean;
  cache: boolean;
}

interface AvatarConfig {
  downloadEnabled: boolean;
  cacheEnabled: boolean;
  isRedisLanMode: boolean;
  redisWriteBackUrl?: string;
  maxMessagesPerConv?: number;
  msgTtlDays?: number;
}

export const useAccountStore = defineStore('account', {
  state: () => {
    const isDemoMode = localStorage.getItem('isDemoMode') === 'true';
    return {
      isDemoMode,
      adminKey: isDemoMode ? '' : (localStorage.getItem('ADMIN_KEY') || ''),
      tokenKey: isDemoMode ? '' : (localStorage.getItem('TOKEN_KEY') || ''),
      baseUrl: isDemoMode ? '' : (localStorage.getItem('baseUrl') || localStorage.getItem('iwe_base_url') || ''),
      debug: (() => {
      try {
        const config = JSON.parse(localStorage.getItem('debug_config') || '{}');
        return {
          all: !!config.all,
          request: !!config.request,
          socket: !!config.socket,
          cache: !!config.cache
        };
      } catch (e) {
        return { all: false, request: false, socket: false, cache: false };
      }
    })() as DebugConfig,
    globalAvatarConfig: (() => {
      try {
        const config = JSON.parse(localStorage.getItem('avatar_config') || '{}');
        return {
          downloadEnabled: config.downloadEnabled !== false,
          cacheEnabled: config.cacheEnabled !== false,
          isRedisLanMode: config.isRedisLanMode !== false,
          redisWriteBackUrl: config.redisWriteBackUrl || '',
          maxMessagesPerConv: config.maxMessagesPerConv !== undefined ? Number(config.maxMessagesPerConv) : 500,
          msgTtlDays: config.msgTtlDays !== undefined ? Number(config.msgTtlDays) : 0
        };
      } catch (e) {
        return { downloadEnabled: true, cacheEnabled: true, isRedisLanMode: true, redisWriteBackUrl: '', maxMessagesPerConv: 500, msgTtlDays: 0 };
      }
    })() as AvatarConfig,
    accountConfigs: (() => {
      try {
        return JSON.parse(localStorage.getItem('account_avatar_configs') || '{}');
      } catch (e) {
        return {};
      }
    })() as Record<string, AvatarConfig>,
    accounts: [] as Account[],
    activeAccountUuid: '',
    detailsQueue: [] as string[],
    isProcessingQueue: false,
    lastSyncTimeMap: {} as Record<string, number>,
    syncLockMap: {} as Record<string, boolean>,
    accountContactMaps: {} as Record<string, Record<string, any>>,
    isContactListLoadedMap: {} as Record<string, boolean>,
    avatarBlobMap: {} as Record<string, string>,
    _statusTimer: null as any
    };
  },

  getters: {
    contactMap(state): Record<string, any> {
      return state.accountContactMaps[state.activeAccountUuid] || {};
    }
  },

  actions: {
    // 1. 静态数据延迟懒加载模块
    async loadDemoData() {
      const chatStore = useChatStore();
      const { populateDemoData } = await import('./demoMockData');
      populateDemoData(this, chatStore);
    },

    // 2. 轮询及管理代理
    startStatusPolling() {
      if (this._statusTimer) {
        clearInterval(this._statusTimer);
        this._statusTimer = null;
      }
    },
    stopStatusPolling() {
      if (this._statusTimer) {
        clearInterval(this._statusTimer);
        this._statusTimer = null;
      }
    },
    async autoSave62Data(license: string) {
      return autoSave62Data(this, license);
    },
    setGlobalConfig(url: string, adminKey: string, tokenKey: string, debug: any) {
      this.baseUrl = url;
      this.adminKey = adminKey;
      this.tokenKey = tokenKey;
      this.debug = typeof debug === 'boolean' ? { ...this.debug, all: debug } : debug;
      localStorage.setItem('baseUrl', url);
      localStorage.setItem('ADMIN_KEY', adminKey);
      localStorage.setItem('TOKEN_KEY', tokenKey);
      localStorage.setItem('debug_config', JSON.stringify(this.debug));
      syncDebugConfig(this.debug);
    },
    updateDebugConfig(config: Partial<DebugConfig>) {
      this.debug = { ...this.debug, ...config };
      localStorage.setItem('debug_config', JSON.stringify(this.debug));
      syncDebugConfig(this.debug);
    },
    updateAvatarConfig(config: Partial<AvatarConfig>, isGlobal = false) {
      if (isGlobal || !this.activeAccountUuid) {
        this.globalAvatarConfig = { ...this.globalAvatarConfig, ...config };
        localStorage.setItem('avatar_config', JSON.stringify(this.globalAvatarConfig));
      } else {
        const current = this.accountConfigs[this.activeAccountUuid] || { ...this.globalAvatarConfig };
        this.accountConfigs[this.activeAccountUuid] = { ...current, ...config };
        localStorage.setItem('account_avatar_configs', JSON.stringify(this.accountConfigs));
      }
      if (config.redisWriteBackUrl !== undefined) {
        this.triggerDebouncedRedisSync();
      }
    },

    // 3. 配置解析及极速模式判定代理
    getEffectiveAvatarConfig(uuid?: string) {
      return getEffectiveAvatarConfig(this, uuid);
    },
    resolveRedisUrl(uuid: string, apiPath: string): string {
      return resolveRedisUrl(this, uuid, apiPath);
    },
    isRedisMode(uuid?: string): boolean {
      return isRedisMode(this, uuid);
    },

    // 4. Redis 核心数据同步代理
    triggerDebouncedRedisSync() {
      return triggerDebouncedRedisSync(this);
    },
    fillContactsFromRedis(accountUuid: string, modContacts: any[]) {
      return fillContactsFromRedis(this, accountUuid, modContacts);
    },
    async syncViaRedis(uuid: string, key: string) {
      return syncViaRedis(this, uuid, key);
    },
    triggerDebouncedRedisWriteback(uuid: string) {
      return triggerDebouncedRedisWriteback(this, uuid);
    },
    async saveAllContactsToRedis(uuid: string) {
      return saveAllContactsToRedis(this, uuid);
    },

    // 5. 个人资料、身份修正及自身头像预加载代理
    async preloadOfflineAccountAvatars() {
      return preloadOfflineAccountAvatars(this);
    },
    async syncAccountsFromServer() {
      return syncAccountsFromServer(this);
    },
    async checkSingleAccountStatus(license: string): Promise<boolean> {
      return checkSingleAccountStatus(this, license);
    },
    async fetchProfileAndFixUuid(license: string) {
      return fetchProfileAndFixUuid(this, license);
    },

    // 6. 好友、本地缓存及分页拉取代理
    async loadContactsFromCache(accountUuid?: string) {
      return loadContactsFromCache(this, accountUuid);
    },
    async updateContact(wxid: string, detail: any, accountUuid?: string, triggerAutoFetch = true) {
      return updateContact(this, wxid, detail, accountUuid, triggerAutoFetch);
    },
    async checkFriendRelation(username: string) {
      return checkFriendRelation(this, username);
    },
    async forceUpdateContactDetails(username: string) {
      return forceUpdateContactDetails(this, username);
    },
    async deleteContact(username: string) {
      return deleteContact(this, username);
    },
    async syncFullContactList(uuid: string, key: string, force = false) {
      return syncFullContactList(this, uuid, key, force);
    },

    // 7. 详情静默补充队列代理
    enqueueContactDetails(wxids: string | string[], accountUuid?: string) {
      return enqueueContactDetails(this, wxids, accountUuid);
    },
    async processDetailsQueue() {
      return processDetailsQueue(this);
    },

    // 8. 辅助工具及内存清理代理
    async getAvatarUrl(url: string) {
      return getAvatarUrl(url);
    },
    getContactAvatar(c: any): string {
      return getContactAvatar(c);
    },
    getAccountAvatar(acc: any): string {
      return getAccountAvatar(this, acc);
    },
    clearMemoryAll(userName?: string) {
      if (userName) {
        delete this.lastSyncTimeMap[userName];
        delete this.syncLockMap[userName];
        delete this.isContactListLoadedMap[userName];
        if (this.accountContactMaps[userName]) {
          this.accountContactMaps[userName] = {};
        }
      } else {
        this.lastSyncTimeMap = {};
        this.syncLockMap = {};
        this.isContactListLoadedMap = {};
        this.accountContactMaps = {};
      }
      console.log("[AccountStore] 已成功清除内存中" + (userName ? '指定账号 ' + userName : '所有账号') + "的同步锁、同步时间及联系人镜像");
    }
  }
});
