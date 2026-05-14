const DB_NAME = 'iwe_cache';
const DB_VERSION = 5; // 升级版本以增加头像表
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
      console.log(`[DB] 尝试打开数据库: ${DB_NAME}, 版本: ${DB_VERSION}`);
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        console.log('[DB] 触发升级逻辑');
        
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'wxid' });
        }
        
        if (!db.objectStoreNames.contains(MSG_STORE)) {
          const msgStore = db.createObjectStore(MSG_STORE, { keyPath: 'id' });
          msgStore.createIndex('account_partner', ['accountUuid', 'partnerId'], { unique: false });
          msgStore.createIndex('time', 'time', { unique: false });
        }

        if (!db.objectStoreNames.contains(CONV_STORE)) {
          // keyPath 使用 accountUuid + partnerId 的组合
          db.createObjectStore(CONV_STORE, { keyPath: 'uid_partner' });
        }

        if (!db.objectStoreNames.contains(AVATAR_STORE)) {
          db.createObjectStore(AVATAR_STORE, { keyPath: 'url' });
        }
      };

      request.onsuccess = (e: any) => {
        this.db = e.target.result;
        console.log('[DB] 数据库打开成功, 表:', Array.from(this.db!.objectStoreNames));
        resolve(this.db!);
      };

      request.onerror = () => reject(request.error);
      request.onblocked = () => {
        console.warn('[DB] 数据库升级被阻塞，请关闭其他标签页后重试');
        reject(new Error('数据库升级被阻塞'));
      };
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
    // 强制重新计算 partnerId 确保正确
    const myId = accountUuid.trim().toLowerCase();
    const fromId = msg.from.trim().toLowerCase();
    const toId = msg.to.trim().toLowerCase();
    const partnerId = fromId === myId ? toId : fromId;

    return new Promise((resolve) => {
      const transaction = db.transaction(MSG_STORE, 'readwrite');
      const store = transaction.objectStore(MSG_STORE);
      store.put({ 
        ...msg, 
        accountUuid, 
        partnerId,
        account_partner: [accountUuid, partnerId] 
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
        const msgs = (request.result || []).sort((a: any, b: any) => a.time - b.time);
        resolve(msgs.slice(-limit));
      };
      request.onerror = () => resolve([]);
    });
  },

  async get(wxid: string) {
    const db = await this.init();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(wxid);
      request.onsuccess = () => resolve(request.result?.detail || null);
      request.onerror = () => resolve(null);
    });
  },

  async getMultiple(wxids: string[]) {
    const db = await this.init();
    return new Promise<Record<string, any>>((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const results: Record<string, any> = {};
      let count = 0;

      if (wxids.length === 0) return resolve({});

      wxids.forEach(wxid => {
        const request = store.get(wxid);
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

  async getAll() {
    const db = await this.init();
    return new Promise<any[]>((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve((request.result || []).map((r: any) => r.detail));
      request.onerror = () => resolve([]);
    });
  },

  async set(wxid: string, detail: any) {
    if (!wxid || typeof wxid !== 'string') {
      console.warn('[DB] 尝试保存无效的 wxid:', wxid);
      return false;
    }
    const db = await this.init();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.put({ wxid, detail, timestamp: Date.now() });
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = (e) => {
        console.error('[DB] 保存联系人失败:', e);
        resolve(false);
      };
    });
  },

  async getCount(storeName = STORE_NAME) {
    const db = await this.init();
    return new Promise<number>((resolve) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(0);
    });
  },

  async getEstimatedSize() {
    // 更加细致的估算逻辑
    const contactCount = await this.getCount(STORE_NAME) as number;
    const msgCount = await this.getCount(MSG_STORE) as number;
    const convCount = await this.getCount(CONV_STORE) as number;

    // 估算标准：
    // 联系人详情：~3KB (包含多个字段、头像URL、备注等)
    // 消息：~1KB (文本消息、元数据、状态)
    // 会话：~0.5KB
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
      console.error('[DB] 获取实际空间占用失败:', e);
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
      transaction.onerror = (e) => {
        console.error(`[DB] 清理表 ${storeName} 失败:`, e);
        resolve(false);
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

  // --- 头像静态化缓存 ---
  async saveAvatar(url: string, blob: Blob) {
    const db = await this.init();
    return new Promise((resolve) => {
      const transaction = db.transaction(AVATAR_STORE, 'readwrite');
      const store = transaction.objectStore(AVATAR_STORE);
      store.put({ url, blob, timestamp: Date.now() });
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
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
