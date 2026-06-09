/**
 * Account Store Redis 极速模式核心数据读写模块
 */
import type { useAccountStore } from '../account';
import { useChatStore } from '../chat';
import request from '@/utils/request';
import { isRedisMode, resolveRedisUrl } from './profile';
import { MessageParser } from '@/utils/parser';
import { debugLog } from '@/utils/debug';

type AccountStoreInstance = ReturnType<typeof useAccountStore>;

let redisSyncDebounceTimer: any = null;
let redisWritebackDebounceTimer: any = null;

export function triggerDebouncedRedisSync(store: AccountStoreInstance) {
  const uuid = store.activeAccountUuid;
  if (!uuid || !isRedisMode(store, uuid)) return;
  const key = store.accounts.find((a: any) => a.uuid === uuid)?.sessionKey || store.tokenKey;
  if (!key) return;

  if (redisSyncDebounceTimer) clearTimeout(redisSyncDebounceTimer);
  redisSyncDebounceTimer = setTimeout(async () => {
    const readUrl = resolveRedisUrl(store, uuid, '/other/SaveContactToRedis');
    if (readUrl) {
      debugLog('cache', '[AccountStore:Redis] 检测到新 Redis 地址已填写，自动触发增量读回同步... (账号: {})', uuid);
      await syncViaRedis(store, uuid, key);
    }
  }, 1000);
}

export function fillContactsFromRedis(store: AccountStoreInstance, accountUuid: string, modContacts: any[]) {
  if (!modContacts || !Array.isArray(modContacts)) return;
  const map: Record<string, any> = store.accountContactMaps[accountUuid] || {};
  let count = 0;
  modContacts.forEach(c => {
    const wxid = c.userName?.str || c.UserName?.str || c.wxid || c.userName || c.UserName;
    if (wxid) {
      map[wxid] = {
        ...map[wxid],
        ...c
      };
      count++;
    }
  });
  store.accountContactMaps[accountUuid] = map;
  debugLog('cache', '[AccountStore:Redis] 从 Redis 快照填充了 {} 个联系人 (账号: {})', count, accountUuid);
}

