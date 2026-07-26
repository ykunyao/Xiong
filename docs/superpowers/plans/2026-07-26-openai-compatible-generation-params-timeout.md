# OpenAI Compatible Generation Parameters and Timeout Implementation Plan

**Goal:** Persist, edit, validate, and apply temperature, maximum output tokens, and request timeout while preserving correct stop-generation behavior and never storing partial assistant output.

**Architecture:** Keep provider parameters in `provider_configs.params_json`. ProviderSettingsService normalizes stored JSON and owns authoritative validation. The adapter sends sampling settings to Vercel AI SDK and composes user cancellation with `AbortSignal.timeout` using `AbortSignal.any`. ChatService maps explicit timeout and manual-cancel reasons to separate terminal behavior.

**Constraints:** No external API calls, no new settings store, no general task queue, no partial assistant persistence, and no change to the existing one-generation-per-conversation rule.

## Task 1: Define settings and persistence behavior

- [x] Add shared defaults, limits, view fields, and save fields.
- [x] Write failing repository tests for params insert and conflict update.
- [x] Preserve params when a repository save omits them.
- [x] Cover API-key re-encryption without parameter reset.
- [x] Add a secret-only compare-and-swap rotation that checks both `apiKeyRef` and the previous ciphertext.
- [x] Prove delayed decrypt cannot overwrite a concurrent key save or restore a cleared key.
- [x] Normalize missing or malformed legacy JSON field by field.

## Task 2: Validate service and IPC inputs

- [x] Write failing service tests for defaults, persistence, provider resolution, and invalid ranges.
- [x] Validate temperature from 0 through 2.
- [x] Validate maximum output tokens as an integer from 1 through 32768.
- [x] Validate timeout as whole seconds represented by 1000 through 600000 milliseconds.
- [x] Add safe, specific provider-settings IPC messages.

## Task 3: Apply parameters and timeout in the provider

- [x] Write an injected-fetch test for temperature and token passthrough.
- [x] Pass temperature and maximum output tokens to `streamText`.
- [x] Compose user and timeout signals with platform `AbortSignal` APIs.
- [x] Convert a timeout winner to `ChatProviderTimeoutError`.
- [x] Preserve the explicit manual `AbortError` when user cancellation wins.
- [x] Exercise AI SDK `onAbort` with a partial local SSE stream that closes normally after abort.

## Task 4: Harden ChatService, IPC, and renderer state

- [x] Give manual cancellation an explicit `user-cancelled` abort reason.
- [x] Map provider timeout to a distinct ChatService error before manual-cancel handling.
- [x] Test partial-output discard for both terminal paths.
- [x] Compose the real AI SDK adapter with ChatService and prove timeout persists only the user.
- [x] Test late-cancel timeout races and post-timeout active-map cleanup.
- [x] Add a safe timeout message in chat IPC.
- [x] Clear transient renderer output on timeout errors.

## Task 5: Add renderer controls

- [x] Display temperature, maximum output tokens, and timeout seconds.
- [x] Add visible range hints and native numeric constraints.
- [x] Parse and validate form strings before invoking IPC.
- [x] Skip parsing and omit unrelated generation/secret fields when switching to Mock.
- [x] Allow arbitrary valid decimal temperature steps, including `0.65`.
- [x] Convert seconds to internal milliseconds and back without unit ambiguity.

## Task 6: Documentation and verification

- [x] Add the feature design and implementation plan.
- [x] Run full typecheck, lint, formatting, tests, and production build.
- [x] Review the final diff and update only evidenced Phase 3 roadmap items.
- [x] Leave the worktree uncommitted and do not push, create a PR, or merge.

Windows packaging is intentionally left to the parent task as requested.
