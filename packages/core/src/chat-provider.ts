export type ChatProviderMessageRole = 'system' | 'user' | 'assistant';

export interface ChatProviderMessage {
  role: ChatProviderMessageRole;
  content: string;
}

export interface ChatProviderRequest {
  characterName: string;
  messages: ChatProviderMessage[];
}

export interface ChatProvider {
  stream(request: ChatProviderRequest): AsyncIterable<string>;
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
    async *stream(request) {
      const userText = findLatestUserText(request.messages);
      const response = Array.from(`${request.characterName}：我收到了你的消息：“${userText}”`);

      for (let index = 0; index < response.length; index += chunkSize) {
        if (index > 0 && delayMs > 0) {
          await sleep(delayMs);
        }

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

async function sleep(delayMs: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}
