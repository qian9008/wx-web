# 微信头像过期/404 响应式自愈与缓存优化任务清单

- [x] 1. 在 `contactCache.ts` 中实现 `saveAvatar` 与 `getAvatar` 缓存读写接口
- [x] 2. 完善 `store/account/utils.ts` 的 `getAvatarUrl` 实质缓存下载、IndexedDB 写入与 store 映射逻辑
- [x] 3. 更新 `Home.vue` 中账号及好友头像的 Computed 属性以优先支持本地缓存秒开
- [x] 4. 在 `ChatMessageItem.vue` 中为头像绑定 `@error` 失败事件并编写 `handleAvatarError` 静默拉取与自愈逻辑
- [x] 5. 在 `ListSidebar.vue` 中为会话、好友等 5 处头像渲染 `<img>` 绑定 `@error` 失败监听与降级自愈处理器
- [x] 6. 运行生产包构建打包验证，确保没有任何 TS 或打包异常
