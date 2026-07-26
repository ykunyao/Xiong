import { contextBridge, ipcRenderer } from 'electron';
import type { ProviderSettingsView, SaveProviderSettingsInput } from '../shared/provider-settings';
import { createChatClient } from './chat-client';

const chatClient = createChatClient({
  on: (channel, listener) => {
    ipcRenderer.on(channel, listener);
  },
  removeListener: (channel, listener) => {
    ipcRenderer.removeListener(channel, listener);
  },
  invoke: async (channel, request) => ipcRenderer.invoke(channel, request),
});

const xiongApi = Object.freeze({
  app: Object.freeze({
    getVersion: async (): Promise<string> => ipcRenderer.invoke('app:get-version'),
  }),
  library: Object.freeze({
    listCharacters: async () => ipcRenderer.invoke('library:list-characters'),
    createCharacter: async (input: unknown) =>
      ipcRenderer.invoke('library:create-character', input),
    listConversations: async (characterId: string) =>
      ipcRenderer.invoke('library:list-conversations', characterId),
    createConversation: async (input: unknown) =>
      ipcRenderer.invoke('library:create-conversation', input),
    listMessages: async (conversationId: string) =>
      ipcRenderer.invoke('library:list-messages', conversationId),
  }),
  providers: Object.freeze({
    getSettings: async (): Promise<ProviderSettingsView> =>
      ipcRenderer.invoke('provider:get-settings'),
    saveSettings: async (input: SaveProviderSettingsInput): Promise<ProviderSettingsView> =>
      ipcRenderer.invoke('provider:save-settings', input),
  }),
  chat: Object.freeze(chatClient),
});

contextBridge.exposeInMainWorld('xiong', xiongApi);
