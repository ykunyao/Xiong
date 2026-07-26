import { describe, expect, test, vi } from 'vitest';
import type { ChatService } from './chat-service';
import { ChatServiceError } from './chat-service';
import { parseCancelChatGenerationInput, parseChatSendRequest, registerChatIpc } from './chat-ipc';
import { ProviderSettingsError } from './provider-settings-service';

describe('chat ipc', () => {
  test('trims and validates a chat request', () => {
    expect(
      parseChatSendRequest({
        requestId: ' request-1 ',
        conversationId: ' conversation-1 ',
        content: ' 你好 ',
      }),
    ).toEqual({
      requestId: 'request-1',
      conversationId: 'conversation-1',
      content: '你好',
    });
  });

  test.each([
    [
      { requestId: '', conversationId: 'conversation-1', content: '你好' },
      'Request id is required',
    ],
    [
      { requestId: 'request-1', conversationId: '', content: '你好' },
      'Conversation id is required',
    ],
    [
      { requestId: 'request-1', conversationId: 'conversation-1', content: '   ' },
      'Message content is required',
    ],
  ])('rejects invalid request %#', (input, message) => {
    expect(() => parseChatSendRequest(input)).toThrow(message);
  });

  test('trims and validates a cancellation request', () => {
    expect(parseCancelChatGenerationInput({ conversationId: ' conversation-1 ' })).toEqual({
      conversationId: 'conversation-1',
    });
    expect(() => parseCancelChatGenerationInput({ conversationId: '   ' })).toThrow(
      'Conversation id is required',
    );
  });

  test('attaches the request id to progress events from the service', async () => {
    const service: ChatService = {
      cancel: () => false,
      send: async (input, emit) => {
        emit({ type: 'delta', conversationId: input.conversationId, delta: '遥：' });
      },
    };
    const { handler } = registerTestHandler(service);
    const { event, send } = createTrustedEvent();

    await handler(event, {
      requestId: 'request-1',
      conversationId: 'conversation-1',
      content: '你好',
    });

    expect(send).toHaveBeenCalledWith('chat:stream-event', {
      requestId: 'request-1',
      type: 'delta',
      conversationId: 'conversation-1',
      delta: '遥：',
    });
  });

  test('rejects calls from a non-main frame', async () => {
    const service: ChatService = { cancel: vi.fn(), send: vi.fn() };
    const { handler } = registerTestHandler(service);
    const { event } = createTrustedEvent();
    event.senderFrame = {};

    await expect(
      handler(event, {
        requestId: 'request-1',
        conversationId: 'conversation-1',
        content: '你好',
      }),
    ).rejects.toThrow('Rejected chat IPC call from an untrusted frame');
    expect(service.send).not.toHaveBeenCalled();
  });

  test('maps expected service errors to safe user-facing events', async () => {
    const service: ChatService = {
      cancel: () => false,
      send: async () => {
        throw new ChatServiceError(
          'generation-active',
          'A reply is already being generated for this conversation',
        );
      },
    };
    const { handler } = registerTestHandler(service);
    const { event, send } = createTrustedEvent();

    await handler(event, {
      requestId: 'request-1',
      conversationId: 'conversation-1',
      content: '你好',
    });

    expect(send).toHaveBeenCalledWith('chat:stream-event', {
      requestId: 'request-1',
      type: 'error',
      conversationId: 'conversation-1',
      message: '当前对话正在生成回复，请稍候。',
    });
  });

  test('maps request timeouts to a distinct safe user-facing event', async () => {
    const service: ChatService = {
      cancel: () => false,
      send: async () => {
        throw new ChatServiceError('request-timeout', 'internal timeout detail');
      },
    };
    const { handler } = registerTestHandler(service);
    const { event, send } = createTrustedEvent();

    await handler(event, {
      requestId: 'request-1',
      conversationId: 'conversation-1',
      content: '你好',
    });

    expect(send).toHaveBeenCalledWith('chat:stream-event', {
      requestId: 'request-1',
      type: 'error',
      conversationId: 'conversation-1',
      message: '模型服务请求超时，未保存未完成的回复，请重试。',
    });
  });

  test('does not expose unexpected provider errors to the renderer', async () => {
    const service: ChatService = {
      cancel: () => false,
      send: async () => {
        throw new Error('secret provider details');
      },
    };
    const { handler } = registerTestHandler(service);
    const { event, send } = createTrustedEvent();

    await handler(event, {
      requestId: 'request-1',
      conversationId: 'conversation-1',
      content: '你好',
    });

    expect(send).toHaveBeenCalledWith('chat:stream-event', {
      requestId: 'request-1',
      type: 'error',
      conversationId: 'conversation-1',
      message: '回复生成失败，请重试。',
    });
  });

  test('maps provider configuration errors to actionable safe messages', async () => {
    const service: ChatService = {
      cancel: () => false,
      send: async () => {
        throw new ProviderSettingsError('secret-decryption-failed', 'sensitive decryption details');
      },
    };
    const { handler } = registerTestHandler(service);
    const { event, send } = createTrustedEvent();

    await handler(event, {
      requestId: 'request-1',
      conversationId: 'conversation-1',
      content: '你好',
    });

    expect(send).toHaveBeenCalledWith('chat:stream-event', {
      requestId: 'request-1',
      type: 'error',
      conversationId: 'conversation-1',
      message: '无法读取已保存的 API Key，请重新保存 Provider 设置。',
    });
  });

  test('routes a trusted cancellation request to the chat service', async () => {
    const cancel = vi.fn(() => true);
    const service: ChatService = { cancel, send: vi.fn() };
    const { cancelHandler } = registerTestHandler(service);
    const { event } = createTrustedEvent();

    expect(cancelHandler(event, { conversationId: ' conversation-1 ' })).toBe(true);
    expect(cancel).toHaveBeenCalledWith('conversation-1');
  });
});

type Registrar = Parameters<typeof registerChatIpc>[0];
type RegisteredHandler = Parameters<Registrar['handle']>[1];
type HandlerEvent = Parameters<RegisteredHandler>[0];

function registerTestHandler(service: ChatService): {
  handler: RegisteredHandler;
  cancelHandler: RegisteredHandler;
} {
  const handlers = new Map<string, RegisteredHandler>();
  registerChatIpc(
    {
      handle: (channel, listener) => {
        handlers.set(channel, listener);
      },
    },
    service,
  );

  const handler = handlers.get('chat:send-message');
  const cancelHandler = handlers.get('chat:cancel-generation');
  if (!handler || !cancelHandler) {
    throw new Error('Chat IPC handlers were not registered');
  }

  return { handler, cancelHandler };
}

function createTrustedEvent(): {
  event: HandlerEvent;
  send: ReturnType<typeof vi.fn>;
} {
  const mainFrame = {};
  const send = vi.fn();
  return {
    event: {
      senderFrame: mainFrame,
      sender: { mainFrame, send },
    },
    send,
  };
}
