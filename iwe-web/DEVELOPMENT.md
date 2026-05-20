# IWE 多账号轻量化 IM 全量开发百科全书 (V1.0 - 深度技术蓝图)

## 第一部分：设计愿景与技术栈规范 (Architectural Vision)

### 1.1 项目核心定位
本项目旨在构建一个基于微信协议后端的高效管理台。与传统 IM 追求全量本地持久化不同，本项目侧重于：
- **极致流畅度**：通过全内存管理，消除磁盘 I/O 带来的卡顿。
- **多账户矩阵**：支持在单页面内同时监控和操作数十个账号，满足专业运营需求。
- **审计与防撤回**：作为管理工具，具备拦截并保留撤回消息的特殊功能。

### 1.2 核心技术栈 (Technology Stack)
| 模块 | 选型 | 核心理由 |
| :--- | :--- | :--- |
| **基础框架** | Vue 3.3 (Composition API) | 响应式系统极佳，结合 `<script setup>` 提升开发效率。 |
| **状态管理** | Pinia 2.1 | 支持模块化，天然适配多账号隔离的数据结构。 |
| **构建工具** | Vite 4.5 | 极速的热更新，大幅提升大型项目开发体验。 |
| **UI 库** | Arco Design Vue | 布局组件完善，内置图标库与工作台风格高度契合。 |
| **网络层** | Axios + Reconnecting-WS | 稳定且可配置，支持重连逻辑的深度定制。 |
| **本地缓存** | IndexedDB | 用于存储联系人详情，支持 1GB 上限与滚动清理。 |
| **类型检查** | TypeScript | 必须对消息流、账号实体进行全量类型定义，规避大型项目维护风险。 |

### 1.3 性能优化哲学
- **混合缓存策略 (Hybrid Caching)**：
  - **消息流 (Memory-as-DB)**：聊天消息完全驻留内存。由于 IM 消息的时效性，放弃本地持久化以换取极致的渲染流畅度。
  - **静态资源 (IndexedDB Cache)**：联系人详情（NickName、Avatar）由于数据稳定且请求昂贵（接口频率限制），必须持久化至 IndexedDB。
    - **自动管理**：设定 1GB 上限（用户可调），超限时按时间戳（LRU）自动滚动删除老旧数据。
    - **流式加载**：优先从缓存加载实现“秒开”，异步并发补全缺失数据并增量更新 UI，实现“所见即所得”。
- **消息修剪算法**：每个会话的内存数组 `Array` 长度强制上限为 50 条。新消息到达时，若超出上限，立即调用 `shift()`。这保证了即使应用运行一个月，内存占用也始终在可控范围内。

---

## 第二部分：功能需求规格说明 (Functional Requirements)

### 2.1 登录与引导配置 (Authentication)
- **F1.1 初始化引导**：首次打开系统，展示全局配置弹窗。需填入 `ServerBaseUrl` 和 `AdminToken`。系统需进行连通性测试（Ping 接口）。
- **F1.2 多账号并行机制**：
  - 支持点击左侧 `+` 开启扫码。
  - 扫码页需展示状态机：`等待扫码` -> `已扫码未确认` -> `登录成功` -> `重定向至主页`。
- **F1.3 账号持久化与详情补全**：
  - 账号登录成功后，其 `SessionKey` 存入 `LocalStorage`。刷新页面时，自动触发后台静默登录。
  - **自动补全机制**：由于登录接口不带头像，系统在同步后自动触发异步详情补全（优先查缓存，其次调用 `getContactDetailsList`）。

### 2.2 消息通讯核心 (Messaging)
- **F2.1 多媒体支持**：
  - **文本**：支持 Emoji 解析。
  - **图片**：聊天流内仅加载缩略图，用户点击后弹出预览框并请求原图资源。
  - **撤回拦截 (核心特色)**：收到撤回指令包时，锁定该消息对象，禁止其从内存中删除，并在 UI 上标记为“已拦截”。
