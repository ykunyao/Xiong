import { ChatProviderTimeoutError, type ChatProvider } from '@xiong/core';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText, type ModelMessage } from 'ai';
import { defaultOpenAICompatibleGenerationParams } from '../shared/provider-settings';

export interface OpenAICompatibleChatProviderConfig {
  baseUrl: string;
  apiKey?: string;
  model: string;
  temperature?: number;
  maxOutputTokens?: number;
  requestTimeoutMs?: number;
}

export interface OpenAICompatibleChatProviderDependencies {
  fetch?: typeof globalThis.fetch;
}

export function createOpenAICompatibleChatProvider(
  config: OpenAICompatibleChatProviderConfig,
  dependencies: OpenAICompatibleChatProviderDependencies = {},
): ChatProvider {
  const temperature = config.temperature ?? defaultOpenAICompatibleGenerationParams.temperature;
  const maxOutputTokens =
    config.maxOutputTokens ?? defaultOpenAICompatibleGenerationParams.maxOutputTokens;
  const requestTimeoutMs =
    config.requestTimeoutMs ?? defaultOpenAICompatibleGenerationParams.requestTimeoutMs;
  const provider = createOpenAICompatible({
    name: 'xiongOpenAICompatible',
    baseURL: config.baseUrl,
    includeUsage: true,
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    ...(dependencies.fetch ? { fetch: dependencies.fetch } : {}),
  });

  return {
    async *stream(request, streamOptions = {}) {
      const timeoutSignal = AbortSignal.timeout(requestTimeoutMs);
      const combinedSignal = streamOptions.signal
        ? AbortSignal.any([streamOptions.signal, timeoutSignal])
        : timeoutSignal;
      let sdkAborted = false;
      const instructions = request.messages
        .filter((message) => message.role === 'system')
        .map((message) => message.content)
        .join('\n\n');
      const result = streamText({
        model: provider.chatModel(config.model),
        abortSignal: combinedSignal,
        temperature,
        maxOutputTokens,
        onAbort: () => {
          sdkAborted = true;
        },
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

      try {
        for await (const delta of result.textStream) {
          yield delta;
        }
      } catch (error) {
        throw classifyStreamError(error, combinedSignal, timeoutSignal, streamOptions.signal);
      }

      if (sdkAborted) {
        throw classifyStreamError(
          combinedSignal.reason,
          combinedSignal,
          timeoutSignal,
          streamOptions.signal,
        );
      }
    },
  };
}

function classifyStreamError(
  error: unknown,
  combinedSignal: AbortSignal,
  timeoutSignal: AbortSignal,
  userSignal: AbortSignal | undefined,
): unknown {
  if (
    combinedSignal.aborted &&
    timeoutSignal.aborted &&
    combinedSignal.reason === timeoutSignal.reason
  ) {
    return new ChatProviderTimeoutError('The provider request timed out', { cause: error });
  }

  if (userSignal?.aborted) {
    return userSignal.reason;
  }

  return error;
}
