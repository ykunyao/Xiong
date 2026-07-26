import type { ChatSendRequest, ChatStreamEvent, SendChatMessageInput } from '../shared/chat';

type ChatIpcListener = (event: unknown, payload: ChatStreamEvent) => void;

export interface ChatIpcRenderer {
  on(channel: string, listener: ChatIpcListener): void;
  removeListener(channel: string, listener: ChatIpcListener): void;
  invoke(channel: string, request: ChatSendRequest): Promise<unknown>;
}

export interface ChatClient {
  sendMessage(
    input: SendChatMessageInput,
    onEvent: (event: ChatStreamEvent) => void,
  ): Promise<void>;
}

export function createChatClient(
  ipcRenderer: ChatIpcRenderer,
  createRequestId: () => string = () => globalThis.crypto.randomUUID(),
): ChatClient {
  return {
    async sendMessage(input, onEvent) {
      const requestId = createRequestId();
      const listener: ChatIpcListener = (_event, streamEvent) => {
        if (streamEvent.requestId !== requestId) {
          return;
        }

        try {
          onEvent(streamEvent);
        } finally {
          if (streamEvent.type === 'complete' || streamEvent.type === 'error') {
            cleanup();
          }
        }
      };
      let listening = false;
      const cleanup = (): void => {
        if (!listening) {
          return;
        }

        listening = false;
        ipcRenderer.removeListener('chat:stream-event', listener);
      };

      ipcRenderer.on('chat:stream-event', listener);
      listening = true;

      try {
        await ipcRenderer.invoke('chat:send-message', { requestId, ...input });
      } finally {
        cleanup();
      }
    },
  };
}
