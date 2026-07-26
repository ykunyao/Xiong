export type ChatProviderMessageRole = 'system' | 'user' | 'assistant';

export interface ChatProviderMessage {
  role: ChatProviderMessageRole;
  content: string;
}

export interface ChatProviderRequest {
  characterName: string;
  messages: ChatProviderMessage[];
}

export interface ChatProviderStreamOptions {
  signal?: AbortSignal;
}

export interface ChatProvider {
  stream(request: ChatProviderRequest, options?: ChatProviderStreamOptions): AsyncIterable<string>;
}

export class ChatProviderTimeoutError extends Error {
  constructor(message = 'The chat provider request timed out', options?: ErrorOptions) {
    super(message, options);
    this.name = 'ChatProviderTimeoutError';
  }
}

export interface MockChatProviderOptions {
  chunkSize?: number;
  delayMs?: number;
}

const defaultChunkSize = 4;
const defaultDelayMs = 45;

export function createMockChatProvider(options: MockChatProviderOptions = {}): ChatProvider {
  const chunkSize = options.chunkSize ?? defaultChunkSize;
  const delayMs = options.delayMs ?? defaultDelayMs;

  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error('Mock provider chunk size must be a positive integer');
  }

  if (!Number.isFinite(delayMs) || delayMs < 0) {
    throw new Error('Mock provider delay must be a non-negative number');
  }

  return {
    async *stream(request, streamOptions = {}) {
      streamOptions.signal?.throwIfAborted();
      const userText = findLatestUserText(request.messages);
      const response = Array.from(`${request.characterName}：我收到了你的消息：“${userText}”`);

      for (let index = 0; index < response.length; index += chunkSize) {
        if (index > 0 && delayMs > 0) {
          await sleep(delayMs, streamOptions.signal);
        }

        streamOptions.signal?.throwIfAborted();
        yield response.slice(index, index + chunkSize).join('');
      }
    },
  };
}

function findLatestUserText(messages: ChatProviderMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === 'user') {
      return message.content;
    }
  }

  throw new Error('Chat provider request must include a user message');
}

async function sleep(delayMs: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);
    const handleAbort = (): void => {
      clearTimeout(timeout);
      cleanup();
      try {
        signal?.throwIfAborted();
      } catch (error) {
        reject(error);
      }
    };
    const cleanup = (): void => {
      signal?.removeEventListener('abort', handleAbort);
    };

    signal?.addEventListener('abort', handleAbort, { once: true });
  });
}
