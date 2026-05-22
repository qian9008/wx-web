/**
 * Account Store 配置管理、心跳、62数据提取及在线状态激活模块
 */
import type { useAccountStore } from '../account';
import { useChatStore } from '../chat';
import { adminApi } from '@/api/modules/admin';
import { loginApi, messageApi } from '@/api/modules/im';
import { socketManager } from '@/utils/socketManager';
import { contactCache } from '@/utils/contactCache';
import request from '@/utils/request';
import { Message } from '@arco-design/web-vue';
import { extractAvatarString, getAvatarUrl } from './utils';
import { syncViaRedis, triggerDebouncedRedisSync } from './redis';
import { loadContactsFromCache, syncFullContactList, updateContact } from './contacts';

type AccountStoreInstance = ReturnType<typeof useAccountStore>;

export function getEffectiveAvatarConfig(store: AccountStoreInstance, uuid?: string) {
  const targetUuid = uuid || store.activeAccountUuid;
  const globalConf = store.globalAvatarConfig;
  if (targetUuid && store.accountConfigs[targetUuid]) {
    const config = store.accountConfigs[targetUuid];
    return {
      downloadEnabled: config.downloadEnabled !== false,
      cacheEnabled: config.cacheEnabled !== false,
      isRedisLanMode: config.isRedisLanMode !== undefined ? !!config.isRedisLanMode : globalConf.isRedisLanMode,
      redisWriteBackUrl: config.redisWriteBackUrl !== undefined ? config.redisWriteBackUrl : globalConf.redisWriteBackUrl,
      maxMessagesPerConv: config.maxMessagesPerConv !== undefined ? Number(config.maxMessagesPerConv) : (globalConf.maxMessagesPerConv || 500),
      msgTtlDays: config.msgTtlDays !== undefined ? Number(config.msgTtlDays) : (globalConf.msgTtlDays || 0)
    };
  }
  return {
    ...globalConf,
    maxMessagesPerConv: globalConf.maxMessagesPerConv || 500,
    msgTtlDays: globalConf.msgTtlDays || 0
  };
}

export function isRedisMode(store: AccountStoreInstance, uuid?: string): boolean {
  const config = getEffectiveAvatarConfig(store, uuid);
  return !!config.isRedisLanMode;
}

export function resolveRedisUrl(store: AccountStoreInstance, uuid: string, apiPath: string): string {
  const config = getEffectiveAvatarConfig(store, uuid);
  let baseUrl = config.redisWriteBackUrl || '';
  if (!baseUrl) {
    baseUrl = 'http://192.168.50.99:7379';
  }
  baseUrl = baseUrl.trim().replace(/\/$/, '');

  if (baseUrl.includes('/other/')) {
    try {
      const urlObj = new URL(baseUrl);
      baseUrl = urlObj.protocol + "//" + urlObj.host;
    } catch (e) {
      const match = baseUrl.match(/^(https?:\/\/[^\/]+)/);
      if (match) baseUrl = match[1];
    }
  }

  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    baseUrl = "http://" + baseUrl;
  }

  const key = store.accounts.find((a: any) => a.uuid === uuid)?.sessionKey || store.tokenKey || '';
  return baseUrl + apiPath + "?key=" + key;
}

export async function preloadOfflineAccountAvatars(store: AccountStoreInstance) {
  for (const acc of store.accounts) {
    if (acc.uuid && !acc.uuid.startsWith('license-') && !acc.uuid.startsWith('token-')) {
      try {
        const selfContact = (await contactCache.get(acc.uuid, acc.uuid)) as any;
        if (selfContact) {
          if (!store.accountContactMaps[acc.uuid]) {
            store.accountContactMaps[acc.uuid] = {};
          }
          store.accountContactMaps[acc.uuid][acc.uuid] = selfContact;

          const url = selfContact.smallHeadImgUrl || selfContact.SmallHeadImgUrl || selfContact.headImgUrl || selfContact.HeadImgUrl || selfContact.avatar || '';
          const rawUrl = typeof url === 'string' ? url.trim().replace(/\u0060/g, '') : '';
          if (rawUrl) {
            const isHttp = rawUrl.startsWith('http://') || rawUrl.startsWith('https://');
            if (isHttp) {
              const blobUrl = await getAvatarUrl(rawUrl);
              if (blobUrl) {
                acc.avatar = blobUrl;
              }
            } else {
              acc.avatar = rawUrl;
            }
          }
        }
      } catch (e) {
        console.warn("[AccountStore] 预加载账号 " + acc.uuid + " 自身头像失败:", e);
      }
    }
  }
}

