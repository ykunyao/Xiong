import type { CharacterRecord, ConversationRecord, MessageRecord } from '@xiong/db';
import type { FormEvent } from 'react';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import type {
  ActiveProvider,
  ProviderSettingsView,
  SecretStorageStatus,
} from '../../shared/provider-settings';
import {
  appendMessageIfMissing,
  chatActivityReducer,
  initialChatActivityState,
} from './chat-ui-state';

const emptyCharacterForm = {
  name: '',
  description: '',
  firstMessage: '',
};

interface ProviderFormState {
  activeProvider: ActiveProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
  clearApiKey: boolean;
}

const initialProviderForm: ProviderFormState = {
  activeProvider: 'mock',
  baseUrl: 'https://api.openai.com/v1',
  model: '',
  apiKey: '',
  clearApiKey: false,
};

export function App(): React.JSX.Element {
  const [version, setVersion] = useState('0.1.0');
  const [characters, setCharacters] = useState<CharacterRecord[]>([]);
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState('');
  const [selectedConversationId, setSelectedConversationId] = useState('');
  const [characterForm, setCharacterForm] = useState(emptyCharacterForm);
  const [conversationTitle, setConversationTitle] = useState('');
  const [messageDrafts, setMessageDrafts] = useState<Record<string, string>>({});
  const [providerSettings, setProviderSettings] = useState<ProviderSettingsView | null>(null);
  const [providerForm, setProviderForm] = useState<ProviderFormState>(initialProviderForm);
  const [providerSaving, setProviderSaving] = useState(false);
  const [chatActivity, dispatchChatActivity] = useReducer(
    chatActivityReducer,
    initialChatActivityState,
  );
  const [status, setStatus] = useState('准备好创建第一个角色。');
  const selectedConversationIdRef = useRef('');
  const activeSendConversationIdsRef = useRef(new Set<string>());

  const selectedCharacter = useMemo(
    () => characters.find((character) => character.id === selectedCharacterId),
    [characters, selectedCharacterId],
  );
  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId),
    [conversations, selectedConversationId],
  );
  const messageDraft = messageDrafts[selectedConversationId] ?? '';
  const streamingReply = chatActivity.streamingReplies[selectedConversationId] ?? '';
  const isGenerating = chatActivity.generatingConversationIds.includes(selectedConversationId);
  const isOpenAICompatible = providerForm.activeProvider === 'openai-compatible';
  const activeProviderLabel =
    providerSettings?.activeProvider === 'openai-compatible'
      ? providerSettings.openAICompatible.model || 'OpenAI Compatible'
      : 'Mock';

  useEffect(() => {
    void window.xiong.app.getVersion().then(setVersion);
    void refreshCharacters();
    void refreshProviderSettings();
  }, []);

  useEffect(() => {
    if (selectedCharacterId) {
      void refreshConversations(selectedCharacterId);
    }
  }, [selectedCharacterId]);

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversationId;
  }, [selectedConversationId]);

  useEffect(() => {
    if (selectedConversationId) {
      void refreshMessages(selectedConversationId);
    }
  }, [selectedConversationId]);

  async function refreshCharacters(selectId?: string): Promise<void> {
    const nextCharacters = await window.xiong.library.listCharacters();
    setCharacters(nextCharacters);
    setSelectedCharacterId(
      (currentId) =>
        selectId ??
        (nextCharacters.some((character) => character.id === currentId)
          ? currentId
          : (nextCharacters[0]?.id ?? '')),
    );
  }

  async function refreshConversations(characterId: string, selectId?: string): Promise<void> {
    const nextConversations = await window.xiong.library.listConversations(characterId);
    setConversations(nextConversations);
    const currentId = selectedConversationIdRef.current;
    const nextId =
      selectId ??
      (nextConversations.some((conversation) => conversation.id === currentId)
        ? currentId
        : (nextConversations[0]?.id ?? ''));
    selectedConversationIdRef.current = nextId;
    setSelectedConversationId(nextId);
  }

  async function refreshMessages(conversationId: string): Promise<void> {
    const nextMessages = await window.xiong.library.listMessages(conversationId);
    if (selectedConversationIdRef.current === conversationId) {
      setMessages(nextMessages);
    }
  }

  async function refreshProviderSettings(): Promise<void> {
    try {
      const nextSettings = await window.xiong.providers.getSettings();
      setProviderSettings(nextSettings);
      setProviderForm({
        activeProvider: nextSettings.activeProvider,
        baseUrl: nextSettings.openAICompatible.baseUrl,
        model: nextSettings.openAICompatible.model,
        apiKey: '',
        clearApiKey: false,
      });
    } catch (error) {
      setStatus(getErrorMessage(error));
    }
  }

  async function saveProviderSettings(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setProviderSaving(true);

    try {
      const apiKey = providerForm.apiKey.trim();
      const nextSettings = await window.xiong.providers.saveSettings({
        activeProvider: providerForm.activeProvider,
        baseUrl: providerForm.baseUrl,
        model: providerForm.model,
        ...(apiKey ? { apiKey } : {}),
        ...(providerForm.clearApiKey ? { clearApiKey: true } : {}),
      });
      setProviderSettings(nextSettings);
      setProviderForm({
        activeProvider: nextSettings.activeProvider,
        baseUrl: nextSettings.openAICompatible.baseUrl,
        model: nextSettings.openAICompatible.model,
        apiKey: '',
        clearApiKey: false,
      });
      setStatus(
        nextSettings.activeProvider === 'mock'
          ? '已切换到本地 Mock Provider。'
          : `已启用模型：${nextSettings.openAICompatible.model}`,
      );
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setProviderSaving(false);
    }
  }

  async function createCharacter(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    try {
      const character = await window.xiong.library.createCharacter(characterForm);
      setCharacterForm(emptyCharacterForm);
      setConversations([]);
      setMessages([]);
      selectedConversationIdRef.current = '';
      setSelectedConversationId('');
      await refreshCharacters(character.id);
      setStatus(`已创建角色：${character.name}`);
    } catch (error) {
      setStatus(getErrorMessage(error));
    }
  }

  async function createConversation(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedCharacterId) {
      setStatus('请先选择一个角色。');
      return;
    }

    try {
      const conversation = await window.xiong.library.createConversation({
        characterId: selectedCharacterId,
        title: conversationTitle,
      });
      setConversationTitle('');
      setMessages([]);
      await refreshConversations(selectedCharacterId, conversation.id);
      setStatus(`已创建对话：${conversation.title}`);
    } catch (error) {
      setStatus(getErrorMessage(error));
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const conversationId = selectedConversationId;
    const content = messageDraft.trim();

    if (!conversationId) {
      setStatus('请先选择一个对话。');
      return;
    }

    if (!content) {
      setStatus('请输入消息内容。');
      return;
    }

    if (isGenerating || activeSendConversationIdsRef.current.has(conversationId)) {
      setStatus('当前对话正在生成回复，请稍候。');
      return;
    }

    let userMessagePersisted = false;
    activeSendConversationIdsRef.current.add(conversationId);
    dispatchChatActivity({ type: 'start', conversationId });
    setMessageDrafts((current) => ({ ...current, [conversationId]: '' }));
    setStatus('正在保存消息…');

    try {
      await window.xiong.chat.sendMessage({ conversationId, content }, (streamEvent) => {
        if (streamEvent.conversationId !== conversationId) {
          return;
        }

        dispatchChatActivity({ type: 'event', event: streamEvent });

        if (streamEvent.type === 'user-message') {
          userMessagePersisted = true;
          if (selectedConversationIdRef.current === conversationId) {
            setMessages((current) => appendMessageIfMissing(current, streamEvent.message));
          }
          setStatus('消息已保存，正在生成回复…');
          return;
        }

        if (streamEvent.type === 'complete') {
          if (selectedConversationIdRef.current === conversationId) {
            setMessages((current) => appendMessageIfMissing(current, streamEvent.message));
          }
          setStatus('回复已生成并保存。');
          return;
        }

        if (streamEvent.type === 'error') {
          if (!userMessagePersisted) {
            restoreDraft(conversationId, content);
          }
          setStatus(streamEvent.message);
        }
      });
    } catch (error) {
      if (!userMessagePersisted) {
        restoreDraft(conversationId, content);
      }
      setStatus(getErrorMessage(error));
    } finally {
      activeSendConversationIdsRef.current.delete(conversationId);
      dispatchChatActivity({ type: 'finish', conversationId });
    }
  }

  function restoreDraft(conversationId: string, content: string): void {
    setMessageDrafts((current) =>
      current[conversationId]
        ? current
        : {
            ...current,
            [conversationId]: content,
          },
    );
  }

  return (
    <main className="shell" aria-label="Xiong Chat">
      <header className="topbar">
        <div>
          <p className="eyebrow">Phase 3 · Provider Integration</p>
          <h1>Xiong</h1>
        </div>
        <p className="version">v{version}</p>
      </header>

      <section className="provider-settings" aria-labelledby="provider-settings-title">
        <form onSubmit={(event) => void saveProviderSettings(event)}>
          <header className="provider-settings-header">
            <div>
              <p className="eyebrow">Model Provider</p>
              <h2 id="provider-settings-title">模型服务</h2>
              <p>默认使用本地 Mock，也可以接入兼容 OpenAI Chat Completions 的服务。</p>
            </div>
            <span className="provider-badge">当前：{activeProviderLabel}</span>
          </header>

          <div className="provider-grid">
            <label>
              使用方式
              <select
                value={providerForm.activeProvider}
                onChange={(event) =>
                  setProviderForm((current) => ({
                    ...current,
                    activeProvider: event.target.value as ActiveProvider,
                  }))
                }
                disabled={providerSaving || isGenerating}
              >
                <option value="mock">本地 Mock（无需配置）</option>
                <option value="openai-compatible">OpenAI Compatible</option>
              </select>
            </label>

            <label>
              服务地址
              <input
                type="url"
                value={providerForm.baseUrl}
                onChange={(event) =>
                  setProviderForm((current) => ({ ...current, baseUrl: event.target.value }))
                }
                placeholder="https://api.openai.com/v1"
                disabled={!isOpenAICompatible || providerSaving || isGenerating}
                required={isOpenAICompatible}
              />
            </label>

            <label>
              模型 ID
              <input
                value={providerForm.model}
                onChange={(event) =>
                  setProviderForm((current) => ({ ...current, model: event.target.value }))
                }
                placeholder="gpt-4.1-mini"
                disabled={!isOpenAICompatible || providerSaving || isGenerating}
                required={isOpenAICompatible}
              />
            </label>

            <label>
              API Key
              <input
                type="password"
                value={providerForm.apiKey}
                onChange={(event) =>
                  setProviderForm((current) => ({
                    ...current,
                    apiKey: event.target.value,
                    clearApiKey: false,
                  }))
                }
                placeholder={
                  providerSettings?.openAICompatible.hasApiKey
                    ? '已安全保存；留空会继续使用'
                    : '可选，取决于服务要求'
                }
                autoComplete="off"
                disabled={
                  !isOpenAICompatible ||
                  providerSaving ||
                  isGenerating ||
                  providerSettings?.secretStorageStatus !== 'available'
                }
              />
            </label>
          </div>

          <div className="provider-footer">
            <div className="provider-notes">
              <p>{getSecretStorageDescription(providerSettings?.secretStorageStatus)}</p>
              {isOpenAICompatible && (
                <p>发送消息时，角色设定和当前对话历史会传给你填写的第三方服务地址。</p>
              )}
              {isOpenAICompatible && providerSettings?.openAICompatible.hasApiKey && (
                <label className="inline-control">
                  <input
                    type="checkbox"
                    checked={providerForm.clearApiKey}
                    onChange={(event) =>
                      setProviderForm((current) => ({
                        ...current,
                        apiKey: '',
                        clearApiKey: event.target.checked,
                      }))
                    }
                    disabled={providerSaving || isGenerating}
                  />
                  清除已保存的 API Key
                </label>
              )}
            </div>
            <button type="submit" disabled={providerSaving || isGenerating}>
              {providerSaving ? '保存中…' : '保存设置'}
            </button>
          </div>
        </form>
      </section>

      <section className="workspace">
        <Panel title="角色" hint="创建本地角色，稍后会接入角色卡导入。">
          <form className="stack" onSubmit={(event) => void createCharacter(event)}>
            <label>
              名称
              <input
                value={characterForm.name}
                onChange={(event) =>
                  setCharacterForm({ ...characterForm, name: event.target.value })
                }
                placeholder="遥"
              />
            </label>
            <label>
              描述
              <textarea
                value={characterForm.description}
                onChange={(event) =>
                  setCharacterForm({ ...characterForm, description: event.target.value })
                }
                placeholder="这个角色是谁？"
              />
            </label>
            <label>
              First Message
              <textarea
                value={characterForm.firstMessage}
                onChange={(event) =>
                  setCharacterForm({ ...characterForm, firstMessage: event.target.value })
                }
                placeholder="你终于来了。"
              />
            </label>
            <button type="submit">创建角色</button>
          </form>

          <RecordList
            emptyText="还没有角色。"
            records={characters}
            selectedId={selectedCharacterId}
            getTitle={(character) => character.name}
            getSubtitle={(character) =>
              character.description || character.firstMessage || '暂无描述'
            }
            onSelect={(id) => {
              setSelectedCharacterId(id);
              selectedConversationIdRef.current = '';
              setSelectedConversationId('');
              setConversations([]);
              setMessages([]);
            }}
          />
        </Panel>

        <Panel
          title="对话"
          hint={selectedCharacter ? `当前角色：${selectedCharacter.name}` : '先选择一个角色。'}
        >
          <form className="stack" onSubmit={(event) => void createConversation(event)}>
            <label>
              标题
              <input
                value={conversationTitle}
                onChange={(event) => setConversationTitle(event.target.value)}
                placeholder="初次见面"
                disabled={!selectedCharacter}
              />
            </label>
            <button type="submit" disabled={!selectedCharacter}>
              创建对话
            </button>
          </form>

          <RecordList
            emptyText="还没有对话。"
            records={conversations}
            selectedId={selectedConversationId}
            getTitle={(conversation) => conversation.title}
            getSubtitle={(conversation) => new Date(conversation.createdAt).toLocaleString()}
            onSelect={(id) => {
              selectedConversationIdRef.current = id;
              setSelectedConversationId(id);
              setMessages([]);
            }}
          />
        </Panel>

        <Panel
          title="消息"
          hint={
            selectedConversation
              ? `当前对话：${selectedConversation.title} · Provider：${activeProviderLabel}`
              : '先选择一个对话。'
          }
        >
          <div className="messages" aria-live="polite">
            {messages.length === 0
              ? !streamingReply && <p className="empty">还没有消息。发送一句话开始聊天。</p>
              : messages.map((message) => (
                  <article className={`message ${message.role}`} key={message.id}>
                    <strong>{message.role}</strong>
                    <MessageContent content={message.content} />
                  </article>
                ))}
            {streamingReply && (
              <article className="message assistant streaming" aria-label="正在生成回复">
                <strong>assistant · streaming</strong>
                <div className="message-content">
                  <Markdown rehypePlugins={[rehypeSanitize]}>{streamingReply}</Markdown>
                  <span className="streaming-cursor" aria-hidden="true">
                    ▍
                  </span>
                </div>
              </article>
            )}
          </div>

          <form className="composer" onSubmit={(event) => void sendMessage(event)}>
            <textarea
              value={messageDraft}
              onChange={(event) =>
                setMessageDrafts((current) => ({
                  ...current,
                  [selectedConversationId]: event.target.value,
                }))
              }
              placeholder="输入消息，回复会流式显示。"
              disabled={!selectedConversation || isGenerating}
            />
            <button
              type="submit"
              disabled={!selectedConversation || isGenerating || !messageDraft.trim()}
            >
              {isGenerating ? '生成中…' : '发送'}
            </button>
          </form>
        </Panel>
      </section>

      <p className="status" role="status">
        {status}
      </p>
    </main>
  );
}

