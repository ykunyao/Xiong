# Phase 1 Data + Basic UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a persistent desktop vertical slice where users can create characters, create conversations, add local messages, and keep that data after restart.

**Architecture:** `packages/db` owns SQLite opening, pragmas, Drizzle schema, and repositories. `apps/desktop` owns Electron app wiring, restricted IPC handlers, preload APIs, and React UI. The renderer calls business APIs only and never accesses raw SQL or filesystem APIs.

**Tech Stack:** Electron, React, TypeScript, Vitest, SQLite, better-sqlite3, Drizzle ORM, Zod.

---

## File Structure

- Modify `package.json` to allow `better-sqlite3` native builds through pnpm.
- Modify `packages/db/package.json` to add runtime dependencies and test scripts.
- Create `packages/db/src/schema.ts` for table definitions.
- Create `packages/db/src/database.ts` for opening SQLite and enabling pragmas.
- Create `packages/db/src/repositories.ts` for character, conversation, and message use cases.
- Modify `packages/db/src/index.ts` to export public database APIs.
- Create `packages/db/src/repositories.test.ts` for repository behavior.
- Modify `apps/desktop/package.json` to depend on `@xiong/db` and `zod`.
- Create `apps/desktop/src/main/library-ipc.ts` for validated IPC handlers.
- Modify `apps/desktop/src/main/index.ts` to initialize the app database and register IPC.
- Modify `apps/desktop/src/preload/index.ts` and `apps/desktop/src/renderer/src/env.d.ts` to expose typed business APIs.
- Replace `apps/desktop/src/renderer/src/App.tsx` with the Phase 1 UI.
- Modify `apps/desktop/src/renderer/src/styles.css` for the three-column layout.
- Create `apps/desktop/src/main/library-ipc.test.ts` for input validation.

## Task 1: Database schema and repositories

**Files:**

- Modify: `package.json`
- Modify: `packages/db/package.json`
- Create: `packages/db/src/schema.ts`
- Create: `packages/db/src/database.ts`
- Create: `packages/db/src/repositories.ts`
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/src/repositories.test.ts`

- [ ] **Step 1: Add the failing repository test**

```ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { createXiongDatabase } from './database';
import { createLibraryRepository } from './repositories';

function createTestRepository() {
  const dir = mkdtempSync(join(tmpdir(), 'xiong-db-'));
  const database = createXiongDatabase(join(dir, 'xiong.sqlite'));
  return {
    database,
    repository: createLibraryRepository(database),
  };
}

describe('library repository', () => {
  test('creates and lists characters, conversations, and ordered messages', () => {
    const { database, repository } = createTestRepository();

    try {
      const character = repository.createCharacter({
        name: '遥',
        description: '温柔但有点嘴硬的旅伴。',
        firstMessage: '你终于来了。',
      });
      const conversation = repository.createConversation({
        characterId: character.id,
        title: '初次见面',
      });
      const userMessage = repository.addMessage({
        conversationId: conversation.id,
        role: 'user',
        content: '晚上好。',
      });
      const assistantMessage = repository.addMessage({
        conversationId: conversation.id,
        role: 'assistant',
        content: '晚上好，路上冷吗？',
      });

      expect(repository.listCharacters()).toMatchObject([
        {
          id: character.id,
          name: '遥',
          description: '温柔但有点嘴硬的旅伴。',
          firstMessage: '你终于来了。',
        },
      ]);
      expect(repository.listConversations(character.id)).toMatchObject([
        {
          id: conversation.id,
          characterId: character.id,
          title: '初次见面',
        },
      ]);
      expect(repository.listMessages(conversation.id).map((message) => message.id)).toEqual([
        userMessage.id,
        assistantMessage.id,
      ]);
    } finally {
      database.close();
    }
  });

  test('enforces conversation foreign keys', () => {
    const { database, repository } = createTestRepository();

    try {
      expect(() =>
        repository.createConversation({
          characterId: 'missing-character',
          title: '不会成功',
        }),
      ).toThrow();
    } finally {
      database.close();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xiong/db test`

Expected: FAIL because `./database` and `./repositories` do not exist.

- [ ] **Step 3: Add dependencies and implementation**

Use:

```json
{
  "dependencies": {
    "better-sqlite3": "12.11.1",
    "drizzle-orm": "0.45.2"
  },
  "devDependencies": {
    "@types/better-sqlite3": "7.6.13",
    "drizzle-kit": "0.31.10"
  }
}
```

Implement `characters`, `conversations`, and `messages` with Drizzle sqlite tables. Open the database with `better-sqlite3`, enable `PRAGMA foreign_keys = ON` and `PRAGMA journal_mode = WAL`, and create tables with idempotent SQL for this first slice.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xiong/db test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json packages/db/package.json packages/db/src
git commit -m "feat: add local library repository"
```

## Task 2: Validated desktop IPC

**Files:**

- Modify: `apps/desktop/package.json`
- Create: `apps/desktop/src/main/library-ipc.ts`
- Test: `apps/desktop/src/main/library-ipc.test.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/renderer/src/env.d.ts`

- [ ] **Step 1: Add failing validation tests**

Test `parseCreateCharacterInput`, `parseCreateConversationInput`, and `parseAddMessageInput` from `library-ipc.ts`. Assert empty names, empty IDs, invalid message roles, and empty content throw readable errors.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xiong/desktop test`

Expected: FAIL because `library-ipc.ts` does not exist.

- [ ] **Step 3: Implement IPC registration and preload API**

Add `zod@4.4.3`, register handlers for:

- `library:list-characters`
- `library:create-character`
- `library:list-conversations`
- `library:create-conversation`
- `library:list-messages`
- `library:add-message`

Each handler must reject calls where `event.senderFrame !== event.sender.mainFrame`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xiong/desktop test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/package.json apps/desktop/src/main apps/desktop/src/preload apps/desktop/src/renderer/src/env.d.ts pnpm-lock.yaml
git commit -m "feat: expose validated library ipc"
```

## Task 3: Phase 1 React UI

**Files:**

- Modify: `apps/desktop/src/renderer/src/App.tsx`
- Modify: `apps/desktop/src/renderer/src/styles.css`

- [ ] **Step 1: Replace the Phase 0 hero with the Phase 1 layout**

Build a three-column UI:

- Character panel with a list and create form.
- Conversation panel with a list and create form for the selected character.
- Message panel with messages and add-message form.

- [ ] **Step 2: Load and refresh data through preload APIs**

Use `useEffect` to load characters on mount, conversations when the selected character changes, and messages when the selected conversation changes. After creating a record, refresh the affected list and select the new record.

- [ ] **Step 3: Run typecheck and app build**

Run:

```bash
pnpm typecheck
pnpm build
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/src/App.tsx apps/desktop/src/renderer/src/styles.css
git commit -m "feat: add persistent library ui"
```

## Task 4: Final verification and PR

**Files:**

- No expected code changes unless verification reveals a defect.

- [ ] **Step 1: Run full verification**

Run:

```bash
pnpm lint
pnpm test
pnpm format:check
pnpm build
pnpm package:win
```

Expected: all pass.

- [ ] **Step 2: Push the branch**

```bash
git push -u origin feature/phase-1-data-ui
```

- [ ] **Step 3: Create PR**

Create a draft PR from `feature/phase-1-data-ui` into `main` with summary, validation list, and scope notes.
