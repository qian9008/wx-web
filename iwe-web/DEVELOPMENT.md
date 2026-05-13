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
