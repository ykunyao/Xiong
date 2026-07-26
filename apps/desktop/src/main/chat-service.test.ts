import type { ChatProvider } from '@xiong/core';
import type {
  CharacterRecord,
  ConversationRecord,
  LibraryRepository,
  MessageRecord,
} from '@xiong/db';
import { describe, expect, test } from 'vitest';
import type { ChatProgressEvent } from '../shared/chat';
import { createChatService } from './chat-service';

const character: CharacterRecord = {
  id: 'character-1',
  name: '遥',
  description: '温柔的旅伴。',
  personality: '有点嘴硬。',
  scenario: '夜晚的旅店。',
  firstMessage: '',
  createdAt: 1,
  updatedAt: 1,
};

const conversation: ConversationRecord = {
  id: 'conversation-1',
  characterId: character.id,
  title: '初次见面',
  createdAt: 1,
  updatedAt: 1,
};

describe('chat service', () => {
  test('persists the user before streaming and the assistant after completion', async () => {
    const { repository, messages } = createFakeRepository();
    const events: ChatProgressEvent[] = [];
    const provider: ChatProvider = {
      async *stream(request) {
        expect(request).toEqual({
          characterName: '遥',
          messages: [
            {
              role: 'system',
              content: [
                '你正在扮演角色“遥”。',
                '角色描述：温柔的旅伴。',
                '性格：有点嘴硬。',
                '场景：夜晚的旅店。',
                '始终以该角色身份回复用户。',
              ].join('\n'),
            },
            { role: 'user', content: '你好' },
          ],
        });
        expect(messages.map((message) => message.role)).toEqual(['user']);
        yield '遥：';
        yield '你好。';
      },
    };

    await createChatService(repository, createResolver(provider)).send(
      { conversationId: conversation.id, content: '你好' },
      (event) => events.push(event),
    );

    expect(messages.map(({ role, content }) => ({ role, content }))).toEqual([
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '遥：你好。' },
    ]);
    expect(events.map((event) => event.type)).toEqual([
      'user-message',
      'delta',
      'delta',
      'complete',
    ]);
    expect(events[1]).toEqual({
      type: 'delta',
      conversationId: conversation.id,
      delta: '遥：',
    });
    expect(events[3]).toMatchObject({
      type: 'complete',
      conversationId: conversation.id,
      message: { role: 'assistant', content: '遥：你好。' },
    });
  });

  test('keeps the user but does not persist a partial assistant reply after provider failure', async () => {
    const { repository, messages } = createFakeRepository();
    const events: ChatProgressEvent[] = [];
    const provider: ChatProvider = {
      async *stream() {
        yield 'partial';
        throw new Error('provider exploded');
      },
    };

    await expect(
      createChatService(repository, createResolver(provider)).send(
        { conversationId: conversation.id, content: '你好' },
        (event) => events.push(event),
      ),
    ).rejects.toThrow('provider exploded');

    expect(messages).toHaveLength(1);
    expect(messages[0]?.role).toBe('user');
    expect(events.map((event) => event.type)).toEqual(['user-message', 'delta']);
  });

  test('rejects a missing conversation before persisting a user message', async () => {
    const { repository, messages } = createFakeRepository({ includeConversation: false });
    const provider: ChatProvider = {
      async *stream() {
        yield 'unused';
      },
    };

    await expect(
      createChatService(repository, createResolver(provider)).send(
        { conversationId: conversation.id, content: '你好' },
        () => undefined,
      ),
    ).rejects.toThrow('Conversation not found');
    expect(messages).toHaveLength(0);
  });

  test('rejects a second generation for the same conversation before saving it', async () => {
    const { repository, messages } = createFakeRepository();
    const streamStarted = createDeferred<void>();
    const releaseStream = createDeferred<void>();
    const provider: ChatProvider = {
      async *stream() {
        streamStarted.resolve();
        await releaseStream.promise;
        yield '完成';
      },
    };
    const service = createChatService(repository, createResolver(provider));

    const firstSend = service.send(
      { conversationId: conversation.id, content: '第一条' },
      () => undefined,
    );
    await streamStarted.promise;

    await expect(
      service.send({ conversationId: conversation.id, content: '第二条' }, () => undefined),
    ).rejects.toThrow('A reply is already being generated for this conversation');
    expect(messages).toHaveLength(1);

    releaseStream.resolve();
    await firstSend;
  });

  test('resolves the provider before persisting a user message', async () => {
    const { repository, messages } = createFakeRepository();
    const service = createChatService(repository, {
      resolveChatProvider: async () => {
        throw new Error('provider is not configured');
      },
    });

    await expect(
      service.send({ conversationId: conversation.id, content: '你好' }, () => undefined),
    ).rejects.toThrow('provider is not configured');
    expect(messages).toHaveLength(0);
  });

  test('passes ordered persisted history including the latest user message', async () => {
    const { repository } = createFakeRepository({
      initialMessages: [
        { role: 'user', content: '第一条' },
        { role: 'assistant', content: '第一条回复' },
      ],
    });
    const provider: ChatProvider = {
      async *stream(request) {
        expect(request.messages.slice(1)).toEqual([
          { role: 'user', content: '第一条' },
          { role: 'assistant', content: '第一条回复' },
          { role: 'user', content: '第二条' },
        ]);
        yield '第二条回复';
      },
    };

    await createChatService(repository, createResolver(provider)).send(
      { conversationId: conversation.id, content: '第二条' },
      () => undefined,
    );
  });
});

interface FakeRepositoryOptions {
  includeConversation?: boolean;
  initialMessages?: Array<Pick<MessageRecord, 'role' | 'content'>>;
}

function createFakeRepository(options: FakeRepositoryOptions = {}): {
  repository: LibraryRepository;
  messages: MessageRecord[];
} {
  const messages: MessageRecord[] = (options.initialMessages ?? []).map((message, index) => ({
    id: `message-${index + 1}`,
    conversationId: conversation.id,
    role: message.role,
    content: message.content,
    createdAt: index + 1,
    updatedAt: index + 1,
  }));
  const includeConversation = options.includeConversation ?? true;

  return {
    messages,
    repository: {
      listCharacters: () => [character],
      getCharacter: (id) => (id === character.id ? character : undefined),
      createCharacter: () => character,
      listConversations: () => (includeConversation ? [conversation] : []),
      getConversation: (id) =>
        includeConversation && id === conversation.id ? conversation : undefined,
      createConversation: () => conversation,
      listMessages: () => messages,
      addMessage: (input) => {
        const message: MessageRecord = {
          id: `message-${messages.length + 1}`,
          conversationId: input.conversationId,
          role: input.role,
          content: input.content,
          createdAt: messages.length + 1,
          updatedAt: messages.length + 1,
        };
        messages.push(message);
        return message;
      },
    },
  };
}

function createResolver(provider: ChatProvider) {
  return {
    resolveChatProvider: async () => provider,
  };
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function createDeferred<T>(): Deferred<T> {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: (value) => resolvePromise?.(value),
  };
}
