const DB_NAME = 'iwe_cache';
const DB_VERSION = 6; // 升级版本：重构 contacts 表以支持多账号隔离
const STORE_NAME = 'contacts';
const MSG_STORE = 'messages';
const CONV_STORE = 'conversations';
const AVATAR_STORE = 'avatars';

export const contactCache = {
  db: null as IDBDatabase | null,

  async init(): Promise<IDBDatabase> {
    if (this.db) {
      if (this.db.objectStoreNames.contains(STORE_NAME) && 
          this.db.objectStoreNames.contains(MSG_STORE) &&
          this.db.objectStoreNames.contains(CONV_STORE) &&
          this.db.objectStoreNames.contains(AVATAR_STORE)) {
        return this.db;
      }
      this.db.close();
      this.db = null;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        console.log('[DB] 触发升级逻辑, 当前版本:', e.oldVersion, '->', e.newVersion);
        
        if (db.objectStoreNames.contains(STORE_NAME)) {
          db.deleteObjectStore(STORE_NAME);
        }
        
        const contactStore = db.createObjectStore(STORE_NAME, { keyPath: 'uid_wxid' });
        contactStore.createIndex('accountUuid', 'accountUuid', { unique: false });
        
        if (!db.objectStoreNames.contains(MSG_STORE)) {
          const msgStore = db.createObjectStore(MSG_STORE, { keyPath: 'id' });
          msgStore.createIndex('account_partner', ['accountUuid', 'partnerId'], { unique: false });
          msgStore.createIndex('time', 'time', { unique: false });
        }

        if (!db.objectStoreNames.contains(CONV_STORE)) {
          db.createObjectStore(CONV_STORE, { keyPath: 'uid_partner' });
        }

        if (!db.objectStoreNames.contains(AVATAR_STORE)) {
          db.createObjectStore(AVATAR_STORE, { keyPath: 'url' });
        }
      };

      request.onsuccess = (e: any) => {
        this.db = e.target.result;
        resolve(this.db!);
      };

      request.onerror = () => reject(request.error);
    });
  },

  // --- 会话持久化 ---
  async saveConversation(accountUuid: string, conv: any) {
    const db = await this.init();
    return new Promise((resolve) => {
      const transaction = db.transaction(CONV_STORE, 'readwrite');
      const store = transaction.objectStore(CONV_STORE);
      store.put({
        ...conv,
        uid_partner: `${accountUuid}_${conv.wxid}`,
        accountUuid
      });
      transaction.oncomplete = () => resolve(true);
    });
  },

  async getConversations(accountUuid: string) {
    const db = await this.init();
    return new Promise<any[]>((resolve) => {
      const transaction = db.transaction(CONV_STORE, 'readonly');
      const store = transaction.objectStore(CONV_STORE);
      const request = store.getAll();
      request.onsuccess = () => {
        const all = request.result || [];
        const filtered = all.filter((c: any) => c.accountUuid === accountUuid)
                           .sort((a: any, b: any) => b.time - a.time);
        resolve(filtered);
      };
      request.onerror = () => resolve([]);
    });
  },

  // --- 消息相关 ---
  async saveMessage(accountUuid: string, msg: any) {
    const db = await this.init();
    return new Promise((resolve) => {
      const transaction = db.transaction(MSG_STORE, 'readwrite');
      const store = transaction.objectStore(MSG_STORE);
      store.put({
        ...msg,
        accountUuid,
        partnerId: msg.partnerId
      });
      transaction.oncomplete = () => resolve(true);
    });
  },

  async getMessages(accountUuid: string, partnerId: string, limit = 50) {
    const db = await this.init();
    return new Promise<any[]>((resolve) => {
      const transaction = db.transaction(MSG_STORE, 'readonly');
      const store = transaction.objectStore(MSG_STORE);
      const index = store.index('account_partner');
      const request = index.getAll(IDBKeyRange.only([accountUuid, partnerId]));
      
      request.onsuccess = () => {
        let all = request.result || [];
        if (all.length === 0) {
          const fallbackRequest = store.getAll();
          fallbackRequest.onsuccess = () => {
            const filtered = (fallbackRequest.result || []).filter(
              (m: any) => m.accountUuid === accountUuid && m.partnerId === partnerId
            );
            const sorted = filtered.sort((a, b) => b.time - a.time).slice(0, limit);
            resolve(sorted.sort((a, b) => a.time - b.time));
          };
          return;
        }
        const sorted = all.sort((a, b) => b.time - a.time).slice(0, limit);
        resolve(sorted.sort((a, b) => a.time - b.time));
      };
      request.onerror = () => resolve([]);
    });
  },

  // --- 联系人相关 ---
  async set(wxid: string, detail: any, accountUuid: string) {
    if (!accountUuid) return;
    const db = await this.init();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.put({
        uid_wxid: `${accountUuid}_${wxid}`,
        wxid,
        accountUuid,
        detail,
        time: Date.now()
      });
      transaction.oncomplete = () => resolve(true);
    });
  },

  async get(wxid: string, accountUuid: string) {
    if (!accountUuid) return null;
    const db = await this.init();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(`${accountUuid}_${wxid}`);
      request.onsuccess = () => resolve(request.result?.detail || null);
      request.onerror = () => resolve(null);
    });
  },

  async getMultiple(wxids: string[], accountUuid: string) {
    if (!accountUuid || wxids.length === 0) return {};
    const db = await this.init();
    return new Promise<Record<string, any>>((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const results: Record<string, any> = {};
      let count = 0;

      wxids.forEach(wxid => {
        const request = store.get(`${accountUuid}_${wxid}`);
        request.onsuccess = () => {
          if (request.result) {
            results[wxid] = request.result.detail;
          }
          count++;
          if (count === wxids.length) resolve(results);
        };
        request.onerror = () => {
          count++;
          if (count === wxids.length) resolve(results);
        };
      });
    });
  },

  async getAll(accountUuid: string) {
    if (!accountUuid) return [];
    const db = await this.init();
    return new Promise<any[]>((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('accountUuid');
      const request = index.getAll(IDBKeyRange.only(accountUuid));
      
      request.onsuccess = () => {
        const results = request.result || [];
        resolve(results.map((r: any) => r.detail));
      };
      request.onerror = () => resolve([]);
    });
  },

  async getCount(storeName = STORE_NAME, accountUuid?: string) {
    const db = await this.init();
    return new Promise<number>((resolve) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      
      // 如果提供了 accountUuid 且该 store 有 accountUuid 索引，则进行过滤统计
      if (accountUuid && store.indexNames.contains('accountUuid')) {
        const index = store.index('accountUuid');
        const request = index.count(IDBKeyRange.only(accountUuid));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(0);
      } else {
        // 全量统计
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(0);
      }
    });
  },

  async getEstimatedSize() {
    const contactCount = await this.getCount(STORE_NAME) as number;
    const msgCount = await this.getCount(MSG_STORE) as number;
    const convCount = await this.getCount(CONV_STORE) as number;
    const sizeInBytes = (contactCount * 3072) + (msgCount * 1024) + (convCount * 512);
    return this.formatSize(sizeInBytes);
  },

  async getActualSize(): Promise<string> {
    if (!window.navigator || !window.navigator.storage || !window.navigator.storage.estimate) {
      return "浏览器不支持";
    }
    try {
      const estimate = await window.navigator.storage.estimate();
      return this.formatSize(estimate.usage || 0);
    } catch (e) {
      return "获取失败";
    }
  },

  async getAvatarCacheSize(): Promise<string> {
    if (!window.caches) return "0 B";
    try {
      const cacheNames = await window.caches.keys();
      let totalSize = 0;
      for (const name of cacheNames) {
        const cache = await window.caches.open(name);
        const keys = await cache.keys();
        for (const key of keys) {
          const response = await cache.match(key);
          if (response) {
            const blob = await response.blob();
            totalSize += blob.size;
          }
        }
      }
      return this.formatSize(totalSize);
    } catch (e) {
      return "无法计算";
    }
  },

  async clearAvatarCache() {
    if (!window.caches) return true;
    const names = await window.caches.keys();
    await Promise.all(names.map(name => window.caches.delete(name)));
    return true;
  },

  formatSize(sizeInBytes: number): string {
    if (sizeInBytes < 1024) return `${sizeInBytes} B`;
    if (sizeInBytes < 1024 * 1024) return `${(sizeInBytes / 1024).toFixed(2)} KB`;
    return `${(sizeInBytes / (1024 * 1024)).toFixed(2)} MB`;
  },

  async clearStore(storeName: string) {
    const db = await this.init();
    return new Promise((resolve) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      store.clear();
      transaction.oncomplete = () => resolve(true);
    });
  },

  /**
   * 迁移账号数据 (用于 Token -> wxid 的身份转换)
   */
  async migrateAccountData(oldUuid: string, newUuid: string) {
    if (!oldUuid || !newUuid || oldUuid === newUuid) return;
    const db = await this.init();
    
    // 需要迁移的 Stores
    const stores = [STORE_NAME, MSG_STORE, CONV_STORE];
    
    for (const storeName of stores) {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      
      // 使用索引找到所有旧数据
      if (store.indexNames.contains('accountUuid')) {
        const index = store.index('accountUuid');
        const request = index.openCursor(IDBKeyRange.only(oldUuid));
        
        request.onsuccess = (e: any) => {
          const cursor = e.target.result;
          if (cursor) {
            const data = cursor.value;
            // 更新关联 ID
            data.accountUuid = newUuid;
            
            // 更新主键 (如果是复合主键)
            if (storeName === STORE_NAME) {
              // 删除旧键
              store.delete(cursor.primaryKey);
              // 修改数据并重新存入
              data.uid_wxid = `${newUuid}_${data.wxid}`;
              store.put(data);
            } else if (storeName === CONV_STORE) {
              store.delete(cursor.primaryKey);
              data.uid_partner = `${newUuid}_${data.wxid}`;
              store.put(data);
            } else {
              // message 等普通主键直接更新
              cursor.update(data);
            }
            cursor.continue();
          }
        };
      }
    }
    console.log(`[DB] 完成账号数据迁移: ${oldUuid} -> ${newUuid}`);
  },

  async clearGroupMessages() {
    const db = await this.init();
    return new Promise((resolve) => {
      const transaction = db.transaction(MSG_STORE, 'readwrite');
      const store = transaction.objectStore(MSG_STORE);
      const request = store.openCursor();
      let count = 0;
      request.onsuccess = (e: any) => {
        const cursor = e.target.result;
        if (cursor) {
          const msg = cursor.value;
          if (msg.partnerId && msg.partnerId.endsWith('@chatroom')) {
            cursor.delete();
            count++;
          }
          cursor.continue();
        } else {
          resolve(count);
        }
      };
    });
  },

  async clearOfficialMessages() {
    const db = await this.init();
    return new Promise((resolve) => {
      const transaction = db.transaction(MSG_STORE, 'readwrite');
      const store = transaction.objectStore(MSG_STORE);
      const request = store.openCursor();
      let count = 0;
      request.onsuccess = (e: any) => {
        const cursor = e.target.result;
        if (cursor) {
          const msg = cursor.value;
          if (msg.partnerId && (msg.partnerId.startsWith('gh_') || ['fmessage', 'medianote', 'floatbottle'].includes(msg.partnerId))) {
            cursor.delete();
            count++;
          }
          cursor.continue();
        } else {
          resolve(count);
        }
      };
    });
  },

  async clearAll() {
    const db = await this.init();
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME, MSG_STORE, CONV_STORE, AVATAR_STORE], 'readwrite');
      transaction.objectStore(STORE_NAME).clear();
      transaction.objectStore(MSG_STORE).clear();
      transaction.objectStore(CONV_STORE).clear();
      transaction.objectStore(AVATAR_STORE).clear();
      transaction.oncomplete = () => resolve(true);
    });
  },

  async saveAvatar(url: string, blob: Blob) {
    const db = await this.init();
    return new Promise((resolve) => {
      const transaction = db.transaction(AVATAR_STORE, 'readwrite');
      const store = transaction.objectStore(AVATAR_STORE);
      store.put({ url, blob, timestamp: Date.now() });
      transaction.oncomplete = () => resolve(true);
    });
  },

  async getAvatar(url: string): Promise<Blob | null> {
    const db = await this.init();
    return new Promise((resolve) => {
      const transaction = db.transaction(AVATAR_STORE, 'readonly');
      const store = transaction.objectStore(AVATAR_STORE);
      const request = store.get(url);
      request.onsuccess = () => resolve(request.result?.blob || null);
      request.onerror = () => resolve(null);
    });
  }
};
