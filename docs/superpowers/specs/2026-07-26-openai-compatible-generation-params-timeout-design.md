# OpenAI Compatible Generation Parameters and Timeout Design

## Goal

Complete the Phase 3 OpenAI Compatible settings needed for stable day-to-day use: persist and edit `temperature`, `maxOutputTokens`, and `requestTimeoutMs`; pass them through the existing AI SDK adapter; and distinguish a user stop from a request timeout without saving partial assistant output.

## Scope

This increment includes:

- generation parameter defaults, validation, persistence, and renderer controls;
- reuse of `provider_configs.params_json` rather than a second settings store;
- field-by-field fallback for legacy or malformed JSON;
- AI SDK `streamText` temperature and output-token settings;
- one composed abort signal for user cancellation and request timeout;
- distinct timeout and user-cancel terminal semantics;
- repository, service, provider, ChatService/IPC, and renderer-state tests.

It does not add retries, a general task queue, provider-specific advanced parameters, resumable streams, partial assistant persistence, or the remaining full AI SDK event-to-domain conversion work.

## Defaults and Validation

The application owns one provider-neutral settings shape:

```ts
interface OpenAICompatibleGenerationParams {
  temperature: number;
  maxOutputTokens: number;
  requestTimeoutMs: number;
}
```

Safe defaults are:

- `temperature`: `1`;
- `maxOutputTokens`: `2048`;
- `requestTimeoutMs`: `60000` (shown as 60 seconds).

Accepted ranges are explicit and enforced in the renderer, IPC parser, and service boundary:

- temperature: finite number from `0` through `2`;
- maximum output: integer from `1` through `32768` tokens;
- timeout: whole seconds from `1` through `600`, represented internally as `1000` through `600000` milliseconds.

The service remains authoritative even if a caller bypasses browser form validation. IPC supplies defaults for older callers that omit the new fields.

## Persistence

The existing `provider_configs.params_json` column stores:

```json
{
  "temperature": 1,
  "maxOutputTokens": 2048,
  "requestTimeoutMs": 60000
}
```

No schema migration or new settings table is required. A row with `{}`, missing fields, wrong types, or out-of-range values is read safely: each invalid field independently falls back to its default without discarding valid sibling fields.

Repository upsert behavior is deliberate:

- inserts write supplied params, or `{}` for a legacy caller;
- conflict updates write params only when the caller supplies them;
- calls that update only encrypted secret material preserve existing params;
- asynchronous secret re-encryption uses a repository compare-and-swap operation rather than the full config upsert;
- the compare-and-swap succeeds only while both the provider's current `apiKeyRef` and the secret's previous encrypted value still match;
- a successful rotation updates only `provider_secrets.encrypted_value` and its timestamp. It never writes `baseUrl`, model, params, `apiKeyRef`, or active state.

This prevents API-key rotation from resetting generation behavior, and prevents a delayed decrypt from restoring a cleared key or overwriting a newer concurrent save.

## Provider Boundary

The OpenAI Compatible adapter passes `temperature` and `maxOutputTokens` directly to `streamText`. The SDK then translates them for the selected compatible model.

Request timeout uses platform cancellation primitives:

1. `AbortSignal.timeout(requestTimeoutMs)` creates the timeout signal;
2. `AbortSignal.any([userSignal, timeoutSignal])` creates one first-wins signal when a user signal exists;
3. the composed signal is passed to `streamText({ abortSignal })`;
4. the adapter observes the SDK abort lifecycle and inspects the composed signal's preserved `reason`.

The adapter does not start a second SDK timeout timer. One timeout source makes the winning reason deterministic: the timeout signal produces `TimeoutError`, while ChatService aborts manual stops with an `AbortError` carrying `code: "user-cancelled"`.

## Chat Semantics

The existing user-message-first persistence rule remains unchanged.

- Normal completion: persist the complete assistant message and emit `complete`.
- User stop: emit `cancelled`; retain an already-saved user message; discard streamed assistant text.
- Timeout: throw `ChatProviderTimeoutError`, map it to `ChatServiceError("request-timeout")`, and send a safe, distinct IPC error; retain the user message and discard streamed assistant text.
- Other provider failure: keep the existing generic safe error behavior.

ChatService no longer treats every aborted-looking failure as a user stop. It recognizes only its explicit `user-cancelled` reason as manual cancellation. A provider timeout error is handled before checking for a late manual abort, so a timeout that already won cannot be relabeled by a racing Stop click.

The active-generation entry is removed by identity in `finally` for every terminal path. A later send can start after timeout or cancellation cleanup, and a stale operation cannot remove a newer one.

## Renderer

The provider panel shows number inputs for all three settings with visible range hints. Temperature uses unrestricted decimal stepping so valid values such as `0.65` agree with the domain rule. Timeout is edited in seconds and converted to milliseconds at the renderer request boundary. Saved settings convert milliseconds back to seconds for display.

Client-side parsing gives a specific validation message before invoking IPC. Native number constraints provide a second UI guard. When Mock is selected, the renderer skips generation-parameter parsing and omits generation and secret fields from the save request, so stale invalid disabled controls cannot block the switch. On a timeout error, the existing reducer treats the event as terminal and clears transient streamed output exactly as it does for other errors; the distinct IPC message explains that incomplete output was not saved.

## Testing

Tests do not call an external model service. The AI SDK adapter receives an injected fetch implementation and deterministic local SSE streams.

Coverage includes:

- params insert, conflict update, and preservation during secret rotation;
- CAS rejection after delayed decrypt races with a newer secret save or key clear;
- defaults for absent and malformed stored JSON;
- service and IPC rejection of every out-of-range setting;
- renderer seconds/milliseconds conversion, decimal temperature parsing, Mock bypass, and validation messages;
- AI SDK request-body passthrough for temperature and maximum tokens;
- a partial local SSE delta followed by a normal stream close on abort, covering the AI SDK `onAbort`-only lifecycle;
- timeout abort reason and manual first-wins cancellation;
- no partial assistant persistence after a real adapter timeout or user stop;
- timeout/manual race classification and active-generation cleanup;
- IPC timeout messaging and renderer transient-state cleanup.

## Acceptance Criteria

A user can view, edit, save, reload, and use all three generation settings. Legacy databases remain usable with safe defaults. AI SDK generation receives the configured values and one abortable timeout. User stops and timeouts produce different messages, neither persists partial assistant output, and a new generation can start after cleanup.

## References

- [AI SDK `streamText`](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text)
- [AI SDK: Stopping Streams](https://ai-sdk.dev/docs/advanced/stopping-streams)
- [MDN: `AbortSignal.any()`](https://developer.mozilla.org/docs/Web/API/AbortSignal/any_static)
- [MDN: `AbortSignal.timeout()`](https://developer.mozilla.org/docs/Web/API/AbortSignal/timeout_static)
