# Xiong

Xiong 是一个本地优先、面向个人用户的 AI 角色扮演桌面应用。目前已经具备最小可用聊天闭环：创建角色和对话、本地持久化消息，并通过 Mock 或 OpenAI Compatible Provider 流式生成回复。

## 环境要求

- Node.js 24
- pnpm 10.28.2
- Windows 10/11（P0 首要支持平台）

## 安装

```powershell
pnpm install
```

## 本地开发

```powershell
pnpm dev
```

首次启动需要下载和初始化 Electron，可能比后续启动慢。

## 模型服务

应用默认使用无需配置的本地 Mock Provider。要连接真实模型：

1. 在页面顶部的“模型服务”中选择 `OpenAI Compatible`；
2. 填写完整 API 前缀（例如 `https://api.openai.com/v1`）、模型 ID 和可选 API Key；
3. 保存设置后发送消息。

远程服务地址必须使用 HTTPS；`localhost`、`127.0.0.1` 和 `::1` 可以使用 HTTP。API Key 由 Electron 调用系统安全存储加密，设置页面不会回显已保存的 Key。使用第三方服务时，角色设定和当前对话历史会发送到该服务。

回复生成期间可以点击“停止生成”。已经发送的用户消息会保留，未完成的助手回复不会写入本地历史。

## 验证

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Windows 打包

```powershell
pnpm package:win
```

输出目录为 `apps/desktop/dist/`。

## 当前结构

```text
apps/desktop   Electron 主进程、Preload 和 React Renderer
packages/core  平台无关领域逻辑
packages/db    SQLite 数据层和 Provider 配置存储
```

完整设计见 [DEVELOPMENT_REVISED.md](./DEVELOPMENT_REVISED.md)。
