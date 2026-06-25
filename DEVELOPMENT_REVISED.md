# Xiong 开发文档 v1.2

> **项目名称**：Xiong  
> **文档版本**：v1.2  
> **最后更新**：2026-06-26  
> **状态**：MVP 优先架构设计阶段  
> **基于版本**：v1.0 DEVELOPMENT.md  

---

## 0. 本版修改摘要

v1.2 的核心目标是：**进一步收紧 P0，自研真正构成产品差异的部分，其余优先复用成熟开源能力。**

主要调整如下：

1. **P0 Monorepo 从近十个包收缩到三个核心包**
   - `core`：角色卡标准化、Prompt、Lorebook、Chat 编排；
   - `db`：Drizzle schema、迁移和领域数据访问；
   - `ui`：可选独立；初期也可直接放在桌面应用内。
   - 模块先通过目录边界隔离，出现真实复用需求后再拆包。

2. **Provider 层优先复用 Vercel AI SDK**
   - 不自行维护通用 SSE 解析、重试、超时和各厂商流事件兼容；
   - 项目只保留薄 Adapter 和自己的领域事件；
   - Prompt Engine、模型参数校验和产品行为仍由本项目控制。

3. **角色卡改为“外部格式 + 内部标准模型”**
   - v2、v3 原始格式分别定义和校验；
   - 导入后统一转换为 `NormalizedCharacter`；
   - 使用 Zod 做运行时验证，不让业务层直接依赖社区格式。

4. **修正 Prompt 与消息分支语义**
   - First Message 在创建对话时写成真实 assistant message，不在每次请求中固定注入；
   - 编辑和重新生成创建新节点，不覆盖或删除旧分支；
   - 明确 `chatHistory` 不包含本次 `latestUserMessage`。

5. **P0 取消通用 Task Queue**
   - 只维护聊天任务注册表和 `AbortController`；
   - 出现并发控制、优先级、后台任务等真实需求后再引入 `p-queue` 或单独任务模块。

6. **收紧 Electron 能力边界**
   - Preload 只暴露业务级 API，不暴露任意文件读写和通用 HTTP 代理；
   - 增加 IPC sender 校验、CSP、导航限制、外链白名单和 Markdown 清洗。

7. **补充数据可靠性与 Windows CI**
   - 增加 WAL、事务、外键、迁移前备份、完整性检查和恢复策略；
   - 流式消息节流落盘；
   - Windows runner 验证 Electron 与 `better-sqlite3` 原生模块打包。

---

## 1. 项目概述

### 1.1 项目定位

Xiong 是一个类 SillyTavern 的 AI 角色扮演聊天应用，面向个人用户、本地优先、可扩展、可导入社区角色卡。

它的核心体验是：

- 导入 / 创建角色卡；
- 配置 AI Provider；
- 创建角色对话；
- 通过角色设定、世界书、作者注、聊天历史组装 Prompt；
- 获得稳定、可控、可调试的 AI 角色扮演体验。

### 1.2 第一阶段目标

P0 阶段只追求一个目标：

> **做出一个体验完整、可长期使用的桌面版 AI 酒馆。**

P0 不追求五端覆盖，不追求插件生态，不追求所有 Provider，不追求云同步。

### 1.3 长期目标

长期上，Xiong 希望具备：

- 兼容 SillyTavern 角色卡 v2/v3；
- 支持世界书 / Lorebook；
- 支持 OpenAI Compatible、Anthropic、Gemini、OpenRouter、Ollama；
- 支持插件系统；
- 支持多角色对话；
- 支持长期记忆；
- 支持本地优先的数据导入导出；
- 后续支持 Android / iOS；
- 核心逻辑保留迁移到 Rust Core 的可能性。

### 1.4 非目标

#### P0 非目标

- 不做移动端；
- 不做云同步；
- 不做多人联机；
- 不做插件市场；
- 不做完整插件沙箱；
- 不做 TTS；
- 不做图片生成；
- 不做模型训练 / 微调；
- 不做内容审核平台；
- 不做应用商店分发。

#### 长期也不主动做的事情

- 不托管用户聊天内容；
- 不强制绑定云账号；
- 不试图替代模型 Provider；
- 不内置绕过第三方服务限制的逻辑。

---

## 2. 技术栈选型

### 2.1 P0 技术栈

| 层级 | 技术 | 版本 | 用途 |
|---|---|---:|---|
| 语言 | TypeScript | 5.x | 全项目主语言 |
| UI | React | 19.x | 桌面端 UI |
| 状态管理 | Zustand | 5.x | 客户端状态 |
| 异步数据 | TanStack Query | 5.x | 查询、缓存、异步状态 |
| 样式 | TailwindCSS + shadcn/ui | 锁定到 package.json | UI 样式和组件基础 |
| Markdown | react-markdown + remark-gfm + rehype-sanitize | 锁定到 package.json | 安全消息渲染 |
| 数据库 | SQLite | 3.x | 本地持久化 |
| ORM | Drizzle ORM | 锁定到 package.json | 类型安全 SQL和迁移 |
| 桌面壳 | Electron | 选择开发时受支持稳定版 | Windows/macOS/Linux |
| SQLite Driver | better-sqlite3 | 与 Electron ABI 锁定 | Electron 主进程数据库访问 |
| AI SDK | Vercel AI SDK | 锁定到 package.json | Provider、流式事件、取消、超时、重试 |
| Schema | Zod | 锁定到 package.json | 角色卡、IPC、配置运行时校验 |
| 构建 | Vite + electron-vite | 锁定到 package.json | 开发和构建 |
| 包管理 | pnpm workspace | 选择开发时稳定版 | Monorepo |
| 测试 | Vitest + Playwright | 锁定到 package.json | 单测和 E2E |
| 代码质量 | ESLint + Prettier | 锁定到 package.json | 规范化 |

版本管理原则：

- 不在设计文档中使用不可复现的 `latest`；
- `package.json` 使用明确的兼容版本范围，`pnpm-lock.yaml` 提交到仓库；
- 使用 Renovate 或 Dependabot 创建依赖升级 PR；
- Electron、Node、`better-sqlite3` 升级必须经过 Windows 打包测试。

### 2.2 P1 / P2 预留技术

| 功能 | 候选技术 | 阶段 |
|---|---|---|
| 移动端 | Capacitor | P2 |
| 插件沙箱 | 独立进程 / QuickJS 等受控运行时 | P1/P2 |
| Tokenizer | tiktoken / gpt-tokenizer / 近似估算 | P0 起 |
| 本地模型 | Ollama / llama.cpp | P1/P2 |
| 向量存储 | sqlite-vec / libsql vector / 自定义表 | P2 |
| TTS | Edge TTS / Kokoro / 系统 TTS | P2 |
| 后台任务并发 | p-queue | 出现真实并发需求后 |

### 2.3 暂不选择的方案

