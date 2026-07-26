import { z } from 'zod';
import type { CancelChatGenerationInput, ChatSendRequest, ChatStreamEvent } from '../shared/chat';
import { ChatServiceError, type ChatService } from './chat-service';
import { ProviderSettingsError } from './provider-settings-service';

interface ChatIpcEvent {
  senderFrame: unknown;
  sender: {
    mainFrame: unknown;
    send(channel: string, payload: ChatStreamEvent): void;
  };
}

interface ChatIpcRegistrar {
  handle(channel: string, listener: (event: ChatIpcEvent, input?: unknown) => unknown): void;
}

const textField = z.string().trim();
const chatSendRequestSchema = z.object({
  requestId: textField.min(1, 'Request id is required'),
  conversationId: textField.min(1, 'Conversation id is required'),
  content: textField.min(1, 'Message content is required'),
});
const cancelChatGenerationSchema = z.object({
  conversationId: textField
    .min(1, 'Conversation id is required')
    .max(128, 'Conversation id is too long'),
});

export function parseChatSendRequest(input: unknown): ChatSendRequest {
  const result = chatSendRequestSchema.safeParse(input);
  if (result.success) {
    return result.data;
  }

  throw new Error(result.error.issues[0]?.message ?? 'Invalid chat request');
}

export function parseCancelChatGenerationInput(input: unknown): CancelChatGenerationInput {
  const result = cancelChatGenerationSchema.safeParse(input);
  if (result.success) {
    return result.data;
  }

  throw new Error(result.error.issues[0]?.message ?? 'Invalid cancellation request');
}

export function registerChatIpc(ipcMain: ChatIpcRegistrar, service: ChatService): void {
  ipcMain.handle('chat:send-message', async (event, input) => {
    assertTrustedFrame(event);
    const request = parseChatSendRequest(input);

    try {
      await service.send(request, (progress) => {
        const streamEvent: ChatStreamEvent = { requestId: request.requestId, ...progress };
        event.sender.send('chat:stream-event', streamEvent);
      });
    } catch (error) {
      event.sender.send('chat:stream-event', {
        type: 'error',
        requestId: request.requestId,
        conversationId: request.conversationId,
        message: getUserFacingError(error),
      });
    }
  });

  ipcMain.handle('chat:cancel-generation', (event, input) => {
    assertTrustedFrame(event);
    const request = parseCancelChatGenerationInput(input);
    return service.cancel(request.conversationId);
  });
}

function assertTrustedFrame(event: ChatIpcEvent): void {
  if (event.senderFrame !== event.sender.mainFrame) {
    throw new Error('Rejected chat IPC call from an untrusted frame');
  }
}

function getUserFacingError(error: unknown): string {
  if (error instanceof ProviderSettingsError) {
    switch (error.code) {
      case 'invalid-base-url':
      case 'model-required':
      case 'provider-not-configured':
        return '当前 OpenAI Compatible Provider 配置不完整，请先检查设置。';
      case 'secret-storage-unavailable':
      case 'secret-storage-insecure':
        return '系统安全存储当前不可用，无法读取 Provider API Key。';
      case 'secret-decryption-failed':
        return '无法读取已保存的 API Key，请重新保存 Provider 设置。';
    }
  }

  if (!(error instanceof ChatServiceError)) {
    return '回复生成失败，请重试。';
  }

  switch (error.code) {
    case 'generation-active':
      return '当前对话正在生成回复，请稍候。';
    case 'conversation-not-found':
      return '找不到当前对话。';
    case 'character-not-found':
      return '找不到当前角色。';
    case 'empty-response':
      return '没有生成回复，请重试。';
  }
}
