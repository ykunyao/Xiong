import { describe, expect, test } from 'vitest';
import { createOpenAICompatibleChatProvider } from './openai-compatible-chat-provider';

describe('createOpenAICompatibleChatProvider', () => {
  test('uses the configured endpoint, key, model, messages, and streams text deltas', async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const provider = createOpenAICompatibleChatProvider(
      {
        baseUrl: 'https://provider.example/v1',
        apiKey: 'test-secret-key',
        model: 'roleplay-model',
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
    };
    expect(body).toMatchObject({
      model: 'roleplay-model',
      messages: [
        { role: 'system', content: '你正在扮演遥。' },
        { role: 'user', content: '你好' },
      ],
      stream: true,
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