| 方案 | 暂不选择原因 |
|---|---|
| Tauri | 移动端和 WebView 一致性问题会增加早期调试成本 |
| Flutter | UI 体验好，但 AI/角色卡/JS 插件生态与项目目标不完全匹配 |
| React Native | 桌面端不是主场，会导致 UI 和架构分叉 |
| Prisma | Electron 打包和 engine 进程增加复杂度 |
| IndexedDB | 对大量本地数据、搜索、迁移、导入导出不如 SQLite 直接 |
| Rust Core | 长期可考虑，但 P0 用 Rust 会降低迭代速度 |

### 2.4 开源复用边界

项目不以“所有模块自研”为目标。判断原则是：

> **产品差异和兼容规则自行掌控；协议解析、通用基础设施和安全能力优先复用。**

| 领域 | P0 策略 | 说明 |
|---|---|---|
| Prompt Engine | 自研 | 是产品核心，必须可调试、可测试、可复现 |
| Lorebook 激活规则 | 自研并对照 SillyTavern 行为 | 需要明确兼容范围和差异 |
| 角色卡业务标准化 | 自研 | 外部 v2/v3 格式转换为内部模型 |
| 角色卡 Schema | 采用 Zod；参考公开规范和测试样本 | 不凭印象定义字段 |
| PNG 底层 chunk 处理 | 评估成熟库后复用 | 只自行处理角色卡 payload 规则 |
| Provider 流处理 | 优先 Vercel AI SDK | 避免重复实现 SSE、重试、超时和厂商差异 |
| 任务并发 | P0 不抽象；需要时使用 p-queue | 不提前建设通用调度系统 |
| Markdown | react-markdown + rehype-sanitize | 用户和角色卡内容一律视为不可信 |
| 数据迁移 | Drizzle migrations | 不自建迁移框架 |
| UI 基础组件 | shadcn/ui | 产品交互和视觉设计仍由项目控制 |

借鉴开源项目时必须记录：

- 借鉴的行为、格式或测试样本；
- 对方许可证及本项目的使用方式；
- 是“参考行为”还是“复制代码”；
- 与 SillyTavern 不兼容的地方必须写入兼容性文档。

SillyTavern 使用 AGPL-3.0。除非本项目选择兼容许可证，否则默认只参考公开格式、产品行为和测试思路，不直接复制其实现代码。

---

## 3. 总体架构

### 3.1 架构原则

#### 原则一：MVP 优先

先做出一个能用、好用、能长期演进的桌面版。

第一版不追求所有方向同时正确，而是优先保证：

- 聊天稳定；
- Prompt 可控；
- 数据不丢；
- 角色卡导入准确；
- 代码结构足够清晰。

#### 原则二：核心逻辑与平台能力分离

核心逻辑不直接依赖 Electron、Node、DOM、Capacitor。

平台能力通过 Adapter 注入。

```ts
export interface PlatformAdapters {
  database: DatabaseClient;
  fileSystem: FileSystemAdapter;
  secretStore: SecretStore;
  httpClient: HttpClient;
  chatTasks: ChatTaskRegistry;
}
```

#### 原则三：Prompt Engine 是一等模块

类酒馆项目的复杂度主要不在 UI，而在 Prompt。

因此必须把 Prompt 组装拆成独立模块，提供：

- 可测试；
- 可调试；
- 可视化；
- 可快照；
- 可被插件 Hook。

#### 原则四：流式接口事件化

Provider 不直接返回纯文本 chunk，而是返回统一的 `StreamEvent`。

这样后续可以兼容：

- reasoning；
- tool call；
- usage；
- safety block；
- error；
- finish reason。

#### 原则五：插件只能返回 Patch

插件不应该直接修改核心对象。

插件只能返回结构化 Patch，核心层负责合并和校验。

这样可以避免插件直接破坏角色卡、消息树、世界书和 Prompt。

---

## 4. Monorepo 目录结构

### 4.1 推荐结构

```txt
ai-tavern/
├── apps/
│   └── desktop/                         # P0：Electron 桌面端
│       ├── src/
│       │   ├── main/                    # Electron、数据库、AI 请求
│       │   ├── preload/                 # 受限的业务级 contextBridge
│       │   ├── renderer/                # React UI；P0 可先放这里
│       │   └── platform/                # 桌面端 adapter 实现
│       ├── electron.vite.config.ts
│       ├── electron-builder.yml
│       └── package.json
│
├── packages/
│   ├── core/                             # 纯领域逻辑，零 Electron/DOM 依赖
│   │   └── src/
│   │       ├── character-card/           # v2/v3 校验、标准化
│   │       ├── lorebook/                 # 激活规则和预算
│   │       ├── prompt/                   # 组装、裁剪和调试
│   │       ├── chat/                     # 对话用例和消息树
│   │       ├── provider/                 # 薄 Adapter、领域事件、Mock
│   │       └── shared/                   # Result、错误、公共类型
│   │
│   ├── db/                               # Drizzle schema、迁移、数据访问
│   │   └── src/
│   │       ├── schema/
│   │       ├── queries/
│   │       └── migrations/
│   │
│   └── ui/                               # 可选；需要跨平台复用时再拆出
│       └── src/
│           ├── app/
│           ├── features/
│           ├── shared/
│           └── styles/
│
├── docs/
│   ├── DEVELOPMENT.md
│   ├── CHARACTER_CARD_COMPATIBILITY.md
│   ├── PROMPT_ENGINE.md
│   └── adr/
│
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── package.json
├── pnpm-lock.yaml
├── .github/workflows/ci.yml
└── README.md
```

### 4.2 依赖关系

```txt
apps/desktop
  ├─ packages/core
  ├─ packages/db
  ├─ packages/ui（可选）
  └─ platform adapters

packages/ui（如果拆出）
  └─ packages/core 的公开应用层 API

packages/db
  └─ packages/core 定义的领域数据访问契约

packages/core
  └─ 不依赖 Electron、DOM 或具体 SQLite driver
```

### 4.3 关键约束

- P0 先通过目录和公开导出建立边界，不为每个概念建立独立 package。
- `core` 不依赖 UI、Electron、DOM 或具体 SQLite driver。
- Prompt、Lorebook、Character Card、Chat 在 `core` 内部保持清晰的单向依赖。
- Chat 用例不直接拼 SQL，只调用面向用例的数据访问接口。
- UI 不直接调用 Provider SDK，只调用应用层 actions/hooks。
- `apps/desktop` 负责平台能力注入。
- 只有出现独立版本、跨应用复用或明显构建边界时，才把 `core` 子目录拆成 package。

---

## 5. 核心类型设计

### 5.1 Result 类型

```ts
export type Result<T, E = AppError> =
  | { ok: true; data: T }
  | { ok: false; error: E };

export interface AppError {
  code: string;
  message: string;
  cause?: unknown;
  recoverable?: boolean;
}
```

核心模块之间尽量返回 `Result`，避免用 `throw` 做业务控制流。

### 5.2 ChatMessage

