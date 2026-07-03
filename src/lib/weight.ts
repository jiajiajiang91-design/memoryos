// 权重模块 · 地基库（纯函数）。
//
// 设计稿：docs/prd/权重模块/权重模块_功能定义_v0.1.md
//
// 边界（重要）：本文件**只做纯计算**——不读写文件、不碰 Tauri、不动 cards.md、
// 不接线进任何 UI 或开场注入。所有跟时间相关的输入（距今天数等）都由调用方算好
// 再传进来，保证函数确定、可测。这样它对现有 app 行为零影响，等 Jiajia review
// 后再决定接线（接线步骤见功能定义 §9 的 S3+，且都标了「需拍板」）。
//
// 三条红线在本文件里是分开的函数，绝不合并：
//   红线1：applyWeightDelta（改数值）/ rerank（层内排序）/ canReclaim（捞回守卫）
//   红线2：isSupersededArchive（内容触发）/ shouldDemoteArchive（权重触发）
//   红线3：触发是调用层的事，本库只提供判定，不自己发起任何动作。

// ── 类型 ───────────────────────────────────────────────

/** 记忆类型——决定新鲜度衰减曲线（A7）。 */
export type MemoryKind = "decision" | "constraint" | "state" | "handoff" | "skill" | "misc";

/** 来源类型——决定初始确定性与冷启动分（A9 / 确定性因子）。 */
export type SourceKind = "user_ratified" | "ai_suggestion" | "third_party";

/** 作用域——排序只在同一池内比较（A6）。 */
export type WeightScope = "project" | "skill" | "global";

/** 给人看的三档（A1）——不暴露裸分，避免数字焦虑。 */
export type Tier = "high" | "mid" | "low";

/** 四因子，各 0–100（A3）。 */
export type Factors = {
  importance: number;
  freshness: number;
  activity: number;
  certainty: number;
};

/** 一条记忆的权重记录（A2 里存进旁挂文件的值；本库只算不存）。 */
export type WeightRecord = {
  factors: Factors;
  kind: MemoryKind;
  scope: WeightScope;
  /** 手动钉住：永不自动降、永不自动归档（A5）。 */
  pinned: boolean;
  /** 手动覆盖分：非空时压过自动合成分（A5）。 */
  manualScore?: number;
  /** 结构卡（项目卡 / 关于我）豁免自动降权归档（A8）。 */
  exempt: boolean;
};

// ── 常量（A4 合成系数 / C 阈值，先写死，后续再开放可调）──────

/** 四因子合成系数（A4）。合计为 1。 */
export const FACTOR_WEIGHTS: Readonly<Record<keyof Factors, number>> = {
  importance: 0.4,
  freshness: 0.25,
  activity: 0.2,
  certainty: 0.15,
};

/** 三档 / 归档阈值（C）。 */
export const THRESHOLDS = {
  /** ≥ promote → 高档 */
  promote: 67,
  /** < demote → 低档 */
  demote: 34,
  /** < archive 且久未引用 → 可降权归档（B5） */
  archive: 20,
} as const;

/** 缺失权重记录时的中性默认分（A10）——保证旧条目不阻塞排序。 */
export const NEUTRAL_SCORE = 50;

/** 新鲜度半衰期（天，A7）：决策/约束衰减极慢，状态/交接正常衰减。 */
export const HALF_LIFE_DAYS: Readonly<Record<MemoryKind, number>> = {
  decision: 180,
  constraint: 180,
  skill: 120,
  state: 14,
  handoff: 14,
  misc: 30,
};

// ── 小工具 ─────────────────────────────────────────────

/** 夹到 [0,100]。 */
export function clampScore(n: number): number {
  if (Number.isNaN(n)) return NEUTRAL_SCORE;
  return Math.max(0, Math.min(100, n));
}

// ── A1：三档派生 ───────────────────────────────────────

export function toTier(score: number): Tier {
  if (score >= THRESHOLDS.promote) return "high";
  if (score < THRESHOLDS.demote) return "low";
  return "mid";
}

// ── A3 / A4：因子 → 合成分 ──────────────────────────────

/** D1：取不到的因子按中性 50 处理，不让整条算不出。 */
function safeFactor(v: number | undefined): number {
  if (v === undefined || Number.isNaN(v)) return NEUTRAL_SCORE;
  return clampScore(v);
}