export async function autoSave62Data(store: AccountStoreInstance, license: string) {
  if (!license) return;

  const matchedAcc = store.accounts.find((a: any) => a.sessionKey === license);
  const uuid = matchedAcc?.uuid;
  const isOnline = matchedAcc?.status === 'online';

  if (!isOnline) {
    return;
  }

  const hasLocalData = localStorage.getItem("wx_62_data_" + license) ||
                       (uuid && localStorage.getItem("wx_62_data_" + uuid));

  if (hasLocalData) {
    if (store.debug.all || store.debug.cache) {
      console.log("[AccountStore] 账号 " + (uuid || license.substring(0, 8)) + " 已有本地 62 数据，跳过自动提取。");
    }
    return;
  }

  try {
    console.log('[AccountStore] 冷启动自动提取并保存62数据...');
    const res: any = await loginApi.get62Data(license);
    let dataVal: any = '';
    if (res) {
      if (typeof res === 'string') {
        dataVal = res;
      } else if (typeof res === 'object') {
        dataVal = res.Data || res.data || '';
        if (dataVal && typeof dataVal === 'object') {
          dataVal = dataVal.data || dataVal.Data || JSON.stringify(dataVal);
        } else if (!dataVal) {
          dataVal = JSON.stringify(res);
        }
      }
    }
    if (dataVal) {
      localStorage.setItem("wx_62_data_" + license, dataVal);
      localStorage.setItem('wx_62_data', dataVal);
      if (matchedAcc && matchedAcc.uuid) {
        localStorage.setItem("wx_62_data_" + matchedAcc.uuid, dataVal);
      }
      console.log("[AccountStore] 62数据已成功在冷启动时按账号 (" + license + ") 隔离保存至本地");
    }
  } catch (err) {
    console.warn('[AccountStore] 冷启动自动提取62数据失败:', err);
  }
}

