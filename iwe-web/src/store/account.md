
---

### 1. 核心模块与行数占比梳理

| 核心职责板块 | 包含的 Action 方法 | 为什么它需要这么多代码？ |
| :--- | :--- | :--- |
| **① 多槽位账号生命周期** | `syncAccountsFromServer`<br>`fetchProfileAndFixUuid`<br>`preloadOfflineAccountAvatars` | **多账号切换与时序控制**：处理多槽位账号串行获取、在线状态动态检测、离线/在线资料修正切换。 |
| **② 局域网 Redis 双引擎极速模式** | `syncViaRedis`<br>`saveAllContactsToRedis`<br>`triggerDebouncedRedisWriteback`<br>`fillContactsFromRedis` | **万级联系人秒开**：通过局域网 Redis 一次性同步最近消息和增量读写，并包含高难度的 **空内存安全回写保护** 与防抖回写。 |
| **③ 增量联系人拉取与 IndexedDB 本地缓存** | `loadContactsFromCache`<br>`syncFullContactList`<br>`updateContact`<br>`deleteContact` | **离线与断网保障**：所有联系人数据在 IndexedDB 极速缓存，支持断点续传同步、自动判重。 |
| **④ 高并发联系人详情补全队列** | `processDetailsQueue` | **防并发冲垮后台**：由于服务器有 API 限频，为了防止数千名好友同时补全信息导致崩溃，在此设计了带有缓冲与延时的高可靠**任务排队调度器**。 |
| **⑤ 头像Blob化预拉取与防Mixed Content强转** | `getAvatarUrl`<br>`downloadAndCacheAvatar`<br>**`getContactAvatar` (新)**<br>**`getAccountAvatar` (新)** | **图片极速秒开与安全防护**：防 Mixed Content (http 强转 https)、过滤微信无效协议、异步后台加载并写入 IndexedDB 本地二级缓存。 |
| **⑥ 62数据自动冷备份与全局配置** | `autoSave62Data`<br>`setGlobalConfig` | 处理账号安全冷启动和管理后台全局 Redis/API 参数持久化。 |

---

### 2. 为什么没有“过度修复”？

在本次重构中，我们不仅没有往 `account.ts` 中塞入任何沉重的冗余代码，反而起到了**“瘦身”**和**“精益求精”**的效果：
* **对 `account.ts` 的改造极简精准**：我们只在文件末尾追加了 `getContactAvatar` 和 `getAccountAvatar` 两个简洁的方法（共约 30 行），并且复用了原有的 `extractAvatarString`，没有破坏任何既有的底层同步逻辑。
* **对前端组件实现了大幅度减负**：我们直接在 [LeftSidebar.vue](file:///d:/Users/Documents/iwe/iwe-web/src/components/LeftSidebar.vue)、[Home.vue](file:///d:/Users/Documents/iwe/iwe-web/src/views/Home.vue)、[ListSidebar.vue](file:///d:/Users/Documents/iwe/iwe-web/src/components/ListSidebar.vue) 和 [SettingsModal.vue](file:///d:/Users/Documents/iwe/iwe-web/src/components/SettingsModal.vue) 中**彻底删除**了各组件本地重复编写的冗余头像转换、http过滤、blob URL 提取逻辑，让前端组件的维护成本显著降低。

### 总结

`src/store/account.ts` 的 1300 行代码是系统高性能（本地 IndexedDB 缓存 + 局域网 Redis + 防并发队列）的**核心保障**。
