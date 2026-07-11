// 现行卡（cards.md）——记忆质量闭环的核心数据文件（PRD·记忆质量升级 F3）。
// 每个项目一份，五张卡：项目卡 / 现行状态 / 现行约束与决策 / 上次交接 / 可调档案索引。
// 全局「关于我」(about_me.md) 不在本文件里，开始指令注入时拼在最前。
// 文件存在 = 该项目启用现行卡模式；不存在 = 沿用旧 context/decisions 流程（逐项目渐进迁移，零破坏）。

export const CARDS_FILENAME = "cards.md";

// 开场注入预算（黄金输出定稿：≤1200 字，按去空白字符数算，中文场景字≈字符）
export const CARDS_BUDGET_CHARS = 1200;

export type CardsStamp = { distilledOn: string };

// 整理日期行（现时性展示 + 并发兜底）：`> 整理于 2026-06-10` / `> Tidied 2026-06-10`。
// 用户确认（06-10）：不向用户暴露 vN 版本号。旧写法 `> 版本: vN · 整理于/蒸馏于 …` 兼容可读。
const STAMP_RE =
  /^>\s*(?:(?:版本|Version)[:：]\s*v\d+\s*·\s*)?(?:整理于|蒸馏于|Tidied|tidied|distilled)\s*(\d{4}-\d{2}-\d{2})\s*$/m;

export function parseCardsStamp(content: string): CardsStamp | null {
  const m = content.match(STAMP_RE);
  if (!m) return null;
  return { distilledOn: m[1] };
}

/** 落盘前重写整理日期行（入库时由 App 执行；AI 提案里保留的旧日期只用来做并发比对）。 */
export function stampCards(content: string, distilledOn: string, lang: "zh" | "en" = "zh"): string {
  const line = lang === "en" ? `> Tidied ${distilledOn}` : `> 整理于 ${distilledOn}`;
  if (STAMP_RE.test(content)) return content.replace(STAMP_RE, line);
  // 没有戳：插在一级标题后，否则放最前
  const lines = content.split("\n");
  if (lines[0]?.startsWith("# ")) {
    return [lines[0], line, ...lines.slice(1)].join("\n");
  }
  return line + "\n" + content;
}

/** 预算用字数：去掉所有空白后的字符数。 */
export function cardsCharCount(content: string): number {
  return content.replace(/\s/g, "").length;
}

/**
 * Review 时被采纳的 AI 建议 → 升格为用户确认的决策，插进「现行约束与决策」卡。
 * （来源标记：升格日期 = 用户点头那天，不是 AI 提出那天。）
 */
export function adoptSuggestionsIntoCards(
  cards: string,
  adopted: string[],
  today: string,
  lang: "zh" | "en" = "zh"
): string {
  if (!adopted.length) return cards;
  const tag = lang === "en" ? "confirmed in review" : "用户确认·Review 采纳";
  const lines = adopted.map((a) => `- [${today}][${tag}] ${a.trim()}`);
  // 新旧标题都认（约束与决策 = 现行命名；现行约束与决策 = 旧命名兼容）
  const headingRe = /^##\s*(?:约束与决策|现行约束与决策|Constraints & Decisions|Active Constraints & Decisions)[^\n]*$/m;
  const m = cards.match(headingRe);
  if (m && m.index !== undefined) {
    const insertAt = m.index + m[0].length;
    return cards.slice(0, insertAt) + "\n" + lines.join("\n") + cards.slice(insertAt);
  }
  // 找不到决策卡标题 → 追加到文件尾（解析容错，不丢内容）
  return cards.trimEnd() + "\n\n## " + (lang === "en" ? "Constraints & Decisions" : "约束与决策") + "\n" + lines.join("\n") + "\n";
}

/**
 * 清理粘贴来的卡片文本：去 ``` 围栏 + 去公共行首缩进。
 * 从聊天窗口复制时每行常带固定缩进（真实试用实证 2026-06-10：缩进让版本戳识别失败 → 重复戳）。
 */
export function stripCodeFence(content: string): string {
  const stripped = content.trim().replace(/^```\w*\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
  const lines = stripped.split("\n");
  // 公共缩进从第 2 个非空行起算：聊天窗口选区常导致首行无缩进、其余行带固定缩进
  const indents = lines
    .slice(1)
    .filter((l) => l.trim().length > 0)
    .map((l) => l.match(/^[ \t]*/)?.[0].length ?? 0);
  const common = indents.length ? Math.min(...indents) : 0;
  if (common === 0) return stripped;
  return lines
    .map((l) => {
      const own = l.match(/^[ \t]*/)?.[0].length ?? 0;
      return l.slice(Math.min(own, common));
    })
    .join("\n");
}

/** 新项目 / 迁移失败兜底用的空卡模板。 */
export function buildEmptyCards(projectName: string, today: string, lang: "zh" | "en" = "zh"): string {
  if (lang === "en") {
    return `# Memory Cards · ${projectName}
> Tidied ${today}

## Project
(What this is / who it's for / where it stands — within 3 sentences)

## Current State
- Done:
- In progress:
- Stuck on:

## Constraints & Decisions
(Each entry dated; only what is valid NOW. Replaced entries move to the archive.)

## Last Session Summary
(Latest only: what we did / what was ratified / where to start next time)

## Archives
- Decision history (incl. superseded & rejected) → decisions.md / rejected.md in the project folder
- Past session summaries → sessions/ in the project folder
(Fetch on demand — do not read everything.)
`;
  }
  return `# 记忆卡片 · ${projectName}
> 整理于 ${today}

## 项目卡
（这是什么 / 给谁用 / 现在到哪了——三句话以内）

## 当前状态
- 已完成：
- 进行中：
- 当前卡点：

## 约束与决策
（每条带日期，只放现在仍有效的；被替代的条目移入历史档案）

## 上次对话总结
（只保留最近一次：上次做了什么 / 拍了什么板 / 本次从哪开始）

## 历史档案
- 决策历史（含已作废、已驳回）→ 项目文件夹 decisions.md / rejected.md
- 历次对话总结 → 项目文件夹 sessions/
（需要细节再取，勿全读）
`;
}
