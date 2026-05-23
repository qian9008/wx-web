const DB_NAME = 'iwe_cache';
const DB_VERSION = 8; // v8: 为 MSG_STORE 添加 partnerType 索引
const STORE_NAME = 'contacts';
const MSG_STORE = 'messages';
const CONV_STORE = 'conversations';
import { isDebug } from './debug';
const AVATAR_STORE = 'avatars';

// 每个会话最多保留的消息条数（FIFO 淘汰）
const MAX_MESSAGES_PER_CONV = 500;
// 头像缓存有效期：30天
const AVATAR_TTL = 30 * 24 * 60 * 60 * 1000;

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
        if (isDebug('cache')) {
          console.log('[DB] 触发升级逻辑, 当前版本:', oldVersion, '->', e.newVersion);
        }

        // contacts store
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const contactStore = db.createObjectStore(STORE_NAME, { keyPath: 'uid_wxid' });
          contactStore.createIndex('accountUuid', 'accountUuid', { unique: false });
        }

        // messages store
        if (!db.objectStoreNames.contains(MSG_STORE)) {
          const msgStore = db.createObjectStore(MSG_STORE, { keyPath: 'id' });
          msgStore.createIndex('account_partner', ['accountUuid', 'partnerId'], { unique: false });
          msgStore.createIndex('time', 'time', { unique: false });
          msgStore.createIndex('partnerId', 'partnerId', { unique: false });
          msgStore.createIndex('partnerType', 'partnerType', { unique: false });
        } else {
          const tx = (e.target as IDBOpenDBRequest).transaction!;
          const msgStore = tx.objectStore(MSG_STORE);
          if (!msgStore.indexNames.contains('partnerId')) {
            msgStore.createIndex('partnerId', 'partnerId', { unique: false });
          }
          if (!msgStore.indexNames.contains('partnerType')) {
            msgStore.createIndex('partnerType', 'partnerType', { unique: false });
          }
        }

        // conversations store
        if (!db.objectStoreNames.contains(CONV_STORE)) {
          const convStore = db.createObjectStore(CONV_STORE, { keyPath: 'uid_partner' });
          convStore.createIndex('accountUuid', 'accountUuid', { unique: false });
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

      if (store.indexNames.contains('accountUuid')) {
        const index = store.index('accountUuid');
        const request = index.getAll(IDBKeyRange.only(accountUuid));
        request.onsuccess = () => {
          const results = (request.result || []).sort((a: any, b: any) => b.time - a.time);
          resolve(results);
        };
        request.onerror = () => resolve([]);
      } else {
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
  async saveMessage(accountUuid: string, msg: any, maxMessagesPerConv = 500) {
    const db = await this.init();
    return new Promise<void>(async (resolve) => {
      await this._pruneMessages(db, accountUuid, msg.partnerId, maxMessagesPerConv);

      const transaction = db.transaction(MSG_STORE, 'readwrite');
      const store = transaction.objectStore(MSG_STORE);

      // 自动补全 partnerType 如果缺失
      if (!msg.partnerType) {
        if (msg.partnerId?.endsWith('@chatroom')) {
          msg.partnerType = 'chatroom';
        } else {
          const specialIds = ['fmessage', 'medianote', 'floatbottle', 'newsapp', 'helper_entry', 'filehelper'];
          if (msg.partnerId?.startsWith('gh_') || specialIds.includes(msg.partnerId)) {
            msg.partnerType = 'official';
          } else {
            msg.partnerType = 'individual';
          }
        }
      }

      store.put({
        ...msg,
        accountUuid,
        partnerId: msg.partnerId,
        partnerType: msg.partnerType
      });
      transaction.oncomplete = () => resolve();
    });
  },

  async _pruneMessages(db: IDBDatabase, accountUuid: string, partnerId: string, maxMessagesPerConv = 500) {
    return new Promise<void>((resolve) => {
      const transaction = db.transaction(MSG_STORE, 'readwrite');
      const store = transaction.objectStore(MSG_STORE);
      const index = store.index('account_partner');
      const request = index.getAll(IDBKeyRange.only([accountUuid, partnerId]));

      request.onsuccess = () => {
        const all: any[] = request.result || [];
        if (all.length < maxMessagesPerConv) {
          resolve();
          return;
        }
        all.sort((a, b) => a.time - b.time);
        const toDelete = all.slice(0, all.length - maxMessagesPerConv + 1);
        toDelete.forEach(m => store.delete(m.id));
        transaction.oncomplete = () => resolve();
      };
      request.onerror = () => resolve();
    });
  },

  async clearGroupMessages(accountUuid?: string) {
    const db = await this.init();
    return new Promise<number>((resolve) => {
      const transaction = db.transaction(MSG_STORE, 'readwrite');
      const store = transaction.objectStore(MSG_STORE);
      const index = store.index('partnerType');
      const request = index.openCursor(IDBKeyRange.only('chatroom'));
      let count = 0;

      request.onsuccess = (e: any) => {
        const cursor = e.target.result;
        if (cursor) {
          const msg = cursor.value;
          if (!accountUuid || msg.accountUuid === accountUuid) {
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

  async clearOfficialMessages(accountUuid?: string) {
    const db = await this.init();
    return new Promise<number>((resolve) => {
      const transaction = db.transaction(MSG_STORE, 'readwrite');
      const store = transaction.objectStore(MSG_STORE);
      const index = store.index('partnerType');
      const request = index.openCursor(IDBKeyRange.only('official'));
      let count = 0;

      request.onsuccess = (e: any) => {
        const cursor = e.target.result;
        if (cursor) {
          const msg = cursor.value;
          if (!accountUuid || msg.accountUuid === accountUuid) {
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

  async getMessages(accountUuid: string, partnerId: string, limit = 50) {
    const db = await this.init();
    return new Promise<any[]>((resolve) => {
      const transaction = db.transaction(MSG_STORE, 'readonly');
      const store = transaction.objectStore(MSG_STORE);
      const index = store.index('account_partner');
      const request = index.getAll(IDBKeyRange.only([accountUuid, partnerId]));

      request.onsuccess = () => {
        const all = request.result || [];
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

  async deleteContact(wxid: string, accountUuid: string) {
    if (!accountUuid) return;
    const db = await this.init();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.delete(`${accountUuid}_${wxid}`);
      transaction.oncomplete = () => resolve(true);
    });
  },

  async deleteConversation(wxid: string, accountUuid: string) {
    if (!accountUuid) return;
    const db = await this.init();
    return new Promise((resolve) => {
      const transaction = db.transaction(CONV_STORE, 'readwrite');
      const store = transaction.objectStore(CONV_STORE);
      store.delete(`${accountUuid}_${wxid}`);
      transaction.oncomplete = () => resolve(true);
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

  async getEstimatedSize(accountUuid?: string) {
    const contactCount = await this.getCount(STORE_NAME, accountUuid) as number;
    const msgCount = await this.getCount(MSG_STORE, accountUuid) as number;
    const convCount = await this.getCount(CONV_STORE, accountUuid) as number;
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

  formatSize(sizeInBytes: number): string {
    if (sizeInBytes < 1024) return `${sizeInBytes} B`;
    if (sizeInBytes < 1024 * 1024) return `${(sizeInBytes / 1024).toFixed(2)} KB`;
    return `${(sizeInBytes / (1024 * 1024)).toFixed(2)} MB`;
  },

  async clearStore(storeName: string, accountUuid?: string) {
    const db = await this.init();
    return new Promise((resolve) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);

      if (accountUuid && store.indexNames.contains('accountUuid')) {
        const index = store.index('accountUuid');
        const request = index.openCursor(IDBKeyRange.only(accountUuid));
        request.onsuccess = (e: any) => {
          const cursor = e.target.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          } else {
            resolve(true);
          }
        };
      } else {
        store.clear();
        transaction.oncomplete = () => resolve(true);
      }
    });
  },

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
      if (isDebug('cache')) {
        console.log(`[DB] 完成账号数据迁移: ${oldUuid} -> ${newUuid}`);
      }
    } catch (err) {
      console.error(`[DB] 账号数据迁移失败: ${oldUuid} -> ${newUuid}`, err);
      throw err;
    }
  },

  async clearAll(accountUuid?: string) {
    if (!accountUuid) {
      const db = await this.init();
      return new Promise((resolve) => {
        const transaction = db.transaction([STORE_NAME, MSG_STORE, CONV_STORE, AVATAR_STORE], 'readwrite');
        transaction.objectStore(STORE_NAME).clear();
        transaction.objectStore(MSG_STORE).clear();
        transaction.objectStore(CONV_STORE).clear();
        transaction.objectStore(AVATAR_STORE).clear();
        transaction.oncomplete = () => resolve(true);
      });
    } else {
      await this.clearStore(STORE_NAME, accountUuid);
      await this.clearStore(MSG_STORE, accountUuid);
      await this.clearStore(CONV_STORE, accountUuid);
      return true;
    }
  },
};
