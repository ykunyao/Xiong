# Xiong Phase 0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reproducible Xiong Electron workspace that opens a secure React window and has a tested platform-neutral core package.

**Architecture:** Use a pnpm workspace with `apps/desktop`, `packages/core`, and `packages/db`. Phase 0 keeps the renderer inside the desktop app, exposes only an `app.getVersion()` preload API, and adds one small tested core function to prove package boundaries and TDD wiring.

**Tech Stack:** TypeScript, React, Electron, electron-vite, Vite, pnpm workspaces, Vitest, ESLint, Prettier.

---

## File Map

- `package.json`: root scripts and workspace metadata.
- `pnpm-workspace.yaml`: workspace package discovery.
- `tsconfig.base.json`: shared strict TypeScript settings.
- `eslint.config.mjs`: flat ESLint configuration.
- `.prettierrc.json`: formatting rules.
- `.gitignore`: generated and local files.
- `apps/desktop/*`: Electron main, preload, renderer, build config, and package scripts.
- `packages/core/*`: platform-neutral domain seed and its test.
- `packages/db/*`: database package placeholder with no runtime implementation yet.
- `.github/workflows/ci.yml`: Linux checks and Windows packaging smoke build.

### Task 1: Initialize workspace configuration

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.prettierrc.json`
- Create: `eslint.config.mjs`

- [x] **Step 1: Add root workspace manifests**

Create root scripts for `dev`, `build`, `typecheck`, `test`, `lint`, and `format:check`, using pnpm recursive execution.

- [x] **Step 2: Install locked dependencies**

Run: `pnpm install`

Expected: `pnpm-lock.yaml` is created and install exits successfully.

- [x] **Step 3: Verify workspace discovery**

Run: `pnpm -r list --depth -1`

Expected: desktop, core, and db packages are listed.

### Task 2: Establish the core package with TDD

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/app-info.test.ts`
- Create: `packages/core/src/app-info.ts`
- Create: `packages/core/src/index.ts`

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { createAppInfo } from './app-info';

describe('createAppInfo', () => {
  it('creates immutable Xiong application metadata', () => {
    expect(createAppInfo('0.1.0')).toEqual({
      name: 'Xiong',
      version: '0.1.0',
    });
  });
});
```

- [x] **Step 2: Run test and verify RED**

Run: `pnpm --filter @xiong/core test`

Expected: FAIL because `./app-info` does not exist.

- [x] **Step 3: Add minimal implementation**

```ts
export function createAppInfo(version: string) {
  return Object.freeze({ name: 'Xiong' as const, version });
}
```

- [x] **Step 4: Run test and verify GREEN**

Run: `pnpm --filter @xiong/core test`

Expected: one passing test.

### Task 3: Add the secure Electron shell

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/electron.vite.config.ts`
- Create: `apps/desktop/src/main/index.ts`
- Create: `apps/desktop/src/preload/index.ts`
- Create: `apps/desktop/src/preload/index.d.ts`
- Create: `apps/desktop/src/renderer/index.html`
- Create: `apps/desktop/src/renderer/src/main.tsx`
- Create: `apps/desktop/src/renderer/src/App.tsx`
- Create: `apps/desktop/src/renderer/src/styles.css`

- [x] **Step 1: Configure Electron build entry points**

Use electron-vite with separate main, preload, and renderer entries.

- [x] **Step 2: Implement the secure main window**

Set `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true`. Deny new windows, block unexpected navigation, and install a production CSP.

- [x] **Step 3: Expose the minimal preload API**

Expose only `window.xiong.app.getVersion()`.

- [x] **Step 4: Render the Xiong welcome screen**

Render the project name, Phase 0 status, and runtime version without adding feature UI.

- [x] **Step 5: Verify desktop compilation**

Run: `pnpm --filter @xiong/desktop typecheck`

Expected: exit code 0.

### Task 4: Add the database package boundary

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/src/index.ts`

- [x] **Step 1: Add an intentionally empty public package**

Export a `DatabasePackageStatus` type only. Do not add SQLite or Drizzle until Phase 1 has behavior tests.

- [x] **Step 2: Verify package compilation**

Run: `pnpm --filter @xiong/db typecheck`

Expected: exit code 0.

### Task 5: Add CI and verify Phase 0

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `README.md`

- [x] **Step 1: Add Linux quality checks**

Run install, typecheck, lint, tests, and build on Ubuntu.

- [x] **Step 2: Add Windows build validation**

Run install and desktop build on Windows to catch Electron platform issues.

- [x] **Step 3: Add operational README**

Document prerequisites and exact commands for install, development, tests, and build.

- [x] **Step 4: Run full verification**

Run:

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Expected: every command exits with code 0.

- [x] **Step 5: Commit**

```powershell
git add .
git commit -m "feat: initialize Xiong desktop workspace"
```
