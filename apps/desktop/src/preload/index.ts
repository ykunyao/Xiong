import { contextBridge, ipcRenderer } from 'electron';

const xiongApi = Object.freeze({
  app: Object.freeze({
    getVersion: async (): Promise<string> => ipcRenderer.invoke('app:get-version'),
  }),
  library: Object.freeze({
    listCharacters: async () => ipcRenderer.invoke('library:list-characters'),
    createCharacter: async (input: unknown) => ipcRenderer.invoke('library:create-character', input),
    listConversations: async (characterId: string) =>
      ipcRenderer.invoke('library:list-conversations', characterId),
    createConversation: async (input: unknown) => ipcRenderer.invoke('library:create-conversation', input),
    listMessages: async (conversationId: string) => ipcRenderer.invoke('library:list-messages', conversationId),
    addMessage: async (input: unknown) => ipcRenderer.invoke('library:add-message', input),
  }),
});

contextBridge.exposeInMainWorld('xiong', xiongApi);