function MessageContent({ content }: { content: string }): React.JSX.Element {
  return (
    <div className="message-content">
      <Markdown rehypePlugins={[rehypeSanitize]}>{content}</Markdown>
    </div>
  );
}

interface PanelProps {
  title: string;
  hint: string;
  children: React.ReactNode;
}

function Panel({ title, hint, children }: PanelProps): React.JSX.Element {
  return (
    <section className="panel">
      <header>
        <h2>{title}</h2>
        <p>{hint}</p>
      </header>
      {children}
    </section>
  );
}

interface RecordWithId {
  id: string;
}

interface RecordListProps<TRecord extends RecordWithId> {
  emptyText: string;
  records: TRecord[];
  selectedId: string;
  getTitle(record: TRecord): string;
  getSubtitle(record: TRecord): string;
  onSelect(id: string): void;
}

function RecordList<TRecord extends RecordWithId>({
  emptyText,
  records,
  selectedId,
  getTitle,
  getSubtitle,
  onSelect,
}: RecordListProps<TRecord>): React.JSX.Element {
  if (records.length === 0) {
    return <p className="empty">{emptyText}</p>;
  }

  return (
    <div className="record-list">
      {records.map((record) => (
        <button
          className={record.id === selectedId ? 'record selected' : 'record'}
          key={record.id}
          type="button"
          onClick={() => onSelect(record.id)}
        >
          <span>{getTitle(record)}</span>
          <small>{getSubtitle(record)}</small>
        </button>
      ))}
    </div>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请稍后重试。';
}

function getSecretStorageDescription(status: SecretStorageStatus | undefined): string {
  switch (status) {
    case 'available':
      return 'API Key 会使用系统安全存储加密，页面不会回显已保存的 Key。';
    case 'insecure':
      return '当前系统密钥后端不安全，因此不会保存 API Key；仍可连接无需 Key 的本地服务。';
    case 'unavailable':
      return '系统安全存储不可用，因此不会保存 API Key；仍可连接无需 Key 的本地服务。';
    default:
      return '正在检查系统安全存储…';
  }
}
