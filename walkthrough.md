# 微信头像过期/404 响应式自愈与 Redis 同步更新交付文档 (Walkthrough)

本次更新落实了**微信头像 404 过期自愈机制**与 **Redis 自动回写同步**，不再向前端 IndexedDB 数据库写入臃肿的头像 Base64 数据，完全依赖浏览器原生 CDN 缓存机制，实现轻量化且高可靠的自愈闭环。

## 变更内容详情

### 1. 彻底移除前端 Base64 本地缓存逻辑（防体积撑爆）
- 回滚并删除了前端 IndexedDB 头像缓存 `avatars` 表的读写逻辑，同时清理了 Pinia `account` store 中的死字段 `avatarBlobMap` 及 `getAvatarUrl` 中的 fetch 缓存转化过程。
- 微信头像回归原生的 CDN URL 直接展示，充分借助浏览器自身的 HTTP 静态资源缓存（304/Disk Cache）进行秒开，防止前端 IndexedDB 爆容风险。

### 2. 头像过期/404 静默自愈与 Redis 自动同步更新
- **图片加载异常捕捉**：在 [ChatMessageItem.vue](file:///d:/Users/Documents/1/iwe/iwe-web/src/components/ChatMessageItem.vue) 和 [ListSidebar.vue](file:///d:/Users/Documents/1/iwe/iwe-web/src/components/ListSidebar.vue) 中，为总计 6 处头像 `<img>` 标签绑定 `@error` 失败事件。
- **无感知静默更新**：一旦头像请求返回 404（微信 CDN 头像 30 天过期），在前端保持裂图状态以确保能直接感知并发现 404 头像，而在后台自动触发静默更新流程。
- **资料拉取自愈**：利用模块全局去重集合 `updatingAvatarWxids`（10 秒去重防重复请求），静默发起 `accountStore.forceUpdateContactDetails(wxid)`，拉取该好友的最新详情资料。
- **Redis 同步更新**：在 `updateContact` 被调用后，如果开启了 Redis 极速模式（即 `isRedisMode`），会通过防抖机制（3秒防抖延迟）自动执行 `saveAllContactsToRedis` 把更新后的好友最新资料（包含最新有效头像链接）全量回写到后端 Redis。
- **响应式刷新**：拉取回的最新头像会瞬间更新内存中的 `contactMap` 及会话列表对象，Vue 的响应式系统触发更新，使页面和会话列表处的头像无缝变回正常的最新微信头像。


---

## 验证与测试结果

- **构建编译验证**：
  通过在终端执行 `npm run build` 进行生产包构建，确认无任何 TS 类型错误与语法编译问题，编译打包成功。
- **自愈功能效果**：
  1. 发生 404 破图时，页面头像呈现裂图状态，方便用户发现与感知，同时后台已静默发送好友详情拉取 API。
  2. 详情数据返回后，页面及会话列表上的头像瞬间自愈变回最新的有效微信头像。
  3. 后台在防抖 3 秒后自动完成 Redis 数据覆盖回写，实现了后端数据的自愈。