/** A4：四因子加权合成 0–100。 */
export function composeScore(factors: Factors): number {
  const f: Factors = {
    importance: safeFactor(factors.importance),
    freshness: safeFactor(factors.freshness),
    activity: safeFactor(factors.activity),
    certainty: safeFactor(factors.certainty),
  };
  const raw =
    f.importance * FACTOR_WEIGHTS.importance +
    f.freshness * FACTOR_WEIGHTS.freshness +
    f.activity * FACTOR_WEIGHTS.activity +
    f.certainty * FACTOR_WEIGHTS.certainty;
  return clampScore(raw);
}

/** A5：有效分 = 手动覆盖优先，否则自动合成。pin 不改分，只影响归档判定。 */
export function effectiveScore(rec: WeightRecord): number {
  if (rec.manualScore !== undefined) return clampScore(rec.manualScore);
  return composeScore(rec.factors);
}

// ── 因子取值辅助（纯函数，时间由调用方算好传入）─────────────

/** 新鲜度：按类型半衰期，从「距今天数」算 0–100（A7）。days=0 → 100。 */
export function freshnessFromAge(daysOld: number, kind: MemoryKind): number {
  const d = Math.max(0, daysOld);
  const halfLife = HALF_LIFE_DAYS[kind] ?? HALF_LIFE_DAYS.misc;
  return clampScore(100 * Math.pow(0.5, d / halfLife));
}

// ── 多标签接入（06-28 确认：一条多类型时衰减按最慢的那类算）─────────

// 条目库的八类映射到权重的衰减类型。事实和偏好是稳定信息，按慢衰减对待。
const ENTRY_KIND_TO_MEMORY_KIND: Readonly<Record<string, MemoryKind>> = {
  decision: "decision",
  constraint: "constraint",
  state: "state",
  handoff: "handoff",
  fact: "misc",
  preference: "constraint",
  skill: "skill",
  misc: "misc",
};

/** 多类型取最慢衰减：半衰期取集合里最长的那个。空集合按 misc。 */
export function slowestHalfLife(entryKinds: string[]): number {
  let max = 0;
  for (const k of entryKinds) {
    const mk = ENTRY_KIND_TO_MEMORY_KIND[k] ?? "misc";
    max = Math.max(max, HALF_LIFE_DAYS[mk]);
  }
  return max || HALF_LIFE_DAYS.misc;
}

/** 多类型新鲜度：按最慢半衰期衰减。 */
export function freshnessFromAgeMulti(daysOld: number, entryKinds: string[]): number {
  const d = Math.max(0, daysOld);
  return clampScore(100 * Math.pow(0.5, d / slowestHalfLife(entryKinds)));
}

// 条目库的来源四类映射确定性：用户 > AI建议 > AI推论 > 三方；三方已校验可上调。
export function certaintyFromEntrySource(
  source: string,
  truthiness?: "verified" | "unverified"
): number {
  switch (source) {
    case "user":
      return 90;
    case "ai_suggestion":
      return 50;
    case "ai_inference":
      return 40;
    case "third_party":
      return truthiness === "verified" ? 55 : 30;
    default:
      return NEUTRAL_SCORE;
  }
}

/**
 * 条目级合成分：用条目的真实标签算四因子。
 * daysOld 距最后更新天数、activity 活跃度 0–100 由调用方给，缺省中性。
 */
export function scoreEntry(
  e: { kinds: string[]; source: string; truthiness?: "verified" | "unverified"; weight?: number },
  daysOld: number,
  activity = NEUTRAL_SCORE
): number {
  if (e.weight !== undefined) return clampScore(e.weight); // 手动分优先
  return composeScore({
    importance: e.source === "user" ? 70 : NEUTRAL_SCORE,
    freshness: freshnessFromAgeMulti(daysOld, e.kinds),
    activity,
    certainty: certaintyFromEntrySource(e.source, e.truthiness),
  });
}

/** 确定性：来源类型映射（点40 三方默认低，真实性校验后可由调用方调高）。 */
export function certaintyFromSource(source: SourceKind): number {
  switch (source) {
    case "user_ratified":
      return 90;
    case "ai_suggestion":
      return 50;
    case "third_party":
      return 30;
  }
}

