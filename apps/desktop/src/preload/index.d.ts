export {};

import type {
  AddMessageInput,
  CharacterRecord,
  ConversationRecord,
  CreateCharacterInput,
  CreateConversationInput,
  MessageRecord,
} from '@xiong/db';

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
    };
  }
}
