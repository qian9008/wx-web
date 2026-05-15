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
    return new Promise((resolve) => {
      const transaction = db.transaction(MSG_STORE, 'readwrite');
      const store = transaction.objectStore(MSG_STORE);
      store.put({
        ...msg,
        accountUuid,
        partnerId: msg.partnerId // 在 chatStore 中会补全这个字段
      });
      transaction.oncomplete = () => resolve(true);
    });
  },

  async getMessages(accountUuid: string, partnerId: string, limit = 50) {
    const db = await this.init();
    return new Promise<any[]>((resolve) => {
      const transaction = db.transaction(MSG_STORE, 'readonly');
      const store = transaction.objectStore(MSG_STORE);
      
      // 复合索引查询在某些环境下不稳定，或者 accountUuid/partnerId 包含特殊字符可能导致数组键失效
      // 优化方案：使用 IDBKeyRange.only 显式指定复合键
      const index = store.index('account_partner');
      const request = index.getAll(IDBKeyRange.only([accountUuid, partnerId]));
      
      request.onsuccess = () => {
        let all = request.result || [];
        
        // 鲁棒性兜底：如果复合索引未返回结果，尝试手动过滤（虽然性能略低但更可靠）
        if (all.length === 0) {
          const fallbackRequest = store.getAll();
          fallbackRequest.onsuccess = () => {
            const filtered = (fallbackRequest.result || []).filter(
              (m: any) => m.accountUuid === accountUuid && m.partnerId === partnerId
            );
            const sorted = filtered.sort((a, b) => b.time - a.time).slice(0, limit);
            resolve(sorted.sort((a, b) => a.time - b.time));
          };
          fallbackRequest.onerror = () => resolve([]);
          return;
        }

        // 按时间倒序取最近的，再正序返回给前端
        const sorted = all.sort((a: any, b: any) => b.time - a.time).slice(0, limit);
        resolve(sorted.sort((a: any, b: any) => a.time - b.time));
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

  async getAll(accountUuid?: string) {
    const db = await this.init();
    return new Promise<any[]>((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        const results = request.result || [];
        // 严格隔离逻辑：
        // 1. 如果没有提供 accountUuid，通常是全局导出等操作，返回所有。
        // 2. 如果提供了 accountUuid，则【只】返回匹配该 ID 的联系人。
        //    不再返回 !r.accountUuid 的数据，防止空槽位泄露其他账号的数据。
        if (!accountUuid) {
          resolve(results.map((r: any) => r.detail));
        } else {
          const filtered = results.filter((r: any) => r.accountUuid === accountUuid);
          resolve(filtered.map((r: any) => r.detail));
        }
      };
      request.onerror = () => resolve([]);
    });
  },

  async set(wxid: string, detail: any, accountUuid?: string) {
    if (!wxid || typeof wxid !== 'string') {
      console.warn('[DB] 尝试保存无效的 wxid:', wxid);
      return false;
    }
    const db = await this.init();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      // 使用组合键或增加字段来隔离
      store.put({ 
        wxid: accountUuid ? `${accountUuid}_${wxid}` : wxid, 
        realWxid: wxid, 
        accountUuid: accountUuid || '', 
        detail, 
        timestamp: Date.now() 
      });
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
          console.log(`[DB] 清理了 ${count} 条群消息记录`);
          resolve(count);
        }
      };
      request.onerror = (e) => {
        console.error('[DB] 清理群消息失败:', e);
        resolve(0);
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
          console.log(`[DB] 清理了 ${count} 条公众号消息记录`);
          resolve(count);
        }
      };
      request.onerror = (e) => {
        console.error('[DB] 清理公众号消息失败:', e);
        resolve(0);
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
