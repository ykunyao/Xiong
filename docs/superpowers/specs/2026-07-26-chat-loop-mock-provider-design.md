# Mock Provider Chat Loop Design

## Goal

Turn the existing local message editor into Xiong's first complete chat loop: a user sends one message, a mock provider streams a deterministic character reply, and both completed messages remain available after the application restarts.

## Scope

This increment includes:

- user-only message composition;
- immediate persistence of the submitted user message;
- deterministic, character-aware mock replies;
- real streaming from the Electron main process to the renderer;
- persistence of the assistant message only after generation completes;
- one active generation per conversation;
- user-visible validation and generation errors;
- automated tests for provider behavior, chat orchestration, validation, and failure handling.

This increment does not include provider settings, real model calls, prompt construction, cancellation, regeneration, message editing, character-card import, or partial-response recovery.

## Chosen Approach

The mock provider runs behind a small provider interface in `packages/core`. Electron's main process owns chat orchestration and persistence, while the renderer receives narrow, request-scoped stream events through the preload bridge.

This approach is preferred over renderer-side typing animation because it exercises the same process boundary that a real provider will use. It is preferred over introducing Vercel AI SDK now because this increment does not need a third-party model adapter yet.

## Components

### Core provider

`packages/core` defines a provider-neutral streaming contract. A request contains the selected character name and current user text. The mock implementation yields deterministic text chunks for:

```text
<character name>：我收到了你的消息：“<user text>”
```

Chunk boundaries and delay are configurable so tests can run without timers while the desktop application can visibly stream the reply.

### Chat service

The Electron main process owns a `ChatService` with one public send operation. It:

1. verifies that no generation is active for the conversation;
2. loads the conversation and its character;
3. persists the user message;
4. emits the persisted user message to the caller;
5. consumes provider chunks and emits delta events;
6. persists the complete assistant reply;
7. emits a completion event containing the saved assistant message;
8. always releases the conversation lock.

The service depends on repository interfaces and the provider interface, so it can be tested without Electron or SQLite.

### IPC and preload boundary

The renderer calls one `chat.sendMessage` preload method with a conversation ID and text. The preload registers a request-scoped listener before invoking the main process, preventing early chunks from being missed. It exposes normalized events rather than Electron event objects.

Each event carries a generated request ID and one of these payloads:

- `user-message`: the persisted user record;
- `delta`: the next assistant text chunk;
- `complete`: the persisted assistant record;
- `error`: a safe user-facing message.

Only the trusted main frame may start a chat request. Inputs are trimmed and validated in the main process. Event listeners are removed after completion, failure, or invocation rejection.

### Renderer behavior

The role selector is removed. The composer submits only user text and is disabled while its selected conversation is generating. The user message appears as soon as persistence succeeds. Assistant deltas are accumulated into one temporary message, then replaced by the persisted assistant record on completion.

Changing characters or conversations does not allow stream events from an older request to mutate the newly selected conversation. The active request retains its original conversation ID, and events update only matching state.

## Data and Failure Semantics

The submitted user message is durable once accepted. A provider failure does not delete it. Incomplete assistant text is never written to SQLite; the renderer removes the temporary assistant message and shows a concise error. A second send for the same conversation while generation is active is rejected without adding another user message.

No schema migration is required because the existing `messages` table already stores user and assistant records. Repository lookup methods will be added only where needed to resolve the conversation and character safely.

## Testing

Tests will cover:

- exact mock response content and deterministic chunk order;
- user-message persistence before provider execution;
- assistant-message persistence after all chunks complete;
- no assistant persistence after provider failure;
- duplicate-generation rejection before another user message is saved;
- validation of blank conversation IDs and blank content;
- request-scoped IPC event forwarding and listener cleanup where practical;
- existing repository, IPC, typecheck, lint, formatting, build, and Windows packaging checks.

## Acceptance Criteria

With a character and conversation selected, entering text and pressing Send visibly streams the mock character reply. Restarting Xiong shows both the user message and the completed assistant response. Repeated sends during generation are blocked, and a generation failure leaves no partial assistant record.
