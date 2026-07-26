# Mock Provider Chat Loop Implementation Plan

> **For agentic workers:** Implement this plan task-by-task with strict red-green-refactor cycles. Do not write production behavior before its failing test.

**Goal:** Build Xiong's first persistent streaming chat loop using a deterministic mock provider.

**Architecture:** `@xiong/core` owns the provider-neutral streaming contract and mock implementation. The Electron main process owns chat orchestration, duplicate-generation locking, persistence, and request-scoped IPC events; the preload exposes a narrow callback API; React renders durable messages plus an in-flight assistant reply.

**Tech Stack:** TypeScript 6, Vitest 4, Electron 42, React 19, Zod 4, Drizzle ORM, SQLite.

## Global Constraints

- The mock reply is exactly `<character name>：我收到了你的消息：“<user text>”`.
- Persist the user message before provider execution.
- Persist the assistant message only after the provider stream completes.
- Allow at most one active generation per conversation.
- Do not persist incomplete assistant text after failure.
- Do not add real providers, prompt construction, cancellation, regeneration, schema migrations, or character-card import.
- Keep Electron objects behind the preload bridge and reject non-main-frame IPC calls.

---

### Task 1: Provider-neutral mock stream

**Files:**

- Create: `packages/core/src/chat-provider.ts`
- Create: `packages/core/src/chat-provider.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**

- Produce `ChatProviderRequest { characterName: string; userText: string }`.
- Produce `ChatProvider { stream(request): AsyncIterable<string> }`.
- Produce `createMockChatProvider({ chunkSize?, delayMs? })`.

- [ ] Write tests proving exact reconstructed output, deterministic chunk ordering, configurable chunk size, and rejection of non-positive chunk sizes.
- [ ] Run `corepack pnpm --filter @xiong/core test -- chat-provider.test.ts` and verify failure because the module does not exist.
- [ ] Implement an async-generator provider that slices by Unicode code points, optionally sleeps between chunks, and yields no empty chunks.
- [ ] Export the provider contract and factory from `packages/core/src/index.ts`.
- [ ] Re-run the focused test and verify all provider tests pass.
- [ ] Commit as `feat: add deterministic mock chat provider`.

### Task 2: Repository lookups and chat orchestration

**Files:**

- Modify: `packages/db/src/repositories.ts`
- Modify: `packages/db/src/repositories.test.ts`
- Create: `apps/desktop/src/shared/chat.ts`
- Create: `apps/desktop/src/main/chat-service.ts`
- Create: `apps/desktop/src/main/chat-service.test.ts`

**Interfaces:**

- Extend `LibraryRepository` with `getCharacter(id)` and `getConversation(id)` returning a record or `undefined`.
- Produce `SendChatMessageInput { conversationId: string; content: string }`.
- Produce request-scoped `ChatStreamEvent` variants for `user-message`, `delta`, `complete`, and `error`.
- Produce `createChatService(repository, provider)` with `send(input, emit): Promise<void>`.

- [ ] Extend the repository test first to require character and conversation lookup by ID; run the focused DB test and observe missing-method failure.
- [ ] Implement the two lookup methods with Drizzle and re-run the DB test.
- [ ] Write chat-service tests with in-memory fakes proving persistence/event order, provider-failure semantics, missing-record handling, and duplicate-generation rejection before a second user message is saved.
- [ ] Run `corepack pnpm --filter @xiong/desktop test -- chat-service.test.ts` and verify failure because the service does not exist.
- [ ] Implement the minimal service with a per-conversation `Set`, `try/finally` lock release, character resolution, provider consumption, and completion-only assistant persistence.
- [ ] Re-run the focused service test and verify it passes.
- [ ] Commit as `feat: orchestrate persistent mock chats`.

### Task 3: Validated streaming IPC and preload client

**Files:**

- Create: `apps/desktop/src/main/chat-ipc.ts`
- Create: `apps/desktop/src/main/chat-ipc.test.ts`
- Create: `apps/desktop/src/preload/chat-client.ts`
- Create: `apps/desktop/src/preload/chat-client.test.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/preload/index.d.ts`
- Modify: `apps/desktop/src/renderer/src/env.d.ts`
- Modify: `apps/desktop/src/main/index.ts`

**Interfaces:**

- Main channel: `chat:send-message`.
- Stream channel: `chat:stream-event`.
- Internal request includes `requestId`, `conversationId`, and trimmed `content`.
- Public preload method: `chat.sendMessage(input, onEvent): Promise<void>`.

- [ ] Write main-process tests for input trimming, blank-field rejection, untrusted-frame rejection, request-ID attachment, and safe error events.
- [ ] Run the focused IPC test and observe module-not-found failure.
- [ ] Implement Zod parsing and `registerChatIpc` without exposing Electron event objects.
- [ ] Write preload-client tests proving listener registration before invoke, filtering by request ID, and cleanup after complete, error, and invoke rejection.
- [ ] Run the focused preload test and observe module-not-found failure.
- [ ] Implement `createChatClient` with injected request-ID creation for deterministic tests; wire it through `contextBridge` and both global declarations.
- [ ] Instantiate one repository, mock provider, chat service, and chat IPC registration in the Electron main entry.
- [ ] Re-run focused IPC and preload tests and verify they pass.
- [ ] Commit as `feat: expose request scoped chat streaming`.

### Task 4: User-facing streaming composer

**Files:**

- Modify: `apps/desktop/src/renderer/src/App.tsx`
- Modify: `apps/desktop/src/renderer/src/styles.css`

**Interfaces:**

- Consume `window.xiong.chat.sendMessage` and `ChatStreamEvent`.
- Keep generating and streaming state keyed by conversation ID.

- [ ] Remove the role selector and the direct `library.addMessage` composer path.
- [ ] Submit user text through the chat API, append persisted events only to the matching selected conversation, and render a temporary assistant message from accumulated deltas.
- [ ] Disable the selected conversation's composer during generation, preserve concurrent state for other conversations, and restore unsaved text after an early failure.
- [ ] Update copy and styles for Send, generating state, and the streaming cursor.
- [ ] Run `corepack pnpm --filter @xiong/desktop typecheck` and fix all type errors.
- [ ] Run `corepack pnpm --filter @xiong/desktop test` and verify desktop tests pass.
- [ ] Commit as `feat: stream mock replies in the chat ui`.

### Task 5: Full verification and publication

**Files:**

- Modify only files required by verification findings.

- [ ] Run `corepack pnpm typecheck`.
- [ ] Run `corepack pnpm lint`.
- [ ] Run `corepack pnpm test`.
- [ ] Run `corepack pnpm format:check`.
- [ ] Run `corepack pnpm build`.
- [ ] Run `corepack pnpm package:win` and verify `apps/desktop/dist/win-unpacked/Xiong.exe` exists.
- [ ] Inspect the complete diff against `main` and confirm every changed file belongs to the chat-loop scope.
- [ ] Push `feature/chat-loop-mock-provider` and open a draft pull request targeting `main` with verification results.