/** A9：冷启动初始合成分（由来源驱动确定性 + 中性其余因子）。 */
export function initialScore(source: SourceKind): number {
  return composeScore({
    importance: source === "user_ratified" ? 70 : NEUTRAL_SCORE,
    freshness: 100, // 刚入库，最新
    activity: NEUTRAL_SCORE,
    certainty: certaintyFromSource(source),
  });
}

// ── D2：阈值校验防呆 ───────────────────────────────────

export function validateThresholds(t: {
  promote: number;
  demote: number;
  archive: number;
}): { ok: boolean; error?: string } {
  if (!(t.demote < t.promote)) return { ok: false, error: "降档阈值必须 < 升档阈值" };
  if (!(t.archive < t.demote)) return { ok: false, error: "归档阈值必须 < 降档阈值" };
  for (const [k, v] of Object.entries(t)) {
    if (v < 0 || v > 100) return { ok: false, error: `阈值 ${k} 越界(${v})，须在 0–100` };
  }
  return { ok: true };
}

// ── 红线1：三个分开的动作 ──────────────────────────────

/** B1 升/降权：只改数值（手动覆盖分）。返回新对象，不改入参（纯函数）。 */
export function applyWeightDelta(rec: WeightRecord, delta: number): WeightRecord {
  const base = effectiveScore(rec);
  return { ...rec, manualScore: clampScore(base + delta) };
}

/** B2 升档/降档：现行层**内部**按有效分降序排（不跨档案，不改分）。 */
export function rerank<T extends { weight: WeightRecord }>(records: T[]): T[] {
  return [...records].sort((a, b) => effectiveScore(b.weight) - effectiveScore(a.weight));
}

/** B3 捞回守卫：已驳回（rejected）的条目不许捞回；钉住的总是允许。 */
export function canReclaim(entryKey: string, rejectedKeys: ReadonlySet<string>): boolean {
  return !rejectedKeys.has(entryKey);
}

// ── 红线2：两种归档判定（分开，原因不同）───────────────────

/**
 * B4 作废归档：内容被替代触发。本库不自己判断"内容是否被替代"
 * （那是蒸馏/Review 流程的事，已由 appendDecisionsArchive 落地），
 * 这里只是显式留一个分开的入口标记，强调它与 B5 不是一回事。
 */
export function isSupersededArchive(contentReplaced: boolean): boolean {
  return contentReplaced;
}

/**
 * B5 降权归档：权重低触发。score 低于归档阈值 且 久未引用 才归档。
 * 钉住 / 豁免（结构卡）永不自动归档（A5 / A8 / D4）。
 */
export function shouldDemoteArchive(
  rec: WeightRecord,
  daysIdle: number,
  minIdleDays = 30
): boolean {
  if (rec.pinned || rec.exempt) return false;
  return effectiveScore(rec) < THRESHOLDS.archive && daysIdle >= minIdleDays;
}

// ── F：对外接口（只排序，不取数；功能归检索/读取模块实现）───────

/** F1 归档排序：低分在前（最该被归档的排最前），用于归档候选预览。 */
export function sortForArchive<T extends { weight: WeightRecord }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => effectiveScore(a.weight) - effectiveScore(b.weight));
}

/** F2 检索 TOP-K：按有效分降序取前 k（k<=0 返回空）。 */
export function topK<T extends { weight: WeightRecord }>(entries: T[], k: number): T[] {
  if (k <= 0) return [];
  return rerank(entries).slice(0, k);
}

/**
 * F3 按权重注入：在字数预算内，从高分往低分挑，直到放不下。
 * sizeOf 由调用方提供（本库不认识条目内容，保持纯粹）。
 */
export function rankForInjection<T extends { weight: WeightRecord }>(
  entries: T[],
  budgetChars: number,
  sizeOf: (e: T) => number
): T[] {
  const out: T[] = [];
  let used = 0;
  for (const e of rerank(entries)) {
    const size = sizeOf(e);
    if (used + size > budgetChars) continue;
    out.push(e);
    used += size;
  }
  return out;
}

/**
 * F4 约束/决策排序：时间 + 权重（点24）。
 * 先按有效分降序，同分再按日期新→旧；日期由调用方传时间戳数。
 */
export function sortDecisions<T extends { weight: WeightRecord; dateTs: number }>(
  entries: T[]
): T[] {
  return [...entries].sort((a, b) => {
    const ds = effectiveScore(b.weight) - effectiveScore(a.weight);
    if (ds !== 0) return ds;
    return b.dateTs - a.dateTs;
  });
}