```ts
export interface ChatMessage {
  id: string;
  chatId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  status: 'streaming' | 'complete' | 'cancelled' | 'error';
  tokenCount?: number;
  parentId?: string | null;
  metadata?: MessageMetadata;
  createdAt: number;
  updatedAt?: number;
}

export interface MessageMetadata {
  providerId?: string;
  model?: string;
  finishReason?: string;
  usage?: TokenUsage;
  promptSnapshotId?: string;
  isEdited?: boolean;
}
```

### 5.3 Character Card 外部格式与内部模型

```ts
export interface CharacterCardV2Raw {
  spec: 'chara_card_v2';
  spec_version: '2.0';
  data: {
    name: string;
    description: string;
    personality: string;
    scenario: string;
    first_mes: string;
    mes_example: string;
    creator_notes: string;
    system_prompt: string;
    post_history_instructions: string;
    alternate_greetings: string[];
    tags: string[];
    creator: string;
    character_version: string;
    extensions: Record<string, unknown>;
  };
}

export interface CharacterCardV3Raw {
  spec: 'chara_card_v3';
  spec_version: '3.0';
  data: CharacterCardV3Data;
}

export interface NormalizedCharacter {
  id: string;
  name: string;
  description: string;
  personality: string;
  scenario: string;
  firstMessage: string;
  messageExamples: string;
  systemPrompt?: string;
  postHistoryInstructions?: string;
  alternateGreetings: string[];
  tags: string[];
  creator?: string;
  characterVersion?: string;
  assets: CharacterAsset[];
  source: {
    format: 'v2' | 'v3' | 'legacy' | 'native';
    rawExtensions: Record<string, unknown>;
  };
}
```

原则：

- `CharacterCardV2Raw`、`CharacterCardV3Raw` 只存在于导入导出边界；
- 所有外部输入先经过 Zod Schema 验证；
- 核心业务、数据库和 UI 使用 `NormalizedCharacter`；
- 未识别扩展字段应尽可能原样保留，避免重新导出时静默丢失；
- 兼容性测试使用合法的公开样本和项目自建 fixture。

---

## 6. 角色卡模块

### 6.1 职责

`character-card` 负责：

- 从 PNG 解析 SillyTavern 角色卡；
- 从 JSON 解析角色卡；
- 分别验证 v2/v3 原始格式；
- 转换为内部 `NormalizedCharacter`；
- 导出 PNG / JSON；
- 在明确规则下做兼容处理；
- 保留未知扩展字段。

### 6.2 接口

```ts
export interface CharacterCardService {
  importPng(data: Uint8Array): Promise<Result<ImportedCharacter>>;
  importJson(json: string): Result<ImportedCharacter>;
  normalize(card: CharacterCardV2Raw | CharacterCardV3Raw): Result<NormalizedCharacter>;
  exportJson(character: NormalizedCharacter, target: 'v2' | 'v3'): Result<string>;
}
```

PNG 的 CRC、chunk 提取和编码优先评估成熟库；项目只负责识别角色卡 chunk、解码 payload、Schema 校验和格式转换。

### 6.3 P0 验收标准

- 能导入常见 SillyTavern v2 PNG；
- 能导入 JSON 角色卡；
- 能显示角色名、头像、描述、开场白；
- 能编辑并保存角色字段；
- 能重新导出 JSON；
- PNG 写回可放到 P1。

---

## 7. Prompt Engine

### 7.1 职责

`prompt-engine` 是项目核心模块之一，负责把角色、世界书、作者注、聊天历史、用户输入组装成最终发送给模型的 Prompt。

它需要同时满足：

- 可预测；
- 可测试；
- 可调试；
- 可快照；
- 可扩展；
- 可被插件系统 Hook。

### 7.2 Prompt 组件

```ts
export interface PromptComponents {
  systemPrompt: string;
  characterDefinition: string;
  scenario: string;
  messageExamples: PromptMessage[];
  lorebookBeforeChar: string[];
  lorebookAfterChar: string[];
  lorebookBeforeAuthorNote: string[];
  lorebookAfterAuthorNote: string[];
  authorNote?: string;
  chatHistory: PromptMessage[];
  postHistoryInstructions?: string;
  latestUserMessage: PromptMessage;
}
```

`chatHistory` 明确不包含本次 `latestUserMessage`。Prompt Engine 必须在开发环境和测试中校验两者 ID 不重复。

角色卡 First Message 不作为固定 Prompt 组件。创建新对话时，将选中的首条问候写成一条真实的 assistant message；后续由正常聊天历史和上下文裁剪规则处理。

### 7.3 ResolvedPrompt

```ts
export interface ResolvedPrompt {
  messages: PromptMessage[];
  tokenCount: number;
  maxContextTokens: number;
  reservedForResponse: number;
  components: PromptComponents;
  debug: PromptDebugInfo;
}

export interface PromptDebugInfo {
  sections: PromptSectionDebug[];
  droppedMessages: ChatMessage[];
  activatedLorebookEntries: string[];
  warnings: PromptWarning[];
}

export interface PromptSectionDebug {
  id: string;
  name: string;
  tokenCount: number;
  contentPreview: string;
}
```

### 7.4 Prompt 组装顺序

```txt
1. Global System Prompt
2. Character System Prompt
3. Lorebook before_char
4. Character Definition
5. Lorebook after_char
6. Scenario
7. Lorebook before_author_note
8. Author Note
9. Lorebook after_author_note
10. Message Examples
11. Chat History
12. Lorebook at_depth entries
13. Post History Instructions
14. Latest User Message
```

### 7.5 Token 预算策略

P0 采用简单稳定策略：

1. 计算固定部分 token：system、character、scenario、world info、author note；
2. 给回复预留 `reservedForResponse`；
3. 剩余 token 给聊天历史；
4. 从最新消息向前保留；
5. 超出部分丢弃；
6. 在 Prompt Debugger 中显示被丢弃的消息。

```ts
export interface ContextBudgetConfig {
  maxContextTokens: number;
  reservedForResponse: number;
  maxLorebookTokens: number;
  maxExampleTokens: number;
}
```

P2 再加入摘要记忆和向量检索。

### 7.6 Prompt 快照测试

Prompt Engine 必须写快照测试。

测试场景至少包括：

- First Message 只作为首条 assistant 历史消息出现；
- `latestUserMessage` 不与历史重复；
- 无世界书普通对话；
- 有 system prompt 的角色卡；
- 有 mes_example 的角色卡；
- 世界书命中；
- 世界书超预算；
- 聊天历史超上下文；
- 编辑消息后重新生成；
- 多 Provider 消息格式转换。

---

## 8. Chat Engine

### 8.1 职责

`chat-engine` 管理对话状态和一次完整聊天流程。

它不负责 UI，不直接访问 SQLite，不直接拼 Prompt。

它负责协调：

- Message Repository；
- Prompt Engine；
- AI Provider；
- Task Queue；
- StreamEvent；
- 消息树。

### 8.2 接口

