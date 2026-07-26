import { describe, expect, test, vi } from 'vitest';
import type { ChatService } from './chat-service';
import { ChatServiceError } from './chat-service';
import { parseChatSendRequest, registerChatIpc } from './chat-ipc';

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

  test('attaches the request id to progress events from the service', async () => {
    const service: ChatService = {
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
    const service: ChatService = { send: vi.fn() };
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

  test('does not expose unexpected provider errors to the renderer', async () => {
    const service: ChatService = {
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
});

type Registrar = Parameters<typeof registerChatIpc>[0];
type RegisteredHandler = Parameters<Registrar['handle']>[1];
type HandlerEvent = Parameters<RegisteredHandler>[0];

function registerTestHandler(service: ChatService): { handler: RegisteredHandler } {
  let handler: RegisteredHandler | undefined;
  registerChatIpc(
    {
      handle: (_channel, listener) => {
        handler = listener;
      },
    },
    service,
  );

  if (!handler) {
    throw new Error('Chat IPC handler was not registered');
  }

  return { handler };
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
