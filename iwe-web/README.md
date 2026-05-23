# IWE Web IM Workbench

[![Vue](https://img.shields.io/badge/Vue-3.3-brightgreen.svg)](https://vuejs.org/)
[![Vite](https://img.shields.io/badge/Vite-4.0-blue.svg)](https://vitejs.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Arco_Design](https://img.shields.io/badge/UI-Arco_Design-orange.svg)](https://arco.design/)

> 一款基于微信协议后端的极致轻量化、多账号矩阵式 Web IM 管理工作台。

## 🌟 项目亮点

*   **🚀 极致轻量**：采用“内存滑动窗口” + IndexedDB 滚动淘汰技术，即便开启数十个账号也依然流畅。
*   **⚡ 索引级性能**：针对海量历史消息，通过 `partnerType` 索引实现秒级分类清理，告别全表扫描。
*   **🛡️ 消息分发解耦**：采用 `MessageDispatcher` 架构，将原始协议解析与业务逻辑彻底解耦，易于扩展。
*   **👯 多账号矩阵**：支持在单页面内同时登录、切换、监控多个微信账号。
*   **📡 零丢失同步**：采用“先连后补”时序安全协议，完美解决 WebSocket 与 HTTP 请求间的空窗期丢消问题。
*   **💎 优雅重构**：核心逻辑已完成模块化拆分，统一类型系统 (TypeScript)，代码结构清晰。

## 🏗️ 核心架构

项目采用**四栏式布局 (Four-Column Layout)**，实现账号管理与内容操作的隔离：

1.  **账号栏 (Account Bar)**：多账号实例管理及在线状态监测。
2.  **功能导航 (App Nav)**：聊天、通讯录、个人/全局设置切换。
3.  **会话列表 (Chat List)**：基于最近活跃度的动态排序，支持拼音搜索。
4.  **聊天区域 (Chat Window)**：支持文本、图片、语音（Silk 解码）及撤回消息拦截展示。

## 🛠️ 技术栈

*   **前端**：Vue 3 (Composition API) + Vite + TypeScript
*   **状态管理**：Pinia (模块化数据隔离)
*   **存储层**：IndexedDB (v8 索引优化) + Redis (极速模式)
*   **算法支持**：二分法有序插入 (`binaryInsert`) + 有界去重集合 (`BoundedSet`)
*   **UI 组件**：Arco Design Vue

## 🚀 快速开始

### 1. 安装依赖
```bash
npm install
```

### 2. 启动开发环境
```bash
npm run dev
```
首次启动请在系统的“引导配置页”中填入后端 API 地址及管理 Token。

## 📖 架构全景
关于详细的文件目录说明与设计决策，请参阅根目录下的：
👉 [PROJECT_MAP.md](./PROJECT_MAP.md)

---
🤖 *Generated with [Claude Code](https://claude.com/claude-code)*