export async function syncAccountsFromServer(store: AccountStoreInstance) {
  if (store.isDemoMode) {
    console.log('[AccountStore:Demo] 开启演示模式，加载模拟数据...');
    
    // Demo 模式不填充真实的地址和 token
    store.baseUrl = '';
    store.adminKey = '';
    store.tokenKey = '';
    
    store.accounts = [
      {
        uuid: 'mock_xiaoming',
        sessionKey: 'demo-key-xiaoming',
        nickname: '小明 (开发助理) [演示]',
        avatar: '',
        status: 'online',
        alias: 'xiaoming_dev'
      },
      {
        uuid: 'mock_linjingli',
        sessionKey: 'demo-key-linjingli',
        nickname: '林经理 (产品经理) [演示]',
        avatar: '',
        status: 'online',
        alias: 'lin_pm'
      },
      {
        uuid: 'mock_backup_slot',
        sessionKey: 'demo-key-backup',
        nickname: '运营备用号 [演示]',
        avatar: '',
        status: 'offline',
        alias: 'backup_op'
      }
    ];

    if (!store.activeAccountUuid) {
      store.activeAccountUuid = 'mock_xiaoming';
    }

    store.loadDemoData();
    return;
  }

  const getLicenseWxidMap = () => {
    try {
      return JSON.parse(localStorage.getItem('license_wxid_map') || '{}');
    } catch (e) {
      return {};
    }
  };

  const saveLicenseWxidMapping = (license: string, wxid: string) => {
    if (!license || !wxid || wxid.length < 5) return;
    const map = getLicenseWxidMap();
    map[license] = wxid;
    localStorage.setItem('license_wxid_map', JSON.stringify(map));
  };

  try {
    let data: any[] = [];

    if (store.tokenKey) {
      console.log('[AccountStore] 使用 TOKEN_KEY 模式，调用 GetProfile 解析真实 wxid...');
      try {
        const profileRes: any = await loginApi.getProfile(store.tokenKey);
        const profileData = profileRes?.Data || profileRes;
        const userInfo = (profileData?.userInfo || profileData?.UserInfo || profileData) as any;
        const userInfoExt = (profileData?.userInfoExt || profileData?.UserInfoExt) as any;

        const realWxid = userInfo?.userName?.str || userInfo?.UserName?.str
                       || userInfo?.userName || userInfo?.UserName;
        const realNick = userInfo?.nickName?.str || userInfo?.NickName?.str
                       || userInfo?.nickName || userInfo?.NickName;
        const realAvatar = (userInfoExt ? (
                             extractAvatarString(userInfoExt.smallHeadImgUrl)
                          || extractAvatarString(userInfoExt.SmallHeadImgUrl)
                          || extractAvatarString(userInfoExt.headImgUrl)
                          || extractAvatarString(userInfoExt.HeadImgUrl)
                          || extractAvatarString(userInfoExt.bigHeadImgUrl)
                          || extractAvatarString(userInfoExt.BigHeadImgUrl)
                          || extractAvatarString(userInfoExt.avatar)
                           ) : '')
                         || extractAvatarString(userInfo?.smallHeadImgUrl)
                         || extractAvatarString(userInfo?.SmallHeadImgUrl)
                         || extractAvatarString(userInfo?.headImgUrl)
                         || extractAvatarString(userInfo?.HeadImgUrl)
                         || extractAvatarString(userInfo?.bigHeadImgUrl)
                         || extractAvatarString(userInfo?.BigHeadImgUrl)
                         || extractAvatarString(userInfo?.avatar);

        const realAlias = userInfo?.alias?.str || userInfo?.Alias?.str
                        || userInfo?.alias || userInfo?.Alias;
        const resolvedUuid = realWxid || store.tokenKey;
        console.log("[AccountStore] TOKEN_KEY 模式 GetProfile 解析: uuid=" + resolvedUuid);

        if (realWxid && realWxid.length > 5) {
          saveLicenseWxidMapping(store.tokenKey, realWxid);
        }

        const resolvedAvatar = realAvatar ? await getAvatarUrl(realAvatar) : '';

        store.accounts = [{
          uuid: resolvedUuid,
          sessionKey: store.tokenKey,
          nickname: realNick || '授权账号',
          avatar: resolvedAvatar || realAvatar || '',
          status: 'offline',
          alias: realAlias || ''
        }];
      } catch (e) {
        console.warn('[AccountStore] TOKEN_KEY GetProfile 失败，尝试从本地映射读取:', e);
        const map = getLicenseWxidMap();
        const cachedWxid = map[store.tokenKey] || '';
        
        store.accounts = [{
          uuid: cachedWxid,
          sessionKey: store.tokenKey,
          nickname: cachedWxid ? '离线账号 (缓存)' : '离线账号',
          avatar: '',
          status: 'offline',
          alias: ''
        }];
      }

      await preloadOfflineAccountAvatars(store);

      const targetAcc = store.accounts[0];
      if (targetAcc) {
        targetAcc.initialized = true;
        store.activeAccountUuid = targetAcc.uuid;
        if (targetAcc.sessionKey) {
          const isOnline = await checkSingleAccountStatus(store, targetAcc.sessionKey);
          if (isOnline) {
            autoSave62Data(store, targetAcc.sessionKey);
            socketManager.registerAccount(targetAcc.uuid, targetAcc.sessionKey);
            if (isRedisMode(store, targetAcc.uuid)) {
              await syncViaRedis(store, targetAcc.uuid, targetAcc.sessionKey);
            } else {
              loadContactsFromCache(store, targetAcc.uuid);
              syncFullContactList(store, targetAcc.uuid, targetAcc.sessionKey);
            }
          } else {
            console.log("[AccountStore] 账号 " + targetAcc.uuid + " 离线，跳过数据同步");
          }
        }
      }

    } else if (store.adminKey) {
      const res: any = await adminApi.getOnlineAccounts();
      console.log('[AccountStore] 使用 ADMIN_KEY 获取到账号列表');
      data = res.Data || res;

      store.accounts = await Promise.all((Array.isArray(data) ? data : []).map(async (acc: any) => {
        const userName = acc.userName || acc.UserName || acc.wx_id || acc.uuid || acc.wxid;
        const key = acc.license || acc.key || acc.session_key || acc.sessionKey || '';
        const rawAvatar = acc.avatar || '';
        const resolvedAvatar = rawAvatar ? await getAvatarUrl(rawAvatar) || rawAvatar : '';
        const aliasVal = acc.alias || acc.Alias || '';
        return {
          uuid: userName || key || '',
          sessionKey: key,
          nickname: acc.nick_name || acc.nickname || (userName ? '已登录' : '未登录槽位'),
          avatar: resolvedAvatar,
          status: 'offline',
          alias: aliasVal
        };
      }));

      if (store.accounts.length > 0 && !store.activeAccountUuid) {
        const firstOnline = store.accounts.find((a: any) => a.uuid);
        if (firstOnline) store.activeAccountUuid = firstOnline.uuid;
      }

      await preloadOfflineAccountAvatars(store);

      const activeAcc = store.accounts.find((a: any) => a.uuid === store.activeAccountUuid);
      if (activeAcc && activeAcc.sessionKey) {
        activeAcc.initialized = true;
        fetchProfileAndFixUuid(store, activeAcc.sessionKey).then(() => {
          preloadOfflineAccountAvatars(store);
        });
      }
    }
  } catch (err) {
    console.error('获取账号列表失败:', err);
  }
}