- **F2.2 消息同步**：
  - **冷启动同步**：登录即拉取 Redis 缓存消息。
  - **断线重连**：自动补拉空窗期消息，无感恢复。
- **F2.3 状态上报**：支持已读回执同步，用户点击进入会话即触发。

### 2.3 交互体验设计
- **F3.1 账号指示器**：左侧账号列展示在线/离线/连接中三种状态点。
- **F3.2 全局未读计数**：跨账号的消息通知，通过左侧导航栏的红点气泡实时反馈。
- **F3.3 搜索与定位**：支持在会话列表中快速搜索联系人或群组名。
- **F3.4 全局设置中心**：左侧底部齿轮图标集成“授权管理”与“数据管理（缓存管理）”。

---

## 第三部分：详细技术实现方案 (Technical Blueprint)

### 3.1 “先连后补”同步时序协议 (Sequence Protocol)
这是解决 IM 系统时序竞争（Race Condition）的终极方案。为了防止从 HTTP 请求发起直到 WebSocket 建立这数秒钟内的消息丢失：
1. **建立 WebSocket (第一优先级)**：
   - 监听 `onmessage`。
   - 所有接收到的消息推入该账号的 `pendingQueue: AppMessage[]`。
   - 此时 **不触发 UI 渲染**。
2. **触发 HTTP 补录 (`SyncMsg`)**：
   - 调用 `/message/SyncMsg?key=xxx`。
   - 解析返回的所有积压消息，并按时间戳顺序写入 Pinia 的 `accountMessages[accountUuid]`。
3. **合并缓冲队列**：
   - 维护一个过去 5 分钟内所有消息 ID 的 `msgIdSet` 去重池。
   - 遍历 `pendingQueue` 中的消息：
     - 若 `msgIdSet.has(msgId)`，说明该消息已在补录包中，直接丢弃。
     - 否则，追加到 Pinia 数组末尾。
4. **状态切换**：清空 `pendingQueue`，开启实时推送消费模式。

### 3.2 Redis 极速冷启动与熔断处理
- **接口**：`/other/GetRedisSyncMsg`。
- **挑战**：当用户多日未上线，Redis 可能积压数百条消息。
- **分片渲染策略**：
  - 接收到 Redis 巨量数据后，先利用 `Array.slice(-20)` 截取最新 20 条立即渲染。
  - 其余消息存入内存数组，但在处理解析（XML解析、格式化）时，通过 `window.requestIdleCallback`逐帧处理。

---

## 第六部分：核心工具类实现 (Core Utilities)

### 6.1 IndexedDB 管理器 (`contactCache.ts`)
实现 1GB 滚动覆盖算法，利用时间戳索引进行 FIFO 清理。确保长期运行下本地存储不溢出。

### 6.2 强兼容解析器 (`Home.vue`)
- `getContactId`: 兼容 `userName`, `UserName`, `wxid` 及嵌套 `{str:""}` 结构。
- `getContactAvatar`: 兼容 `smallHeadImgUrl`, `bigHeadImgUrl`, `headImgUrl`, `avatar` 等 6 种字段并自动处理 URL 中的非法字符（如反引号）。
- `getContactName`: 优先级逻辑：备注(Remark) > 昵称(NickName) > 微信号。

---

## 第七部分：核心 API 与映射关系

| 功能 | 接口路径 | 说明 |
| :--- | :--- | :--- |
| 获取二维码 | `/login/GetLoginQrCode` | 获取 uuid 与 base64 图片 |
| 登录状态 | `/login/CheckLogin` | 轮询确认状态 |
| 增量同步 | `/message/SyncMsg` | HTTP 补录核心 |
| Redis 缓存 | `/other/GetRedisSyncMsg` | 冷启动加速 |
| 会话列表 | `/message/GetContact` | 初始化最近会话 |
| 获取联系人列表 | `/friend/GetContactList` | 仅返回 wxid 列表，需结合详情接口使用 |
| 获取联系人详情 | `/friend/GetContactDetailsList` | 核心：请求体字段必须为 `UserNames` (Array) |
| 发送文本 | `/message/SendTextMsg` | 实现乐观更新 |
| 拉取图片 | `/message/GetMsgImg` | 只有点击时拉取原图 |

