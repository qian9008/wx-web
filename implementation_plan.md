# 微信头像过期/404 响应式自愈与降级展示设计方案

微信头像 URL 存在时效限制，过期后会返回 404，导致前端列表及聊天中的头像破损。本方案在前端实现**视觉降级与静默自愈机制**，无需用户手动拉取，全自动静默修复破损头像。

## 涉及文件修改

### 1. [components/ChatMessageItem.vue](file:///d:/Users/Documents/1/iwe/iwe-web/src/components/ChatMessageItem.vue)
- **改动详情**：
  - 聊天气泡头像 `<img>` 标签绑定 `@error` 事件：`@error="(e) => handleAvatarError(e, msg.isSelf ? activeAccountUuid : String(msg.from))"`。
  - 在 script 中实现 `handleAvatarError`：
    1. 图片加载失败时，保持原有裂图状态，使用户可以直接感知发现头像 404 问题。
    2. 使用全局 `updatingAvatarWxids` 去重集合（防重复刷屏拉取）。
    3. 若该好友不是自己且非 `filehelper`，异步调用 `accountStore.forceUpdateContactDetails(wxid)` 发起后端拉取，完成数据库与内存资料的静默更新。

### 2. [components/ListSidebar.vue](file:///d:/Users/Documents/1/iwe/iwe-web/src/components/ListSidebar.vue)
- **改动详情**：
  - 对会话列表、联系人列表、群聊及公众号列表中的共 5 处渲染头像的 `<img>` 标签绑定 `@error` 事件。
  - 在 script 中引入模块全局 `updatingAvatarWxids = new Set<string>()`，实现类似的 `handleAvatarError` 自愈处理。

---

## 验证计划

1. **404 感知验证**：修改联系人缓存中的某个头像 URL 为不存在的伪地址，重新进入会话，确认其头像加载失败显示裂图，控制台出现 404。
2. **静默更新验证**：在上述加载失败后，控制台应打印 `[Avatar:Error] 发现头像过期/404, 触发静默更新资料: xxx`，且网络面板有 `GetContactDetailsList` 接口的 POST 请求，请求返回后页面上的头像自动刷新变回真实头像。
3. **高频防刷验证**：在同一个好友发出多条消息的界面，其头像 404 后，触发静默更新的 API 请求应当只发送 1 次，其余重复报错被 `Set` 完美拦截。
4. **编译构建验证**：运行 `npm run build`。