```ts
export interface ChatEngine {
  sendMessage(input: SendMessageInput): AsyncIterable<ChatRuntimeEvent>;
  regenerate(input: RegenerateInput): AsyncIterable<ChatRuntimeEvent>;
  editAndRegenerate(input: EditAndRegenerateInput): AsyncIterable<ChatRuntimeEvent>;
  stop(taskId: string): Promise<void>;
  buildPrompt(chatId: string): Promise<Result<ResolvedPrompt>>;
}
```

### 8.3 ChatRuntimeEvent

```ts
export type ChatRuntimeEvent =
  | { type: 'task_started'; taskId: string }
  | { type: 'prompt_built'; prompt: ResolvedPrompt }
  | { type: 'assistant_message_created'; messageId: string }
  | { type: 'delta'; messageId: string; text: string }
  | { type: 'usage'; usage: TokenUsage }
  | { type: 'finished'; messageId: string; finishReason?: string }
  | { type: 'cancelled'; taskId: string }
  | { type: 'error'; error: AppError };
```

### 8.4 消息树

消息编辑和重新生成不能简单覆盖历史。

推荐使用不可变消息节点和 `parentId` 表示分支。

P0 先实现：

- 编辑某条消息时创建新节点，不覆盖原节点；
- 重新生成时创建同一父节点下的新 assistant 节点；
- `chats.currentLeafMessageId` 指向当前展示分支；
- 默认删除只做软删除或解除当前分支引用；
- 旧分支保留，UI 可以暂时只显示当前分支。

`branchIndex` 不作为权威状态持久化；需要显示“第几个回复”时，可按同父节点的创建时间或显式排序字段计算。

P1 再做完整分支切换 UI。

---

## 9. AI Provider

### 9.1 Provider 策略

P0 优先使用 Vercel AI SDK 处理 OpenAI Compatible 请求、流式响应、取消、超时和重试。本项目不重复实现通用 SSE parser。

项目保留薄 Adapter，用于：

- 把内部 Prompt 转换为 SDK 模型消息；
- 统一模型参数和 Provider 配置；
- 把 SDK 流事件转换为领域事件；
- 记录 Prompt 快照、usage 和错误；
- 在 SDK 不支持某个 Provider 特性时保留可替换边界。

### 9.2 Provider 接口

```ts
export interface AIProvider {
  id: string;
  name: string;
  capabilities: ProviderCapabilities;

  chat(request: ChatRequest, signal?: AbortSignal): AsyncIterable<StreamEvent>;
  listModels(): Promise<Result<ModelInfo[]>>;
  validateConfig(config: ProviderConfig): Promise<Result<boolean>>;
  normalizeMessages(messages: PromptMessage[]): Result<ProviderMessage[]>;
  estimateTokens?(text: string, model?: string): number;
}
```

实现约束：

- P0 的 OpenAI Compatible Adapter 优先封装 AI SDK；
- `MockProvider` 保持项目自有实现，确保测试完全可控；
- 不直接把第三方 SDK 类型泄漏到 UI、数据库或 Prompt Engine；
- Provider 未知原始事件可放入受控的 `raw` 调试字段，但不能成为业务依赖。

### 9.3 ProviderCapabilities

```ts
export interface ProviderCapabilities {
  streaming: boolean;
  vision: boolean;
  toolCall: boolean;
  reasoning: boolean;
  jsonMode: boolean;
  systemPromptMode: 'message' | 'top_level' | 'unsupported';
  maxContextTokensByModel?: Record<string, number>;
}
```

### 9.4 StreamEvent

```ts
export type StreamEvent =
  | { type: 'start'; providerId: string; model: string }
  | { type: 'text_delta'; text: string }
  | { type: 'reasoning_delta'; text: string }
  | { type: 'tool_call_delta'; toolCall: unknown }
  | { type: 'usage'; usage: TokenUsage }
  | { type: 'finish'; reason?: string };
```

错误语义：

- Provider 网络错误和协议错误由流抛出 `ProviderError`；
- `StreamEvent` 不再包含 `error` 分支，避免“既可能抛异常又可能返回错误事件”的双重语义；
- Chat Engine 捕获异常后统一转换为 `ChatRuntimeEvent.error`；
- 用户取消转换为 `cancelled`，不显示为普通错误。

### 9.5 P0 Provider 范围

P0 只实现：

1. OpenAI Compatible；
2. Mock Provider。

OpenAI Compatible 覆盖：

- OpenAI；
- OpenRouter；
- DeepSeek；
- 硅基流动；
- Ollama OpenAI-compatible endpoint；
- 其他自定义 base URL。

Anthropic、Gemini 放到 P1。

### 9.6 API Key 存储

不要直接把 API Key 明文写入 SQLite。

桌面端优先：

- Windows：Credential Manager / Electron safeStorage；
- macOS：Keychain / Electron safeStorage；
- Linux：Secret Service；如果 Electron safeStorage 退化为 `basic_text`，必须警告用户，不得宣称密钥已安全加密。

优先使用 Electron safeStorage 异步 API，并检测加密能力和后端状态。

数据库只保存：

```ts
export interface ProviderConfigRecord {
  id: string;
  type: string;
  name: string;
  baseUrl?: string;
  apiKeyRef?: string;
  defaultModel?: string;
  params?: Record<string, unknown>;
}
```

---

## 10. Lorebook 世界书

### 10.1 P0 范围

P0 世界书只做基础能力：

- 创建 / 编辑 / 删除世界书；
- 创建 / 编辑 / 删除条目；
- 关键词匹配；
- 常驻条目；
- token 预算；
- position：`before_char` / `after_char` / `at_depth`。

P1 再做：

- 递归扫描；
- secondary keys；
- 更细粒度 position；
- 批量导入导出；
- 和 SillyTavern 世界书格式更完整兼容。

### 10.2 匹配接口

```ts
export interface LorebookEngine {
  resolve(input: ResolveLorebookInput): Promise<Result<LorebookActivation[]>>;
}

export interface ResolveLorebookInput {
  lorebooks: Lorebook[];
  messages: ChatMessage[];
  character: NormalizedCharacter;
  scanDepth: number;
  tokenBudget: number;
}
```

### 10.3 匹配流程

```txt
1. 取最近 scanDepth 条消息作为扫描文本
2. 加入 constant=true 的条目
3. 对 enabled 条目做关键词匹配
4. 计算 token
5. 根据 insertionOrder 排序
6. 根据 tokenBudget 裁剪
7. 按 position 返回
```

---

## 11. 领域数据访问层

### 11.1 为什么需要薄的数据访问边界

业务代码不应该直接写：

```ts
db.select().from(messages).where(...)
```

而应该依赖：

```ts
messageRepository.listByChat(chatId)
```

这样 Chat 用例不必理解表结构，也便于事务测试和未来数据迁移。

但这里不建设一套通用 Repository 框架：

- 不为每张表机械生成完整 CRUD；
- 不重复包装 Drizzle 已经提供的查询能力；
- 只为真实业务用例提供稳定接口；
- 简单设置读写可以直接放在 `db` 包的 query service 中；
- 云同步若进入范围，应单独设计同步协议，而不是假设替换 Repository 就能自动实现。

