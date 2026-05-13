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
        const res: any = await messageApi.getContactList(sessionKey, 0, 0);
        const data = res.Data || res;
        
        let rawList: any = [];
        if (Array.isArray(data)) {
          rawList = data;
        } else if (data && typeof data === 'object') {
          rawList = data.UserNameList || data.userNameList || data.ContactList || data.contactList || [];
        }

        // 强制确保是数组
        const userIds = Array.isArray(rawList) ? rawList : [rawList];

        // 统一提取 ID 字符串
        const cleanIds = userIds.map((id: any) => 
          typeof id === 'string' ? id : (id.str || id.UserName || id.userName || id.wxid || '')
        ).filter(id => !!id);

        console.log(`[Account] 账号 ${uuid} 共有 ${cleanIds.length} 个联系人待同步`);

        const batchSize = 50;
        for (let i = 0; i < cleanIds.length; i += batchSize) {
          const batch = cleanIds.slice(i, i + batchSize);
          const cached = await contactCache.getMultiple(batch);
          const missingIds = batch.filter(id => !cached[id]);

          if (missingIds.length > 0) {
            try {
              const detailRes: any = await messageApi.getContactDetailsList(sessionKey, missingIds);
              const dData = detailRes.Data || detailRes;
              const details = dData.contactList || dData.ContactList || [];
              
              for (const d of details) {
                const wid = d.userName?.str || d.UserName?.str || d.wxid || d.userName || d.UserName || '';
                if (wid) {
                  await contactCache.set(wid, d);
                }
              }
              console.log(`[Account] 已同步 ${i + details.length}/${cleanIds.length}`);
            } catch (e) {
              console.error(`[Account] 同步批次 ${i} 失败:`, e);
            }
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
