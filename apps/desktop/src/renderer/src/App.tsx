import type { CharacterRecord, ConversationRecord, MessageRecord, MessageRole } from '@xiong/db';
import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';

const emptyCharacterForm = {
  name: '',
  description: '',
  firstMessage: '',
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
  const [messageRole, setMessageRole] = useState<MessageRole>('user');
  const [messageContent, setMessageContent] = useState('');
  const [status, setStatus] = useState('准备好创建第一个角色。');

  const selectedCharacter = useMemo(
    () => characters.find((character) => character.id === selectedCharacterId),
    [characters, selectedCharacterId],
  );
  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId),
    [conversations, selectedConversationId],
  );

  useEffect(() => {
    void window.xiong.app.getVersion().then(setVersion);
    void refreshCharacters();
  }, []);

  useEffect(() => {
    if (!selectedCharacterId) {
      setConversations([]);
      setSelectedConversationId('');
      return;
    }

    void refreshConversations(selectedCharacterId);
  }, [selectedCharacterId]);

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      return;
    }

    void refreshMessages(selectedConversationId);
  }, [selectedConversationId]);

  async function refreshCharacters(selectId?: string): Promise<void> {
    const nextCharacters = await window.xiong.library.listCharacters();
    setCharacters(nextCharacters);
    setSelectedCharacterId((currentId) => selectId ?? currentId ?? nextCharacters[0]?.id ?? '');
  }

  async function refreshConversations(characterId: string, selectId?: string): Promise<void> {
    const nextConversations = await window.xiong.library.listConversations(characterId);
    setConversations(nextConversations);
    setSelectedConversationId((currentId) => selectId ?? currentId ?? nextConversations[0]?.id ?? '');
  }

  async function refreshMessages(conversationId: string): Promise<void> {
    setMessages(await window.xiong.library.listMessages(conversationId));
  }

  async function createCharacter(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    try {
      const character = await window.xiong.library.createCharacter(characterForm);
      setCharacterForm(emptyCharacterForm);
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
      await refreshConversations(selectedCharacterId, conversation.id);
      setStatus(`已创建对话：${conversation.title}`);
    } catch (error) {
      setStatus(getErrorMessage(error));
    }
  }

  async function addMessage(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedConversationId) {
      setStatus('请先选择一个对话。');
      return;
    }

    try {
      const message = await window.xiong.library.addMessage({
        conversationId: selectedConversationId,
        role: messageRole,
        content: messageContent,
      });
      setMessageContent('');
      await refreshMessages(selectedConversationId);
      setStatus(`已添加 ${message.role} 消息。`);
    } catch (error) {
      setStatus(getErrorMessage(error));
    }
  }

  return (
    <main className="shell" aria-label="Xiong Phase 1">
      <header className="topbar">
        <div>
          <p className="eyebrow">Phase 1 · Persistent Library</p>
          <h1>Xiong</h1>
        </div>
        <p className="version">v{version}</p>
      </header>

      <section className="workspace">
        <Panel title="角色" hint="创建本地角色，稍后会接入角色卡导入。">
          <form className="stack" onSubmit={(event) => void createCharacter(event)}>
            <label>
              名称
              <input
                value={characterForm.name}
                onChange={(event) => setCharacterForm({ ...characterForm, name: event.target.value })}
                placeholder="遥"
              />
            </label>
            <label>
              描述
              <textarea
                value={characterForm.description}
                onChange={(event) => setCharacterForm({ ...characterForm, description: event.target.value })}
                placeholder="这个角色是谁？"
              />
            </label>
            <label>
              First Message
              <textarea
                value={characterForm.firstMessage}
                onChange={(event) => setCharacterForm({ ...characterForm, firstMessage: event.target.value })}
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
            getSubtitle={(character) => character.description || character.firstMessage || '暂无描述'}
            onSelect={setSelectedCharacterId}
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
            onSelect={setSelectedConversationId}
          />
        </Panel>

        <Panel
          title="消息"
          hint={selectedConversation ? `当前对话：${selectedConversation.title}` : '先选择一个对话。'}
        >
          <div className="messages" aria-live="polite">
            {messages.length === 0 ? (
              <p className="empty">还没有消息。先写一条本地消息试试。</p>
            ) : (
              messages.map((message) => (
                <article className={`message ${message.role}`} key={message.id}>
                  <strong>{message.role}</strong>
                  <p>{message.content}</p>
                </article>
              ))
            )}
          </div>

          <form className="composer" onSubmit={(event) => void addMessage(event)}>
            <select
              value={messageRole}
              onChange={(event) => setMessageRole(event.target.value as MessageRole)}
              disabled={!selectedConversation}
            >
              <option value="user">user</option>
              <option value="assistant">assistant</option>
              <option value="system">system</option>
            </select>
            <textarea
              value={messageContent}
              onChange={(event) => setMessageContent(event.target.value)}
              placeholder="写一条本地消息，验证保存链路。"
              disabled={!selectedConversation}
            />
            <button type="submit" disabled={!selectedConversation}>
              添加消息
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