### 11.2 用例导向接口

```ts
export interface Repositories {
  characters: CharacterRepository;
  chats: ChatRepository;
  messages: MessageRepository;
  lorebooks: LorebookRepository;
  providers: ProviderRepository;
  settings: SettingsRepository;
  promptSnapshots: PromptSnapshotRepository;
}
```

```ts
export interface MessageRepository {
  listByChat(chatId: string, options?: MessageListOptions): Promise<ChatMessage[]>;
  get(id: string): Promise<ChatMessage | null>;
  create(input: NewMessage): Promise<ChatMessage>;
  update(id: string, patch: Partial<ChatMessage>): Promise<ChatMessage>;
  delete(id: string): Promise<void>;
  listBranch(chatId: string, leafMessageId?: string): Promise<ChatMessage[]>;
}
```

涉及“创建用户消息、创建流式 assistant 消息、更新当前叶节点”的操作必须由一个数据库事务完成，不能依赖多个松散 Repository 调用自行保持一致。

---

## 12. 数据库设计

### 12.1 表结构总览

```txt
meta
settings
providers
characters
chats
messages
lorebooks
lorebook_entries
prompt_snapshots
plugins              # P1/P2
plugin_settings      # P1/P2
```

### 12.2 meta 表

```ts
export const meta = sqliteTable('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
```

建议初始化：

| key | value |
|---|---|
| schema_version | 1 |
| app_version | 0.1.0 |
| created_at | timestamp |
| last_migrated_at | timestamp |

### 12.3 characters

```ts
export const characters = sqliteTable('characters', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  cardData: text('card_data', { mode: 'json' }).notNull(),
  avatarFileName: text('avatar_file_name'),
  source: text('source'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
```

### 12.4 chats

```ts
export const chats = sqliteTable('chats', {
  id: text('id').primaryKey(),
  characterId: text('character_id').references(() => characters.id),
  title: text('title'),
  currentLeafMessageId: text('current_leaf_message_id'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
```

### 12.5 messages

```ts
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  chatId: text('chat_id').notNull().references(() => chats.id),
  parentId: text('parent_id'),
  role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
  content: text('content').notNull(),
  status: text('status', {
    enum: ['streaming', 'complete', 'cancelled', 'error'],
  }).notNull(),
  deletedAt: integer('deleted_at'),
  tokenCount: integer('token_count'),
  metadata: text('metadata', { mode: 'json' }),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at'),
});
```

头像 P0 统一保存为应用数据目录中的受管文件，数据库只保存受控文件名。不要同时维护路径和 Blob 两套权威来源。

### 12.6 prompt_snapshots

Prompt 快照用于调试和复现。

```ts
export const promptSnapshots = sqliteTable('prompt_snapshots', {
  id: text('id').primaryKey(),
  chatId: text('chat_id').notNull().references(() => chats.id),
  messageId: text('message_id'),
  providerId: text('provider_id'),
  model: text('model'),
  prompt: text('prompt', { mode: 'json' }).notNull(),
  tokenCount: integer('token_count'),
  createdAt: integer('created_at').notNull(),
});
```

### 12.7 providers

```ts
export const providers = sqliteTable('providers', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  name: text('name').notNull(),
  baseUrl: text('base_url'),
  apiKeyRef: text('api_key_ref'),
  defaultModel: text('default_model'),
  params: text('params', { mode: 'json' }),
  isActive: integer('is_active', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
```

### 12.8 索引建议

```ts
// messages
index('idx_messages_chat_created').on(messages.chatId, messages.createdAt);
index('idx_messages_parent').on(messages.parentId);

// chats
index('idx_chats_character_updated').on(chats.characterId, chats.updatedAt);

// lorebook_entries
index('idx_lorebook_entries_lorebook').on(lorebookEntries.lorebookId);
```

### 12.9 数据可靠性

数据库初始化和迁移必须满足：

- 启用 `PRAGMA foreign_keys = ON`；
- 使用 WAL 模式，并在应用关闭和备份时正确 checkpoint；
- 关键写入使用事务；
- 迁移前创建可恢复备份；
- 迁移后运行 schema/version 校验，发布构建加入 `integrity_check`；
- 迁移失败时保留原数据库并进入只读恢复流程，不继续带病写入；
- 外键明确 `ON DELETE` 行为，不依赖 SQLite 默认值；
- 流式消息在内存中实时更新，按时间或字符数节流批量写入，结束时强制 flush，禁止每个 token 写一次 SQLite。

Prompt 快照默认关闭或仅保留最近 N 条，并提供自动清理和一键清空。快照可能包含完整敏感对话，不应无限期增长。

---

## 13. P0 聊天任务管理

### 13.1 P0 不建设通用任务队列

P0 的真实需求只有：

- 发送消息；
- 重新生成；
- 停止生成；
- 同一聊天避免重复提交。

因此只实现轻量注册表：

```ts
export interface ChatTaskRegistry {
  start(chatId: string): Result<{ taskId: string; signal: AbortSignal }>;
  cancel(taskId: string): boolean;
  finish(taskId: string): void;
  getByChat(chatId: string): ActiveChatTask | null;
}
```

内部可使用 `Map<TaskId, AbortController>`。重试和超时优先使用 AI SDK 能力。

当 P1/P2 真正出现 TTS、Embedding、图片生成、优先级、并发限制或持久化后台任务时，再评估：

- `p-queue`：进程内并发和优先级；
- 独立 worker/utility process：CPU 密集任务；
- 持久化任务表：需要应用重启后恢复的任务。

---

## 14. UI 设计

### 14.1 目录组织

UI 按 feature 组织，而不是按组件类型组织。

```txt
packages/ui/src/
├── app/
│   ├── App.tsx
│   ├── providers.tsx
│   └── router.tsx
│
├── features/
│   ├── chat/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── store/
│   │   └── index.ts
│   ├── character/
│   ├── lorebook/
│   ├── providers/
│   ├── settings/
│   └── prompt-debugger/
│
├── shared/
│   ├── components/
│   ├── hooks/
│   ├── utils/
│   └── icons/
│
└── styles/
```

### 14.2 P0 页面

P0 只做这些页面：

1. 欢迎 / 初始化页；
2. Provider 设置页；
3. 角色列表；
4. 角色导入页；
5. 角色编辑页；
6. 聊天页；
7. Prompt Debugger；
8. 通用设置页。

### 14.3 Prompt Debugger

Prompt Debugger 是 P0 重要功能，不是锦上添花。

它至少显示：

- 当前最终发送 messages；
- 每个 Prompt section 的 token 数；
- 世界书命中条目；
- 被裁剪的历史消息；
- Provider 消息格式转换结果；
- 一键复制最终 Prompt。

这会极大提升开发和用户调参体验。

### 14.4 Markdown 安全

聊天消息、角色卡字段、世界书内容和插件输出一律视为不可信输入。

