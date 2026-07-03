// 记忆条目 · 地基库（纯函数）。
//
// 设计稿：docs/prd/记忆展示形态/记忆展示形态_功能定义.md
//
// 边界（重要）：本文件只做纯计算，不读写文件、不碰 Tauri、不接线进 UI 或注入。
// 跟时间相关的输入（编号、时间戳）都由调用方传进来，保证函数确定、可测，对现有
// app 行为零影响，等 Jiajia 确认后再接线（接线步骤见功能定义第 9 节 S3 起）。
//
// 一条记忆等于一行，带唯一编号；类型和归属都是集合，支持多标签（功能定义已确认）。

// ── 类型 ───────────────────────────────────────────────

// 八类（分类模块已确认）：决策 约束 状态 交接 事实 偏好 技能 零散。
export type EntryKind =
  | "decision"
  | "constraint"
  | "state"
  | "handoff"
  | "fact"
  | "preference"
  | "skill"
  | "misc";

export const ALL_KINDS: readonly EntryKind[] = [
  "decision",
  "constraint",
  "state",
  "handoff",
  "fact",
  "preference",
  "skill",
  "misc",
];

// 中文标签，导出 md 和给用户看时用。
export const KIND_LABELS: Readonly<Record<EntryKind, string>> = {
  decision: "决策",
  constraint: "约束",
  state: "状态",
  handoff: "交接",
  fact: "事实",
  preference: "偏好",
  skill: "技能",
  misc: "零散",
};

const LABEL_TO_KIND: Readonly<Record<string, EntryKind>> = Object.fromEntries(
  (Object.keys(KIND_LABELS) as EntryKind[]).map((k) => [KIND_LABELS[k], k])
);

// 归属：项目 slug、"global"（about_me 全局库）、"skill"（技能库）。
export type EntryScope = string;

// 来源四类（来源模块已确认）：用户 AI建议 AI推论 三方。
export type SourceKind = "user" | "ai_suggestion" | "ai_inference" | "third_party";

export const SOURCE_LABELS: Readonly<Record<SourceKind, string>> = {
  user: "用户",
  ai_suggestion: "AI建议",
  ai_inference: "AI推论",
  third_party: "三方",
};

const LABEL_TO_SOURCE: Readonly<Record<string, SourceKind>> = Object.fromEntries(
  (Object.keys(SOURCE_LABELS) as SourceKind[]).map((s) => [SOURCE_LABELS[s], s])
);

// 真实性，只三方用。
export type Truthiness = "verified" | "unverified";

// 模态。记忆本质是多模态的，现阶段只有文字一种取值，为声音图像等预留结构。
export type Modality = "text";

// 关联，知识图谱的边：这条和另一条是什么关系。现阶段可空，第 4 轮起步填。
// rel 取值先留三种：related 相关、from_same_session 同次对话产生、supersedes 取代。
export type EntryRelation = {
  to: string; // 目标条目 id
  rel: "related" | "from_same_session" | "supersedes";
  note?: string;
};

export type MemoryEntry = {
  id: string;
  text: string;
  kinds: EntryKind[];
  scopes: EntryScope[];
  source: SourceKind;
  truthiness?: Truthiness;
  weight?: number;
  modality: Modality;
  relations: EntryRelation[];
  createdAt: string;
  updatedAt: string;
};

// ── 发号（纯函数：基于现有最大号加一，不用随机或当前时间）──────

const ID_RE = /^m-(\d+)$/;

