/**
 * Account Store 好友、缓存、分页同步及详情补全队列管理模块
 */
import type { useAccountStore } from '../account';
import { useChatStore } from '../chat';
import { contactCache } from '@/utils/contactCache';
import { messageApi } from '@/api/modules/im';
import { isRedisMode } from './profile';
import { triggerDebouncedRedisWriteback, syncViaRedis } from './redis';
import { getAvatarUrl } from './utils';
import { debugLog } from '@/utils/debug';

type AccountStoreInstance = ReturnType<typeof useAccountStore>;

export async function loadContactsFromCache(store: AccountStoreInstance, accountUuid?: string) {
  const targetUuid = accountUuid || store.activeAccountUuid;
  if (!targetUuid) return;

  if (store.accountContactMaps[targetUuid] && Object.keys(store.accountContactMaps[targetUuid]).length > 0) {
    if (store.debug.cache) {
      debugLog('cache', '[AccountStore] 命中内存缓存，跳过 DB 读取联系人 (账号: {})', targetUuid);
    }
    return;
  }

  const all = await contactCache.getAll(targetUuid);
  const map: Record<string, any> = {};
  all.forEach((c: any) => {
    const wxid = c.userName?.str || c.UserName?.str || c.wxid || c.userName || c.UserName;
    if (wxid) {
      map[wxid] = c;
    }
  });

  store.accountContactMaps[targetUuid] = map;
  debugLog('cache', '[AccountStore] 从 DB 加载了 {} 个联系人 (账号: {})', () => Object.keys(map).length, targetUuid);
}

export async function updateContact(
  store: AccountStoreInstance,
  wxid: string,
  detail: any,
  accountUuid?: string,
  triggerAutoFetch = true
) {
  if (!wxid) return;
  const targetUuid = accountUuid || store.activeAccountUuid;
  if (!targetUuid) return;

  if (!store.accountContactMaps[targetUuid]) {
    store.accountContactMaps[targetUuid] = {};
  }

  store.accountContactMaps[targetUuid][wxid] = {
    ...store.accountContactMaps[targetUuid][wxid],
    ...detail,
    isPlaceholder: false,
    lastUpdated: Date.now()
  };

  if (isRedisMode(store, targetUuid)) {
    triggerDebouncedRedisWriteback(store, targetUuid);
  } else {
    contactCache.set(wxid, store.accountContactMaps[targetUuid][wxid], targetUuid);
  }

  const isChatRoom = wxid.endsWith('@chatroom');
  if (isChatRoom && triggerAutoFetch) {
    const memberList = detail.chatRoomMembers || detail.memberList || detail.MemberList || [];
    if (memberList.length > 0) {
      const memberWxids = memberList.map((m: any) =>
        typeof m === 'string' ? m : (m.userName?.str || m.UserName?.str || m.userName || m.UserName || m.wxid)
      ).filter(Boolean);

      if (memberWxids.length > 0) {
        debugLog('cache', '[AccountStore] 发现群 {} 成员列表 ({}人)，加入静默占位...', wxid, () => memberWxids.length);
        memberWxids.forEach((mId: string) => {
          if (!store.accountContactMaps[targetUuid][mId]) {
            store.accountContactMaps[targetUuid][mId] = { wxid: mId, isPlaceholder: true };
          }
        });
      }
    }
  }

  const chatStore = useChatStore();
  if (chatStore.accountConversations[targetUuid]) {
    const convs = [...chatStore.accountConversations[targetUuid]];
    const convIdx = convs.findIndex(c => c.wxid === wxid);

    if (convIdx > -1) {
      const conv = { ...convs[convIdx] };
      const newName = detail.remark?.str || detail.Remark?.str || detail.remark || detail.Remark
                    || detail.nickName?.str || detail.NickName?.str || detail.nickName || detail.NickName;
      const newAvatar = detail.smallHeadImgUrl || detail.SmallHeadImgUrl || detail.headImgUrl || detail.avatar;

      if (newName) conv.nickname = newName;
      if (newAvatar) {
        conv.avatar = newAvatar;
        getAvatarUrl(newAvatar);
      }

      convs[convIdx] = conv;
      chatStore.accountConversations[targetUuid] = convs;

      if (!isRedisMode(store, targetUuid)) {
        contactCache.saveConversation(targetUuid, JSON.parse(JSON.stringify(conv)));
      }
    }
  }
}