- 使用 `react-markdown + remark-gfm + rehype-sanitize`；
- P0 不开启任意原始 HTML；
- 外链点击交给 Main Process 校验协议后再用系统浏览器打开；
- 禁止消息内容触发 `javascript:`、本地文件访问、内联事件或任意 iframe；
- 如果未来支持受限 HTML，必须使用明确 allowlist，并增加 XSS fixture 测试。

---

## 15. 插件系统

### 15.1 阶段安排

插件系统不进入 P0。

P0 只做：

- 内部事件定义；
- Prompt Patch 类型；
- 插件 API 草案；
- 不加载第三方插件。

P1 做：

- 桌面端实验性插件；
- 本地插件目录；
- manifest；
- 权限声明；
- Patch API；
- 基础沙箱。

P2 做：

- 插件市场；
- 插件签名；
- 移动端插件；
- 更严格隔离。

### 15.2 插件 Patch 模型

插件不直接修改核心对象，只返回 Patch。

```ts
export type PluginPatch =
  | { type: 'prompt.append'; position: InjectionPosition; text: string }
  | { type: 'message.replace'; messageId: string; content: string }
  | { type: 'lorebook.add_activation'; entry: LorebookActivation }
  | { type: 'request.param.set'; key: string; value: unknown }
  | { type: 'cancel'; reason: string };
```

核心层负责：

1. 校验 Patch；
2. 检查插件权限；
3. 合并 Patch；
4. 记录调试信息；
5. 出错时禁用该插件本次执行。

### 15.3 插件权限

```ts
export type PluginPermissionType =
  | 'message:read'
  | 'message:write'
  | 'prompt:read'
  | 'prompt:write'
  | 'lorebook:read'
  | 'lorebook:write'
  | 'character:read'
  | 'character:write'
  | 'network'
  | 'storage';
```

### 15.4 插件安全原则

- 不暴露 `require`；
- 不暴露 `process`；
- 不暴露真实文件系统；
- 网络访问必须声明权限；
- 插件存储隔离；
- 插件执行有超时；
- 插件错误不能导致聊天主流程崩溃。

---

## 16. Electron 桌面端

### 16.1 进程职责

```txt
Main Process
  - 创建窗口
  - 管理数据库连接
  - 管理文件系统
  - 管理 API Key 安全存储
  - 通过 Provider Adapter 执行 AI 请求
  - 暴露 IPC

Preload
  - contextBridge
  - 暴露安全 API

Renderer
  - React UI
  - 状态管理
  - 调用 window.aiTavern API
```

### 16.2 Preload API

```ts
declare global {
  interface Window {
    aiTavern: {
      app: {
        getVersion(): Promise<string>;
      };
      characters: {
        importFromDialog(): Promise<Result<ImportedCharacter>>;
        exportToDialog(characterId: string, format: 'json-v2' | 'json-v3'): Promise<Result<void>>;
      };
      backups: {
        exportToDialog(): Promise<Result<void>>;
        importFromDialog(): Promise<Result<BackupPreview>>;
      };
      providers: {
        saveConfig(input: ProviderConfigInput): Promise<Result<ProviderConfigView>>;
        testConnection(providerId: string): Promise<Result<ModelInfo[]>>;
      };
    };
  }
}
```

Preload 不暴露：

- 任意路径的 `readFile` / `writeFile`；
- 通用 HTTP fetch 代理；
- 用户数据目录真实路径；
- 原始 secret get/set；
- 任意 IPC channel 调用器。

IPC 请求和响应均使用 Zod 校验。Main Process 校验 `event.senderFrame` 来源，并在每个 handler 内做权限和资源范围检查。

### 16.3 安全配置

Electron 窗口必须启用：

```ts
webPreferences: {
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  preload: preloadPath,
}
```

禁止 Renderer 直接访问 Node API。

另外必须：

- 配置严格 CSP；生产环境禁止 `unsafe-eval`；
- 拦截并限制 `will-navigate`；
- 默认拒绝 `window.open`，仅允许经过 URL 解析和协议白名单校验的外链；
- 不使用 `<webview>`；若未来必须使用，需单独安全评审；
- 禁止禁用 `webSecurity`，禁止 `allowRunningInsecureContent`；
- 开发与生产使用不同 CSP，但开发例外不得进入发布构建；
- 所有 IPC handler 校验 sender，不仅校验参数；
- 对自定义 Provider `baseUrl` 明确允许 `http://localhost`，其他明文 HTTP 地址默认警告或拒绝。

---

## 17. 移动端适配方案

移动端放到 P2。

### 17.1 为什么后移

移动端不是简单套壳，会带来：

- SQLite driver 差异；
- 文件系统沙箱；
- 键盘遮挡；
- iOS WebView 限制；
- 插件沙箱差异；
- 长文本输入体验；
- 流式请求后台中断；
- 数据同步问题。

如果 P0 就做移动端，会拖慢核心体验完成。

### 17.2 P2 移动端目标

P2 再考虑：

- Capacitor；
- 复用 `packages/ui`；
- 移动端 Repository 实现；
- 数据库导入导出；
- 与桌面端数据迁移；
- 移动端无插件或受限插件。

---

## 18. MVP 功能清单

### 18.1 P0：能用的桌面酒馆

| 优先级 | 功能 | 说明 |
|---|---|---|
| P0 | Electron 桌面端 | Windows 优先，macOS/Linux 后测 |
| P0 | OpenAI Compatible Provider | 支持 baseUrl + apiKey + model |
| P0 | Mock Provider | 用于测试和开发 |
| P0 | 流式对话 | 支持停止生成 |
| P0 | SQLite 本地存储 | 角色、对话、消息、设置 |
| P0 | 角色卡导入 | PNG / JSON 导入 |
| P0 | 角色卡编辑 | 基础字段编辑 |
| P0 | 多对话管理 | 创建、切换、删除对话 |
| P0 | 消息操作 | 编辑、删除、重新生成 |
| P0 | Prompt Engine | 角色、历史、用户输入组装 |
| P0 | 基础世界书 | 关键词命中 + token 预算 |
| P0 | Prompt Debugger | 查看最终 Prompt 和 token 分布 |
| P0 | Token 估算 | 至少支持近似估算 |
| P0 | 设置页 | Provider、模型、温度、上下文大小 |
| P0 | 数据导出 | 至少导出 JSON 备份 |
| P0 | 安全渲染 | Markdown 清洗、外链白名单、严格 IPC |

### 18.2 P1：完整桌面体验

| 优先级 | 功能 | 说明 |
|---|---|---|
| P1 | Anthropic Provider | Claude 适配 |
| P1 | Gemini Provider | Gemini 适配 |
| P1 | OpenRouter 模型列表 | 更好的模型选择体验 |
| P1 | 完整世界书 | secondary keys、递归扫描、导入导出 |
| P1 | 消息分支 UI | 可切换重抽分支 |
| P1 | 桌面插件系统 | 实验性 JS 插件 |
| P1 | 数据批量导入导出 | 角色、对话、世界书 |
| P1 | 搜索 | 搜索角色和聊天记录 |
| P1 | 主题系统 | 暗色、亮色、自定义色 |
| P1 | 自动更新 | GitHub release 更新 |