export async function checkSingleAccountStatus(store: AccountStoreInstance, license: string): Promise<boolean> {
  if (store.isDemoMode) {
    return license === 'demo-key-xiaoming' || license === 'demo-key-linjingli';
  }
  if (!license) return false;
  try {
    const res: any = await loginApi.getOnlineStatus(license);
    const data = res?.Data || res;
    if (data) {
      const isOnline = data.loginState === 1;
      const accIndex = store.accounts.findIndex((a: any) => a.sessionKey === license);
      if (accIndex > -1) {
        const acc = store.accounts[accIndex];
        const wasOffline = acc.status === 'offline';
        acc.status = isOnline ? 'online' : 'offline';

        if (wasOffline && isOnline) {
          console.log("[AccountStore] 检测到账号 [" + acc.nickname + "] 从离线恢复在线，自动启动激活流程...");

          Message.success({
            content: "检测到账号 [" + acc.nickname + "] 已成功上线！已自动激活在线模式。",
            duration: 4
          });

          autoSave62Data(store, license);

          if (acc.uuid && acc.uuid !== license) {
            socketManager.registerAccount(acc.uuid, license);
            if (isRedisMode(store, acc.uuid)) {
              await syncViaRedis(store, acc.uuid, license);
            } else {
              await loadContactsFromCache(store, acc.uuid);
              await syncFullContactList(store, acc.uuid, license);
            }
          } else {
            fetchProfileAndFixUuid(store, license).catch(err => {
              console.error('[AccountStore] 自动解析激活失败:', err);
            });
          }
        }
      }
      return isOnline;
    }
  } catch (err) {
    console.error("[AccountStore] 检测状态失败 (" + license + "):", err);
    const accIndex = store.accounts.findIndex((a: any) => a.sessionKey === license);
    if (accIndex > -1) {
      store.accounts[accIndex].status = 'offline';
    }
  }
  return false;
}

