import { defineStore } from 'pinia';
import { adminApi } from '@/api/modules/admin';
import { loginApi, messageApi } from '@/api/modules/im';
import { socketManager } from '@/utils/socketManager';
import { contactCache } from '@/utils/contactCache';
import { useChatStore } from './chat';

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
    
    // 详情补全请求队列
    detailsQueue: [] as string[],
    isProcessingQueue: false,
    
    // 同步控制：accountUuid -> timestamp
    lastSyncTimeMap: {} as Record<string, number>,
    // 同步锁：防止同一账号并发同步
    syncLockMap: {} as Record<string, boolean>,

    // 内存镜像：{ [accountUuid]: { [wxid]: contactDetail } }
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
        this.globalAvatarConfig = { ...this.globalAvatarConfig, ...config };
        localStorage.setItem('avatar_config', JSON.stringify(this.globalAvatarConfig));
      } else {
        const current = this.accountConfigs[this.activeAccountUuid] || { ...this.globalAvatarConfig };
        this.accountConfigs[this.activeAccountUuid] = { ...current, ...config };
        localStorage.setItem('account_avatar_configs', JSON.stringify(this.accountConfigs));
      }
    },

    getEffectiveAvatarConfig(uuid?: string): AvatarConfig {
      const targetUuid = uuid || this.activeAccountUuid;
      if (targetUuid && this.accountConfigs[targetUuid]) {
        return this.accountConfigs[targetUuid];
      }
      return this.globalAvatarConfig;
    },

    async syncAccountsFromServer() {
      try {
        let data: any[] = [];
        
        if (this.adminKey) {
          const res: any = await adminApi.getOnlineAccounts();
          console.log('[AccountStore] 使用 ADMIN_KEY 获取到账号列表');
          data = res.Data || res;
        } else if (this.tokenKey) {
          console.log('[AccountStore] 使用 TOKEN_KEY 模式');
          try {
            const statusRes: any = await loginApi.getOnlineStatus(this.tokenKey);
            const sData = statusRes.Data || statusRes;
            const isOnline = statusRes.Code === 200 || sData.loginState === 1 || 
                             (statusRes.Text && statusRes.Text.includes('在线状态良好'));
            const resolvedUuid = sData.wxid || sData.wx_id || this.tokenKey;

            data = [{
              wx_id: resolvedUuid,
              license: this.tokenKey,
              nick_name: sData.nick_name || sData.nickname || '授权账号',
              avatar: sData.avatar || '',
              status: isOnline ? 'online' : 'offline'
            }];
          } catch (e) {
            data = [{
              wx_id: this.tokenKey,
              license: this.tokenKey,
              nick_name: '授权账号',
              status: 'offline'
            }];
          }
        }

        this.accounts = (Array.isArray(data) ? data : []).map((acc: any) => {
          const uuid = acc.wx_id || acc.uuid || acc.wxid || acc.UserName;
          // 修正 Key 选取：优先取账号自身的 license，授权码模式下取 tokenKey，绝对不回退到管理码
          const key = acc.license || acc.key || acc.session_key || acc.sessionKey || (this.tokenKey ? this.tokenKey : '');

          return {
            uuid: uuid || '', 
            sessionKey: key, 
            nickname: acc.nick_name || acc.nickname || (uuid ? '已登录' : '未登录槽位'),
            avatar: acc.avatar || '',
            status: (acc.status || (uuid ? 'online' : 'offline')) as 'online' | 'offline'
          };
        });
        
        if (this.tokenKey) {
          const targetAcc = this.accounts.find(acc => acc.sessionKey === this.tokenKey || acc.uuid === this.tokenKey);
          this.activeAccountUuid = targetAcc?.uuid || targetAcc?.sessionKey || this.tokenKey;
        } else if (this.accounts.length > 0 && !this.activeAccountUuid) {
          const firstOnline = this.accounts.find(a => a.uuid);
          if (firstOnline) {
            this.activeAccountUuid = firstOnline.uuid;
          }
        }

        this.accounts.forEach(acc => {
          if (acc.uuid) {
            socketManager.registerAccount(acc.uuid, acc.sessionKey, acc.uuid);
            
            // 修正：所有账号在获取列表后，都应该尝试补全一次资料以统一 ID
            // 特别是 adminKey 模式下的账号，也需要通过 GetProfile 修正为真实 wxid
            this.fetchProfileAndFixUuid(acc.sessionKey);
          }
        });
      } catch (err) {
        console.error('获取账号列表失败:', err);
      }
    },

    async fetchProfileAndFixUuid(license: string) {
      try {
        const res: any = await loginApi.getProfile(license);
        console.log(`[AccountStore] GetProfile 响应 (${license.substring(0,8)}...):`, res);
        
        // 修正：拦截器已经剥离了 Data 层，res 可能就是数据本身，也可能还带着 Data (取决于 API 实现)
        const data = res?.Data || res;
        const userInfo = data?.userInfo || data?.UserInfo || data; 
        
        if (!userInfo || (!userInfo.userName && !userInfo.UserName)) {
          console.warn(`[AccountStore] GetProfile 未能解析到 userInfo 结构`, res);
          return;
        }

        const realWxid = userInfo.userName?.str || userInfo.UserName?.str || userInfo.userName || userInfo.UserName;
        const realNick = userInfo.nickName?.str || userInfo.NickName?.str || userInfo.nickName || userInfo.NickName;
        const realAvatar = userInfo.smallHeadImgUrl || userInfo.SmallHeadImgUrl || userInfo.bigHeadImgUrl || userInfo.BigHeadImgUrl;

        if (realWxid) {
          console.log(`[AccountStore] 身份比对: 当前ID vs 真实ID -> ${license.substring(0,10)}... vs ${realWxid}`);
          
          const chatStore = useChatStore();
          // 注意：我们要找的是 sessionKey 匹配的那个账号对象
          const accIndex = this.accounts.findIndex(a => a.sessionKey === license);
          if (accIndex > -1) {
            const oldUuid = this.accounts[accIndex].uuid;
            if (oldUuid === realWxid) {
              console.log(`[AccountStore] 账号 ID 已是最新，无需修正 (${realWxid})`);
              return;
            }

            console.log(`[AccountStore] 触发 ID 修正: ${oldUuid} -> ${realWxid}`);
            
            // 1. 迁移内存镜像
            if (this.accountContactMaps[oldUuid]) {
              this.accountContactMaps[realWxid] = { 
                ...this.accountContactMaps[realWxid], 
                ...this.accountContactMaps[oldUuid] 
              };
              delete this.accountContactMaps[oldUuid];
            }

            // 2. 迁移聊天记录 Pinia
            chatStore.migrateData(oldUuid, realWxid);
            
            // 3. 迁移 IndexedDB
            await contactCache.migrateAccountData(oldUuid, realWxid);
            
            // 4. 更新 Store 中的账号信息
            this.accounts[accIndex].uuid = realWxid;
            this.accounts[accIndex].nickname = realNick || this.accounts[accIndex].nickname;
            this.accounts[accIndex].avatar = realAvatar || this.accounts[accIndex].avatar;
            
            if (this.activeAccountUuid === oldUuid || this.activeAccountUuid === license) {
              this.activeAccountUuid = realWxid;
            }

            // 5. 重启 Socket 关联
            if (oldUuid) {
              socketManager.stopAccount(oldUuid);
            }
            socketManager.registerAccount(realWxid, license, realWxid);
            
            // 6. 重新加载新 ID 的缓存
            await this.loadContactsFromCache(realWxid);
            
            // 7. 触发新 ID 的全量同步判定
            this.syncFullContactList(realWxid, license);
          }
        }
      } catch (e) {
        console.warn('[AccountStore] 资料补全失败:', e);
      }
    },

    async loadContactsFromCache(accountUuid?: string) {
      const targetUuid = accountUuid || this.activeAccountUuid;
      if (!targetUuid) return;
      
      const all = await contactCache.getAll(targetUuid);
      const map: Record<string, any> = {};
      all.forEach((c: any) => {
        // 增加更健壮的 wxid 解析逻辑，确保能匹配到各种 API 返回的结构
        const wxid = c.userName?.str || c.UserName?.str || c.wxid || c.userName || c.UserName;
        if (wxid) {
          map[wxid] = c;
        }
      });
      
      this.accountContactMaps[targetUuid] = map;
      console.log(`[AccountStore] 内存镜像已加载 ${Object.keys(map).length} 个联系人 (账号: ${targetUuid})`);
    },

    async updateContact(wxid: string, detail: any, accountUuid?: string) {
      if (!wxid) return;
      const targetUuid = accountUuid || this.activeAccountUuid;
      if (!targetUuid) return;

      if (!this.accountContactMaps[targetUuid]) {
        this.accountContactMaps[targetUuid] = {};
      }
      
      this.accountContactMaps[targetUuid][wxid] = { 
        ...this.accountContactMaps[targetUuid][wxid], 
        ...detail,
        isPlaceholder: false // 清除占位标记
      };
      
      await contactCache.set(wxid, detail, targetUuid);
    },

    async syncFullContactList(uuid: string, key: string, force = false) {
      // 1. 同步锁判断
      if (this.syncLockMap[uuid]) return;
      
      this.syncLockMap[uuid] = true;
      try {
        console.log(`[AccountStore] 开始全量同步 (账号: ${uuid}, 强制: ${force})`);

        // 第一阶段：GetFriendList (获取好友总数并同步第一批)
        let apiTotalCount = 0;
        try {
          const friendRes: any = await messageApi.getFriendList(key);
          const friendData = friendRes.Data || friendRes;
          apiTotalCount = friendData.count || friendData.Count || 0;
          const friendList = friendData.friendList || [];
          
          if (friendList.length > 0) {
            console.log(`[AccountStore] GetFriendList 成功拉取 ${friendList.length} 个好友详情 (API 总数: ${apiTotalCount})`);
            for (const f of friendList) {
              const wxid = f.userName?.str || f.UserName?.str || f.wxid || f.userName || f.UserName;
              if (wxid) {
                await this.updateContact(wxid, f, uuid);
              }
            }
          }
        } catch (e) {
          console.warn('[AccountStore] GetFriendList 失败:', e);
        }

        // 智能判定：如果不是强制同步，看本地数据是否足够
        const currentDbCount = await contactCache.getCount('contacts', uuid);
        
        // 核心优化：如果 API 返回的总数与本地数据库数量匹配（或本地更多），且不是强制同步，则跳过耗时的分页
        if (!force && apiTotalCount > 0 && currentDbCount >= apiTotalCount) {
          console.log(`[AccountStore] 账号 ${uuid} 数量已达标 (db:${currentDbCount}, api:${apiTotalCount}), 跳过分页同步`);
          await this.loadContactsFromCache(uuid);
          return;
        }

        // 第二阶段：分页补漏
        let currentContactSeq = 0;
        let currentChatRoomSeq = 0;
        let hasMore = true;
        let newWxids: string[] = [];
        let safetyCounter = 0;

        while (hasMore && safetyCounter < 100) {
          safetyCounter++;
          const res: any = await messageApi.getContactList(key, currentContactSeq, currentChatRoomSeq);
          const data = res.Data || res;
          
          // 根据最新解读，数据位于 Data.ContactList
          const contactListData = data.ContactList || data.contactList || data;
          
          // 1. 提取 ID 列表
          const userList = contactListData.contactUsernameList || contactListData.UsernameList || 
                           contactListData.userNameList || contactListData.MemberList || 
                           contactListData.memberList || contactListData.List || [];
          
          if (userList.length > 0) {
            for (const item of userList) {
              const wxid = typeof item === 'string' ? item : (item.userName || item.UserName || item.wxid);
              if (wxid) {
                if (!this.accountContactMaps[uuid]?.[wxid] || this.accountContactMaps[uuid]?.[wxid].isPlaceholder) {
                  if (!this.accountContactMaps[uuid]) this.accountContactMaps[uuid] = {};
                  if (!this.accountContactMaps[uuid][wxid]) {
                    this.accountContactMaps[uuid][wxid] = { wxid, isPlaceholder: true };
                  }
                  newWxids.push(wxid);
                }
              }
            }
          }

          // 2. 提取并更新版本号指针 (大数字)
          const nextContactSeq = contactListData.currentWxcontactSeq || contactListData.CurrentWxcontactSeq || 0;
          const nextChatRoomSeq = contactListData.currentChatRoomContactSeq || contactListData.CurrentChatRoomContactSeq || 0;
          
          // 3. 核心：通过 continueFlag 判断是否继续
          const continueFlag = contactListData.continueFlag !== undefined ? contactListData.continueFlag : 
                               (contactListData.ContinueFlag !== undefined ? contactListData.ContinueFlag : 0);
          
          console.log(`[AccountStore] GetContactList 翻页: version(${currentContactSeq} -> ${nextContactSeq}), continueFlag: ${continueFlag}, 本页获取: ${userList.length}`);

          if (continueFlag === 1) {
            currentContactSeq = nextContactSeq;
            currentChatRoomSeq = nextChatRoomSeq;
            
            // 优化：每获取一页(50个)，就立刻触发一次详情补全，提高感知速度
            if (newWxids.length >= 50) {
              const batch = newWxids.splice(0, newWxids.length);
              console.log(`[AccountStore] 达到 50 个步长，先行补全批次详情...`);
              this.enqueueContactDetails(batch, uuid);
            }
            
            // 防止请求过快，给服务器留点喘息时间
            await new Promise(r => setTimeout(r, 100));
          } else {
            hasMore = false;
          }
        }

        // 自动触发详情补全
        if (newWxids.length > 0) {
          console.log(`[AccountStore] 分页发现 ${newWxids.length} 个联系人需补全详情 (账号: ${uuid})`);
          this.enqueueContactDetails(newWxids, uuid);
        }

        this.lastSyncTimeMap[uuid] = Date.now();
        console.log(`[AccountStore] 通讯录索引同步完成 (账号: ${uuid})`);
      } catch (err) {
        console.error('同步流程异常:', err);
      } finally {
        this.syncLockMap[uuid] = false;
      }
    },

    enqueueContactDetails(wxids: string | string[], accountUuid?: string) {
      const targetUuid = accountUuid || this.activeAccountUuid;
      if (!targetUuid) return;

      const ids = Array.isArray(wxids) ? wxids : [wxids];
      const map = this.accountContactMaps[targetUuid] || {};
      const needsFetch = ids.filter(id => !map[id] || map[id].isPlaceholder);
      
      needsFetch.forEach(id => {
        if (!this.detailsQueue.includes(id)) {
          this.detailsQueue.push(id);
        }
      });

      this.processDetailsQueue();
    },

    async processDetailsQueue() {
      if (this.isProcessingQueue || this.detailsQueue.length === 0) return;
      this.isProcessingQueue = true;

      const batchSize = 50;
      // 修正：从活跃账号获取 key，如果没有则回退
      const activeAcc = this.accounts.find(a => a.uuid === this.activeAccountUuid);
      const key = activeAcc?.sessionKey || this.tokenKey;

      try {
        let completed = 0;
        const total = this.detailsQueue.length;
        
        while (this.detailsQueue.length > 0) {
          const batch = this.detailsQueue.splice(0, batchSize);
          const details: any = await messageApi.getContactDetailsList(key, batch);
          const detailList = details.Data || details || [];
          
          for (const d of detailList) {
            const wxid = d.userName?.str || d.UserName?.str || d.wxid || d.userName || d.UserName;
            if (wxid) {
              await this.updateContact(wxid, d);
            }
          }
          
          completed += batch.length;
          console.log(`[AccountStore] 详情补全进度: ${completed}/${total} (当前批次: ${detailList.length})`);
          
          await new Promise(r => setTimeout(r, 200));
        }
      } catch (err) {
        console.error('[AccountStore] 补全队列异常:', err);
      } finally {
        this.isProcessingQueue = false;
        if (this.detailsQueue.length > 0) this.processDetailsQueue();
      }
    },

    async getAvatarUrl(url: string) {
      if (!url) return '';
      if (this.avatarBlobMap[url]) return this.avatarBlobMap[url];
      const config = this.getEffectiveAvatarConfig();
      if (config.cacheEnabled) {
        const cached = await contactCache.getAvatar(url);
        if (cached) {
          const blobUrl = URL.createObjectURL(cached);
          this.avatarBlobMap[url] = blobUrl;
          return blobUrl;
        }
      }
      const restrictedDomains = ['wx.qlogo.cn', 'mmhead.c2c.wechat.com'];
      if (restrictedDomains.some(domain => url.includes(domain))) return url;
      if (config.downloadEnabled) this.downloadAndCacheAvatar(url);
      return url;
    },

    async downloadAndCacheAvatar(url: string) {
      const config = this.getEffectiveAvatarConfig();
      if (!config.downloadEnabled) return;
      try {
        const response = await fetch(url).catch(() => null);
        if (!response || !response.ok) return;
        const blob = await response.blob();
        if (config.cacheEnabled) await contactCache.saveAvatar(url, blob);
        const blobUrl = URL.createObjectURL(blob);
        this.avatarBlobMap[url] = blobUrl;
      } catch (e) {}
    }
  }
});
