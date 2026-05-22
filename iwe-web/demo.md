 移除方案 A：代码级完全物理清除（只需几分钟）
如果您在未来彻底不再需要 Demo 相关的任何代码，只需执行以下几步简单清理：

store/account.ts：
搜索 isDemoMode，将 isDemoMode: localStorage.getItem('isDemoMode') === 'true' 从 state 中移除。
删除 loadDemoData() 这个 Action。
去掉 syncAccountsFromServer 及其他几个 API 同步 action 入口处的 if (this.isDemoMode) { ... } 保护拦截块。
store/chat.ts：
搜索 isDemoMode，删掉 4 个 Action（如备份、同步、会话载入）最顶部的 if (accountStore.isDemoMode) 快速 return 分支。
views/Config.vue：
删掉模板中带 .demo-card-container 的 div 卡片结构。
删掉 enterDemoMode 这一段跳转函数。
views/Home.vue：
将 handleSendMessage 中的 if (accountStore.isDemoMode) 整个分支删掉。
utils/socketManager.ts & components/LeftSidebar.vue：
移除 isDemoMode 判断及相应的侧边栏 v-if 微标签与 scoped 样式。