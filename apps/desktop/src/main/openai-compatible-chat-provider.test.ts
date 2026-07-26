import { describe, expect, test } from 'vitest';
import { createOpenAICompatibleChatProvider } from './openai-compatible-chat-provider';
import { ChatProviderTimeoutError } from '@xiong/core';

describe('createOpenAICompatibleChatProvider', () => {
  test('uses the configured endpoint, key, model, messages, and streams text deltas', async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const provider = createOpenAICompatibleChatProvider(
      {
        baseUrl: 'https://provider.example/v1',
        apiKey: 'test-secret-key',
        model: 'roleplay-model',
        temperature: 0.65,
        maxOutputTokens: 3072,
        requestTimeoutMs: 60_000,
      },
      {
        fetch: async (input, init) => {
          requests.push({ input, ...(init ? { init } : {}) });
          return createOpenAIStreamResponse(['你', '好']);
        },
      },
    );
    const chunks: string[] = [];

    for await (const chunk of provider.stream({
      characterName: '遥',
      messages: [
        { role: 'system', content: '你正在扮演遥。' },
        { role: 'user', content: '你好' },
      ],
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['你', '好']);
    expect(requests).toHaveLength(1);
    expect(String(requests[0]?.input)).toBe('https://provider.example/v1/chat/completions');

    const headers = new Headers(requests[0]?.init?.headers);
    expect(headers.get('authorization')).toBe('Bearer test-secret-key');

    const body = JSON.parse(String(requests[0]?.init?.body)) as {
      model: string;
      messages: Array<{ role: string; content: string }>;
      stream: boolean;
      temperature: number;
      max_tokens: number;
    };
    expect(body).toMatchObject({
      model: 'roleplay-model',
      messages: [
        { role: 'system', content: '你正在扮演遥。' },
        { role: 'user', content: '你好' },
      ],
      stream: true,
      temperature: 0.65,
      max_tokens: 3072,
    });
  });

  test('omits the authorization header when no key is configured', async () => {
    let authorization: string | null = 'not-called';
    const provider = createOpenAICompatibleChatProvider(
      {
        baseUrl: 'http://localhost:1234/v1',
        model: 'local-model',
      },
      {
        fetch: async (_input, init) => {
          authorization = new Headers(init?.headers).get('authorization');
          return createOpenAIStreamResponse(['本地回复']);
        },
      },
    );

    const chunks: string[] = [];
    for await (const chunk of provider.stream({
      characterName: '遥',
      messages: [{ role: 'user', content: '你好' }],
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['本地回复']);
    expect(authorization).toBeNull();
  });

  test('forwards an aborting signal to the AI SDK request', async () => {
    let requestSignal: AbortSignal | null | undefined;
    const provider = createOpenAICompatibleChatProvider(
      {
        baseUrl: 'https://provider.example/v1',
        model: 'roleplay-model',
      },
      {
        fetch: async (_input, init) => {
          requestSignal = init?.signal;
          return createOpenAIStreamResponse(['完成']);
        },
      },
    );
    const controller = new AbortController();
    const chunks: string[] = [];

    for await (const chunk of provider.stream(
      {
        characterName: '遥',
        messages: [{ role: 'user', content: '你好' }],
      },
      { signal: controller.signal },
    )) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['完成']);
    expect(requestSignal?.aborted).toBe(false);
    controller.abort();
    expect(requestSignal?.aborted).toBe(true);
  });

  test('reports timeout when the SDK only calls onAbort after a partial SSE response', async () => {
    let requestSignal: AbortSignal | null | undefined;
    const provider = createOpenAICompatibleChatProvider(
      {
        baseUrl: 'https://provider.example/v1',
        model: 'roleplay-model',
        temperature: 1,
        maxOutputTokens: 2048,
        requestTimeoutMs: 50,
      },
      {
        fetch: async (_input, init) => {
          requestSignal = init?.signal;
          return createPausingOpenAIStreamResponse(requestSignal, '部分');
        },
      },
    );
    const stream = provider.stream({
      characterName: '遥',
      messages: [{ role: 'user', content: '你好' }],
    });
    const iterator = stream[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toEqual({ value: '部分', done: false });
    await expect(iterator.next()).rejects.toBeInstanceOf(ChatProviderTimeoutError);
    expect(requestSignal?.aborted).toBe(true);
    expect(requestSignal?.reason).toMatchObject({ name: 'TimeoutError' });
  });

  test('preserves manual cancellation when it wins before timeout after a partial delta', async () => {
    const controller = new AbortController();
    const provider = createOpenAICompatibleChatProvider(
      {
        baseUrl: 'https://provider.example/v1',
        model: 'roleplay-model',
        temperature: 1,
        maxOutputTokens: 2048,
        requestTimeoutMs: 50,
      },
      {
        fetch: async (_input, init) => {
          const signal = init?.signal;
          return createPausingOpenAIStreamResponse(signal, '部分');
        },
      },
    );
    const stream = provider.stream(
      {
        characterName: '遥',
        messages: [{ role: 'user', content: '你好' }],
      },
      { signal: controller.signal },
    );
    const iterator = stream[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toEqual({ value: '部分', done: false });
    const completion = iterator.next();

    controller.abort();

    await expect(completion).rejects.toMatchObject({ name: 'AbortError' });
    await expect(completion).rejects.not.toBeInstanceOf(ChatProviderTimeoutError);
  });
});

function createOpenAIStreamResponse(chunks: string[]): Response {
  const events = [
    ...chunks.map((content) =>
      JSON.stringify({
        id: 'chatcmpl-test',
        object: 'chat.completion.chunk',
        created: 1,
        model: 'roleplay-model',
        choices: [
          {
            index: 0,
            delta: { content },
            finish_reason: null,
          },
        ],
      }),
    ),
    JSON.stringify({
      id: 'chatcmpl-test',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'roleplay-model',
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4 },
    }),
    '[DONE]',
  ];

  return new Response(events.map((event) => `data: ${event}\n\n`).join(''), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

function createPausingOpenAIStreamResponse(
  signal: AbortSignal | null | undefined,
  content: string,
): Response {
  const encoder = new TextEncoder();
  let removeAbortListener: () => void = () => undefined;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const close = () => {
        if (closed) {
          return;
        }

        closed = true;
        removeAbortListener();
        controller.close();
      };
      const event = JSON.stringify({
        id: 'chatcmpl-pausing-test',
        object: 'chat.completion.chunk',
        created: 1,
        model: 'roleplay-model',
        choices: [{ index: 0, delta: { content }, finish_reason: null }],
      });

      controller.enqueue(encoder.encode(`data: ${event}\n\n`));
      if (signal?.aborted) {
        close();
        return;
      }

      signal?.addEventListener('abort', close, { once: true });
      removeAbortListener = () => signal?.removeEventListener('abort', close);
    },
    cancel() {
      removeAbortListener();
    },
  });

  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}
