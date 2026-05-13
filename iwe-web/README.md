# IWE Web IM Workbench

[![Vue](https://img.shields.io/badge/Vue-3.3-brightgreen.svg)](https://vuejs.org/)
[![Vite](https://img.shields.io/badge/Vite-4.0-blue.svg)](https://vitejs.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Arco_Design](https://img.shields.io/badge/UI-Arco_Design-orange.svg)](https://arco.design/)

> 一款基于微信协议后端的极致轻量化、多账号矩阵式 Web IM 管理工作台。

## 🌟 项目亮点

*   **🚀 极致轻量**：完全抛弃 IndexedDB，采用“内存滑动窗口”技术，即便开启数十个账号也依然流畅。
*   **🛡️ 消息防撤回**：核心解析引擎自动拦截 `10002` 撤回指令，锁定并保留原始聊天内容。
*   **👯 多账号矩阵**：支持在单页面内同时登录、切换、监控多个微信账号。
*   **📡 零丢失同步**：采用“先连后补”时序安全协议，完美解决 WebSocket 与 HTTP 请求间的空窗期丢消问题。
*   **💎 优雅交互**：经典的四栏式工作台布局，支持乐观更新及跨账号未读数实时提醒。

## 🏗️ 核心架构

项目采用**四栏式布局 (Four-Column Layout)**，实现账号管理与内容操作的完美隔离：

1.  **账号栏 (Account Bar)**：管理所有登录实例及在线状态监测。
2.  **功能导航 (App Nav)**：账号内的聊天、通讯录及设置切换。
3.  **会话列表 (Chat List)**：基于最近活跃度的动态会话排序。
4.  **聊天区域 (Chat Window)**：支持文本、图片预览及撤回消息拦截展示。

## 🛠️ 技术栈

*   **前端**：Vue 3 (Composition API) + Vite + TypeScript
*   **状态管理**：Pinia (模块化数据隔离)
*   **UI 组件**：Arco Design Vue
*   **网络**：Axios (HTTP) + Reconnecting-WebSocket (实时)
*   **同步协议**：三阶段加载（Redis 缓存 -> 会话骨架 -> 增量补录）

## 🚀 快速开始

### 1. 环境准备
确保您的环境中已安装 [Node.js](https://nodejs.org/) (推荐 v16+)。

### 2. 安装依赖
```bash
npm install
# 或者
yarn install
```

### 3. 配置与启动
首次启动后，请在系统的“引导配置页”中填入您的后端 API 基础路径及管理 Token。
```bash
npm run dev
```

## 📖 开发文档
关于系统的**详细同步协议**、**XML 解析算法**、**多账号状态机**等深度设计方案，请参阅：
👉 [DEVELOPMENT.md](./DEVELOPMENT.md)

## 🤝 贡献与反馈
本项目由 OpenAI Codex 协作开发。如有任何建议或问题，欢迎交流。
