import { defineStore } from 'pinia';
import { adminApi } from '@/api/modules/admin';
import { messageApi } from '@/api/modules/im'; // 引入 IM API
import { socketManager } from '@/utils/socketManager';
import { contactCache } from '@/utils/contactCache'; // 引入缓存

interface Account {
  uuid: string;
  sessionKey: string;
  nickname: string;
  avatar: string;
  status: 'online' | 'offline';
}

export const useAccountStore = defineStore('account', {
  state: () => ({
    baseUrl: localStorage.getItem('iwe_base_url') || '',
    adminToken: localStorage.getItem('iwe_admin_token') || '',
    accounts: JSON.parse(localStorage.getItem('iwe_accounts') || '[]') as Account[],
    activeAccountUuid: localStorage.getItem('iwe_active_uuid') || '',
  }),
  actions: {
    async syncAccountsFromServer() {
      try {
        const res: any = await adminApi.getAuthKey();
        if (res && Array.isArray(res)) {
          const serverAccounts = res
            .filter((item: any) => item.wx_id && item.status === 1)
            .map((item: any) => ({
              uuid: item.wx_id,
              sessionKey: item.license,
              nickname: item.nick_name || '未知账号',
              avatar: '', // 初始为空
              status: 'online' as const
            }));

          this.accounts = serverAccounts;
          this.saveAccountsToLocal();
          
          this.enrichAccountDetails();

          serverAccounts.forEach(acc => {
            socketManager.registerAccount(acc.uuid, acc.sessionKey, acc.uuid);
          });

          const stillExists = this.accounts.some(acc => acc.uuid === this.activeAccountUuid);
          if (!stillExists && this.accounts.length > 0) {
            this.setActiveAccount(this.accounts[0].uuid);
          }
        }
      } catch (err) {
        console.error('从服务器同步账号失败:', err);
      }
    },

    async enrichAccountDetails() {
      for (const acc of this.accounts) {
        try {
          const cached: any = await contactCache.get(acc.uuid);
          if (cached) {
            this.updateAccountInfo(acc.uuid, cached);
            continue;
          }

          const res: any = await messageApi.getContactDetailsList(acc.sessionKey, [acc.uuid]);
          const data = res.Data || res;
          const details = data.contactList || data.ContactList || [];
          if (details.length > 0) {
            const detail = details[0];
            this.updateAccountInfo(acc.uuid, detail);
            contactCache.set(acc.uuid, detail); 
          }
        } catch (e) {
          console.error(`补全账号 ${acc.uuid} 详情失败:`, e);
        }
      }
    },

    async syncFullContactList(uuid: string, sessionKey: string) {
      try {
        console.log(`[Account] 开始同步账号 ${uuid} 的全量通讯录...`);
        
        let currentSeq = 0;
        let currentRoomSeq = 0;
        let allCleanIds: string[] = [];
        let hasMore = true;
        let safetyCounter = 0;

        while (hasMore && safetyCounter < 50) {
          safetyCounter++;
          const res: any = await messageApi.getContactList(sessionKey, currentSeq, currentRoomSeq);
          console.log(`[Account] getContactList (Seq: ${currentSeq}) 原始响应:`, res);
          
          const data = res.Data || res;
          let rawList: any = [];
          
          if (data && typeof data === 'object') {
            const cl = data.ContactList || data.contactList;
            if (Array.isArray(cl)) {
              rawList = cl;
            } else if (cl && typeof cl === 'object') {
              rawList = cl.MemberList || cl.memberList || cl.UserNameList || cl.userNameList || Object.values(cl).find(v => Array.isArray(v)) || [];
            } else {
              rawList = data.UserNameList || data.userNameList || [];
            }

            const nextSeq = data.CurrentWxcontactSeq || data.currentWxcontactSeq || (cl && (cl.CurrentWxcontactSeq || cl.currentWxcontactSeq)) || 0;
            const nextRoomSeq = data.CurrentChatRoomContactSeq || data.currentChatRoomContactSeq || (cl && (cl.CurrentChatRoomContactSeq || cl.currentChatRoomContactSeq)) || 0;
            
            if ((nextSeq === currentSeq && nextRoomSeq === currentRoomSeq) || (nextSeq === 0 && nextRoomSeq === 0)) {
              hasMore = false;
            }
            
            currentSeq = nextSeq;
            currentRoomSeq = nextRoomSeq;
            
            console.log(`[Account] 进度: Seq=${currentSeq}, RoomSeq=${currentRoomSeq}`);
          } else {
            hasMore = false;
          }

          const userIds = Array.isArray(rawList) ? rawList : (rawList ? [rawList] : []);
          const cleanIds = userIds.map((id: any) => {
            if (typeof id === 'string') return id;
            if (id && typeof id === 'object') {
              return id.str || id.Str || id.UserName || id.userName || id.wxid || '';
            }
            return '';
          }).filter(id => !!id && typeof id === 'string');

          allCleanIds = [...new Set([...allCleanIds, ...cleanIds])];
          console.log(`[Account] 当前已累计提取 ID: ${allCleanIds.length}`);
        }

        console.log(`[Account] 账号 ${uuid} 共提取到 ${allCleanIds.length} 个有效 ID`);

        if (allCleanIds.length === 0) {
          console.warn(`[Account] 账号 ${uuid} 未获取到任何联系人 ID`);
          return;
        }

        const batchSize = 50;
        for (let i = 0; i < allCleanIds.length; i += batchSize) {
          const batch = allCleanIds.slice(i, i + batchSize);
          const cached = await contactCache.getMultiple(batch);
          const missingIds = batch.filter(id => !cached[id]);

          if (missingIds.length > 0) {
            try {
              const detailRes: any = await messageApi.getContactDetailsList(sessionKey, missingIds);
              const dData = detailRes.Data || detailRes;
              const details = dData.contactList || dData.ContactList || [];
              
              for (const d of details) {
                let wid = '';
                if (typeof d.userName === 'object') {
                  wid = d.userName.str || d.userName.Str || '';
                } else if (typeof d.UserName === 'object') {
                  wid = d.UserName.str || d.UserName.Str || '';
                } else {
                  wid = d.userName || d.UserName || d.wxid || '';
                }
                
                if (wid && typeof wid === 'string') {
                  await contactCache.set(wid, d);
                }
              }
              console.log(`[Account] 详情同步进度: ${Math.min(i + batchSize, allCleanIds.length)}/${allCleanIds.length}`);
            } catch (e) {
              console.error(`[Account] 同步详情批次 ${i} 失败:`, e);
            }
          } else {
            console.log(`[Account] 详情批次 ${i} 已在缓存中，跳过`);
          }
        }
        console.log(`[Account] 账号 ${uuid} 通讯录同步完成`);
      } catch (err) {
        console.error(`[Account] 同步通讯录失败:`, err);
      }
    },

    updateAccountInfo(uuid: string, detail: any) {
      const acc = this.accounts.find(a => a.uuid === uuid);
      if (acc) {
        const url = detail.smallHeadImgUrl || detail.SmallHeadImgUrl || detail.headImgUrl || detail.HeadImgUrl || detail.avatar || '';
        acc.avatar = typeof url === 'string' ? url.trim().replace(/`/g, '') : '';
        const nick = detail.nickName || detail.NickName || detail.nickname;
        acc.nickname = (nick && typeof nick === 'object') ? (nick.str || acc.nickname) : (nick || acc.nickname);
        this.saveAccountsToLocal();
      }
    },

    setGlobalConfig(url: string, token: string) {
      this.baseUrl = url;
      this.adminToken = token;
      localStorage.setItem('iwe_base_url', url);
      localStorage.setItem('iwe_admin_token', token);
    },
    
    saveAccountsToLocal() {
      localStorage.setItem('iwe_accounts', JSON.stringify(this.accounts));
    },

    addAccount(acc: Account) {
      const exists = this.accounts.find(a => a.uuid === acc.uuid);
      if (!exists) {
        this.accounts.push(acc);
      } else {
        exists.sessionKey = acc.sessionKey; 
      }
      this.saveAccountsToLocal();
      if (!this.activeAccountUuid) {
        this.setActiveAccount(acc.uuid);
      }
    },

    setActiveAccount(uuid: string) {
      this.activeAccountUuid = uuid;
      localStorage.setItem('iwe_active_uuid', uuid);
    }
  }
});