export async function checkFriendRelation(store: AccountStoreInstance, username: string) {
  if (!username) return;
  const targetUuid = store.activeAccountUuid;
  if (!targetUuid) return;
  const activeAcc = store.accounts.find((a: any) => a.uuid === targetUuid);
  const key = activeAcc?.sessionKey || store.tokenKey;
  if (!key) {
    throw new Error('当前账号未登录或缺少密钥');
  }

  try {
    const res: any = await messageApi.getFriendRelation(key, username);
    debugLog('request', '[AccountStore] checkFriendRelation 结果:', () => res);

    const relation = res?.FriendRelation !== undefined ? res.FriendRelation : -1;
    const sign = res?.Sign || '';
    const openid = res?.Openid || '';

    await updateContact(store, username, {
      friendRelation: relation,
      relationSign: sign,
      relationOpenid: openid,
      relationCheckedAt: Date.now()
    }, targetUuid, false);

    return res;
  } catch (err: any) {
    console.error('[AccountStore] 获取好友关系失败:', err);
    throw err;
  }
}

export async function forceUpdateContactDetails(store: AccountStoreInstance, username: string) {
  if (store.isDemoMode) {
    return store.contactMap[username];
  }
  if (!username) return;
  const targetUuid = store.activeAccountUuid;
  if (!targetUuid) return;
  const activeAcc = store.accounts.find((a: any) => a.uuid === targetUuid);
  const key = activeAcc?.sessionKey || store.tokenKey;
  if (!key) {
    throw new Error('当前账号未登录或缺少密钥');
  }

  try {
    const res: any = await messageApi.getContactDetailsList(key, [username]);
    debugLog('request', '[AccountStore] forceUpdateContactDetails 结果:', () => res);

    let detailList: any[] = [];
    if (Array.isArray(res)) detailList = res;
    else if (res?.Data && Array.isArray(res.Data)) detailList = res.Data;
    else if (res?.Data?.ContactList && Array.isArray(res.Data.ContactList)) detailList = res.Data.ContactList;
    else if (res?.Data?.contactList && Array.isArray(res.Data.contactList)) detailList = res.Data.contactList;
    else if (res?.Data?.List && Array.isArray(res.Data.List)) detailList = res.Data.List;
    else if (res?.ContactList && Array.isArray(res.ContactList)) detailList = res.ContactList;
    else if (res?.contactList && Array.isArray(res.contactList)) detailList = res.contactList;

    const detail = detailList.find(d => {
      const wxid = d.userName?.str || d.UserName?.str || d.wxid || d.userName || d.UserName;
      return wxid === username;
    });

    if (detail) {
      await updateContact(store, username, detail, targetUuid, false);
      return detail;
    } else {
      throw new Error('接口未返回有效的联系人详情');
    }
  } catch (err: any) {
    console.error('[AccountStore] 强制更新资料失败:', err);
    throw err;
  }
}

export async function deleteContact(store: AccountStoreInstance, username: string) {
  if (!username) return;
  const targetUuid = store.activeAccountUuid;
  if (!targetUuid) return;
  const activeAcc = store.accounts.find((a: any) => a.uuid === targetUuid);
  const key = activeAcc?.sessionKey || store.tokenKey;
  if (!key) {
    throw new Error('当前账号未登录或缺少密钥');
  }

  try {
    const res: any = await messageApi.delContact(key, username);
    debugLog('request', '[AccountStore] deleteContact 结果:', () => res);

    if (store.accountContactMaps[targetUuid]) {
      delete store.accountContactMaps[targetUuid][username];
    }

    if (!isRedisMode(store, targetUuid)) {
      await contactCache.deleteContact(username, targetUuid);
    } else {
      triggerDebouncedRedisWriteback(store, targetUuid);
    }

    const chatStore = useChatStore();
    if (chatStore.accountConversations[targetUuid]) {
      chatStore.accountConversations[targetUuid] = chatStore.accountConversations[targetUuid].filter(c => c.wxid !== username);
      await contactCache.deleteConversation(username, targetUuid);
    }

    return res;
  } catch (err: any) {
    console.error('[AccountStore] 删除好友失败:', err);
    throw err;
  }
}

