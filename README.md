# Xiong

Xiong 是一个本地优先、面向个人用户的 AI 角色扮演桌面应用。目前仓库处于 Phase 0：建立安全的 Electron 桌面壳、平台无关核心包和可复现工程基线。

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
packages/db    Phase 1 数据层边界
```

完整设计见 [DEVELOPMENT_REVISED.md](./DEVELOPMENT_REVISED.md)。