### 18.3 P2：增强体验

| 优先级 | 功能 | 说明 |
|---|---|---|
| P2 | 移动端 | Capacitor Android/iOS |
| P2 | 长期记忆 | 摘要 + 向量检索 |
| P2 | TTS | 语音回复 |
| P2 | 图片生成 | SD / ComfyUI / API |
| P2 | Visual Novel 模式 | 立绘、背景、CG |
| P2 | MCP 支持 | 工具调用生态 |
| P2 | 本地模型管理 | Ollama / llama.cpp |
| P2 | 云同步 | 可选，自托管优先 |
| P2 | 插件市场 | 签名、安装、更新 |

---

## 19. 开发路线图

### Phase 0：项目初始化

目标：搭建能跑起来的工程骨架。

任务：

- [ ] 初始化 pnpm workspace；
- [ ] 配置 TypeScript strict；
- [ ] 配置 ESLint / Prettier；
- [ ] 配置 Electron + Vite；
- [ ] 配置 React + TailwindCSS；
- [ ] 配置 shadcn/ui；
- [ ] 配置 Vitest；
- [ ] 配置 Zod、AI SDK 和 Markdown sanitize；
- [ ] 配置 GitHub Actions 基础 CI；
- [ ] 创建 ADR 目录。

验收：

- [ ] `pnpm dev` 能启动桌面窗口；
- [ ] `pnpm typecheck` 通过；
- [ ] `pnpm test` 通过；
- [ ] CI 能跑通。

### Phase 1：数据层和基础 UI

目标：可以创建角色、创建对话、保存数据。

任务：

- [ ] 设计 Drizzle schema；
- [ ] 实现迁移；
- [ ] 实现用例导向数据访问；
- [ ] 配置 foreign keys、WAL 和事务；
- [ ] 实现迁移前备份与失败恢复；
- [ ] 实现角色列表；
- [ ] 实现角色编辑；
- [ ] 实现对话列表；
- [ ] 实现消息列表 UI；
- [ ] 实现设置页骨架。

验收：

- [ ] 重启应用数据不丢；
- [ ] 能创建角色；
- [ ] 能创建对话；
- [ ] 能添加本地消息。

### Phase 2：角色卡导入

目标：导入并正确展示 SillyTavern 角色卡。

任务：

- [ ] 评估并选定 PNG chunk 基础库；
- [ ] 实现 v2/v3 Zod Schema；
- [ ] 实现角色卡标准化层；
- [ ] 实现头像读取；
- [ ] 实现导入 UI；
- [ ] 实现角色详情展示。

验收：

- [ ] 常见 ST v2 PNG 可导入；
- [ ] JSON 角色卡可导入；
- [ ] 角色名、头像、描述、开场白显示正确。

### Phase 3：Provider 和流式聊天

目标：能和模型稳定对话。

任务：

- [ ] 使用 AI SDK 实现 OpenAI Compatible Adapter；
- [ ] 实现 SDK 事件到领域 StreamEvent 的转换；
- [ ] 实现 Mock Provider；
- [ ] 实现 API Key 安全存储；
- [ ] 实现模型和参数设置；
- [ ] 实现流式渲染；
- [ ] 实现停止生成；
- [ ] 实现超时、取消和错误语义测试；

验收：

- [ ] 能配置自定义 baseUrl；
- [ ] 能选择模型；
- [ ] 能流式输出；
- [ ] 停止生成能生效；
- [ ] 错误能显示给用户。

### Phase 4：Prompt Engine

目标：酒馆核心体验成型。

任务：

- [ ] 实现 Prompt 组件拆分；
- [ ] 实现 token 预算；
- [ ] 实现上下文裁剪；
- [ ] 实现 mes_example 格式化；
- [ ] 实现 post_history_instructions；
- [ ] 实现 Prompt Debugger；
- [ ] 编写 Prompt 快照测试。

验收：

- [ ] 能查看最终 Prompt；
- [ ] 能看到各 section token；
- [ ] 超上下文时能裁剪历史；
- [ ] 快照测试覆盖核心场景。

### Phase 5：世界书

目标：支持基础 Lorebook。

任务：

- [ ] 实现 lorebook 表；
- [ ] 实现 lorebook_entries 表；
- [ ] 实现关键词匹配；
- [ ] 实现 token 预算；
- [ ] 实现世界书编辑 UI；
- [ ] 接入 Prompt Engine；
- [ ] 在 Prompt Debugger 显示命中条目。

验收：

- [ ] 命中关键词后能注入 Prompt；
- [ ] 世界书超预算时能裁剪；
- [ ] Debugger 能显示命中原因。

### Phase 6：消息操作和打包

目标：第一个可发布版本。

任务：

- [ ] 编辑消息；
- [ ] 重新生成；
- [ ] 删除消息；
- [ ] 基础消息分支；
- [ ] 数据导出；
- [ ] Windows 打包；
- [ ] 基础 E2E 测试。

验收：

- [ ] Windows `.exe` 可运行；
- [ ] 能完成完整角色聊天流程；
- [ ] 主要功能 E2E 通过；
- [ ] 可以发布 v0.1.0。

---

## 20. 测试策略

### 20.1 单元测试

使用 Vitest。

必须覆盖：

- 角色卡 v2/v3 Schema 和标准化；
- PNG 角色卡 payload 读取；
- Prompt Engine；
- Lorebook matcher；
- Token budget；
- AI SDK 事件到领域事件的转换；
- 用例导向数据访问和事务；
- 消息分支不可变规则；
- IPC Schema、sender 校验和 Markdown XSS fixture；
- 数据迁移成功、失败回滚和备份恢复。

### 20.2 Prompt 快照测试

Prompt 是最容易被无意改坏的部分。

测试方式：

```ts
expect(resolvedPrompt.messages).toMatchSnapshot();
expect(resolvedPrompt.debug.sections).toMatchSnapshot();
```

任何 Prompt 顺序变化都必须显式确认。

### 20.3 Mock Provider 测试

Mock Provider 用于稳定测试：

```ts
const provider = new MockProvider({
  chunks: ['你好', '，遥', '。'],
  usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110 },
});
```

### 20.4 E2E 测试

使用 Playwright。

P0 E2E 场景：

- 启动应用；
- 添加 Provider；
- 导入角色卡；
- 创建对话；
- 发送消息；
- 停止生成；
- 重新生成；
- 重启后数据仍存在；
- 恶意 Markdown 不执行脚本；
- 迁移后旧数据仍可读取；
- Windows 打包产物可以启动并加载原生 SQLite 模块。

---

## 21. CI / CD

### 21.1 GitHub Actions

每次 PR 必须运行：

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build

  windows-package:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
      - run: pnpm package:win
      - run: pnpm test:packaged-smoke