export async function syncFullContactList(store: AccountStoreInstance, uuid: string, key: string, force = false) {
  if (store.isDemoMode) {
    debugLog('cache', '[AccountStore:Demo] 演示模式跳过真实好友同步 (账号: {})', uuid);
    return;
  }
  if (store.syncLockMap[uuid]) return;

  store.syncLockMap[uuid] = true;
  try {
    if (isRedisMode(store, uuid)) {
      debugLog('cache', '[AccountStore] 账号 {} 已启用 Redis 极速模式，走 Redis 同步路径', uuid);
      await syncViaRedis(store, uuid, key);
      store.syncLockMap[uuid] = false;
      return;
    }

    debugLog('cache', '[AccountStore] 开始全量同步检查 (账号: {}, 强制: {})', uuid, force);

    const currentDbCount = await contactCache.getCount('contacts', uuid);
    if (!force && currentDbCount > 0) {
      debugLog('cache', '[AccountStore] 账号 {} 本地已有联系人 ({}个), 跳过自动 API 同步', uuid, currentDbCount);
      await loadContactsFromCache(store, uuid);
      store.syncLockMap[uuid] = false;
      return;
    }

    debugLog('cache', '[AccountStore] 本地无联系人或强制同步，开始调用接口获取 (账号: {})', uuid);

    let apiTotalCount = 0;
    try {
      const friendRes: any = await messageApi.getFriendList(key);
      const friendData = friendRes.Data || friendRes;
      apiTotalCount = friendData.count || friendData.Count || 0;
      const friendList = friendData.friendList || [];

      if (friendList.length > 0) {
        debugLog('cache', '[AccountStore] GetFriendList 成功拉取 {} 个好友详情 (API 总数: {})', () => friendList.length, apiTotalCount);
        for (const f of friendList) {
          const wxid = f.userName?.str || f.UserName?.str || f.wxid || f.userName || f.UserName;
          if (wxid) {
            if (!store.accountContactMaps[uuid]?.[wxid] || store.accountContactMaps[uuid]?.[wxid].isPlaceholder) {
              if (!store.accountContactMaps[uuid]) store.accountContactMaps[uuid] = {};
              store.accountContactMaps[uuid][wxid] = { wxid, ...f, isPlaceholder: false };
              contactCache.set(wxid, f, uuid);
            }
          }
        }
      }
    } catch (e) {
      console.warn('[AccountStore] GetFriendList 失败:', e);
    }

    let currentContactSeq = 1;
    let currentChatRoomSeq = 1;
    let hasMore = true;
    let newWxids: string[] = [];
    let safetyCounter = 0;

    while (hasMore && safetyCounter < 100) {
      safetyCounter++;
      const res: any = await messageApi.getContactList(key, currentContactSeq, currentChatRoomSeq);
      const data = res?.Data || res;
      if (!data) break;

      const contactListData = data.contactList || data.ContactList || data;
      if (!contactListData) break;

      const userList = contactListData.contactUsernameList || contactListData.UsernameList ||
                       contactListData.userNameList || contactListData.MemberList ||
                       contactListData.memberList || contactListData.List || [];

      if (userList.length > 0) {
        for (const item of userList) {
          const wxid = typeof item === 'string' ? item : (item.userName || item.UserName || item.wxid);
          if (wxid) {
            if (!store.accountContactMaps[uuid]?.[wxid] || store.accountContactMaps[uuid]?.[wxid].isPlaceholder) {
              if (!store.accountContactMaps[uuid]) store.accountContactMaps[uuid] = {};
              if (!store.accountContactMaps[uuid][wxid]) {
                store.accountContactMaps[uuid][wxid] = { wxid, isPlaceholder: true };
              }
              newWxids.push(wxid);
            }
          }
        }
      }

      const nextContactSeq = data.currentWxcontactSeq || data.CurrentWxcontactSeq || contactListData.currentWxcontactSeq || contactListData.CurrentWxcontactSeq || 0;
      const nextChatRoomSeq = data.currentChatRoomContactSeq || data.CurrentChatRoomContactSeq || contactListData.currentChatRoomContactSeq || contactListData.CurrentChatRoomContactSeq || 0;

      const continueFlag = data.continueFlag !== undefined ? data.continueFlag :
                           (data.ContinueFlag !== undefined ? data.ContinueFlag :
                           (contactListData.continueFlag !== undefined ? contactListData.continueFlag :
                           (contactListData.ContinueFlag !== undefined ? contactListData.ContinueFlag : 0)));

      debugLog('cache', '[AccountStore] GetContactList 翻页: version({} -> {}), continueFlag: {}, 本页获取: {}', currentContactSeq, nextContactSeq, continueFlag, () => userList.length);

      if (continueFlag === 1) {
        currentContactSeq = nextContactSeq;
        currentChatRoomSeq = nextChatRoomSeq;

        if (newWxids.length >= 50) {
          newWxids.splice(0, newWxids.length);
          debugLog('cache', '[AccountStore] 已存入 50 个联系人占位符...');
        }

        await new Promise(r => setTimeout(r, 100));
      } else {
        hasMore = false;
      }
    }

    store.lastSyncTimeMap[uuid] = Date.now();
    store.isContactListLoadedMap[uuid] = true;
    debugLog('cache', '[AccountStore] 通讯录索引同步完成 (账号: {})', uuid);
  } catch (err) {
    console.error('同步流程异常:', err);
  } finally {
    store.syncLockMap[uuid] = false;
  }
}