export async function syncViaRedis(store: AccountStoreInstance, uuid: string, key: string) {
  const chatStore = useChatStore();
  // --- 阶段 A：原 Redis 只读快照获取并快速同步 (使用主服务全局 IP) ---
  try {
    debugLog('cache', '[AccountStore:Redis] 开始原 Redis 极速同步 (只读, 账号: {})', uuid);

    const originalBase = store.baseUrl || localStorage.getItem('baseUrl') || '';
    let originalUrl = "/other/GetRedisSyncMsg?key=" + key;
    if (originalUrl.startsWith('/')) {
      if (originalBase) {
        originalUrl = originalBase.replace(/\/$/, '') + originalUrl;
      } else {
        originalUrl = "/api" + originalUrl;
      }
    }

    debugLog('cache', '[AccountStore:Redis] 请求原 Redis 同步接口 (URL: {})', originalUrl);
    const res: any = await request.post(originalUrl, {});
    const data = res?.Data || res;

    // 1. 填充联系人（ModContacts）
    const modContacts = data?.ModContacts || [];
    if (modContacts.length > 0) {
      fillContactsFromRedis(store, uuid, modContacts);
    }

    // 2. 填充自身信息（ModUserInfos）
    const modUserInfos = data?.ModUserInfos || [];
    if (modUserInfos.length > 0) {
      const selfInfo = modUserInfos[0];
      const selfWxid = selfInfo.userName?.str || selfInfo.UserName?.str || selfInfo.userName || selfInfo.UserName;
      if (selfWxid) {
        fillContactsFromRedis(store, uuid, [selfInfo]);
      }
    }

    // 3. 填充消息（AddMsgs）
    const addMsgs = data?.AddMsgs || [];
    if (addMsgs.length > 0) {
      debugLog('cache', '[AccountStore:Redis] 发现 {} 条待同步消息，开始解析并填充...', () => addMsgs.length);
      for (const rawMsg of addMsgs) {
        const parsed = MessageParser.parse(rawMsg, uuid);
        if (parsed && parsed.type !== 'status_notify') {
          await chatStore.addParsedMessage(uuid, parsed, true);
        }
      }
      debugLog('cache', '[AccountStore:Redis] 消息同步完成');
    }
  } catch (err) {
    console.error('[AccountStore:Redis] 原 Redis 极速同步阶段 A 失败:', err);
  }

  // --- 阶段 B：新 Redis 读回补写联系人（自动启动，在不同服务器） ---
  const readUrl = resolveRedisUrl(store, uuid, '/other/SaveContactToRedis');
  if (readUrl) {
    debugLog('cache', '[AccountStore:Redis] 自动从新 Redis 读回补写联系人 (URL: {})', readUrl);
    try {
      let newRes: any = null;
      let methodUsed = 'GET';
      try {
        newRes = await request.get(readUrl);
        debugLog('cache', '[AccountStore:Redis] 从新 Redis 读回原始响应 (GET):', () => newRes);
      } catch (getErr) {
        console.warn('[AccountStore:Redis] 新 Redis GET 请求失败，将尝试 POST:', getErr);
      }

      if (!newRes || (Array.isArray(newRes) && newRes.length === 0) || (typeof newRes === 'object' && Object.keys(newRes).length === 0)) {
        methodUsed = 'POST';
        newRes = await request.post(readUrl, {});
        debugLog('cache', '[AccountStore:Redis] 从新 Redis 读回原始响应 (POST):', () => newRes);
      }

      if (typeof newRes === 'string') {
        try {
          newRes = JSON.parse(newRes);
        } catch (e) {}
      }

      let newContacts: any[] = [];
      if (Array.isArray(newRes)) {
        newContacts = newRes;
      } else if (newRes && typeof newRes === 'object') {
        const dataContent = newRes.Data !== undefined ? newRes.Data : (newRes.data !== undefined ? newRes.data : newRes);
        if (Array.isArray(dataContent)) {
          newContacts = dataContent;
        } else if (dataContent && typeof dataContent === 'object') {
          const list = dataContent.ModContacts || dataContent.modContacts || dataContent.contacts || dataContent.List || dataContent.list;
          if (Array.isArray(list)) {
            newContacts = list;
          } else {
            for (const k of Object.keys(dataContent)) {
              if (Array.isArray(dataContent[k])) {
                newContacts = dataContent[k];
                break;
              }
            }
          }
        }
      }

      if (newContacts.length > 0) {
        fillContactsFromRedis(store, uuid, newContacts);
        debugLog('cache', '[AccountStore:Redis] 成功从新 Redis 读回并填充了 {} 个补写联系人 (使用方法: {})', () => newContacts.length, methodUsed);
      } else {
        debugLog('cache', '[AccountStore:Redis] 从新 Redis 读回了 0 个补写联系人 (使用方法: {})，原始响应详情: {}', methodUsed, () => JSON.stringify(newRes));
      }
    } catch (newErr) {
      console.error('[AccountStore:Redis] 从新 Redis 读回补写联系人失败:', newErr);
    }
  }

  store.isContactListLoadedMap[uuid] = true;
  debugLog('cache', '[AccountStore:Redis] 账号 {} 的联系人加载完成，已解除 Redis 自动回写锁定。', uuid);
}

export function triggerDebouncedRedisWriteback(store: AccountStoreInstance, uuid: string) {
  if (!isRedisMode(store, uuid)) return;
  if (!store.isContactListLoadedMap[uuid]) return;

  if (redisWritebackDebounceTimer) clearTimeout(redisWritebackDebounceTimer);
  redisWritebackDebounceTimer = setTimeout(async () => {
    debugLog('cache', '[AccountStore:Redis] 触发自动防抖全量回写 (账号: {})...', uuid);
    try {
      await saveAllContactsToRedis(store, uuid);
    } catch (err) {
      console.error("[AccountStore:Redis] 自动防抖全量回写失败:", err);
    }
  }, 3000);
}

export async function saveAllContactsToRedis(store: AccountStoreInstance, uuid: string) {
  const key = store.accounts.find((a: any) => a.uuid === uuid)?.sessionKey;
  if (!key) return;

  const contacts = Object.values(store.accountContactMaps[uuid] || {}).filter((c: any) => {
    const wxid = c.userName?.str || c.UserName?.str || c.wxid || c.userName || c.UserName || '';
    if (!wxid) return false;

    const specialIds = ['fmessage', 'medianote', 'floatbottle', 'newsapp', 'helper_entry', 'filehelper'];
    if (specialIds.includes(wxid)) return false;

    return true;
  });
  if (contacts.length === 0) return;

  const writeBackUrl = resolveRedisUrl(store, uuid, '/other/SaveContactToRedis');
  if (!writeBackUrl) return;

  debugLog('cache', '[AccountStore:Redis] 手动回写所有联系人 ({} 个) 到 Redis: {}', () => contacts.length, writeBackUrl);
  try {
    await request.post(writeBackUrl, { ModContacts: contacts });
    debugLog('cache', '[AccountStore:Redis] 批量回写成功！');
  } catch (err) {
    console.error("[AccountStore:Redis] 批量回写失败:", err);
    throw err;
  }
}
