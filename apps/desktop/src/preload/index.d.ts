export {};

import type {
  AddMessageInput,
  CharacterRecord,
  ConversationRecord,
  CreateCharacterInput,
  CreateConversationInput,
  MessageRecord,
} from '@xiong/db';
import type { ChatStreamEvent, SendChatMessageInput } from '../shared/chat';

declare global {
  interface Window {
    xiong: {
      app: {
        getVersion(): Promise<string>;
      };
      library: {
        listCharacters(): Promise<CharacterRecord[]>;
        createCharacter(input: CreateCharacterInput): Promise<CharacterRecord>;
        listConversations(characterId: string): Promise<ConversationRecord[]>;
        createConversation(input: CreateConversationInput): Promise<ConversationRecord>;
        listMessages(conversationId: string): Promise<MessageRecord[]>;
        addMessage(input: AddMessageInput): Promise<MessageRecord>;
      };
      chat: {
        sendMessage(
          input: SendChatMessageInput,
          onEvent: (event: ChatStreamEvent) => void,
        ): Promise<void>;
      };
    };
  }
}
