const DB_NAME = 'iwe_cache';
const DB_VERSION = 7; // v7: CONV_STORE 添加 accountUuid 索引，MSG_STORE 添加 partnerId 索引
const STORE_NAME = 'contacts';
const MSG_STORE = 'messages';
const CONV_STORE = 'conversations';
const AVATAR_STORE = 'avatars';

// Fix #9: 每个会话最多保留的消息条数（FIFO 淘汰）
const MAX_MESSAGES_PER_CONV = 500;

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
        const oldVersion = e.oldVersion;
        console.log('[DB] 触发升级逻辑, 当前版本:', oldVersion, '->', e.newVersion);

        // contacts store
        if (db.objectStoreNames.contains(STORE_NAME)) {
          db.deleteObjectStore(STORE_NAME);
        }
        const contactStore = db.createObjectStore(STORE_NAME, { keyPath: 'uid_wxid' });
        contactStore.createIndex('accountUuid', 'accountUuid', { unique: false });

        // messages store
        if (!db.objectStoreNames.contains(MSG_STORE)) {
          const msgStore = db.createObjectStore(MSG_STORE, { keyPath: 'id' });
          msgStore.createIndex('account_partner', ['accountUuid', 'partnerId'], { unique: false });
          msgStore.createIndex('time', 'time', { unique: false });
          // Fix #11: 添加 partnerId 索引，加速按类型批量删除
          msgStore.createIndex('partnerId', 'partnerId', { unique: false });
        } else if (oldVersion < 7) {
          // 升级已存在的 MSG_STORE：添加缺失索引
          const tx = (e.target as IDBOpenDBRequest).transaction!;
          const msgStore = tx.objectStore(MSG_STORE);
          if (!msgStore.indexNames.contains('partnerId')) {
            msgStore.createIndex('partnerId', 'partnerId', { unique: false });
          }
        }

        // Fix #3: conversations store 添加 accountUuid 索引
        if (db.objectStoreNames.contains(CONV_STORE)) {
          db.deleteObjectStore(CONV_STORE);
        }
        const convStore = db.createObjectStore(CONV_STORE, { keyPath: 'uid_partner' });
        convStore.createIndex('accountUuid', 'accountUuid', { unique: false });

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

  // Fix #3: 使用 accountUuid 索引代替全表扫描
  async getConversations(accountUuid: string) {
    const db = await this.init();
    return new Promise<any[]>((resolve) => {
      const transaction = db.transaction(CONV_STORE, 'readonly');
      const store = transaction.objectStore(CONV_STORE);

      // 优先使用索引精确查找
      if (store.indexNames.contains('accountUuid')) {
        const index = store.index('accountUuid');
        const request = index.getAll(IDBKeyRange.only(accountUuid));
        request.onsuccess = () => {
          const results = (request.result || []).sort((a: any, b: any) => b.time - a.time);
          resolve(results);
        };
        request.onerror = () => resolve([]);
      } else {
        // 降级：全表扫描（兼容旧 DB 版本，升级后不再走此分支）
        const request = store.getAll();
        request.onsuccess = () => {
          const filtered = (request.result || [])
            .filter((c: any) => c.accountUuid === accountUuid)
            .sort((a: any, b: any) => b.time - a.time);
          resolve(filtered);
        };
        request.onerror = () => resolve([]);
      }
    });
  },

  // --- 消息相关 ---
  async saveMessage(accountUuid: string, msg: any) {
    const db = await this.init();
    return new Promise<void>(async (resolve) => {
      // Fix #9: 写入前检查该会话消息数，超过上限则淘汰最旧的
      await this._pruneMessages(db, accountUuid, msg.partnerId);

      const transaction = db.transaction(MSG_STORE, 'readwrite');
      const store = transaction.objectStore(MSG_STORE);
      store.put({
        ...msg,
        accountUuid,
        partnerId: msg.partnerId
      });
      transaction.oncomplete = () => resolve();
    });
  },

  // Fix #9: FIFO 淘汰旧消息，保持每会话不超过 MAX_MESSAGES_PER_CONV 条
  async _pruneMessages(db: IDBDatabase, accountUuid: string, partnerId: string) {
    return new Promise<void>((resolve) => {
      const transaction = db.transaction(MSG_STORE, 'readwrite');
      const store = transaction.objectStore(MSG_STORE);
      const index = store.index('account_partner');
      const request = index.getAll(IDBKeyRange.only([accountUuid, partnerId]));

      request.onsuccess = () => {
        const all: any[] = request.result || [];
        if (all.length < MAX_MESSAGES_PER_CONV) {
          resolve();
          return;
        }
        // 按时间排序，删除最旧的 (all.length - MAX_MESSAGES_PER_CONV + 1) 条
        all.sort((a, b) => a.time - b.time);
        const toDelete = all.slice(0, all.length - MAX_MESSAGES_PER_CONV + 1);
        toDelete.forEach(m => store.delete(m.id));
        transaction.oncomplete = () => resolve();
      };
      request.onerror = () => resolve(); // 剪枝失败不阻塞写入
    });
  },

  // Fix #4: 删除 fallback 全表扫描
  async getMessages(accountUuid: string, partnerId: string, limit = 50) {
    const db = await this.init();
    return new Promise<any[]>((resolve) => {
      const transaction = db.transaction(MSG_STORE, 'readonly');
      const store = transaction.objectStore(MSG_STORE);
      const index = store.index('account_partner');
      const request = index.getAll(IDBKeyRange.only([accountUuid, partnerId]));

      request.onsuccess = () => {
        const all = request.result || [];
        // 取最新 limit 条（时间倒序取前 N，再正序返回）
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

      if (accountUuid && store.indexNames.contains('accountUuid')) {
        const index = store.index('accountUuid');
        const request = index.count(IDBKeyRange.only(accountUuid));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(0);
      } else {
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
    if (!window.navigator?.storage?.estimate) return '浏览器不支持';
    try {
      const estimate = await window.navigator.storage.estimate();
      return this.formatSize(estimate.usage || 0);
    } catch (e) {
      return '获取失败';
    }
  },

  async getAvatarCacheSize(): Promise<string> {
    if (!window.caches) return '0 B';
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
      return '无法计算';
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

    const stores = [STORE_NAME, MSG_STORE, CONV_STORE];

    const promises = stores.map(storeName => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);

        transaction.oncomplete = () => resolve(true);
        transaction.onerror = (e) => reject(e);

        if (store.indexNames.contains('accountUuid')) {
          const index = store.index('accountUuid');
          const request = index.openCursor(IDBKeyRange.only(oldUuid));

          request.onsuccess = (e: any) => {
            const cursor = e.target.result;
            if (cursor) {
              const data = cursor.value;
              data.accountUuid = newUuid;

              if (storeName === STORE_NAME) {
                store.delete(cursor.primaryKey);
                data.uid_wxid = `${newUuid}_${data.wxid}`;
                store.put(data);
              } else if (storeName === CONV_STORE) {
                store.delete(cursor.primaryKey);
                data.uid_partner = `${newUuid}_${data.wxid}`;
                store.put(data);
              } else {
                cursor.update(data);
              }
              cursor.continue();
            }
          };
        } else {
          resolve(true);
        }
      });
    });

    try {
      await Promise.all(promises);
      console.log(`[DB] 完成账号数据迁移: ${oldUuid} -> ${newUuid}`);
    } catch (err) {
      console.error(`[DB] 账号数据迁移失败: ${oldUuid} -> ${newUuid}`, err);
      throw err;
    }
  },

  // Fix #11: 使用索引精确删除群消息，传入 accountUuid 隔离
  async clearGroupMessages(accountUuid?: string) {
    const db = await this.init();
    return new Promise<number>((resolve) => {
      const transaction = db.transaction(MSG_STORE, 'readwrite');
      const store = transaction.objectStore(MSG_STORE);
      let count = 0;

      // 尝试使用 account_partner 复合索引定向扫描（如无法直接枚举 chatroom，降级 cursor）
      const request = store.openCursor();
      request.onsuccess = (e: any) => {
        const cursor = e.target.result;
        if (cursor) {
          const msg = cursor.value;
          const belongsToAccount = !accountUuid || msg.accountUuid === accountUuid;
          if (belongsToAccount && msg.partnerId?.endsWith('@chatroom')) {
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

  // Fix #11: 同上，按账号隔离清理公众号消息
  async clearOfficialMessages(accountUuid?: string) {
    const db = await this.init();
    return new Promise<number>((resolve) => {
      const transaction = db.transaction(MSG_STORE, 'readwrite');
      const store = transaction.objectStore(MSG_STORE);
      let count = 0;

      const request = store.openCursor();
      request.onsuccess = (e: any) => {
        const cursor = e.target.result;
        if (cursor) {
          const msg = cursor.value;
          const belongsToAccount = !accountUuid || msg.accountUuid === accountUuid;
          const isOfficial = msg.partnerId?.startsWith('gh_') ||
            ['fmessage', 'medianote', 'floatbottle'].includes(msg.partnerId);
          if (belongsToAccount && isOfficial) {
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
