import type { ChatProvider, ChatProviderMessage } from '@xiong/core';
import type { LibraryRepository } from '@xiong/db';
import type { ChatProgressEvent, SendChatMessageInput } from '../shared/chat';

export type ChatServiceErrorCode =
  | 'generation-active'
  | 'conversation-not-found'
  | 'character-not-found'
  | 'empty-response';

export class ChatServiceError extends Error {
  constructor(
    readonly code: ChatServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ChatServiceError';
  }
}

export interface ChatService {
  send(input: SendChatMessageInput, emit: (event: ChatProgressEvent) => void): Promise<void>;
}

export interface ChatProviderResolver {
  resolveChatProvider(): Promise<ChatProvider>;
}

export function createChatService(
  repository: LibraryRepository,
  providerResolver: ChatProviderResolver,
): ChatService {
  const activeConversations = new Set<string>();

  return {
    async send(input, emit) {
      if (activeConversations.has(input.conversationId)) {
        throw new ChatServiceError(
          'generation-active',
          'A reply is already being generated for this conversation',
        );
      }

      activeConversations.add(input.conversationId);

      try {
        const conversation = repository.getConversation(input.conversationId);
        if (!conversation) {
          throw new ChatServiceError('conversation-not-found', 'Conversation not found');
        }

        const character = repository.getCharacter(conversation.characterId);
        if (!character) {
          throw new ChatServiceError('character-not-found', 'Character not found');
        }

        const provider = await providerResolver.resolveChatProvider();

        const userMessage = repository.addMessage({
          conversationId: conversation.id,
          role: 'user',
          content: input.content,
        });
        emit({
          type: 'user-message',
          conversationId: conversation.id,
          message: userMessage,
        });

        let assistantContent = '';
        for await (const delta of provider.stream({
          characterName: character.name,
          messages: [
            {
              role: 'system',
              content: createCharacterSystemPrompt(character),
            },
            ...repository.listMessages(conversation.id).flatMap<ChatProviderMessage>((message) => {
              if (message.role === 'user' || message.role === 'assistant') {
                return [{ role: message.role, content: message.content }];
              }
              return [];
            }),
          ],
        })) {
          if (delta.length === 0) {
            continue;
          }

          assistantContent += delta;
          emit({ type: 'delta', conversationId: conversation.id, delta });
        }

        if (assistantContent.length === 0) {
          throw new ChatServiceError('empty-response', 'Provider returned an empty response');
        }

        const assistantMessage = repository.addMessage({
          conversationId: conversation.id,
          role: 'assistant',
          content: assistantContent,
        });
        emit({
          type: 'complete',
          conversationId: conversation.id,
          message: assistantMessage,
        });
      } finally {
        activeConversations.delete(input.conversationId);
      }
    },
  };
}

function createCharacterSystemPrompt(character: {
  name: string;
  description: string;
  personality: string;
  scenario: string;
}): string {
  const lines = [`你正在扮演角色“${character.name}”。`];
  if (character.description.trim()) {
    lines.push(`角色描述：${character.description.trim()}`);
  }
  if (character.personality.trim()) {
    lines.push(`性格：${character.personality.trim()}`);
  }
  if (character.scenario.trim()) {
    lines.push(`场景：${character.scenario.trim()}`);
  }
  lines.push('始终以该角色身份回复用户。');
  return lines.join('\n');
}
