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
  /** 钉住：永不自动降权、永不自动归档（权重模块 A5 确认）。 */
  pinned?: boolean;
  /**
   * 归档状态。空 = 在现行层。红线2：作废归档和降权归档原因分开记，
   * superseded 内容被替代、lowWeight 权重过低、manual 手动。捞回 = 清掉此字段。
   */
  archived?: { reason: "superseded" | "lowWeight" | "manual"; at: string };
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

/** 一条记忆导出成一行：`- [id] 正文 #决策 #状态 @用户 ->m-0002`。箭头是关联目标。 */
function entryToLine(e: MemoryEntry): string {
  const kindTags = kindsOf(e).map((k) => "#" + KIND_LABELS[k]).join(" ");
  const srcTag = "@" + SOURCE_LABELS[e.source];
  const relTags = e.relations.map((r) => "->" + r.to).join(" ");
  return `- [${e.id}] ${e.text} ${kindTags} ${srcTag}${relTags ? " " + relTags : ""}`.replace(/\s+$/, "");
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
  /** 行内 ->编号 解析出的关联目标。 */
  relTargets: string[];
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
    const relTargets: string[] = [];
    for (const rm of rest.matchAll(/->(m-\d+)/g)) {
      if (!relTargets.includes(rm[1])) relTargets.push(rm[1]);
    }
    const text = rest.replace(/->m-\d+/g, "").replace(/[#@]\S+/g, "").trim();
    if (!text) continue; // 纯标签无正文的行不算
    out.push({ id, text, kinds, source, relTargets });
  }
  return out;
}

export type ImportPlan = {
  updates: {
    current: MemoryEntry;
    text: string;
    kinds: EntryKind[];
    relations: EntryRelation[];
    conflict: boolean;
  }[];
  adds: { text: string; kinds: EntryKind[]; source: SourceKind; relTargets: string[] }[];
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
      // 关联对账：目标集合没变不算变；变了保留原关系类型，新目标记 related
      const curTargets = cur.relations.map((r) => r.to);
      const relChanged =
        curTargets.length !== p.relTargets.length ||
        !p.relTargets.every((to) => curTargets.includes(to));
      const relations = relChanged
        ? p.relTargets.map(
            (to) => cur.relations.find((r) => r.to === to) ?? { to, rel: "related" as const }
          )
        : cur.relations;
      const changed = cur.text !== p.text || !sameKinds(cur.kinds, kinds) || relChanged;
      if (changed) {
        const conflict = !!opts.exportedAt && cur.updatedAt > opts.exportedAt;
        updates.push({ current: cur, text: p.text, kinds, relations, conflict });
      }
    } else {
      adds.push({
        text: p.text,
        kinds: p.kinds.length ? p.kinds : ["misc"],
        source: p.source ?? "user",
        relTargets: p.relTargets,
      });
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
 * 把条目拼成给 AI 的注入文本。类型分区块，区块内按分从高到低，
 * 超预算的条目舍弃并记录。纯函数，不碰真实注入链路。
 * scoreOf 是挑选用的尺子：生产调用方一律传 weight.ts 的 scoreEntryAt
 * （手动分优先，否则新鲜度+来源确定性合成，和界面档位徽章同一把尺），
 * 缺省退回原始 weight 字段仅供测试。
 */
export function buildInjectionFromEntries(
  entries: MemoryEntry[],
  budget = INJECTION_BUDGET_CHARS,
  scoreOf: (e: MemoryEntry) => number = (e) => e.weight ?? 50
): InjectionResult {
  // 已归档的不进注入：遗忘等于归档，现行层才是给 AI 的。
  entries = entries.filter((e) => !e.archived);
  // 找出关系并输出（知识图谱起步）：被高权重条目关联的目标，挑选时加分，
  // 让相关的记忆倾向一起入选，而不是各排各的。
  const boosted = new Set<string>();
  for (const e of entries) {
    if (scoreOf(e) >= 67) for (const r of e.relations) boosted.add(r.to);
  }
  const w = (e: MemoryEntry) =>
    Math.min(100, scoreOf(e) + (boosted.has(e.id) ? 15 : 0));
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

// ── 技能汇集：把散在项目库和全局库、标了技能类型的条目挑出来移进技能库 ────

/** 汇集候选：标了技能类型、未归档、还没归到技能库的条目。 */
export function skillCandidates(entries: MemoryEntry[]): MemoryEntry[] {
  return entries.filter(
    (e) => !e.archived && e.kinds.includes("skill") && !e.scopes.includes("skill")
  );
}

// ── 注入合并：项目库和技能库拼一起给 AI，共用 1200 字预算（07-10 确认）──

/**
 * 合并项目库和技能库供注入。两库编号各自独立会撞号（都从 m-0001 发），
 * 技能库条目的 id 和关联目标统一加 s: 前缀再合并，关联加分和舍弃统计不串库。
 */
export function mergeLibsForInjection(
  projectEntries: MemoryEntry[],
  skillEntries: MemoryEntry[]
): MemoryEntry[] {
  return [
    ...projectEntries,
    ...skillEntries.map((e) => ({
      ...e,
      id: "s:" + e.id,
      relations: e.relations.map((r) => ({ ...r, to: "s:" + r.to })),
    })),
  ];
}

// ── 关于我迁移：about_me.md 机械解析进全局库，每条列表行一条偏好条目 ────

export function migrateAboutMeToEntries(
  aboutMeMd: string,
  now: string,
  existing: { id: string }[] = []
): MemoryEntry[] {
  const out: MemoryEntry[] = [];
  const counter = [...existing];
  for (const raw of aboutMeMd.split("\n")) {
    const li = raw.match(/^\s*-\s+(.*)$/);
    if (!li) continue;
    const text = li[1].trim();
    if (!text || /^[（(].*[)）]$/.test(text)) continue;
    const id = nextEntryId(counter);
    counter.push({ id });
    out.push({
      id,
      text,
      kinds: ["preference"],
      scopes: ["global"],
      source: "user",
      modality: "text",
      relations: [],
      createdAt: now,
      updatedAt: now,
    });
  }
  return out;
}

// ── 一键找关联：内容相近产出提案，用户确认才建边（07-10 提案走审核）────
// 机械初版四字滑窗有交集即相近。提案不直接入库：接受才建边，驳回记名单防复提，
// 和外部写回必经收件箱是同一条纪律。

/** 文本切成所有连续四字窗口的集合，去空白。太短的文本返回空集不参与。 */
function textWindows(text: string): Set<string> {
  const s = text.replace(/\s+/g, "");
  const out = new Set<string>();
  for (let i = 0; i + 4 <= s.length; i++) out.add(s.slice(i, i + 4));
  return out;
}

/** 一条关联提案：from 恒为编号小的一侧，和建边落点一致。 */
export type RelationProposal = { from: string; to: string };

/** 提案的防复提键，驳回名单存这个。 */
export function relPairKey(p: RelationProposal): string {
  return `${p.from}->${p.to}`;
}

/**
 * 找内容相近的关联提案：两条现行正文共享连续四字即一条提案。
 * 已有边（双向）、已驳回、已归档的都不出。只产提案不改条目。
 */
export function proposeRelationsByOverlap(
  entries: MemoryEntry[],
  rejectedKeys: string[] = [],
  minShared = 1
): RelationProposal[] {
  const rejected = new Set(rejectedKeys);
  const act = entries.filter((e) => !e.archived);
  const win = new Map(act.map((e) => [e.id, textWindows(e.text)]));
  const out: RelationProposal[] = [];
  for (let i = 0; i < act.length; i++) {
    for (let j = i + 1; j < act.length; j++) {
      const a = act[i], b = act[j];
      const already =
        a.relations.some((r) => r.to === b.id) || b.relations.some((r) => r.to === a.id);
      if (already) continue;
      const p: RelationProposal = a.id <= b.id ? { from: a.id, to: b.id } : { from: b.id, to: a.id };
      if (rejected.has(relPairKey(p))) continue;
      const wa = win.get(a.id)!, wb = win.get(b.id)!;
      if (!wa.size || !wb.size) continue;
      let shared = 0;
      for (const w of wa) {
        if (wb.has(w)) {
          shared++;
          if (shared >= minShared) break;
        }
      }
      if (shared >= minShared) out.push(p);
    }
  }
  return out;
}

/** 接受一条提案：建 related 边在编号小的一侧。目标不存在或已有边则原样返回。 */
export function acceptRelationProposal(
  entries: MemoryEntry[],
  p: RelationProposal
): MemoryEntry[] {
  const from = entries.find((e) => e.id === p.from);
  const to = entries.find((e) => e.id === p.to);
  if (!from || !to) return entries;
  const already =
    from.relations.some((r) => r.to === p.to) || to.relations.some((r) => r.to === p.from);
  if (already) return entries;
  return entries.map((e) =>
    e.id === p.from
      ? { ...e, relations: [...e.relations, { to: p.to, rel: "related" as const }] }
      : e
  );
}

/**
 * 一键找关联的旧入口：提案全部直接接受。保留给测试和批量场景，
 * UI 已改走提案审核，不再调用这个。
 */
export function suggestRelationsByOverlap(
  entries: MemoryEntry[],
  minShared = 1
): { entries: MemoryEntry[]; added: number } {
  const proposals = proposeRelationsByOverlap(entries, [], minShared);
  let cur = entries;
  for (const p of proposals) cur = acceptRelationProposal(cur, p);
  return { entries: cur, added: proposals.length };
}

// ── 去重合并：疑似重复的条目对走提案确认，合并不丢信息 ─────────────
// 脑图 调整·机械·去重合并 的落地。重复的判定比"相关"严得多：一条的
// 字对八成以上出现在另一条里才算。合并=保留一条，被并的盖作废章。

/** 一条合并提案：keep 建议保留（分高或钉住的），drop 建议并入。 */
export type MergeProposal = { keep: string; drop: string };

/** 合并提案的防复提键，与方向无关（编号小的在前）。 */
export function mergePairKey(p: MergeProposal): string {
  const [a, b] = [p.keep, p.drop].sort();
  return `merge:${a}->${b}`;
}

/**
 * 找疑似重复的现行条目对。判定：任一方向的字对包含度过 0.8。
 * keep 规则：钉住的留；否则 scoreOf 高的留；同分留编号小的。
 * 已驳回的不复提。只产提案不改条目。
 */
export function proposeMerges(
  entries: MemoryEntry[],
  rejectedKeys: string[] = [],
  scoreOf: (e: MemoryEntry) => number = (e) => e.weight ?? 50,
  minScore = 0.8
): MergeProposal[] {
  const rejected = new Set(rejectedKeys);
  const act = entries.filter((e) => !e.archived);
  const out: MergeProposal[] = [];
  for (let i = 0; i < act.length; i++) {
    for (let j = i + 1; j < act.length; j++) {
      const a = act[i], b = act[j];
      const dup =
        similarityScore(a.text, b.text) >= minScore ||
        similarityScore(b.text, a.text) >= minScore;
      if (!dup) continue;
      let keep = a, drop = b;
      if (b.pinned && !a.pinned) [keep, drop] = [b, a];
      else if (a.pinned === b.pinned) {
        const sa = scoreOf(a), sb = scoreOf(b);
        if (sb > sa || (sb === sa && b.id < a.id)) [keep, drop] = [b, a];
      }
      const p = { keep: keep.id, drop: drop.id };
      if (rejected.has(mergePairKey(p))) continue;
      out.push(p);
    }
  }
  return out;
}

/**
 * 执行合并：保留 keep，drop 盖作废归档章。不丢信息——
 * drop 的关联并进 keep，指向 drop 的边改指 keep，keep 记一条取代边，
 * 手动分取两者较高，任一方钉住则保留钉住。
 */
export function applyMerge(
  entries: MemoryEntry[],
  p: MergeProposal,
  now: string
): MemoryEntry[] {
  const keep = entries.find((e) => e.id === p.keep);
  const drop = entries.find((e) => e.id === p.drop);
  if (!keep || !drop || keep.id === drop.id) return entries;
  return entries.map((e) => {
    if (e.id === keep.id) {
      const tos = new Set(e.relations.map((r) => r.to));
      const merged = [...e.relations];
      for (const r of drop.relations) {
        if (r.to !== keep.id && !tos.has(r.to)) {
          merged.push(r);
          tos.add(r.to);
        }
      }
      if (!tos.has(drop.id)) merged.push({ to: drop.id, rel: "supersedes" });
      const weight =
        e.weight !== undefined || drop.weight !== undefined
          ? Math.max(e.weight ?? 0, drop.weight ?? 0)
          : undefined;
      return {
        ...e,
        relations: merged,
        ...(weight !== undefined ? { weight } : {}),
        ...(drop.pinned ? { pinned: true } : {}),
        updatedAt: now,
      };
    }
    if (e.id === drop.id) {
      return { ...e, archived: { reason: "superseded" as const, at: now }, updatedAt: now };
    }
    // 其他条目指向 drop 的边改指 keep（已指 keep 则去重）
    if (e.relations.some((r) => r.to === drop.id)) {
      const hasKeep = e.relations.some((r) => r.to === keep.id);
      const relations = e.relations
        .filter((r) => !(r.to === drop.id && hasKeep))
        .map((r) => (r.to === drop.id ? { ...r, to: keep.id } : r));
      return { ...e, relations, updatedAt: now };
    }
    return e;
  });
}

/** 提案旁挂文件的内容：待确认队列 + 已驳回名单（防复提）。 */
export type EntrySuggestions = {
  pendingRelations: RelationProposal[];
  rejectedRelations: string[];
  pendingMerges: MergeProposal[];
  rejectedMerges: string[];
};

export const EMPTY_SUGGESTIONS: EntrySuggestions = {
  pendingRelations: [],
  rejectedRelations: [],
  pendingMerges: [],
  rejectedMerges: [],
};

/** 新合并提案并进已有队列，按防复提键去重。 */
export function mergeMergeProposals(
  pending: MergeProposal[],
  fresh: MergeProposal[]
): MergeProposal[] {
  const seen = new Set(pending.map(mergePairKey));
  const out = [...pending];
  for (const p of fresh) {
    const k = mergePairKey(p);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

/** 新提案并进已有队列，按防复提键去重，顺序保持先来的在前。 */
export function mergeProposals(
  pending: RelationProposal[],
  fresh: RelationProposal[]
): RelationProposal[] {
  const seen = new Set(pending.map(relPairKey));
  const out = [...pending];
  for (const p of fresh) {
    const k = relPairKey(p);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

// ── 相近检索：关键词搜不到的换个说法也能找到（本地相似度，不联网）────
// 语义检索的第一版：查询和正文都切成二字字对，查询字对出现在正文里的
// 占比即相似度。机械但可解释，真语义要嵌入模型，以后再说。

/** 文本切成二字字对集合，去空白、统一小写。太短返回空集。 */
function textBigrams(text: string): Set<string> {
  const s = text.replace(/\s+/g, "").toLowerCase();
  const out = new Set<string>();
  for (let i = 0; i + 2 <= s.length; i++) out.add(s.slice(i, i + 2));
  return out;
}

/** 查询对正文的包含度：查询字对有多大比例出现在正文里，0 到 1。 */
export function similarityScore(query: string, text: string): number {
  const q = textBigrams(query);
  if (!q.size) return 0;
  const t = textBigrams(text);
  let shared = 0;
  for (const b of q) if (t.has(b)) shared++;
  return shared / q.size;
}

export type SimilarHit = { id: string; score: number };

/**
 * 按相似度找相近条目，排除已被关键词直接命中的（excludeIds），
 * 高分在前，只出超过阈值的，最多 limit 条。
 */
export function searchSimilar(
  entries: MemoryEntry[],
  query: string,
  excludeIds: Set<string>,
  opts: { limit?: number; minScore?: number } = {}
): SimilarHit[] {
  const { limit = 5, minScore = 0.25 } = opts;
  const hits: SimilarHit[] = [];
  for (const e of entries) {
    if (excludeIds.has(e.id)) continue;
    const score = similarityScore(query, e.text);
    if (score >= minScore) hits.push({ id: e.id, score });
  }
  hits.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  return hits.slice(0, limit);
}

// ── 统一检索入口：关键词命中 + 关联双向带出 + 相近兜底 ─────────────
// 双视图同源纪律的检索版：人翻库（记忆库页搜索框）和 AI 拉取（MCP
// search_memory）走同一个函数，避免两条检索路各自演化。

export type EntrySearchHit = {
  entry: MemoryEntry;
  /** keyword 直接命中；related 被命中条目的关联带出；similar 换说法相近。 */
  match: "keyword" | "related" | "similar";
};

/**
 * 在一个库里检索。关键词命中正文或编号（不分大小写），命中条目的关联
 * 双向一起带出；关键词覆盖不到的再按相近兜底。opts.filter 只约束关键词
 * 命中（带出的关联不受限，和记忆库页行为一致）。关键词命中按分高在前，
 * opts.scoreOf 是排序尺子（生产调用方传 weight.ts 的 scoreEntryAt，
 * 与注入挑选、界面档位同一把尺；缺省退回原始 weight 字段仅供测试）。
 * 归档条目照常可搜（检索是捞回通道，遗忘只挡注入不挡检索）。
 */
export function searchEntries(
  entries: MemoryEntry[],
  query: string,
  opts: {
    filter?: (e: MemoryEntry) => boolean;
    maxSimilar?: number;
    scoreOf?: (e: MemoryEntry) => number;
  } = {}
): EntrySearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const { filter, maxSimilar = 5, scoreOf = (e) => e.weight ?? 50 } = opts;
  const keyword = entries.filter(
    (e) =>
      (e.text.toLowerCase().includes(q) || e.id.toLowerCase().includes(q)) &&
      (!filter || filter(e))
  );
  keyword.sort((a, b) => scoreOf(b) - scoreOf(a));
  const hitIds = new Set(keyword.map((e) => e.id));
  const related: MemoryEntry[] = [];
  for (const e of entries) {
    if (hitIds.has(e.id)) continue;
    const linked =
      e.relations.some((r) => hitIds.has(r.to)) ||
      keyword.some((h) => h.relations.some((r) => r.to === e.id));
    if (linked) related.push(e);
  }
  const excluded = new Set([...hitIds, ...related.map((e) => e.id)]);
  const similar = searchSimilar(entries, query, excluded, { limit: maxSimilar });
  const byId = new Map(entries.map((e) => [e.id, e]));
  return [
    ...keyword.map((entry) => ({ entry, match: "keyword" as const })),
    ...related.map((entry) => ({ entry, match: "related" as const })),
    ...similar.map((h) => ({ entry: byId.get(h.id)!, match: "similar" as const })),
  ];
}

// ── AI 整理提示词：把导出 md 交给外部 AI 调标签、提关联，改完导回 ────

export function buildRefinePrompt(exportedMd: string): string {
  return `请帮我整理下面的记忆条目清单。每行一条记忆，格式固定：

- [编号] 正文 #类型 @来源 ->关联编号

你要做的：
1. 检查每条的 #类型 标签是否贴切，不贴切就改。八类可选：#决策 #约束 #状态 #交接 #事实 #偏好 #技能 #零散。一条可以有多个类型标签。
2. 找出内容上相关的条目，在行尾加 ->编号 指向对方，一行可以有多个箭头。已有的箭头如果不合理可以删。
3. 只动 #标签 和 ->箭头。不许改正文、不许改 [编号]、不许改 @来源、不许增删行。

输出完整清单，格式和输入完全一样，不要解释。

${exportedMd}`;
}

// ── 写入闭环：卡片入库后同步条目库（机械第一版）───────────────────
// 新对话总结写进 cards.md 后调用：卡片里的新行补进条目库，被替代的旧条目
// 盖作废归档章。不动用户手动调过的档位、钉住和已有条目，钉住的豁免自动归档。

const normText = (t: string) => t.replace(/\s+/g, " ").trim();

export type SyncResult = { entries: MemoryEntry[]; added: number; archivedCount: number };

export function syncEntriesWithCards(
  existing: MemoryEntry[],
  cardsMd: string,
  scope: EntryScope,
  now: string,
  superseded: string[] = []
): SyncResult {
  const have = new Set(existing.filter((e) => !e.archived).map((e) => normText(e.text)));
  const counter: { id: string }[] = [...existing];
  const out: MemoryEntry[] = [...existing];
  const newIds: string[] = [];
  let added = 0;
  for (const cand of migrateCardsToEntries(cardsMd, scope, now)) {
    if (have.has(normText(cand.text))) continue;
    const id = nextEntryId(counter);
    counter.push({ id });
    out.push({ ...cand, id });
    newIds.push(id);
    have.add(normText(cand.text));
    added++;
  }
  // 隐式边（知识图谱最便宜的关系）：同一次对话总结产生的新条目互相关联。
  // 存成链式，每条指向前一条，避免两两全连边数爆炸。
  if (newIds.length > 1) {
    const idSet = new Set(newIds);
    for (const e of out) {
      if (!idSet.has(e.id)) continue;
      const idx = newIds.indexOf(e.id);
      if (idx > 0) {
        e.relations = [...e.relations, { to: newIds[idx - 1], rel: "from_same_session" }];
      }
    }
  }
  let archivedCount = 0;
  const final = out.map((e) => {
    if (e.archived || e.pinned) return e;
    const en = normText(e.text);
    const hit = superseded.some((s) => {
      const sn = normText(s);
      return sn.length > 3 && (en.includes(sn) || sn.includes(en));
    });
    if (!hit) return e;
    archivedCount++;
    return { ...e, archived: { reason: "superseded" as const, at: now }, updatedAt: now };
  });
  return { entries: final, added, archivedCount };
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