/** 现有条目里最大编号加一，格式 m-0001。空集返回 m-0001。 */
export function nextEntryId(existing: { id: string }[]): string {
  let max = 0;
  for (const e of existing) {
    const m = e.id.match(ID_RE);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return "m-" + String(max + 1).padStart(4, "0");
}

/** 一条记忆没有类型时归零散，保证分组不漏。 */
function kindsOf(e: { kinds: EntryKind[] }): EntryKind[] {
  return e.kinds.length ? e.kinds : ["misc"];
}

// ── 八类分组（多标签进多组：一条多类型在每个类型组都露出，同一引用）──

export function groupByKind<T extends { kinds: EntryKind[] }>(
  entries: T[]
): Record<EntryKind, T[]> {
  const out = {} as Record<EntryKind, T[]>;
  for (const k of ALL_KINDS) out[k] = [];
  for (const e of entries) {
    for (const k of kindsOf(e)) out[k].push(e);
  }
  return out;
}

// ── 导出 md（每条只出现一次，按主类型分区块，行尾带全部类型和来源标签）──

/** 一条记忆导出成一行：`- [id] 正文 #决策 #状态 @用户`。 */
function entryToLine(e: MemoryEntry): string {
  const kindTags = kindsOf(e).map((k) => "#" + KIND_LABELS[k]).join(" ");
  const srcTag = "@" + SOURCE_LABELS[e.source];
  return `- [${e.id}] ${e.text} ${kindTags} ${srcTag}`.replace(/\s+$/, "");
}

/**
 * 一个库的条目导出成 markdown，供携带或手改。
 * 按主类型（第一个类型）分区块，每条只在主类型区块出现一次；
 * 行尾的 #类型标签带全部类型，所以导回解析不依赖区块标题。
 */
export function exportToMarkdown(entries: MemoryEntry[], title = "记忆库"): string {
  const grouped = {} as Record<EntryKind, MemoryEntry[]>;
  for (const k of ALL_KINDS) grouped[k] = [];
  for (const e of entries) grouped[kindsOf(e)[0]].push(e);

  const lines: string[] = [`# ${title}`, ""];
  for (const k of ALL_KINDS) {
    if (!grouped[k].length) continue;
    lines.push(`## ${KIND_LABELS[k]}`);
    for (const e of grouped[k]) lines.push(entryToLine(e));
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

// ── 导入 md（解析 + 按编号对账）──────────────────────────

export type ParsedLine = {
  id: string | null; // 没编号的新行为 null
  text: string;
  kinds: EntryKind[];
  source: SourceKind | null;
};

const LINE_RE = /^\s*-\s+(?:\[(m-\d+)\]\s*)?(.*)$/;

/** 解析导出的 md，逐行取编号、正文、类型、来源。忽略标题和非条目行。 */
export function parseMarkdown(md: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  for (const raw of md.split("\n")) {
    const m = raw.match(LINE_RE);
    if (!m) continue; // 标题、空行、非列表行跳过
    const id = m[1] ?? null;
    let rest = m[2];
    const kinds: EntryKind[] = [];
    for (const tag of rest.matchAll(/#(\S+)/g)) {
      const k = LABEL_TO_KIND[tag[1]];
      if (k && !kinds.includes(k)) kinds.push(k);
    }
    const srcM = rest.match(/@(\S+)/);
    const source = srcM ? LABEL_TO_SOURCE[srcM[1]] ?? null : null;
    const text = rest.replace(/[#@]\S+/g, "").trim();
    if (!text) continue; // 纯标签无正文的行不算
    out.push({ id, text, kinds, source });
  }
  return out;
}

export type ImportPlan = {
  updates: { current: MemoryEntry; text: string; kinds: EntryKind[]; conflict: boolean }[];
  adds: { text: string; kinds: EntryKind[]; source: SourceKind }[];
  deletes: MemoryEntry[]; // 待用户确认，不自动删
};

/**
 * 把改完的 md 和现有条目按编号对账，产出导回方案。
 * 编号在、正文或类型变了 → update；编号在、整行没了 → delete 候选（待确认）；
 * 没编号的新行 → add（接线时发新号）。
 * 传了 exportedAt 时，现有条目的 updatedAt 晚于它说明导出后又在 app 改过，标 conflict。
 */
export function reconcileImport(
  current: MemoryEntry[],
  parsed: ParsedLine[],
  opts: { exportedAt?: string } = {}
): ImportPlan {
  const byId = new Map(current.map((e) => [e.id, e]));
  const seen = new Set<string>();
  const updates: ImportPlan["updates"] = [];
  const adds: ImportPlan["adds"] = [];

  for (const p of parsed) {
    if (p.id && byId.has(p.id)) {
      seen.add(p.id);
      const cur = byId.get(p.id)!;
      const kinds = p.kinds.length ? p.kinds : cur.kinds;
      const changed = cur.text !== p.text || !sameKinds(cur.kinds, kinds);
      if (changed) {
        const conflict = !!opts.exportedAt && cur.updatedAt > opts.exportedAt;
        updates.push({ current: cur, text: p.text, kinds, conflict });
      }
    } else {
      adds.push({ text: p.text, kinds: p.kinds.length ? p.kinds : ["misc"], source: p.source ?? "user" });
    }
  }

  const deletes = current.filter((e) => !seen.has(e.id));
  return { updates, adds, deletes };
}

function sameKinds(a: EntryKind[], b: EntryKind[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((k, i) => k === sb[i]);
}

// ── AI 视图注入拼装（双视图之一：按权重挑条目，1200 字内）─────────

export const INJECTION_BUDGET_CHARS = 1200;

/** 预算用字数：去掉所有空白后的字符数，与 cards.ts 的口径一致。 */
export function entryCharCount(text: string): number {
  return text.replace(/\s/g, "").length;
}

export type InjectionResult = {
  text: string;
  charCount: number;
  includedIds: string[];
  droppedIds: string[]; // 预算装不下被舍弃的条目，供界面提示
};

/**
 * 把条目拼成给 AI 的注入文本。类型分区块，区块内按权重从高到低，
 * 权重缺省按 50 算；超预算的条目舍弃并记录。纯函数，不碰真实注入链路。
 */
export function buildInjectionFromEntries(
  entries: MemoryEntry[],
  budget = INJECTION_BUDGET_CHARS
): InjectionResult {
  // 找出关系并输出（知识图谱起步）：被高权重条目关联的目标，挑选时加分，
  // 让相关的记忆倾向一起入选，而不是各排各的。
  const boosted = new Set<string>();
  for (const e of entries) {
    if ((e.weight ?? 50) >= 67) for (const r of e.relations) boosted.add(r.to);
  }
  const w = (e: MemoryEntry) =>
    Math.min(100, (e.weight ?? 50) + (boosted.has(e.id) ? 15 : 0));
  const grouped = {} as Record<EntryKind, MemoryEntry[]>;
  for (const k of ALL_KINDS) grouped[k] = [];
  for (const e of entries) grouped[kindsOf(e)[0]].push(e);

  const lines: string[] = [];
  const includedIds: string[] = [];
  const droppedIds: string[] = [];
  let used = 0;
  for (const k of ALL_KINDS) {
    const pool = [...grouped[k]].sort((a, b) => w(b) - w(a));
    let headerWritten = false;
    for (const e of pool) {
      const line = `- ${e.text}`;
      const header = headerWritten ? "" : `## ${KIND_LABELS[k]}`;
      const cost = entryCharCount(line) + (header ? entryCharCount(header) : 0);
      if (used + cost > budget) {
        droppedIds.push(e.id);
        continue;
      }
      if (header) {
        lines.push(header);
        headerWritten = true;
      }
      lines.push(line);
      used += cost;
      includedIds.push(e.id);
    }
  }
  const text = lines.join("\n");
  return { text, charCount: entryCharCount(text), includedIds, droppedIds };
}

// ── 存储序列化（jsonl，一条一行；坏行隔离不连累其他条目）──────────

/** 条目集合序列化成 jsonl，一条一行，稳定可差异比对。 */
export function toJsonl(entries: MemoryEntry[]): string {
  return entries.map((e) => JSON.stringify(e)).join("\n") + (entries.length ? "\n" : "");
}

export type JsonlParseResult = {
  entries: MemoryEntry[];
  badLines: number[]; // 解析失败的行号，从 1 起，供提示用户；坏行跳过不丢好行
};

/** 解析 jsonl。单行损坏只跳过该行并记行号，好行全部保留。 */
export function fromJsonl(text: string): JsonlParseResult {
  const entries: MemoryEntry[] = [];
  const badLines: number[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      const obj = JSON.parse(line);
      if (typeof obj?.id === "string" && typeof obj?.text === "string") {
        entries.push({
          modality: "text",
          relations: [],
          kinds: [],
          scopes: [],
          source: "user",
          createdAt: "",
          updatedAt: "",
          ...obj,
        });
      } else {
        badLines.push(i + 1);
      }
    } catch {
      badLines.push(i + 1);
    }
  }
  return { entries, badLines };
}

// ── 六卡迁移（把现有六卡 md 机械解析成条目，类型由区块标题映射）──────

/** 六卡区块标题映射到类型。机械第一版，AI 再细化（功能定义第 6 节）。 */
function headingToKind(heading: string): EntryKind | null {
  const h = heading;
  if (/项目卡|Project/i.test(h)) return "fact";
  if (/当前状态|Current State/i.test(h)) return "state";
  if (/约束与决策|约束|决策|Constraints|Decisions/i.test(h)) return "decision";
  if (/上次对话总结|上次交接|Last Session|Last Handoff/i.test(h)) return "handoff";
  if (/历史档案|Archives/i.test(h)) return null; // 指针，不迁
  return "misc";
}

/**
 * 把一个项目的六卡 md 解析成条目。每个 `- ` 行变一条，类型由所在区块映射，
 * 归属为传入的 scope，来源默认用户。编号从 existing 续号，时间用传入的 now。
 */
export function migrateCardsToEntries(
  cardsMd: string,
  scope: EntryScope,
  now: string,
  existing: { id: string }[] = []
): MemoryEntry[] {
  const out: MemoryEntry[] = [];
  let curKind: EntryKind | null = null;
  const counter = [...existing];
  for (const raw of cardsMd.split("\n")) {
    const h = raw.match(/^#{1,6}\s+(.*)$/);
    if (h) {
      curKind = headingToKind(h[1].trim());
      continue;
    }
    if (curKind === null) continue; // 历史档案区块或标题前的行跳过
    const li = raw.match(/^\s*-\s+(.*)$/);
    if (!li) continue;
    const text = li[1].trim();
    if (!text || /^[（(].*[)）]$/.test(text)) continue; // 空行或纯括号占位说明跳过
    const id = nextEntryId(counter);
    counter.push({ id });
    out.push({
      id,
      text,
      kinds: [curKind],
      scopes: [scope],
      source: "user",
      modality: "text",
      relations: [],
      createdAt: now,
      updatedAt: now,
    });
  }
  return out;
}
