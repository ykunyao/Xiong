# Phase 1 Data + Basic UI Design

## Goal

Build the first persistent vertical slice for Xiong: users can create a character, create a conversation for that character, add local messages, restart the app, and still see the saved data.

This PR intentionally stops before provider calls, prompt assembly, character-card import, lorebook, and rich message editing.

## Scope

In scope:

- SQLite database initialization for the desktop app.
- Drizzle schema and migrations for characters, conversations, and messages.
- Repository functions for the minimum Phase 1 use cases.
- Restricted Electron IPC APIs exposed through preload.
- A simple React UI for character list, conversation list, message list, and local message creation.
- Tests for schema-level behavior, repository behavior, and input validation.

Out of scope:

- Real AI provider calls.
- Streaming chat.
- API key storage.
- SillyTavern PNG / JSON import.
- Lorebook and Prompt Engine.
- Full design system adoption.

## Architecture

The renderer never talks to SQLite directly. It calls `window.xiong.library.*` APIs exposed by preload. The main process validates IPC input with Zod and calls database repositories.

`packages/db` owns schema, migrations, database opening, pragmas, and repository functions. `apps/desktop` owns platform wiring: user data path, IPC registration, and UI state.

`packages/core` remains pure domain logic. This PR does not move chat orchestration into core yet because the immediate value is persistence and UI flow.

## Data Model

### characters

- `id`: text primary key.
- `name`: required text.
- `description`: text, defaults to empty string.
- `personality`: text, defaults to empty string.
- `scenario`: text, defaults to empty string.
- `first_message`: text, defaults to empty string.
- `created_at`: integer unix milliseconds.
- `updated_at`: integer unix milliseconds.

### conversations

- `id`: text primary key.
- `character_id`: required text foreign key to `characters.id`.
- `title`: required text.
- `created_at`: integer unix milliseconds.
- `updated_at`: integer unix milliseconds.

### messages

- `id`: text primary key.
- `conversation_id`: required text foreign key to `conversations.id`.
- `role`: one of `user`, `assistant`, `system`.
- `content`: required text.
- `created_at`: integer unix milliseconds.
- `updated_at`: integer unix milliseconds.

## API Design

Preload exposes:

```ts
window.xiong.library.listCharacters(): Promise<CharacterSummary[]>
window.xiong.library.createCharacter(input: CreateCharacterInput): Promise<CharacterRecord>
window.xiong.library.listConversations(characterId: string): Promise<ConversationRecord[]>
window.xiong.library.createConversation(input: CreateConversationInput): Promise<ConversationRecord>
window.xiong.library.listMessages(conversationId: string): Promise<MessageRecord[]>
window.xiong.library.addMessage(input: AddMessageInput): Promise<MessageRecord>
```

All inputs are validated in the main process. Empty names, missing IDs, invalid roles, and empty message content are rejected with a user-readable error.

## UI Design

The UI is deliberately simple:

- Left column: character list and create-character form.
- Middle column: conversations for the selected character and create-conversation form.
- Right column: messages for the selected conversation and add-message form.

The default state explains what to create next. After creating a record, the relevant list refreshes and selects the newly created item.

## Error Handling

Repository-level expected failures return typed errors or throw validation errors at the IPC boundary. The renderer displays failures as inline status text. Unexpected database failures are logged in the main process and surfaced to the renderer as a generic message.

## Testing

- `packages/db` tests cover database pragmas, foreign keys, create/list behavior, and message ordering.
- `apps/desktop` tests cover IPC input schemas without needing to launch Electron.
- Existing root checks remain required: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, and Windows packaging if time allows.

## Acceptance Criteria

- The app starts and renders the Phase 1 UI.
- A user can create a character.
- A user can create a conversation for that character.
- A user can add local user/assistant messages.
- Restarting the app does not lose the created data.
- Renderer cannot access arbitrary filesystem, HTTP, secrets, or raw SQL through preload.