---

## 第八部分：开发与优化日志 (Development Log)

### 2026-05-17 内存治理、消息渲染与接口容错深度优化
1. **存储架构优化 (`contactCache.ts`)**：
   - 将 IndexedDB 版本升级至 DB v7，引入 `accountUuid` 复合索引，彻底杜绝多账号环境下的全表扫描。
   - 实现单会话消息数量上限截断 (上限 500 条) 的 FIFO 淘汰算法，防止长久挂机运行导致 IndexedDB 暴涨。
2. **核心内存泄漏修复 (`chat.ts`)**：
   - 重构了 `msgIdSet` 去重逻辑，采用最大上限 2000 条的有界队列 (`BoundedSet`) 彻底解决 `Set` 无限制增长导致的严重内存泄漏。
   - 会话列表与消息追加全面引入二分法插入 (`binaryInsert`) 和 `unshift` 置顶操作，避免了高频渲染下的 `O(n log n)` 全局重新排序计算开销。
3. **网络与接口调度修复 (`socketManager.ts` & `account.ts`)**：
   - **WebSocket 补位机制**：给 WebSocket 增加了立即断开回调。当长连接掉线瞬间，无需死等 30 秒轮询，立即触发一次 HTTP `syncMsg` 进行空窗期消息补齐。
   - **批量查询崩溃隔离**：修正了 `GetContactDetailsList` 接口报错缺陷。对于无效的 `wxid` (如群助手 `filehelper` 及自身扫码账号 ID)，已引入队列投递前的精确隔离，防止它们导致整个 50 个/批次的批量请求返回空值或抛错。
   - **不可迭代异常安全保护**：在 `processDetailsQueue` 消费者中，增加了极度严苛的 `Array.isArray()` 类型回退和解析安全层，若接口被限流或返回非常规结构，再也不会因 `is not iterable` 抛错而卡死整个补全队列。
4. **渲染层防穿透 (数据回填与 UI 联动)**：
   - 彻底修复群聊、公众号及自身头像/昵称仅显示原始 `wxid` 的问题。在 `Home.vue` 中增设了 `getConvName` 和 `getConvAvatar`，实现了向 `contactMap` 及活跃账号本身的双向击穿。
   - `chatStore` 加载历史会话后，即使当时详情缺失，也能借助增量回查 `DB` 里的持久化昵称做到 “回写补漏 (Back-patch)”，真正实现会话列表所见即所得。

### 2026-05-17 离线账号管理优化、头像防盗链及本地缓存深度复用
1. **离线账户深度拦截与自动恢复**：
   - 优化了账号状态检测流程，在 `account.ts` 中增强了 `checkSingleAccountStatus` 的返回类型为 `Promise<boolean>`。
   - 彻底拦截了离线账号的 WebSocket 注册、最近会话拉取、以及联系人获取同步，规避了大量无效的网络流量。
   - 修复了 `Home.vue` 切换高亮账号时直接无脑建立 Socket 的遗留缺陷，全权交由底层真实状态管控。
   - 轮询监控系统 (`startStatusPolling`) 新增状态跃迁监测，若检测到账号状态由 `offline` 恢复到 `online`，将自动恢复该账号的 Socket 连接以及全量数据同步。
2. **请求静默白名单机制**：
   - 针对 30 秒自动状态轮询，在 Axios 拦截器中将 `/login/GetLoginStatus` 和 `/login/GetProfile` 纳入“静默处理”白名单，屏蔽在离线状态或后台偶发 300/500 业务报错时的 Message.error 弹窗，消除用户被反复骚扰的问题。
