import type {
  AddMessageInput,
  CreateCharacterInput,
  CreateConversationInput,
  LibraryRepository,
} from '@xiong/db';
import { z } from 'zod';

interface TrustedFrameEvent {
  senderFrame: unknown;
  sender: {
    mainFrame: unknown;
  };
}

interface IpcRegistrar {
  handle(channel: string, listener: (event: TrustedFrameEvent, input?: unknown) => unknown): void;
}

const textField = z.string().trim();

const createCharacterSchema = z.object({
  name: textField.min(1, 'Character name is required'),
  description: textField.optional().default(''),
  personality: textField.optional().default(''),
  scenario: textField.optional().default(''),
  firstMessage: textField.optional().default(''),
});

const createConversationSchema = z.object({
  characterId: textField.min(1, 'Character id is required'),
  title: textField.min(1, 'Conversation title is required'),
});

const addMessageSchema = z.object({
  conversationId: textField.min(1, 'Conversation id is required'),
  role: z.enum(['user', 'assistant', 'system'], {
    error: 'Message role is invalid',
  }),
  content: textField.min(1, 'Message content is required'),
});

export function parseCreateCharacterInput(input: unknown): CreateCharacterInput {
  return parseWithUserMessage(createCharacterSchema, input);
}

export function parseCreateConversationInput(input: unknown): CreateConversationInput {
  return parseWithUserMessage(createConversationSchema, input);
}

export function parseAddMessageInput(input: unknown): AddMessageInput {
  return parseWithUserMessage(addMessageSchema, input);
}

export function registerLibraryIpc(ipcMain: IpcRegistrar, repository: LibraryRepository): void {
  ipcMain.handle('library:list-characters', (event) => {
    assertTrustedFrame(event);
    return repository.listCharacters();
  });

  ipcMain.handle('library:create-character', (event, input) => {
    assertTrustedFrame(event);
    return repository.createCharacter(parseCreateCharacterInput(input));
  });

  ipcMain.handle('library:list-conversations', (event, characterId) => {
    assertTrustedFrame(event);
    return repository.listConversations(parseRequiredId(characterId, 'Character id is required'));
  });

  ipcMain.handle('library:create-conversation', (event, input) => {
    assertTrustedFrame(event);
    return repository.createConversation(parseCreateConversationInput(input));
  });

  ipcMain.handle('library:list-messages', (event, conversationId) => {
    assertTrustedFrame(event);
    return repository.listMessages(parseRequiredId(conversationId, 'Conversation id is required'));
  });

  ipcMain.handle('library:add-message', (event, input) => {
    assertTrustedFrame(event);
    return repository.addMessage(parseAddMessageInput(input));
  });
}

function parseRequiredId(input: unknown, message: string): string {
  return parseWithUserMessage(textField.min(1, message), input);
}

function parseWithUserMessage<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) {
    return result.data;
  }

  throw new Error(result.error.issues[0]?.message ?? 'Invalid input');
}

function assertTrustedFrame(event: TrustedFrameEvent): void {
  if (event.senderFrame !== event.sender.mainFrame) {
    throw new Error('Rejected library IPC call from an untrusted frame.');
  }
}
