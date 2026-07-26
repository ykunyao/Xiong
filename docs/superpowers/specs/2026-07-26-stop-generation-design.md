# Stop Generation Design

## Goal

Let a user stop the active reply for a conversation. Stopping must abort the underlying provider request, clear the transient streamed text, keep an already-persisted user message, and never persist an incomplete assistant message.

## Scope

This increment includes:

- one Stop button for each actively generating conversation;
- a validated `chat:cancel-generation` IPC command;
- one `AbortController` owned by ChatService for each active conversation;
- `AbortSignal` propagation through the provider-neutral core interface;
- abort-aware deterministic Mock delays;
- Vercel AI SDK `streamText({ abortSignal })` integration;
- an explicit terminal `cancelled` stream event;
- tests for cancellation before persistence, during streaming, after cleanup, and across IPC.

This increment does not include pause/resume, preserving partial assistant output, editing or regenerating messages, timeout settings, cancelling every conversation at once, or process-crash recovery.

## User Semantics

The existing rule that one conversation can have only one active generation remains unchanged.

When the user presses Stop:

1. the renderer sends the selected `conversationId` to the main process;
2. ChatService aborts that conversation's controller;
3. the signal reaches Mock or the AI SDK request;
4. ChatService emits one terminal `cancelled` event;
5. the renderer removes transient streamed text and enables sending again.

If the user message was already stored, it remains in history. If cancellation happens while provider settings are still resolving and before the user message is stored, the renderer restores the draft. Partial assistant text is always transient and is discarded.

Cancellation is a user action, not an error. The status says the generation was stopped rather than showing a provider failure.

## Provider Boundary

The provider-neutral API gains optional stream options:

```ts
interface ChatProviderStreamOptions {
  signal?: AbortSignal;
}

interface ChatProvider {
  stream(
    request: ChatProviderRequest,
    options?: ChatProviderStreamOptions,
  ): AsyncIterable<string>;
}
```

Mock checks the signal before output and uses an abort-aware delay between deterministic chunks. The OpenAI Compatible adapter forwards the signal to `streamText` as `abortSignal`. No custom HTTP cancellation protocol is introduced.

## ChatService Ownership

ChatService replaces its active-conversation `Set` with a `Map<string, AbortController>`. It exposes:

```ts
cancel(conversationId: string): boolean;
```

The first cancellation of an active generation returns `true`. Cancelling a missing or already-aborted generation returns `false`.

The controller is registered before repository/provider work starts and removed in `finally`. The same map continues to enforce duplicate-generation rejection. The controller identity is checked during cleanup so a stale task cannot remove a newer task.

ChatService checks `signal.aborted` after provider resolution, while consuming deltas, and after stream completion. This handles providers that throw on abort as well as streams that close normally after cancellation. If an exception occurs while the signal is aborted, it is treated as cancellation; otherwise the existing provider-error behavior remains.

## IPC and Preload

The main process validates a bounded, trimmed `conversationId` for `chat:cancel-generation` and applies the same trusted-main-frame rule as sending.

The preload exposes only:

```ts
chat.cancelGeneration(conversationId): Promise<boolean>;
```

The terminal renderer event is:

```ts
{
  type: 'cancelled';
  requestId: string;
  conversationId: string;
}
```

It carries no partial text or provider details. The request-scoped listener treats `cancelled` like `complete` and `error` for cleanup.

## Renderer

While the selected conversation is generating, the Send button becomes a Stop button. A second click is disabled while cancellation is requested. Other conversations retain independent generation and stopping state.

On `cancelled`:

- the reducer removes the conversation from the generating list;
- transient streamed text is cleared;
- the original draft is restored only when no `user-message` event was received;
- the status reports that incomplete output was not saved.

Provider settings remain disabled for the selected active generation as before.

## Race Handling

- Stop before user persistence: no message is stored; draft is restored.
- Stop after user persistence: user message remains; no assistant message is stored.
- Stop after completion: the service returns `false` and does not alter persisted output.
- Repeated Stop: only the first request is accepted.
- New send after cancellation: allowed only after the original send task has reached `finally` and the renderer has received its terminal event.

## Testing

Tests cover:

- Mock delay interruption without waiting for the full timeout;
- AI SDK fetch receiving an aborting signal;
- ChatService cancellation before and after user persistence;
- partial assistant output never reaching the repository;
- active-controller cleanup and duplicate protection;
- cancel IPC validation, trusted-frame enforcement, and service routing;
- preload invocation and request-listener cleanup on `cancelled`;
- renderer state cleanup for the terminal event;
- full type, lint, test, build, Windows package, and packaged smoke checks.

## Acceptance Criteria

During an active streamed reply, the user can press Stop and see generation end promptly. The underlying provider receives an abort signal. Any saved user message remains, partial assistant output disappears and is not stored, the UI becomes ready for another message, and cancelling one conversation does not affect another.

## References

- [AI SDK: Stopping Streams](https://ai-sdk.dev/docs/advanced/stopping-streams)
- [AI SDK `streamText`](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text)
- [AI SDK Error Handling](https://ai-sdk.dev/docs/ai-sdk-core/error-handling)