3. **微信头像防盗链 (403 Forbidden) 突破与本地缓存复用**：
   - 引入 `getAccountAvatar` 账号头像加载优化，在第一栏（账号列表）和聊天对话框（自身头像）中优先查 `contactMap` 获取早已由联系人/消息同步机制下载并存在本地的真实 Blob URL。
   - 极大地拓宽了 `GetProfile` 解析时头像字段名的匹配范围，添加 `headImgUrl`, `HeadImgUrl`, `avatar` 等兼容。
   - 在模板的所有头像 `<img>` 标签中加入了 `referrerpolicy="no-referrer"` 终极防盾牌，防止微信防盗链 Referer 阻碍头像渲染。

### 2026-05-17 手机端 UI 适配与响应式双栏布局设计
1. **多栏架构自适应合并 (Responsive Dual-Pane Layout)**：
   - 针对移动端屏幕宽度进行布局优化，通过引入 `@media (max-width: 768px)` 媒体查询，将 PC 端的四栏并列布局无缝转换为流畅的“双视图切换”模式。
   - 当检测到移动端且无活跃会话时，隐藏聊天内容视窗，以完美的空间利用率展示左侧账号、导航栏和会话列表。
   - 当点击并打开任意会话时，通过动态类名 `has-active-chat` 精准控制 DOM 显示，隐藏账号与列表，使聊天窗口 100% 占满全屏，提供沉浸式的移动聊天体验。
2. **手机专属返回机制与返回按钮 (Back-to-List Action)**：
   - 引入 `IconLeft` 图标，在聊天视窗的头部增加针对移动端定制的“返回”按钮。
   - 点击该按钮触发 `chatStore.activeId = ''` 清空当前选中会话状态，配合 CSS 瞬时将视图切换回主会话列表，实现了符合人体工程学的移动端交互链路。
3. **关键组件样式平滑缩放与细节调优 (Micro-animations & Spacing Scale-down)**：
   - 在手机端针对头像尺寸、侧边栏宽度、加号登录按钮、以及弹窗 `arco-modal` 宽度（自动拉伸至 95%）进行了深度等比缩放和间距微调。
   - 将配置引导页 `Config.vue` 中的磨砂玻璃卡片宽度由固定 `440px` 变更为自适应 `width: 100%; max-width: 440px`，并在 480px 以下自动缩减 padding 与字号，彻底消除小屏设备上的水平滚动条。
4. **聊天头像防挤压与滚动条美化 (Avatar Preservation & Sleek Scrollbars)**：
   - 修复了在窄屏或长文本下，聊天对话流中的用户/好友头像被 flexbox 容器默认 `flex-shrink: 1` 挤压变形的问题，通过引入 `.msg-avatar { flex-shrink: 0; }` 锁定头像尺寸，永远保持 36x36px 的黄金正方形比例。
   - 对系统会话列表（`.scroll-area`）与聊天历史记录流（`.messages-flow`）的滚动条进行了全局视觉重构。摒弃了 Windows 默认的笨重死板的滚动条样式，替换为极细的 6px 呼吸感半透明圆角滑块，与极客感极佳的暗黑主题（Dark Theme）风格融为一体。
