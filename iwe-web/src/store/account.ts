import { defineStore } from 'pinia';
import { adminApi } from '@/api/modules/admin';
import { messageApi } from '@/api/modules/im';
import { socketManager } from '@/utils/socketManager';
import { contactCache } from '@/utils/contactCache';

interface Account {
  uuid: string;
  sessionKey: string;
  nickname: string;
  avatar: string;
  status: 'online' | 'offline';
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
}

export const useAccountStore = defineStore('account', {
  state: () => ({
    // 统一键名
    adminKey: localStorage.getItem('ADMIN_KEY') || '',
    tokenKey: localStorage.getItem('TOKEN_KEY') || '',
    baseUrl: localStorage.getItem('baseUrl') || localStorage.getItem('iwe_base_url') || '',
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
    // 全局默认配置
    globalAvatarConfig: (() => {
      try {
        const config = JSON.parse(localStorage.getItem('avatar_config') || '{}');
        return {
          downloadEnabled: config.downloadEnabled !== false,
          cacheEnabled: config.cacheEnabled !== false
        };
      } catch (e) {
        return { downloadEnabled: true, cacheEnabled: true };
      }
    })() as AvatarConfig,
    // 账号独立配置：uuid -> AvatarConfig
    accountConfigs: (() => {
      try {
        return JSON.parse(localStorage.getItem('account_avatar_configs') || '{}');
      } catch (e) {
        return {};
      }
    })() as Record<string, AvatarConfig>,
    accounts: [] as Account[],
    activeAccountUuid: '',
    // 内存镜像：wxid -> contactDetail
    // 内存中的联系人镜像，按账号 UUID 隔离
    // 结构: { [accountUuid]: { [wxid]: contactDetail } }
    accountContactMaps: {} as Record<string, Record<string, any>>,
    
    // 兼容性计算属性：获取当前活跃账号的联系人 Map
    get contactMap(): Record<string, any> {
      return this.accountContactMaps[this.activeAccountUuid] || {};
    },
    // 头像 Blob URL 缓存：url -> blobUrl
    avatarBlobMap: {} as Record<string, string>
  }),

  actions: {
    setGlobalConfig(url: string, adminKey: string, tokenKey: string, debug: any) {
      this.baseUrl = url;
      this.adminKey = adminKey;
      this.tokenKey = tokenKey;
      this.debug = typeof debug === 'boolean' ? { ...this.debug, all: debug } : debug;
      localStorage.setItem('baseUrl', url);
      localStorage.setItem('ADMIN_KEY', adminKey);
      localStorage.setItem('TOKEN_KEY', tokenKey);
      localStorage.setItem('debug_config', JSON.stringify(this.debug));
    },

    updateDebugConfig(config: Partial<DebugConfig>) {
      this.debug = { ...this.debug, ...config };
      localStorage.setItem('debug_config', JSON.stringify(this.debug));
    },

    updateAvatarConfig(config: Partial<AvatarConfig>, isGlobal = false) {
      if (isGlobal || !this.activeAccountUuid) {
        // 更新全局默认配置
        this.globalAvatarConfig = { ...this.globalAvatarConfig, ...config };
        localStorage.setItem('avatar_config', JSON.stringify(this.globalAvatarConfig));
      } else {
        // 更新当前账号的配置
        const current = this.accountConfigs[this.activeAccountUuid] || { ...this.globalAvatarConfig };
        this.accountConfigs[this.activeAccountUuid] = { ...current, ...config };
        localStorage.setItem('account_avatar_configs', JSON.stringify(this.accountConfigs));
      }
    },

    // 获取当前有效的配置（优先使用账号独立配置，否则使用全局配置）
    getEffectiveAvatarConfig(uuid?: string): AvatarConfig {
      const targetUuid = uuid || this.activeAccountUuid;
      if (targetUuid && this.accountConfigs[targetUuid]) {
        return this.accountConfigs[targetUuid];
      }
      return this.globalAvatarConfig;
    },

    // 账号管理
    async syncAccountsFromServer() {
      try {
        let data: any[] = [];
        
        if (this.adminKey) {
          // 如果有管理密钥，获取所有账号
          const res: any = await adminApi.getOnlineAccounts();
          console.log('[AccountStore] 使用 ADMIN_KEY 获取到账号列表');
          data = res.Data || res;
        } else if (this.tokenKey) {
          // 如果只有授权码，构建单账号信息 (或者通过 GetLoginStatus 补全)
          console.log('[AccountStore] 使用 TOKEN_KEY 模式');
          try {
            const statusRes: any = await loginApi.getOnlineStatus(this.tokenKey);
            const sData = statusRes.Data || statusRes;
            
            // 根据返回的 Text 或 Code 判定在线状态
            const isOnline = statusRes.Code === 200 || 
                             (statusRes.Text && statusRes.Text.includes('在线状态良好'));
            
            data = [{
              wx_id: sData.wxid || sData.wx_id || '',
              license: this.tokenKey,
              nick_name: sData.nick_name || sData.nickname || '个人账号',
              avatar: sData.avatar || '',
              status: isOnline ? 'online' : 'offline'
            }];
          } catch (e) {
            // 降级：如果获取状态失败，至少保留一个槽位
            data = [{
              license: this.tokenKey,
              nick_name: '个人账号',
              status: 'offline'
            }];
          }
        }

        this.accounts = (Array.isArray(data) ? data : []).map((acc: any) => {
          const uuid = acc.wx_id || acc.uuid || acc.wxid || acc.UserName;
          const key = acc.license || acc.key || acc.session_key || acc.sessionKey;
          return {
            uuid: uuid || '', // 允许为空槽位
            sessionKey: key || this.tokenKey, // 兜底使用当前的 tokenKey
            nickname: acc.nick_name || acc.nickname || (uuid ? '已登录' : '未登录槽位'),
            avatar: acc.avatar || '',
            status: uuid ? 'online' : 'offline'
          };
        });
        
        console.log(`[AccountStore] 账号列表已更新，包含 ${this.accounts.length} 个槽位`);

        // 自动激活逻辑
        if (this.tokenKey) {
          // 精确匹配：找到与当前授权码关联的槽位
          const targetAcc = this.accounts.find(acc => acc.sessionKey === this.tokenKey || acc.uuid === this.tokenKey);
          // 激活标识：有 UUID 用 UUID，否则用授权码作为临时标识
          this.activeAccountUuid = targetAcc?.uuid || targetAcc?.sessionKey || this.tokenKey;
          console.log(`[AccountStore] 授权码模式激活标识: ${this.activeAccountUuid}`);
        } else if (this.accounts.length > 0 && !this.activeAccountUuid) {
          // ADMIN 模式：默认激活第一个已登录账号
          const firstOnline = this.accounts.find(a => a.uuid);
          if (firstOnline) {
            this.activeAccountUuid = firstOnline.uuid;
          }
        }

        // 核心修复：仅注册有有效 UUID 的账号
        this.accounts.forEach(acc => {
          if (acc.uuid) {
            console.log(`[AccountStore] 正在为已登录账号注册同步: ${acc.uuid}`);
            socketManager.registerAccount(acc.uuid, acc.sessionKey, acc.uuid);
          }
        });
      } catch (err) {
        console.error('获取账号列表失败:', err);
      }
    },

    // 核心：内存镜像管理
    async loadContactsFromCache(accountUuid?: string) {
      const targetUuid = accountUuid || this.activeAccountUuid;
      if (!targetUuid) return;
      
      const all = await contactCache.getAll(targetUuid);
      const map: Record<string, any> = {};
      all.forEach((c: any) => {
        const wxid = c.userName?.str || c.UserName?.str || c.wxid || c.userName;
        if (wxid) map[wxid] = c;
      });
      
      this.accountContactMaps[targetUuid] = map;
      console.log(`[AccountStore] 内存镜像已加载 ${Object.keys(map).length} 个联系人 (账号: ${targetUuid})`);
    },

    // 获取并缓存头像 Blob
    async getAvatarUrl(url: string) {
      if (!url) return '';
      // 内存缓存命中
      if (this.avatarBlobMap[url]) return this.avatarBlobMap[url];

      const config = this.getEffectiveAvatarConfig();

      // 如果缓存开启，尝试从 IndexedDB 获取
      if (config.cacheEnabled) {
        const cached = await contactCache.getAvatar(url);
        if (cached) {
          const blobUrl = URL.createObjectURL(cached);
          this.avatarBlobMap[url] = blobUrl;
          return blobUrl;
        }
      }

      // 微信头像域名已知存在 CORS 限制，无法通过 JS 下载
      const restrictedDomains = ['wx.qlogo.cn', 'mmhead.c2c.wechat.com'];
      if (restrictedDomains.some(domain => url.includes(domain))) {
        return url;
      }

      // 如果下载开启，异步下载到本地缓存
      if (config.downloadEnabled) {
        this.downloadAndCacheAvatar(url);
      }
      return url;
    },

    async downloadAndCacheAvatar(url: string) {
      const config = this.getEffectiveAvatarConfig();
      if (!config.downloadEnabled) return;
      try {
        const response = await fetch(url).catch(() => null);
        if (!response || !response.ok) return;
        
        const blob = await response.blob();
        
        // 仅在缓存开启时保存到 DB
        if (config.cacheEnabled) {
          await contactCache.saveAvatar(url, blob);
        }
        
        const blobUrl = URL.createObjectURL(blob);
        this.avatarBlobMap[url] = blobUrl;
      } catch (e) {
        // 捕获所有错误（包括 CORS 导致的 fetch 失败），不抛出日志
      }
    },

    async updateContact(wxid: string, detail: any, accountUuid?: string) {
      if (!wxid) return;
      const targetUuid = accountUuid || this.activeAccountUuid;
      if (!targetUuid) return;

      // 确保该账号的 Map 已初始化
      if (!this.accountContactMaps[targetUuid]) {
        this.accountContactMaps[targetUuid] = {};
      }
      
      // 更新内存
      this.accountContactMaps[targetUuid][wxid] = { 
        ...this.accountContactMaps[targetUuid][wxid], 
        ...detail 
      };
      
      // 更新 DB
      await contactCache.set(wxid, detail, targetUuid);
    },

    // 增量补全通讯录
    async syncFullContactList(uuid: string, key: string) {
      try {
        let currentContactSeq = 0;
        let currentChatRoomSeq = 0;
        let allCleanIds: string[] = [];
        let hasMore = true;

        while (hasMore) {
          const res: any = await messageApi.getContactList(key, currentContactSeq, currentChatRoomSeq);
          const data = res.Data || res;
          const userList = data.UsernameList || [];
          
          allCleanIds = [...allCleanIds, ...userList];
          currentContactSeq = data.CurrentWxcontactSeq;
          currentChatRoomSeq = data.CurrentChatRoomContactSeq;

          if (userList.length === 0 || (currentContactSeq === 0 && currentChatRoomSeq === 0)) {
            hasMore = false;
          }
        }

        // 批量补全详情
        const batchSize = 50;
        for (let i = 0; i < allCleanIds.length; i += batchSize) {
          const batch = allCleanIds.slice(i, i + batchSize);
          const needFetch = batch.filter(id => !this.contactMap[id]);
          
          if (needFetch.length > 0) {
            const details: any = await messageApi.getContactDetailsList(key, needFetch);
            const detailList = details.Data || details || [];
            for (const d of detailList) {
              const wxid = d.userName?.str || d.UserName?.str || d.wxid || d.userName;
              await this.updateContact(wxid, d);
            }
          }
        }
      } catch (err) {
        console.error('通讯录同步失败:', err);
      }
    }
  }
});
