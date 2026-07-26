import type { MessageRecord } from '@xiong/db';
import type { ChatStreamEvent } from '../../shared/chat';

export interface ChatActivityState {
  generatingConversationIds: string[];
  streamingReplies: Record<string, string>;
}

export type ChatActivityAction =
  | { type: 'start'; conversationId: string }
  | { type: 'event'; event: ChatStreamEvent }
  | { type: 'finish'; conversationId: string };

export const initialChatActivityState: ChatActivityState = {
  generatingConversationIds: [],
  streamingReplies: {},
};

export function chatActivityReducer(
  state: ChatActivityState,
  action: ChatActivityAction,
): ChatActivityState {
  if (action.type === 'start') {
    return {
      generatingConversationIds: state.generatingConversationIds.includes(action.conversationId)
        ? state.generatingConversationIds
        : [...state.generatingConversationIds, action.conversationId],
      streamingReplies: withoutConversation(state.streamingReplies, action.conversationId),
    };
  }

  if (action.type === 'finish') {
    return finishConversation(state, action.conversationId);
  }

  const { event } = action;
  if (event.type === 'delta') {
    return {
      ...state,
      streamingReplies: {
        ...state.streamingReplies,
        [event.conversationId]: (state.streamingReplies[event.conversationId] ?? '') + event.delta,
      },
    };
  }

  if (event.type === 'complete' || event.type === 'error' || event.type === 'cancelled') {
    return finishConversation(state, event.conversationId);
  }

  return state;
}

export function appendMessageIfMissing(
  messages: MessageRecord[],
  message: MessageRecord,
): MessageRecord[] {
  return messages.some((current) => current.id === message.id) ? messages : [...messages, message];
}

function finishConversation(state: ChatActivityState, conversationId: string): ChatActivityState {
  return {
    generatingConversationIds: state.generatingConversationIds.filter(
      (current) => current !== conversationId,
    ),
    streamingReplies: withoutConversation(state.streamingReplies, conversationId),
  };
}

function withoutConversation(
  replies: Record<string, string>,
  conversationId: string,
): Record<string, string> {
  const nextReplies = { ...replies };
  delete nextReplies[conversationId];
  return nextReplies;
}
