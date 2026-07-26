import type { MessageRecord } from '@xiong/db';

export interface SendChatMessageInput {
  conversationId: string;
  content: string;
}

export interface UserMessageEvent {
  type: 'user-message';
  conversationId: string;
  message: MessageRecord;
}

export interface ChatDeltaEvent {
  type: 'delta';
  conversationId: string;
  delta: string;
}

export interface ChatCompleteEvent {
  type: 'complete';
  conversationId: string;
  message: MessageRecord;
}

export type ChatProgressEvent = UserMessageEvent | ChatDeltaEvent | ChatCompleteEvent;

export type ChatStreamEvent =
  | (ChatProgressEvent & { requestId: string })
  | {
      type: 'error';
      requestId: string;
      conversationId: string;
      message: string;
    };

export interface ChatSendRequest extends SendChatMessageInput {
  requestId: string;
}