export function enqueueContactDetails(store: AccountStoreInstance, wxids: string | string[], accountUuid?: string) {
  const targetUuid = accountUuid || store.activeAccountUuid;
  if (!targetUuid) return;

  const ids = Array.isArray(wxids) ? wxids : [wxids];
  const map = store.accountContactMaps[targetUuid] || {};

  ids.forEach(id => {
    if (id !== targetUuid && id !== 'filehelper' && !map[id]) {
      if (!store.accountContactMaps[targetUuid]) {
        store.accountContactMaps[targetUuid] = {};
      }
      store.accountContactMaps[targetUuid][id] = { wxid: id, isPlaceholder: true };

      if (!isRedisMode(store, targetUuid)) {
        contactCache.set(id, store.accountContactMaps[targetUuid][id], targetUuid);
      } else {
        triggerDebouncedRedisWriteback(store, targetUuid);
      }
    }
  });

  if (store.detailsQueue.length > 0) processDetailsQueue(store);
  if (isRedisMode(store, targetUuid)) {
    return;
  }

  const needsFetch = ids.filter(id => {
    if (id === targetUuid || id === 'filehelper') return false;
    const contact = map[id] || store.accountContactMaps[targetUuid]?.[id];
    return !contact || contact.isPlaceholder;
  });

  needsFetch.forEach(id => {
    if (!store.detailsQueue.includes(id)) {
      store.detailsQueue.push(id);
    }
  });

  processDetailsQueue(store);
}

export async function processDetailsQueue(store: AccountStoreInstance) {
  if (store.isProcessingQueue || store.detailsQueue.length === 0) return;
  store.isProcessingQueue = true;

  const batchSize = 20;
  const activeAcc = store.accounts.find((a: any) => a.uuid === store.activeAccountUuid);
  const key = activeAcc?.sessionKey || store.tokenKey;

  try {
    while (store.detailsQueue.length > 0) {
      const batch = store.detailsQueue.splice(0, batchSize);
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
        console.warn("[AccountStore] 补全队列批次请求未返回有效数组，可能包含无效ID或触发限频", details);
      }

      for (const d of detailList) {
        const wxid = d.userName?.str || d.UserName?.str || d.wxid || d.userName || d.UserName;
        if (wxid) {
          await updateContact(store, wxid, d);
        }
      }
    }
  } catch (err) {
    console.error('[AccountStore] 补全队列异常:', err);
  } finally {
    store.isProcessingQueue = false;
    if (store.detailsQueue.length > 0) processDetailsQueue(store);
  }
}
