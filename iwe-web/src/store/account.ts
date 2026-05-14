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

export const useAccountStore = defineStore('account', {
  state: () => ({
    // 统一键名
    adminToken: localStorage.getItem('adminToken') || '',
    baseUrl: localStorage.getItem('baseUrl') || '',
    accounts: [] as Account[],
    activeAccountUuid: '',
    // 内存镜像：wxid -> contactDetail
    contactMap: {} as Record<string, any>
  }),

  actions: {
    setGlobalConfig(url: string, token: string) {
      this.baseUrl = url;
      this.adminToken = token;
      localStorage.setItem('baseUrl', url);
      localStorage.setItem('adminToken', token);
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