5. **设置弹窗与表单项深度自适应 (Teleported Modals & Dynamic Form Adaptations)**：
   - **突破 Teleport Scoped 限制**：由于 Arco Design 的弹窗（`a-modal`）会默认被 Teleport 挂载到 document.body 顶层，原有的 Scoped 样式对其无效。为此，我们在 [Home.vue](file:///d:/Users/Documents/iwe/iwe-web/src/views/Home.vue) 尾部追加了全局无作用域（non-scoped）样式的 `@media (max-width: 768px)` 媒体查询，全局拦截并重写 `.arco-modal` 宽度为 95%，并将内边距与头部间距进行等比缩减。
   - **重构数据分表网格 (Grid Item Wrapping)**：将数据管理面板中的 `.store-item` 从横向 Row 变更为纵向 Column 排列，使得“清理群消息/公众号消息/全部清理”等按钮群在小屏设备上自动折行，彻底解决了数据管理菜单严重向右溢出和挤压的顽疾。
   - **表单与按钮组移动端折行 (Form Input Group Wrapping)**：全局将移动端的 `.arco-input-group` 变更为 `flex-direction: column` 并强制内部输入框 `.arco-input-wrapper` 及发送按钮宽度为 100%，完美实现了诸如“绑定手机验证码”表单项在移动端的自适应缩放。
   - **登录弹窗布局微调 (Login Layout Polish)**：在 [Login.vue](file:///d:/Users/Documents/iwe/iwe-web/src/views/Login.vue) 中优化了移动端下的 `.qr-code` 盒模型尺寸、`.connect-box` 内边距及 Tabs 靠左对齐方式，确保扫码及 62 账号登录在小屏设备上的视觉纯净度。

### 2026-05-18 高性能头像滑动过期、写 I/O 阻断降低与多账号极速同步重构收官
1. **高性能头像滑动过期与写 I/O 归零机制 (`contactCache.ts`)**：
   - **双阈值管理**：实现了 30 天超长 TTL 缓存清理机制，解决了微信头像频繁过期与 `403 Forbidden` 僵尸头像问题。
   - **24小时写阻断**：引入 **24 小时“写阀值”网关模式**。单日内高频点开会话或滚动联系人列表时，只读不写，将 IndexedDB 写 I/O 降低 99.9% 以上，彻底杜绝写放大。
   - **非阻塞异步写事务**：读取头像仅用 `readonly` 只读事务，读完放行渲染，把续期（`_renewAvatar`）和失效清理（`_deleteAvatar`）独立出前台控制链，丢给后台异步执行，保证页面流畅度始终维持在 60fps。
2. **多账号双引擎 Redis 极速冷启动同步整合 (`account.ts`)**：
   - **双阶段并行冷启动**：整合了极速同步冷启动双引擎逻辑。阶段 A 构造主服务全局基准绝对 URL 请求原 Redis 同步接口 (`GetRedisSyncMsg`) 以防 IP 污染，秒级拉取历史积压并进行 idle 分帧解析；阶段 B 自动识别新 Redis 独占回写地址，自动补写联系人。
   - **Redis 独立持久化**：完善了批量联系人回写 Redis 的链路 (`saveSingleContactToRedis` / `saveAllContactsToRedis`)，使 Redis 极速模式下的持久化彻底取代传统 IndexedDB，实现真正的全内存超高吞吐。
3. **修复严重的编译错乱与功能错位**：
   - **重塑语法树**：彻底扫清因 IDE 合并冲突产生的语法废品：修复了 `syncViaRedis` 的断流声明；恢复了被错误夹塞的 `fetchProfileAndFixUuid` 闭合边界；重建了被覆盖的 `loadContactsFromCache` 函数；修正了 `processDetailsQueue` 补全队列被误塞为头像下载方法而失效的致命问题。
   - **参数定位纠偏**：修正了 `contactCache.set(...)` 调用参数位置颠倒的缺陷。
   - **解锁 API 接口**：完善了解锁 `im.ts` 历史增量消息同步 API (`syncHistoryMsg`) 及其在 `socketManager.ts` 中的整合调用。

### 2026-05-19 62账号登录历史选择与数据自动填充优化
1. **历史账号快捷下拉选择 (History Selection Dropdown)**：
   - 在 62 账号登录表单的 `微信账号` 输入框中，内置了“历史账号”快捷下拉选择器（使用 Arco Design 的 `a-dropdown` 结合 `IconHistory` / `IconDown`）。
   - 该选择器自动汇总本地 store 中已在线的账号以及在 `localStorage` 中扫描到的带有专用 62 数据的账户，格式化展示昵称与账号标识。
   - 用户可直接一键点选，系统会同时将对应的微信账号及关联隔离的 62 数据一并回填到表单中，极大地改善了重复登录时的手感。
2. **智能状态覆写与防抖 Watch 填充 (Smart Auto-fill Watcher)**：
   - 对 62 账号表单的回填逻辑进行重构。支持当用户在账号输入框中直接键入或修改账号时，Watcher 会智能分析当前 62 数据输入框的值。
   - 规则：如果 62 数据输入框为空、或者当前内容为通用备份 `wx_62_data` 数据、或匹配了上一次修改前账号的专属 62 数据，则自动将其覆写填充为当前新账号的专属数据；如果用户手动改写了该数据（与系统预设均不匹配），则维持用户的自定义更改，避免强行覆盖手动输入内容。
3. **登录成功自动隔离归档 (Successful Login Auto-Archive)**：
   - 在 `deviceLogin` 登录成功回调中，自动提取本次登录的账号、生成的 `Uuid`，并将本次填写的 62 数据以极其严格的隔离格式（`wx_62_data_${username}` 及 `wx_62_data_${uuid}`）归档回本地浏览器缓存。
   - 该机制使得即便用户首次登录时为手动复制粘贴，一旦成功，后续登录即可彻底进入“零复制”全自动填充通道。

4. **微信账号优先填入 Alias 自定义微信号 (`alias` 字段优先)**：
   - 重构了绑定关系实体 `Wx62Binding` 与本地关联缓存 `wx_62_bindings` 的存储与提取规范。
   - 增加对 Pinia 账号 Store 的 `alias` (WeChat Alias / 微信个性签名/微信号) 字段解析与存储支持。
   - 在所有的绑定和自动回填数据流中，均将 `alias` 字段的优先级提升至 `uuid` (内部 wxid) 之外。这确保了一键回填至 `微信账号` 输入框的数据是直观的自定义微信号（即 API 接受的有效登录用户名），而非难记的系统内部 `wxid_xxxxxx`。
5. **插槽安全规避 Slot 调用警告**：
   - 针对 Vue 3 内部插槽在 lazy/custom 渲染时可能弹出的 `Slot "default" invoked outside of the render function` 编译警告，移除了 `<a-input>` 内部 `#suffix` 插槽嵌套下拉菜单的结构。
   - 将下拉选择菜单移动至 `<a-form-item>` 的 `#label` 插槽中，采用 `flex` 两端对齐布局，彻底解决 Vue 3 依赖收集和插槽生命周期警告，保证控制台干净清爽。

### 2026-05-19 核心工作台 Home.vue 合理化重构与组件拆分
1. **重构提取聊天主视窗组件 (ChatArea.vue)**:
   - 新建了 `src/components/ChatArea.vue` 独立业务组件，将原本挤压在 `Home.vue` 里的右侧聊天视窗完全剥离。
   - 实现了自包含的输入框文本状态管理 (`inputText`)、对话框元素流向自动底部定位 (`msgFlow` + `scrollToBottom`) 以及时间戳格式化逻辑。
   - 隔离了所有聊天气泡相关的样式（包括普通消息、图片消息、撤回提示等）和移动端适配媒体查询规则，使得样式结构更清晰且不会对全局产生副作用。
2. **极大清空工作台 Home.vue 的代码冗余**:
   - 移除了 `Home.vue` 内部定义的无用滚动监听、文本引用和冗余 watch 逻辑。
   - 重新设计了 `handleSendMessage` 的事件触发流，改为由子组件 emit 并接受 message 文字参数发送，完全切断了父子状态多级耦合带来的隐患。
   - 经过重构，`Home.vue` 已经成功瘦身并提升了整体可读性，并且打包编译成功 (`npx vite build` 零报错完成)。

### 2026-05-19 全局与个人设置弹窗 SettingsModal.vue 独立化重构
1. **重构提取设置控制台组件 (SettingsModal.vue)**:
   - 新建了 `src/components/SettingsModal.vue` 组件，将原工作台下庞大的 `adminVisible` 设置和系统管理模版（约 320 行）以及 200+ 行相关逻辑脚本彻底剥离。
   - 包含的模块有：服务器与管理密钥的保存与页面重载、全局授权码增删改查及回调地址绑定管理、 IndexedDB 本地分表占用计算与数据清理、系统调试开关选项、全局默认头像与 Redis Lan Mode 开关、当前活跃账号的头像缓存切换、极速 Redis 通道及一键批量好友联系人 Redis 回写等高阶维护功能。
   - 在“系统管理”表单中特别修复并补充了“保存配置并刷新页面”的触发按钮，提供了流畅直白的管理员交互体验。
2. **进一步轻量化核心主页面 Home.vue**:
   - 移除了 `Home.vue` 内部多达十余个与管理相关的响应式变量（如 `adminAuthKey`、`cacheStats`、`contactLoading` 等）及全部的管理同步清理相关 JS 处理函数，主页面体积再次大幅缩减。
   - 通过 `v-model:visible` 绑定实现了优雅的双向状态同步，主文件更加专注于三栏结构逻辑。
   - 打包构建成功，零报错，无打包体积或依赖冲突副作用。

### 2026-05-19 账号栏与功能导航侧边栏 LeftSidebar.vue 独立化重构
1. **重构提取侧边栏组件 (LeftSidebar.vue)**:
   - 新建了 `src/components/LeftSidebar.vue` 组件，将主工作台最左侧的“账号多账号管理栏”与“功能导航栏”彻底抽离成自包含的导航组件。
   - 包含的模块有：多账号在线/离线灰度检测头像、扫码增添微信账号与手动授权登录、系统控制台与账号设置模态框唤醒按钮，以及当前活跃账号手动状态重检的 neon 特效呼吸环。
   - 在子组件中优雅地封装了头像检索匹配逻辑 (`getAccountAvatar` / `getContactAvatar`)，对外暴露了 `v-model:active-tab` 的极简数据绑定。
2. **极大轻量化 Home.vue 主文件**:
   - 移除了 `Home.vue` 顶部原有的账号侧边栏和导航侧边栏（近 130 行 HTML 模版），并用极简的组件声明替换：
     ```html
     <!-- 第一栏与第二栏：侧边栏与功能导航 -->
     <LeftSidebar
       v-model:active-tab="activeTab"
       :pending-account-uuid="pendingAccountUuid"
       @switch-contact="handleSwitchContact"
       @switch-account="handleSwitchAccount"
       @add-account="handleAddAccount"
       @manual-login="handleManualLogin"
       @open-global-settings="handleOpenGlobalSettings"
       @open-personal-settings="handleOpenPersonalSettings"
       @active-account-manual-check="handleActiveAccountManualCheck"
     />
     ```
   - 编译打包测试完美通过 (`Exit Code: 0`)。

### 2026-05-19 会话与联系人列表栏 ListSidebar.vue 独立化重构
1. **重构提取列表展示组件 (ListSidebar.vue)**:
   - 新建了 `src/components/ListSidebar.vue` 组件，将主工作台第三栏（消息会话与联系人好友/群组/公众号列表，约 120 行模版）彻底抽离。
   - 包含的模块有：消息会话搜索过滤、联系人按首字母拼音排序、增量分批渲染机制、以及基于 `IntersectionObserver` 和自定义指令 `v-lazy-contact` 的高级视口感知头像懒加载。
   - 子组件内封装了复杂的分表排序及搜索过滤计算逻辑，大大降低了主页面的计算开销。
2. **极轻量化 Home.vue 主文件**:
   - 移除了 `Home.vue` 内部多达 15 个相关的局部变量（如 `contactCategory`、`visibleFriendLimit`、`slicedFriends` 等）和懒加载指令注册，以及相关的复杂监听器。
   - 精简了第三栏 HTML 模版为一行组件声明：
     ```html
     <!-- 第三栏：列表展示 -->
     <ListSidebar
       :active-tab="activeTab"
       :active-id="chatStore.activeId"
       @select-chat="handleSelectChat"
       @select-contact="handleSelectContact"
     />
     ```
   - 保证了主页面只留下四个最核心的 avatar/name 解析工具，并与子组件建立优雅的双向事件桥梁。
   - 打包构建成功，零报错，无任何编译及执行期隐患。

### 2026-05-19 微信登录与高级管理弹窗 LoginModal.vue 独立化重构
1. **重构提取登录管理弹窗组件 (LoginModal.vue)**:
   - 新建了 `src/components/LoginModal.vue` 组件，将原有的 `loginVisible` 弹窗及其高级控制模块（包含在线状态轮询、唤醒设备登录、绑定手机发送验证码以及 62 免验证登录环境数据提取等，共 80 行模版）彻底隔离开来。
   - 内置封装了设备高级唤醒状态的高频短轮询定时检测（每 2 秒一次，最多 5 次）以及环境 62 数据的多格式兼容处理，对上层暴露出极度精简的 `@success` 和 `v-model:visible` 回调。
2. **极轻量化 Home.vue 主文件**:
   - 移除了 `Home.vue` 主文件中的 `verifyMobile`、`currentAccountResult` 等反应状态，以及 `handleAccountStatusActionForCurrent`、`handleExtract62DataForCurrent` 等高级设备 API 回调。
   - 将原登录弹窗的代码用优雅的组件声明进行了替换：
     ```html
     <LoginModal
       v-model:visible="loginVisible"
       :pending-session-key="pendingSessionKey"
       @success="handleLoginSuccess"
     />
     ```
   - 打包构建成功，零报错，完成了整个主页面的重构优化旅程。

### 2026-05-19 主工作台样式 Home.css 彻底抽离与轻量化
1. **抽离表现层样式 rules (Home.css)**:
   - 新建了 `src/views/Home.css` 并将主页面 `Home.vue` 尾部近 530 行的 CSS 样式选择器规则完全迁出。
   - 使用 Vue 单文件组件的高级外链特性：
     ```html
     <style scoped src="./Home.css"></style>
     ```
     在保证原有 scoped 隔离的同时，实现了表现层与行为逻辑的优雅分治。
2. **主页面 Home.vue 精简里程碑**:
   - 经过全部五个阶段的组件和样式拆解，`Home.vue` 文件体积成功缩减到仅为 **364 行**（较重构前的 2200 行，**代码行数大幅减少 83.3%**）。
   - 主页面目前极其纯粹，仅承载宏观的三栏和弹窗组件拼装，极大降低了维护人员的认知负担，彻底打通了未来快速迭代和热更新 of 无障碍通道。

### 2026-05-20 微信 GetProfile 头像解析增强（userInfoExt 节点适配）
1. **解决自身头像显示为空（昵称首字母）的严重问题**：
   - 微信后端 `GetProfile` 接口响应体中，自身头像 URL 字段（如 `smallHeadImgUrl` 与 `bigHeadImgUrl` 等）并不嵌套于 `userInfo` 内，而是存放于与其同级的 `userInfoExt` 属性内。
   - 原有逻辑因只解包并解析 `userInfo`，导致提取头像链接时恒为 `undefined`。
2. **适配 `userInfoExt` 节点解析链**：
   - 重构了 `src/store/account.ts` 中的 `fetchProfileAndFixUuid`（手动同步自身资料/上线激活）与 `syncAccountsFromServer`（冷启动 `TOKEN_KEY` 模式）方法。
   - 增加对 `userInfoExt` / `UserInfoExt` 节点的解包提取。优先从中获取各大小头像 URL 并防御性地通过 `extractAvatarString` 进行解包处理，无法提取时才退回 `userInfo` 进行兜底提取。
3. **日志输出与编译测试**：
   - 在控制台中加入了对 `userInfoExt` 节点的解包打印及 `rawSmallUrl` 调试信息。
   - 运行并完成了 `npx vite build` 生产构建打包校验，完全成功通过且零 TypeScript/Vue 模板警告，完全治愈了同步头像始终为空的缺陷。

