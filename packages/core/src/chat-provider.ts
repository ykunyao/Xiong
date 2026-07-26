export interface ChatProviderRequest {
  characterName: string;
  userText: string;
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
      const response = Array.from(
        `${request.characterName}：我收到了你的消息：“${request.userText}”`,
      );

      for (let index = 0; index < response.length; index += chunkSize) {
        if (index > 0 && delayMs > 0) {
          await sleep(delayMs);
        }

        yield response.slice(index, index + chunkSize).join('');
      }
    },
  };
}

async function sleep(delayMs: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}
