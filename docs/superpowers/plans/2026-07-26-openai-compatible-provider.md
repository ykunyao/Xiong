# OpenAI Compatible Provider Implementation Plan

> **For agentic workers:** Implement each production behavior after a focused failing test. Keep third-party SDK and secret types behind the desktop main-process boundary.

**Goal:** Let Xiong persist a secure OpenAI Compatible configuration and use it for real streamed chat while retaining Mock as the default fallback.

**Architecture:** `@xiong/core` keeps provider-neutral messages and deterministic Mock behavior. `@xiong/db` stores sanitized provider config plus encrypted secret bytes. Electron main owns `safeStorage`, AI SDK adapter creation, provider selection, IPC validation, and user-facing error mapping. React edits only sanitized settings and consumes the existing request-scoped stream.

**Tech Stack:** TypeScript 6, Vitest 4, Electron 42, React 19, Zod 4, SQLite/Drizzle, AI SDK 7, `@ai-sdk/openai-compatible` 3, `react-markdown`, and `rehype-sanitize`.

## Global Constraints

- Default to Mock when no OpenAI Compatible configuration is active.
- Never store or return a plaintext API key.
- Reject remote plain-HTTP base URLs; allow local loopback HTTP.
- Do not expose AI SDK, Electron, encrypted secret, or secret-reference types to the renderer.
- Preserve the user message but not a partial assistant message after a provider/network failure.
- Do not add cancellation, model discovery, retries UI, full Prompt Engine, or multiple provider profiles.

---

### Task 1: Provider-neutral messages and real AI SDK adapter

**Files:**

- Modify: `packages/core/src/chat-provider.ts`
- Modify: `packages/core/src/chat-provider.test.ts`
- Create: `apps/desktop/src/main/openai-compatible-chat-provider.ts`
- Create: `apps/desktop/src/main/openai-compatible-chat-provider.test.ts`
- Modify: `apps/desktop/package.json`
- Modify: `pnpm-lock.yaml`

- [ ] Change `ChatProviderRequest` to carry normalized system/user/assistant messages while retaining `characterName` for deterministic Mock output.
- [ ] Update Mock tests first to prove it uses the latest user message and preserves exact output/chunks.
- [ ] Install exact AI SDK packages in the desktop app.
- [ ] Write an adapter test using a fake OpenAI SSE `fetch` response; assert request URL, bearer key, model, messages, and emitted text deltas.
- [ ] Implement `createOpenAICompatibleChatProvider` with `createOpenAICompatible` and `streamText`.
- [ ] Verify focused core and desktop adapter tests.

### Task 2: Provider config and encrypted-secret persistence

**Files:**

- Modify: `packages/db/src/schema.ts`
- Modify: `packages/db/src/database.ts`
- Create: `packages/db/src/provider-config-repository.ts`
- Create: `packages/db/src/provider-config-repository.test.ts`
- Modify: `packages/db/src/index.ts`

- [ ] Write repository tests for initial Mock state, OpenAI config upsert, active selection, encrypted secret persistence, replacement, preservation, and clearing.
- [ ] Add `provider_configs` and `provider_secrets` tables plus indexes/constraints.
- [ ] Implement a dedicated provider config repository with transaction-safe config/secret writes.
- [ ] Prove the database never contains the plaintext fixture key.

### Task 3: Safe storage and settings service

**Files:**

- Create: `apps/desktop/src/shared/provider-settings.ts`
- Create: `apps/desktop/src/main/safe-storage-secret-codec.ts`
- Create: `apps/desktop/src/main/provider-settings-service.ts`
- Create: `apps/desktop/src/main/provider-settings-service.test.ts`

- [ ] Define secret-free settings input/view types and stable error codes.
- [ ] Write service tests for URL rules, mode switching, key preservation/replacement/clearing, unavailable/insecure storage, decryption, and key rotation.
- [ ] Implement an injected secret codec contract and Electron asynchronous `safeStorage` adapter.
- [ ] Implement provider resolution with Mock fallback and real adapter creation.
- [ ] Ensure errors never include key material.

### Task 4: Chat request construction and dynamic provider resolution

**Files:**

- Modify: `apps/desktop/src/main/chat-service.ts`
- Modify: `apps/desktop/src/main/chat-service.test.ts`

- [ ] Change ChatService tests first to use an async resolver and assert resolution happens before user persistence.
- [ ] Assert normalized messages include a character system message and ordered persisted history including the latest user message.
- [ ] Implement the minimal request builder without token trimming or Prompt Engine abstractions.
- [ ] Preserve duplicate-generation, provider-failure, and completion-only assistant persistence semantics.

### Task 5: Validated Provider IPC and preload API

**Files:**

- Create: `apps/desktop/src/main/provider-settings-ipc.ts`
- Create: `apps/desktop/src/main/provider-settings-ipc.test.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/preload/index.d.ts`
- Modify: `apps/desktop/src/renderer/src/env.d.ts`
- Modify: `apps/desktop/src/main/index.ts`

- [ ] Write IPC tests for trimming, conditional required fields, URL-length limits, untrusted frames, and secret-free responses.
- [ ] Implement `provider:get-settings` and `provider:save-settings` handlers.
- [ ] Expose only business-level preload methods.
- [ ] Wire one provider settings service into both settings IPC and ChatService resolution.

### Task 6: Provider settings UI and safe AI rendering

**Files:**

- Modify: `apps/desktop/src/renderer/src/App.tsx`
- Modify: `apps/desktop/src/renderer/src/styles.css`
- Modify: `apps/desktop/package.json`
- Modify: `pnpm-lock.yaml`

- [ ] Load sanitized settings at startup and render Mock/OpenAI Compatible selection.
- [ ] Add base URL, model, password input, saved-key state, clear-key control, and third-party data-flow notice.
- [ ] Save settings without ever repopulating the key input.
- [ ] Replace Mock-specific chat copy with active provider/model copy.
- [ ] Render completed and streaming assistant output with `react-markdown` plus `rehype-sanitize`.
- [ ] Verify keyboard/disabled/status behavior remains usable.

### Task 7: Full verification and publication

- [ ] Run `corepack pnpm typecheck`.
- [ ] Run `corepack pnpm lint`.
- [ ] Run `corepack pnpm test`.
- [ ] Run `corepack pnpm format:check`.
- [ ] Run `corepack pnpm build`.
- [ ] Run `corepack pnpm package:win`.
- [ ] Smoke-test the packaged main process, SQLite initialization, renderer load, and encrypted-key persistence without logging key material.
- [ ] Inspect the diff against `main`, commit intentionally, push `feature/openai-compatible-provider`, and create a Draft PR targeting `main`.
