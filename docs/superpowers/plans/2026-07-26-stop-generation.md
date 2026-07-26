# Stop Generation Implementation Plan

**Goal:** Add request cancellation from the renderer through ChatService to Mock and OpenAI Compatible providers without persisting partial assistant output.

**Architecture:** ChatService owns one `AbortController` per active conversation. A validated cancel IPC command invokes it, and the provider-neutral stream options carry its signal to each adapter. Cancellation ends with a typed `cancelled` event instead of an error.

**Constraints:** Preserve persisted user messages, discard partial assistant output, keep Mock deterministic, never expose provider errors, and do not add timeout or regeneration behavior.

## Task 1: Provider cancellation boundary

- [x] Add optional `ChatProviderStreamOptions.signal`.
- [x] Write a failing Mock test that aborts during a delayed stream.
- [x] Implement an abort-aware Mock delay.
- [x] Write a failing adapter test proving the AI SDK request signal aborts.
- [x] Forward the signal through `streamText({ abortSignal })`.

## Task 2: ChatService cancellation semantics

- [x] Add a terminal `cancelled` progress event.
- [x] Write failing tests for cancellation before user persistence and after a partial delta.
- [x] Replace the active set with conversation-scoped controllers.
- [x] Add `cancel(conversationId)` and deterministic cleanup.
- [x] Preserve duplicate-generation and provider-failure behavior.

## Task 3: IPC and preload

- [x] Add and test cancel request validation.
- [x] Register trusted `chat:cancel-generation` handling.
- [x] Expose `cancelGeneration` from the request-scoped preload client.
- [x] Treat `cancelled` as a terminal event and clean up listeners.
- [x] Update preload and renderer declarations.

## Task 4: Renderer interaction

- [x] Add reducer coverage for cancellation cleanup.
- [x] Replace Send with Stop while the selected conversation generates.
- [x] Prevent duplicate cancellation clicks.
- [x] Restore the draft only when cancellation precedes user persistence.
- [x] Show a non-error stopped status.

## Task 5: Verification and publication

- [x] Run typecheck, lint, all tests, and formatting checks.
- [x] Run production build and Windows package.
- [x] Smoke-test packaged startup and database compatibility.
- [ ] Review the diff, commit, push, and create a Draft PR to `main`.
- [ ] Wait for GitHub CI and fix any failures.
