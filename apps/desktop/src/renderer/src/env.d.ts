export {};

import type {
  CharacterRecord,
  ConversationRecord,
  CreateCharacterInput,
  CreateConversationInput,
  MessageRecord,
} from '@xiong/db';
import type { ChatStreamEvent, SendChatMessageInput } from '../../shared/chat';
import type {
  ProviderSettingsView,
  SaveProviderSettingsInput,
} from '../../shared/provider-settings';

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
      };
      providers: {
        getSettings(): Promise<ProviderSettingsView>;
        saveSettings(input: SaveProviderSettingsInput): Promise<ProviderSettingsView>;
      };
      chat: {
        cancelGeneration(conversationId: string): Promise<boolean>;
        sendMessage(
          input: SendChatMessageInput,
          onEvent: (event: ChatStreamEvent) => void,
        ): Promise<void>;
      };
    };
  }
}
