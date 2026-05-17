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

          // adminKey 模式：先用 API 返回的 ID 建账号，再通过 getProfile 修正为真实 wxid
          this.accounts = (Array.isArray(data) ? data : []).map((acc: any) => {
            const userName = acc.userName || acc.UserName || acc.wx_id || acc.uuid || acc.wxid;
            const key = acc.license || acc.key || acc.session_key || acc.sessionKey || '';
            return {
              uuid: userName || key || '',
              sessionKey: key,
              nickname: acc.nick_name || acc.nickname || (userName ? '已登录' : '未登录槽位'),
              avatar: acc.avatar || '',
              status: (acc.status || (userName ? 'online' : 'offline')) as 'online' | 'offline'
            };
          });

          if (this.accounts.length > 0 && !this.activeAccountUuid) {
            const firstOnline = this.accounts.find(a => a.uuid);
            if (firstOnline) this.activeAccountUuid = firstOnline.uuid;
          }

          // 异步修正 ID：getProfile → 拿到真实 wxid → 再注册 Socket
          this.accounts.forEach(acc => {
            if (acc.sessionKey) this.fetchProfileAndFixUuid(acc.sessionKey);
          });

        } else if (this.tokenKey) {
          // TOKEN_KEY 模式：直接调 getProfile 作为唯一真相，不依赖 getOnlineStatus 解析 wxid
          console.log('[AccountStore] 使用 TOKEN_KEY 模式，调用 GetProfile 解析真实 wxid...');
          try {
            const profileRes: any = await loginApi.getProfile(this.tokenKey);
            // 拦截器已剥离 Code/Data 外壳，profileRes 就是 Data 体
            const profileData = profileRes?.Data || profileRes;
            const userInfo = profileData?.userInfo || profileData?.UserInfo || profileData;
            
            const realWxid = userInfo?.userName?.str || userInfo?.UserName?.str 
                           || userInfo?.userName || userInfo?.UserName;
            const realNick = userInfo?.nickName?.str || userInfo?.NickName?.str 
                           || userInfo?.nickName || userInfo?.NickName;
            const realAvatar = userInfo?.smallHeadImgUrl || userInfo?.SmallHeadImgUrl 
                             || userInfo?.bigHeadImgUrl || userInfo?.BigHeadImgUrl;

            const resolvedUuid = realWxid || this.tokenKey;
            console.log(`[AccountStore] TOKEN_KEY 模式 GetProfile 解析: uuid=${resolvedUuid}`);

            this.accounts = [{
              uuid: resolvedUuid,
              sessionKey: this.tokenKey,
              nickname: realNick || '授权账号',
              avatar: realAvatar || '',
              status: realWxid ? 'online' : 'offline'
            }];
          } catch (e) {
            console.warn('[AccountStore] TOKEN_KEY GetProfile 失败，使用 tokenKey 占位:', e);
            this.accounts = [{
              uuid: this.tokenKey,
              sessionKey: this.tokenKey,
              nickname: '授权账号',
              avatar: '',
              status: 'offline'
            }];
          }

          // 设置活跃账号（此时 uuid 已是真实 wxid 或 tokenKey）
          const targetAcc = this.accounts[0];
          if (targetAcc) {
            this.activeAccountUuid = targetAcc.uuid;
            // 直接注册 Socket，因为 uuid 已是最终确定的 ID
            if (targetAcc.sessionKey) {
              socketManager.registerAccount(targetAcc.uuid, targetAcc.sessionKey);
              // 加载缓存数据
              this.loadContactsFromCache(targetAcc.uuid);
              this.syncFullContactList(targetAcc.uuid, targetAcc.sessionKey);
            }
          }
        }
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
              console.log(`[AccountStore] 账号 ID 已是最新，确保 Socket 注册正确 (${realWxid})`);
              // ID 已正确，但 Socket 可能尚未注册（首次启动时跳过了预注册）
              socketManager.registerAccount(realWxid, license);
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
            // 这里 registerAccount 内部会自己处理 wxid 查找，但我们已经知道 realWxid 了
            socketManager.registerAccount(realWxid, license);
            
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

      // 反向同步：更新会话列表中的昵称和头像
      const chatStore = useChatStore();
      if (chatStore.accountConversations[targetUuid]) {
        const convs = [...chatStore.accountConversations[targetUuid]];
        const convIdx = convs.findIndex(c => c.wxid === wxid);
        
        if (convIdx > -1) {
          const conv = { ...convs[convIdx] };
          
          // 获取最新名称逻辑 (备注 > 昵称 > wxid)
          const newName = detail.remark?.str || detail.Remark?.str || detail.remark || detail.Remark 
                        || detail.nickName?.str || detail.NickName?.str || detail.nickName || detail.NickName;
          const newAvatar = detail.smallHeadImgUrl || detail.SmallHeadImgUrl || detail.headImgUrl || detail.avatar;
          
          if (newName) conv.nickname = newName;
          if (newAvatar) {
            conv.avatar = newAvatar;
            // 立即触发头像预下载并存入缓存
            this.getAvatarUrl(newAvatar);
          }
          
          convs[convIdx] = conv;
          chatStore.accountConversations[targetUuid] = convs;
          
          // 同时持久化会话更新到 DB
          contactCache.saveConversation(targetUuid, JSON.parse(JSON.stringify(conv)));
        }
      }
    },

    async syncFullContactList(uuid: string, key: string, force = false) {
      // 1. 同步锁判断
      if (this.syncLockMap[uuid]) return;
      
      this.syncLockMap[uuid] = true;
      try {
        console.log(`[AccountStore] 开始全量同步检查 (账号: ${uuid}, 强制: ${force})`);

        // 核心优化：先检查本地数据库是否有联系人
        const currentDbCount = await contactCache.getCount('contacts', uuid);
        
        // 如果不是强制同步，且本地已经有联系人，则不再自动调用 API 刷新
        if (!force && currentDbCount > 0) {
          console.log(`[AccountStore] 账号 ${uuid} 本地已有联系人 (${currentDbCount}个), 跳过自动 API 同步`);
          await this.loadContactsFromCache(uuid);
          this.syncLockMap[uuid] = false;
          return;
        }

        console.log(`[AccountStore] 本地无联系人或强制同步，开始调用接口获取 (账号: ${uuid})`);

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

        // 第二阶段：分页补漏
        let currentContactSeq = 1;
        let currentChatRoomSeq = 1;
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
          const nextContactSeq = data.currentWxcontactSeq || data.CurrentWxcontactSeq || contactListData.currentWxcontactSeq || contactListData.CurrentWxcontactSeq || 0;
          const nextChatRoomSeq = data.currentChatRoomContactSeq || data.CurrentChatRoomContactSeq || contactListData.currentChatRoomContactSeq || contactListData.CurrentChatRoomContactSeq || 0;
          
          // 3. 核心：通过 continueFlag 判断是否继续
          const continueFlag = data.continueFlag !== undefined ? data.continueFlag :
                               (data.ContinueFlag !== undefined ? data.ContinueFlag :
                               (contactListData.continueFlag !== undefined ? contactListData.continueFlag : 
                               (contactListData.ContinueFlag !== undefined ? contactListData.ContinueFlag : 0)));
          
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
      
      // 过滤掉自己、文件传输助手，以及已经有完整数据的联系人
      const needsFetch = ids.filter(id => {
        if (id === targetUuid || id === 'filehelper') return false;
        return !map[id] || map[id].isPlaceholder;
      });
      
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

      const batchSize = 20;
      // 修正：从活跃账号获取 key，如果没有则回退
      const activeAcc = this.accounts.find(a => a.uuid === this.activeAccountUuid);
      const key = activeAcc?.sessionKey || this.tokenKey;

      try {
        let completed = 0;
        const total = this.detailsQueue.length;
        
        while (this.detailsQueue.length > 0) {
          const batch = this.detailsQueue.splice(0, batchSize);
          const details: any = await messageApi.getContactDetailsList(key, batch);
          
          let detailList: any[] = [];
          if (Array.isArray(details)) detailList = details;
          else if (details?.Data && Array.isArray(details.Data)) detailList = details.Data;
          else if (details?.Data?.ContactList && Array.isArray(details.Data.ContactList)) detailList = details.Data.ContactList;
          else if (details?.Data?.contactList && Array.isArray(details.Data.contactList)) detailList = details.Data.contactList;
          else if (details?.Data?.List && Array.isArray(details.Data.List)) detailList = details.Data.List;
          else if (details?.ContactList && Array.isArray(details.ContactList)) detailList = details.ContactList;
          else if (details?.contactList && Array.isArray(details.contactList)) detailList = details.contactList;
          
          if (detailList.length === 0 && details?.Code !== 0) {
            console.warn(`[AccountStore] 补全队列批次请求未返回有效数组，可能包含无效ID或触发限流:`, details);
          }
          
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
