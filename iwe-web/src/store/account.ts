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

export const useAccountStore = defineStore('account', {
  state: () => ({
    // 统一键名
    adminKey: localStorage.getItem('ADMIN_KEY') || '',
    baseUrl: localStorage.getItem('baseUrl') || '',
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
    accounts: [] as Account[],
    activeAccountUuid: '',
    // 内存镜像：wxid -> contactDetail
    contactMap: {} as Record<string, any>,
    // 头像 Blob URL 缓存：url -> blobUrl
    avatarBlobMap: {} as Record<string, string>
  }),

  actions: {
    setGlobalConfig(url: string, adminKey: string, debug: any) {
      this.baseUrl = url;
      this.adminKey = adminKey;
      this.debug = typeof debug === 'boolean' ? { ...this.debug, all: debug } : debug;
      localStorage.setItem('baseUrl', url);
      localStorage.setItem('ADMIN_KEY', adminKey);
      localStorage.setItem('debug_config', JSON.stringify(this.debug));
    },

    updateDebugConfig(config: Partial<DebugConfig>) {
      this.debug = { ...this.debug, ...config };
      localStorage.setItem('debug_config', JSON.stringify(this.debug));
    },

    // 账号管理
    async syncAccountsFromServer() {
      try {
        const res: any = await adminApi.getOnlineAccounts();
        console.log('[AccountStore] 获取到原始账号数据:', res);
        const data = res.Data || res;
        this.accounts = (Array.isArray(data) ? data : []).map((acc: any) => {
          const uuid = acc.wx_id || acc.uuid || acc.wxid || acc.UserName;
          const key = acc.license || acc.key || acc.session_key;
          return {
            uuid: uuid || '', // 允许为空槽位
            sessionKey: key,
            nickname: acc.nick_name || acc.nickname || (uuid ? '已登录' : '未登录槽位'),
            avatar: acc.avatar || '',
            status: uuid ? 'online' : 'offline'
          };
        });
        
        console.log(`[AccountStore] 账号列表已更新，包含 ${this.accounts.length} 个槽位`);

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
    async loadContactsFromCache() {
      const all = await contactCache.getAll();
      const map: Record<string, any> = {};
      all.forEach((c: any) => {
        const wxid = c.userName?.str || c.UserName?.str || c.wxid || c.userName;
        if (wxid) map[wxid] = c;
      });
      this.contactMap = map;
      console.log(`[AccountStore] 内存镜像已加载 ${Object.keys(map).length} 个联系人`);
    },

    // 获取并缓存头像 Blob
    async getAvatarUrl(url: string) {
      if (!url) return '';
      // 内存缓存命中
      if (this.avatarBlobMap[url]) return this.avatarBlobMap[url];

      // 微信头像域名已知存在 CORS 限制，无法通过 JS 下载
      // 直接返回原始 URL，不触发下载逻辑，从而避免控制台 ERR_FAILED
      const restrictedDomains = ['wx.qlogo.cn', 'mmhead.c2c.wechat.com'];
      if (restrictedDomains.some(domain => url.includes(domain))) {
        return url;
      }

      // 尝试从 IndexedDB 获取
      const cached = await contactCache.getAvatar(url);
      if (cached) {
        const blobUrl = URL.createObjectURL(cached);
        this.avatarBlobMap[url] = blobUrl;
        return blobUrl;
      }

      // 异步下载到本地缓存
      this.downloadAndCacheAvatar(url);
      return url;
    },

    async downloadAndCacheAvatar(url: string) {
      try {
        // 由于后端没有 /other/DownloadFile 接口 (404)，且微信域名严格限制 CORS
        // 我们改用一种“潜伏下载”策略：利用浏览器对 <img> 标签的跨域豁免
        // 注意：如果图片响应头没带 Allow-Origin，Canvas 依然无法读取数据。
        // 这是前端静态化头像的一个经典难题。
        
        const response = await fetch(url).catch(() => null);
        if (!response || !response.ok) return;
        
        const blob = await response.blob();
        await contactCache.saveAvatar(url, blob);
        const blobUrl = URL.createObjectURL(blob);
        this.avatarBlobMap[url] = blobUrl;
      } catch (e) {
        // 捕获所有错误（包括 CORS 导致的 fetch 失败），不抛出日志
      }
    },

    async updateContact(wxid: string, detail: any) {
      if (!wxid) return;
      // 更新内存
      this.contactMap[wxid] = { ...this.contactMap[wxid], ...detail };
      // 更新 DB
      await contactCache.set(wxid, detail);
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
