import type { ChatProvider } from '@xiong/core';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText, type ModelMessage } from 'ai';

export interface OpenAICompatibleChatProviderConfig {
  baseUrl: string;
  apiKey?: string;
  model: string;
}

export interface OpenAICompatibleChatProviderDependencies {
  fetch?: typeof globalThis.fetch;
}

export function createOpenAICompatibleChatProvider(
  config: OpenAICompatibleChatProviderConfig,
  dependencies: OpenAICompatibleChatProviderDependencies = {},
): ChatProvider {
  const provider = createOpenAICompatible({
    name: 'xiongOpenAICompatible',
    baseURL: config.baseUrl,
    includeUsage: true,
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    ...(dependencies.fetch ? { fetch: dependencies.fetch } : {}),
  });

  return {
    async *stream(request, streamOptions = {}) {
      const instructions = request.messages
        .filter((message) => message.role === 'system')
        .map((message) => message.content)
        .join('\n\n');
      const result = streamText({
        model: provider.chatModel(config.model),
        ...(streamOptions.signal ? { abortSignal: streamOptions.signal } : {}),
        ...(instructions ? { instructions } : {}),
        messages: request.messages
          .filter((message) => message.role !== 'system')
          .map<ModelMessage>((message) => {
            switch (message.role) {
              case 'user':
                return { role: 'user', content: message.content };
              case 'assistant':
                return { role: 'assistant', content: message.content };
              case 'system':
                throw new Error('System messages must be converted to instructions');
            }
          }),
      });

      for await (const delta of result.textStream) {
        yield delta;
      }
    },
  };
}
