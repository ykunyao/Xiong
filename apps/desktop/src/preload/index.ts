import { contextBridge, ipcRenderer } from 'electron';

const xiongApi = Object.freeze({
  app: Object.freeze({
    getVersion: async (): Promise<string> => ipcRenderer.invoke('app:get-version'),
  }),
});

contextBridge.exposeInMainWorld('xiong', xiongApi);
