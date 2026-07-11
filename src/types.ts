// 开放字符串 — 8 个预置 + 用户自定义都可。预置清单在 lib/sourceTools.ts。
export type SourceTool = string;
export type RiskLevel = "low" | "medium" | "high";

export type ProjectMeta = {
  slug: string;
  name: string;
  description: string;
  currentGoal: string;
  currentGoalBullets: string[];
  focus: string;
  progress: number;
  statusLabel: string;
  createdAt: string;
  updatedAt: string;
  /** 信任模式（06-10 用户确认）：MCP 写回到收件箱后由 app 自动入库，不再逐条确认。默认 false。 */
  mcpAutoApply?: boolean;
  /** 开场注入使用条目库（07-04 确认）：开了用条目按权重拼的文本，不开仍用记忆卡片。默认 false。 */
  entryInjection?: boolean;
};

export type Session = {
  filename: string;
  date: string;
  time: string;
  sourceTool: SourceTool;
  sessionGoal: string;
  rawMarkdown: string;
};

export type Project = ProjectMeta & {
  contextMarkdown: string;
  decisionsMarkdown: string;
  /** 现行卡（cards.md）全文；空串 = 该项目未启用现行卡模式（PRD·记忆质量升级 F3）。 */
  cardsMarkdown: string;
  sessions: Session[];
};

export type ParsedHandoff = {
  metadata: Record<string, string>;
  whatWeWorkedOn: string;
  keyDecisions: string;
  currentState: string;
  openQuestions: string;
  nextActions: string;
  suggestedContextUpdate: string;
  suggestedDecisionsUpdate: string;
  suggestedAboutMeUpdate: string;
  compactContext: string;
  // ── 现行卡模式（PRD·记忆质量升级 F1）。旧 inbox JSON 没有这些字段，全部 optional。──
  /** AI 建议·待确认——未经用户确认的想法只能住这栏（来源标记）。 */
  aiSuggestions?: string;
  /** AI 连带产出的 cards.md 完整新版（六卡更新提案）。 */
  proposedCards?: string;
  /** 提案中被替换/移除的旧条目描述（Review 划线高亮用）。 */
  proposedCardsSuperseded?: string[];
  /** 条目模式（07-11 写入口条目原生化）：本轮新记忆条目行 + !归档 !并入 调整标记。 */
  proposedEntries?: string;
};

// ── Memory Inbox（PRD v0.3.1 §4.2）─────────────────────
// 通道无关的待审结构化 handoff。所有通道（manual / mcp / browser）只做一件事：
// 把一个 InboxItem 写进 .memoryos/inbox/，用户 review 后才入正式 memory 文件。
export type SourceChannel = "manual" | "mcp" | "browser";
export type InboxStatus = "pending" | "applied" | "discarded";

export type InboxItem = {
  id: string;            // uuid
  slug: string;          // 目标项目 slug
  sourceChannel: SourceChannel;
  sourceClient: string;  // Claude Desktop / Codex / ChatGPT Web …（cross_ai_reuse 以此为准）
  sourcePlatform?: string | null; // 可选，常不可靠，允许空
  createdAt: string;     // ISO
  handoff: ParsedHandoff; // === 与 ParsedHandoff 同名同构，直接复用 ===
  status: InboxStatus;
};

// MCP 连接状态（PRD v0.3.1 §4.2 .memoryos/mcp_state.json）。server 每次工具调用后写，app 读来显示
// 「最近 MCP 活动」（非实时 socket，server↔app 无 RPC，只通过此文件通信）。
export type McpState = {
  lastClient: string;
  lastTool: string;
  lastProject?: string;
  lastActivityAt: string; // ISO
  serverVersion: string;
};

export type UpdateSuggestion = {
  id: string;
  targetFile: string; // "session" for the low-risk save, else file name; "ai-suggestion" = AI 建议·待确认行
  riskLevel: RiskLevel;
  content: string;
  selected: boolean;
  warning?: string;
  mode?: "append" | "replace";
  originalContent?: string;
  newAddition?: string;
  superseded?: string[];
  /** 仅 ai-suggestion：用户点了驳回 → 入防复提名单（rejected.md）。 */
  rejected?: boolean;
};