export async function fetchProfileAndFixUuid(store: AccountStoreInstance, license: string) {
  if (store.isDemoMode) {
    const accIndex = store.accounts.findIndex((a: any) => a.sessionKey === license);
    if (accIndex > -1) {
      store.accounts[accIndex].initialized = true;
    }
    return {
      realWxid: license === 'demo-key-xiaoming' ? 'mock_xiaoming' : 'mock_linjingli',
      realNick: license === 'demo-key-xiaoming' ? '小明 (开发助理)' : '林经理 (产品经理)',
      realAvatar: ''
    };
  }
  const accIndex = store.accounts.findIndex((a: any) => a.sessionKey === license);
  if (accIndex > -1) {
    store.accounts[accIndex].initialized = true;
  }
  try {
    const isOnline = await checkSingleAccountStatus(store, license);
    if (isOnline) {
      autoSave62Data(store, license);
    }

    const res: any = await loginApi.getProfile(license);
    console.log("[AccountStore] GetProfile 原始响应:", res);

    const data = res?.Data || res;
    const userInfo = data?.userInfo || data?.UserInfo || data;
    const userInfoExt = data?.userInfoExt || data?.UserInfoExt;

    if (!userInfo || (!userInfo.userName && !userInfo.UserName)) {
      console.warn("[AccountStore] GetProfile 未能解析到 userInfo 结构", res);
      return null;
    }

    const realWxid = userInfo.userName?.str || userInfo.UserName?.str || userInfo.userName || userInfo.UserName;
    const realNick = userInfo.nickName?.str || userInfo.NickName?.str || userInfo.nickName || userInfo.NickName;

    if (!realWxid || realWxid === license) {
      console.warn("[AccountStore] GetProfile 解析到的 wxid 无效或与 license 相同，跳过修正", { realWxid, license });
      return null;
    }

    const realAvatar = (userInfoExt ? (
                         extractAvatarString(userInfoExt.smallHeadImgUrl)
                      || extractAvatarString(userInfoExt.SmallHeadImgUrl)
                      || extractAvatarString(userInfoExt.headImgUrl)
                      || extractAvatarString(userInfoExt.HeadImgUrl)
                      || extractAvatarString(userInfoExt.bigHeadImgUrl)
                      || extractAvatarString(userInfoExt.BigHeadImgUrl)
                      || extractAvatarString(userInfoExt.avatar)
                       ) : '')
                     || extractAvatarString(userInfo.smallHeadImgUrl)
                     || extractAvatarString(userInfo.SmallHeadImgUrl)
                     || extractAvatarString(userInfo.headImgUrl)
                     || extractAvatarString(userInfo.HeadImgUrl)
                     || extractAvatarString(userInfo.bigHeadImgUrl)
                     || extractAvatarString(userInfo.BigHeadImgUrl)
                     || extractAvatarString(userInfo.avatar);

    if (realWxid) {
      console.log("[AccountStore] 身份比对: 当前ID vs 真实ID -> " + license.substring(0,10) + "... vs " + realWxid);
      
      // 绑定 License 与 wxid 关系并持久化
      if (realWxid.length > 5) {
        try {
          const map = JSON.parse(localStorage.getItem('license_wxid_map') || '{}');
          map[license] = realWxid;
          localStorage.setItem('license_wxid_map', JSON.stringify(map));
        } catch (e) {}
      }

      const chatStore = useChatStore();
      const accIndex = store.accounts.findIndex((a: any) => a.sessionKey === license);
      if (accIndex > -1) {
        const oldUuid = store.accounts[accIndex].uuid;

        if (oldUuid && oldUuid !== realWxid) {
          console.log("[AccountStore] 触发 ID 修正与数据迁移: " + oldUuid + " -> " + realWxid);

          if (store.accountContactMaps[oldUuid]) {
            store.accountContactMaps[realWxid] = {
              ...store.accountContactMaps[realWxid],
              ...store.accountContactMaps[oldUuid]
            };
            delete store.accountContactMaps[oldUuid];
          }

          chatStore.migrateData(oldUuid, realWxid);
          await contactCache.migrateAccountData(oldUuid, realWxid);

          store.accounts[accIndex].uuid = realWxid;

          if (oldUuid) {
            socketManager.stopAccount(oldUuid);
          }
        }

        const realAlias = userInfo.alias?.str || userInfo.Alias?.str || userInfo.alias || userInfo.Alias;
        store.accounts[accIndex].alias = realAlias || '';
        if (realNick) {
          store.accounts[accIndex].nickname = realNick;
        }

        const rawAvatar = realAvatar || store.accounts[accIndex].avatar;
        if (rawAvatar) {
          store.accounts[accIndex].avatar = await getAvatarUrl(rawAvatar) || rawAvatar;
        }

        const selfProfile = {
          userName: { str: realWxid },
          nickName: { str: realNick || '微信用户' },
          smallHeadImgUrl: realAvatar,
          headImgUrl: realAvatar,
          contactType: 0
        };
        await updateContact(store, realWxid, selfProfile, realWxid);

        if (store.activeAccountUuid === oldUuid || store.activeAccountUuid === license) {
          store.activeAccountUuid = realWxid;
        }

        if (isOnline) {
          socketManager.registerAccount(realWxid, license);
          if (isRedisMode(store, realWxid)) {
            await syncViaRedis(store, realWxid, license);
          } else {
            await loadContactsFromCache(store, realWxid);
            syncFullContactList(store, realWxid, license);
          }
        }
        return { realWxid, realNick, realAvatar };
      }
    }
  } catch (e) {
    console.warn('[AccountStore] 资料补全失败:', e);
  }
  return null;
}
