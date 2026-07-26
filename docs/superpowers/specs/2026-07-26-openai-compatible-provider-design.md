# OpenAI Compatible Provider Design

## Goal

Add Xiong's first real model connection without replacing the working Mock flow. A user can choose OpenAI Compatible, configure a base URL, model, and optional API key, then receive a real streamed reply through the existing persistent chat loop.

## Scope

This increment includes:

- one OpenAI Compatible configuration;
- a persistent choice between Mock and OpenAI Compatible;
- custom `baseUrl`, model ID, and optional API key;
- API-key encryption through Electron `safeStorage` before persistence;
- a settings view that never receives the stored key or encrypted payload;
- Vercel AI SDK streaming through `@ai-sdk/openai-compatible`;
- minimal character-and-history message construction so real replies are conversational;
- safe Markdown rendering with `react-markdown` and `rehype-sanitize`;
- user-facing configuration and provider errors;
- automated tests for validation, secret handling, provider requests, persistence, and IPC safety.

This increment does not include model discovery, connection-test billing calls, cancellation, retry controls, regeneration, message editing, token budgeting, Prompt Debugger, full Prompt Engine behavior, multiple simultaneous provider profiles, or provider-specific extensions.

## Chosen Approach

Keep the existing `ChatProvider` boundary in `@xiong/core`. The Mock Provider remains a deterministic core implementation. The Electron main process adds a thin OpenAI Compatible adapter that delegates HTTP protocol and stream parsing to Vercel AI SDK instead of implementing SSE handling.

Provider configuration is stored in SQLite, but the API key is never stored in plaintext. Electron `safeStorage` encrypts it in the main process, an encrypted secret row stores the resulting bytes as base64, and the provider config stores only a secret reference. Renderer and preload APIs expose only `hasApiKey` and storage-security status.

The application defaults to Mock. Selecting OpenAI Compatible activates the saved real-provider config. Switching back to Mock preserves the real config and key so the user can return later.

## Dependencies

- `ai@7.0.37` for `streamText`;
- `@ai-sdk/openai-compatible@3.0.14` for a generic OpenAI Chat Completions compatible model;
- Electron 42 asynchronous `safeStorage` APIs for OS-backed encryption;
- `react-markdown@10.1.0` and `rehype-sanitize@6.0.0` for safe AI text rendering.

The SDK packages remain behind the desktop adapter. Their request, response, and error types do not cross into core, SQLite, preload, or renderer APIs.

## Provider-Neutral Request

`ChatProviderRequest` becomes message-oriented:

```ts
interface ChatProviderMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatProviderRequest {
  characterName: string;
  messages: ChatProviderMessage[];
}
```

The Mock Provider derives the latest user text and preserves its exact deterministic response. The OpenAI Compatible adapter forwards the normalized messages to AI SDK `streamText` and yields only `textStream` deltas.

The chat service constructs a deliberately small request:

1. one system message containing the character name and currently available description, personality, and scenario;
2. the persisted user and assistant history for the conversation, including the latest user message.

This is not the full Prompt Engine. It has no lorebook, token budget, context trimming, snapshots, or debug metadata. Keeping the request already normalized lets the later Prompt Engine replace this small builder without changing provider adapters.

## Data Model

Two tables are added:

```text
provider_configs
  id, type, name, base_url, api_key_ref, default_model,
  params_json, is_active, created_at, updated_at

provider_secrets
  id, encrypted_value, created_at, updated_at
```

Only one row with ID `openai-compatible-default` is used in this increment. `is_active = false`, or no row, means Mock is active. The stable secret ID is referenced by `api_key_ref`.

Saving a blank key preserves an existing key. An explicit clear action removes the encrypted secret and reference. Deactivating OpenAI Compatible does not delete its configuration.

## Secret Storage

The main process uses `safeStorage.isAsyncEncryptionAvailable()`, `encryptStringAsync()`, and `decryptStringAsync()` after Electron is ready.

- Windows uses DPAPI through Electron.
- macOS and supported Linux desktops use their OS secret backend.
- Linux `basic_text` is treated as insecure.
- A new key is not persisted when encryption is unavailable or insecure.
- If asynchronous decryption requests re-encryption after key rotation, the main process writes a newly encrypted value back before returning the secret.

No preload method can read a secret. IPC save input accepts a replacement key, but settings output contains only `hasApiKey` and one of `available`, `unavailable`, or `insecure`.

## URL Validation

Provider URLs are parsed and normalized in the main process.

- HTTPS is allowed.
- Plain HTTP is allowed only for `localhost`, `127.0.0.1`, or `::1`.
- Embedded usernames, passwords, query strings, and fragments are rejected.
- Trailing slashes are removed before passing the value to AI SDK.
- The user supplies the complete API prefix, such as `https://api.openai.com/v1` or `http://localhost:1234/v1`.

## Main-Process Services

`ProviderSettingsService` owns three operations:

- `getSettings()` returns the active provider and sanitized config view;
- `saveSettings(input)` validates and persists mode/config/key changes;
- `resolveChatProvider()` returns Mock or decrypts the key and constructs the real adapter.

The chat service depends on an asynchronous provider resolver. It resolves and validates the provider before persisting a user message. Once generation starts, existing semantics remain unchanged: provider/network failure keeps the user message and never persists a partial assistant response.

## IPC and Renderer

The preload exposes only:

```ts
providers.getSettings()
providers.saveSettings(input)
```

Both main-process handlers validate the trusted main frame. Zod trims and bounds every input. Returned values cannot contain an API key, encrypted value, or secret reference.

The renderer adds a compact Provider settings section above the existing workspace. It shows the active mode, base URL, model, password input, stored-key state, storage-security state, and a clear data-flow notice: sending a message transmits the assembled conversation to the configured third-party endpoint.

Chat copy no longer claims every response is simulated. The active provider/model appears near the composer. Mock remains immediately usable when no real configuration exists.

## Errors

Expected failures use stable codes at the main-process boundary:

- invalid or insecure base URL;
- missing model;
- secure storage unavailable;
- stored key cannot be decrypted;
- OpenAI Compatible provider not configured;
- provider request or protocol failure;
- empty model response.

IPC converts these to concise Chinese messages. Raw response bodies, headers, request payloads, and API keys are never sent to the renderer.

## Testing

Tests cover:

- provider config and encrypted-secret persistence without plaintext leakage;
- Mock as the default and after switching back from OpenAI Compatible;
- URL normalization and rejection of remote plain HTTP;
- key preservation, replacement, clearing, unavailable storage, and re-encryption;
- the real adapter's URL, Authorization header, model/messages request body, and streamed deltas using an in-memory fake `fetch` response;
- provider resolution before user persistence;
- history and character fields in the normalized request;
- IPC input validation, trusted-frame checks, and secret-free responses;
- renderer compilation, existing chat behavior, full tests, build, and Windows packaging.

## Acceptance Criteria

Xiong starts in Mock mode as before. A user can select OpenAI Compatible, save a valid base URL, model, and optional key, then send a message and see real text stream into the same conversation. Restarting Xiong preserves the selected mode and non-secret settings; the key remains usable without ever being returned to the renderer or stored in plaintext. Switching back to Mock works without deleting the real configuration.

## References

- [AI SDK OpenAI Compatible Providers](https://ai-sdk.dev/providers/openai-compatible-providers)
- [AI SDK `streamText`](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text)
- [Electron `safeStorage`](https://www.electronjs.org/docs/latest/api/safe-storage)