```

Windows job 是 P0 必需项，因为 Electron 与 `better-sqlite3` 涉及原生 ABI。Ubuntu 构建成功不能替代 Windows 打包验证。

### 21.2 发布流程

P0 发布先只做 Windows：

- tag：`v0.1.0`；
- GitHub Release；
- 上传 `.exe` 和 `.zip`；
- 附带 SHA256；
- changelog 自动生成。

macOS/Linux 等基础稳定后再加入。

---

## 22. ADR 架构决策记录

### 22.1 为什么需要 ADR

项目里会有很多争议性选择：

- 为什么先 Electron；
- 为什么不用 Tauri；
- 为什么 SQLite；
- 为什么 Prompt Engine 独立；
- 为什么插件用 Patch 模型；
- 为什么 P0 不做移动端。

这些不要只写在聊天记录里，应该沉淀成 ADR。

### 22.2 ADR 模板

```md
# ADR-0001: Electron-first

## 状态
Accepted

## 背景
...

## 决策
...

## 影响
### 正面
...

### 负面
...

## 替代方案
...
```

---

## 23. 编码规范

### 23.1 TypeScript

- 开启 strict；
- 禁止隐式 any；
- 公共 API 必须显式类型；
- 同步/Promise 领域操作的预期失败使用 Result；
- 流式 Provider 可抛出标准化异常，由 Chat Engine 在边界统一转换；
- 不用 throw 做普通分支判断；
- 不在核心层 import Electron / Node / DOM。

### 23.2 命名

- 类型：`PascalCase`；
- 函数：`camelCase`；
- 文件：`kebab-case.ts`；
- React 组件：`PascalCase.tsx`；
- 数据库列：`snake_case`；
- TypeScript 字段：`camelCase`。

### 23.3 提交规范

使用 Conventional Commits：

```txt
feat: add prompt debugger
fix: handle openai stream error
refactor: split prompt engine
chore: update deps
```

---

## 24. 安全和隐私

### 24.1 本地优先

默认所有数据保存在用户本地。

应用自身不会上传：

- 聊天记录；
- 角色卡；
- 世界书；
- API Key；
- Prompt 快照。

但用户发起模型请求时，最终 Prompt 会发送到用户配置的第三方 Provider。设置页和首次发送前必须明确提示这一数据流，不能把“本地优先”描述成“聊天内容永不离开设备”。

Prompt 快照默认关闭或限制保留数量；用户可查看、清空并彻底禁用。

### 24.2 API Key

- 不明文写入数据库；
- 使用系统安全存储并检查实际加密后端；
- Linux `basic_text` 后端必须明确警告；
- 导出备份时默认不导出 API Key；
- 如果用户主动导出密钥，必须显示警告。

### 24.3 插件安全

- 插件系统不进入 P0；
- 插件不能直接访问文件系统；
- 插件不能直接访问数据库；
- 插件不能直接修改核心对象；
- 插件所有修改必须通过 Patch；
- 插件执行错误不会中断主流程。

---

## 25. 风险清单

| 风险 | 影响 | 应对 |
|---|---|---|
| P0 范围过大 | 项目迟迟无法发布 | 移动端、插件、记忆系统全部后移 |
| Prompt 逻辑混乱 | 聊天效果不稳定 | 独立 Prompt Engine + 快照测试 + Debugger |
| Provider 差异大 | 后续适配困难 | AI SDK + 薄 Adapter + 领域 StreamEvent |
| AI SDK 行为不满足兼容需求 | Provider 功能受限 | 隔离 SDK 类型，保留替换 Adapter 的边界 |
| 角色卡标准理解错误 | 导入失败或字段丢失 | v2/v3 分离 Schema + 标准化 + fixture |
| 数据迁移失败 | 用户数据损坏 | Drizzle migrations + 迁移前备份 + 恢复流程 |
| Prompt 快照无限增长 | 隐私和磁盘风险 | 默认关闭/限额 + 自动清理 |
| 插件破坏数据 | 安全问题 | Patch 模型 + 权限 + 沙箱 |
| API Key 泄露 | 严重安全问题 | 系统安全存储，不明文导出 |
| Electron 安全配置错误 | 本地文件或密钥暴露 | CSP + sender 校验 + sandbox + 业务级 Preload API |
| 原生模块只在开发机可用 | Windows 安装包启动失败 | Windows CI 打包和 packaged smoke test |

---

## 26. P0 最终验收标准

P0 发布前必须满足：

- [ ] 能导入 SillyTavern 角色卡 PNG；
- [ ] v2/v3 原始格式能正确标准化，未知扩展字段不静默丢失；
- [ ] 能创建 / 编辑角色卡；
- [ ] 能配置 OpenAI Compatible Provider；
- [ ] 能选择模型；
- [ ] 能流式聊天；
- [ ] 能停止生成；
- [ ] 能重新生成回复；
- [ ] 能编辑消息并继续生成；
- [ ] 编辑和重新生成不会覆盖旧分支；
- [ ] 能创建多个对话；
- [ ] 重启应用后数据不丢；
- [ ] 世界书基础关键词注入可用；
- [ ] Prompt Debugger 可查看最终 Prompt；
- [ ] First Message 不会在每轮 Prompt 中重复注入；
- [ ] 恶意 Markdown 和外链不能执行任意代码或读取本地文件；
- [ ] 迁移失败可恢复原数据库；
- [ ] Windows 能打包运行；
- [ ] Windows packaged smoke test 通过；
- [ ] 单元测试通过；
- [ ] 核心 Prompt 快照测试通过；
- [ ] E2E 主流程通过。

---

## 27. 推荐开发顺序

如果只有一个人开发，推荐按这个顺序：

1. Electron 空窗口；
2. SQLite + 迁移/备份 + 用例数据访问；
3. 角色列表 / 创建角色；
4. 聊天 UI 静态版；
5. Mock Provider 流式输出；
6. AI SDK OpenAI Compatible Adapter；
7. Prompt Engine；
8. 角色卡导入；
9. Prompt Debugger；
10. 世界书；
11. 消息编辑 / 重抽；
12. 数据导出；
13. 打包发布。

不要一开始就做插件、移动端、记忆系统、TTS。

---

## 28. 总结

Xiong 的长期架构可以保持野心，但第一版必须克制。

v1.2 的方向是：

> **先做一个桌面端、稳定、可调试、Prompt 体验优秀的 AI 酒馆。**

只要 P0 能跑通，后面的插件、移动端、记忆系统、TTS、图片生成、Visual Novel 模式，都可以逐步加上去。

第一版最重要的不是功能多，而是：

- 聊天稳定；
- Prompt 清楚；
- 数据可靠；
- 用户愿意每天打开。

自研边界最终落在：

- Prompt 组装和调试；
- Lorebook 激活和预算规则；
- 角色卡标准化与兼容行为；
- 消息树和产品交互。

Provider 协议、流式基础设施、Schema 校验、数据库迁移、Markdown 清洗和 UI 基础组件优先复用成熟开源方案。
