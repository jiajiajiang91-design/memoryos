// MemoryOS handoff Markdown parser + prompt builders.
// Splits the standard 9-section handoff into structured fields.
// Prompt builders accept lang for zh/en switching.

import type { ParsedHandoff } from "../types";
import type { Lang } from "./lang";

function extract(text: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const patterns: RegExp[] = [
    // #{1-3} with optional number, tolerates leading horizontal whitespace
    new RegExp(
      `(?:^|\\n)[ \\t]*#{1,3}\\s*(?:\\d+\\.?\\s+)?${escaped}[^\\n]*\\n([\\s\\S]*?)(?=\\n[ \\t]*#{1,3}\\s|$)`,
      "i"
    ),
    // Bold: "**1. Heading**" / "**Heading**"
    new RegExp(
      `(?:^|\\n)[ \\t]*\\*\\*\\s*(?:\\d+\\.?\\s+)?${escaped}[^\\n]*\\*\\*[^\\n]*\\n([\\s\\S]*?)(?=\\n[ \\t]*\\*\\*\\s*(?:\\d|[A-Z\\u4e00-\\u9fa5])|\\n[ \\t]*#{1,3}\\s|$)`,
      "i"
    ),
    // Numbered without #: "1. Heading" (allows leading indent from terminal-pasted markdown)
    new RegExp(
      `(?:^|\\n)[ \\t]*\\d+\\.\\s+${escaped}[^\\n]*\\n([\\s\\S]*?)(?=\\n[ \\t]*\\d+\\.\\s+[A-Z\\u4e00-\\u9fa5]|\\n[ \\t]*#{1,3}\\s|$)`,
      "i"
    ),
    // Plain heading: just the heading on its own line (last-resort, e.g. "Metadata\n")
    new RegExp(
      `(?:^|\\n)[ \\t]*${escaped}[ \\t]*\\n([\\s\\S]*?)(?=\\n[ \\t]*\\d+\\.\\s+[A-Z\\u4e00-\\u9fa5]|\\n[ \\t]*#{1,3}\\s|\\n[ \\t]*\\*\\*|$)`,
      "i"
    ),
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return "";
}

/**
 * 抽取「六卡更新提案」（现行卡模式，PRD·记忆质量升级 F1）。
 * 提案本身是一份完整 cards.md（内含 ## 二级标题），普通按-下一个-标题-截断的 extract()
 * 会把它切碎，所以要求 AI 放在 ``` 围栏代码块里，这里手工定位围栏边界。
 * 返回 { cards: 围栏内全文, tail: 围栏后的剩余文本（供扫 Superseded 行） }。
 */
/** 通用：定位某标题后的 ``` 围栏代码块。cards 提案和条目提案共用。 */
function extractFencedBlock(
  raw: string,
  headings: string[]
): { body: string; tail: string } {
  for (const h of headings) {
    const escaped = h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const hm = raw.match(
      new RegExp(
        `(?:^|\\n)[ \\t]*(?:#{1,3}\\s*(?:\\d+\\.?\\s+)?|\\*\\*\\s*(?:\\d+\\.?\\s+)?)?${escaped}`,
        "i"
      )
    );
    if (!hm || hm.index === undefined) continue;
    const after = raw.slice(hm.index + hm[0].length);
    const fenceOpen = after.match(/```(?:markdown|md)?[ \t]*\n/);
    if (!fenceOpen || fenceOpen.index === undefined) continue;
    const bodyStart = fenceOpen.index + fenceOpen[0].length;
    const fenceClose = after.slice(bodyStart).indexOf("\n```");
    if (fenceClose === -1) continue;
    const body = after.slice(bodyStart, bodyStart + fenceClose).trim();
    const tail = after.slice(bodyStart + fenceClose + 4, bodyStart + fenceClose + 4 + 2000);
    return { body, tail };
  }
  return { body: "", tail: "" };
}

function extractCardsProposal(raw: string): { cards: string; tail: string } {
  const headings = [
    "Proposed cards.md Update",
    "Proposed Cards Update",
    "现行卡更新提案",
    "建议更新到现行卡",
  ];
  for (const h of headings) {
    const escaped = h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const hm = raw.match(
      new RegExp(
        `(?:^|\\n)[ \\t]*(?:#{1,3}\\s*(?:\\d+\\.?\\s+)?|\\*\\*\\s*(?:\\d+\\.?\\s+)?)?${escaped}`,
        "i"
      )
    );
    if (!hm || hm.index === undefined) continue;
    const after = raw.slice(hm.index + hm[0].length);
    const fenceOpen = after.match(/```(?:markdown|md)?[ \t]*\n/);
    if (!fenceOpen || fenceOpen.index === undefined) continue;
    const bodyStart = fenceOpen.index + fenceOpen[0].length;
    const fenceClose = after.slice(bodyStart).indexOf("\n```");
    if (fenceClose === -1) continue;
    const cards = after.slice(bodyStart, bodyStart + fenceClose).trim();
    const tail = after.slice(bodyStart + fenceClose + 4, bodyStart + fenceClose + 4 + 2000);
    return { cards, tail };
  }
  return { cards: "", tail: "" };
}

export function parseHandoff(raw: string): ParsedHandoff {
  const metaText = extract(raw, "Metadata");
  const metadata: Record<string, string> = {};
  for (const line of metaText.split("\n")) {
    const m = line.match(/^\s*-\s*([^:]+):\s*(.+)$/);
    if (m) metadata[m[1].trim()] = m[2].trim();
  }
  if (!metadata["Date"]) {
    const d = raw.match(/Date:\s*([\d-]+)/)?.[1];
    if (d) metadata["Date"] = d;
  }
  if (!metadata["Source Tool"]) {
    const t = raw.match(/Source Tool:\s*(\w+)/)?.[1];
    if (t) metadata["Source Tool"] = t;
  }
  const proposal = extractCardsProposal(raw);
  // 条目模式提案（07-11 写入口条目原生化）：新记忆条目行的围栏代码块
  const entriesProposal = extractFencedBlock(raw, [
    "Proposed Memory Entries",
    "记忆条目更新",
    "新记忆条目",
  ]);
  return {
    metadata,
    whatWeWorkedOn:
      extract(raw, "What We Worked On") || extract(raw, "做了什么") || extract(raw, "本轮工作"),
    keyDecisions:
      extract(raw, "Key Decisions") || extract(raw, "关键决策") || extract(raw, "重要决策"),
    currentState:
      extract(raw, "Current Project State") || extract(raw, "Current State") ||
      extract(raw, "当前项目状态") || extract(raw, "当前状态"),
    openQuestions:
      extract(raw, "Open Questions") || extract(raw, "未解决问题") || extract(raw, "开放问题"),
    nextActions:
      extract(raw, "Next Actions") || extract(raw, "下一步行动") || extract(raw, "下一步"),
    suggestedContextUpdate:
      extract(raw, "Suggested Updates to 00_context.md") ||
      extract(raw, "Suggested Updates to 00_context") ||
      extract(raw, "建议更新到 00_context") ||
      extract(raw, "建议更新到项目说明"),
    suggestedDecisionsUpdate:
      extract(raw, "Suggested Updates to decisions.md") ||
      extract(raw, "Suggested Updates to decisions") ||
      extract(raw, "建议更新到 decisions") ||
      extract(raw, "建议更新到决策记录"),
    suggestedAboutMeUpdate:
      extract(raw, "Suggested Updates to about_me.md") ||
      extract(raw, "Suggested Updates to about_me") ||
      extract(raw, "建议更新到 about_me") ||
      extract(raw, "建议更新到关于我"),
    compactContext:
      extract(raw, "Compact Context for Next Session") ||
      extract(raw, "Compact Context") ||
      extract(raw, "压缩上下文") || extract(raw, "下次对话"),
    // ── 现行卡模式（旧格式 handoff 解析出来就是空串/空数组，互不影响）──
    aiSuggestions:
      extract(raw, "AI Suggestions") ||
      extract(raw, "AI 建议") ||
      extract(raw, "建议待确认"),
    proposedCards: proposal.cards,
    proposedCardsSuperseded: proposal.cards ? extractSuperseded(proposal.tail) : [],
    proposedEntries: entriesProposal.body,
  };
}

export function extractSuperseded(suggestedUpdate: string): string[] {
  const out: string[] = [];
  const re = /(?:\*\*)?Superseded:?(?:\*\*)?\s*(.+)/gi;
  let m;
  while ((m = re.exec(suggestedUpdate)) !== null) {
    for (const part of m[1].split(/[;；,，]/)) {
      const trimmed = part.replace(/^["'「」"']+|["'「」"']+$/g, "").trim();
      if (/^(none|无|没有|n\/a)\.?$/i.test(trimmed)) continue; // 占位词不是关键词
      if (trimmed && trimmed.length > 2) out.push(trimmed);
    }
  }
  return out;
}

export function aboutMeBootstrapPrompt(
  optsOrLang: Lang | { existingAboutMe?: string; lang?: Lang } = "zh"
): string {
  const opts =
    typeof optsOrLang === "string" ? { lang: optsOrLang } : optsOrLang;
  const lang: Lang = opts.lang ?? "zh";
  const existing = (opts.existingAboutMe ?? "").trim();
  const isRebuild = existing.length > 0;

  if (lang === "en") {
    const rebuildPreface = isRebuild
      ? `**Rebuild mode — I already have an \`about_me.md\`.** Rules update:
- Don't re-ask questions that already have answers in the existing file.
- **Preserve everything below verbatim** unless I explicitly say to change it: stable preferences, "don't do" rules, identity, long-term goals.
- Ask at most 1–2 open questions: "Anything to add or change since last time?"
- In the output, keep all unchanged items from the existing file as-is; only update what genuinely changed.

---

## Existing about_me.md (must be preserved unless I overrule)

${existing}

---

`
      : "";
    return `${rebuildPreface}I'm using MemoryOS (a local-first cross-AI working memory tool). Please help me draft an \`about_me.md\` that captures my long-term identity preferences.

Ask me a few quick questions to learn:

1. Basics (name/nickname, location, current role — student / professional / other)
2. What I'm working on (field, long-term goal, recent focus)
3. Work and communication preferences (concise vs. detailed, preferred languages, what kind of feedback is most useful)
4. AI collaboration preferences (want direct answers vs. clarifying questions, what mistakes I'm sensitive to, what I dislike)
5. Anything you want all future AI conversations to remember

After the Q&A, output the full \`about_me.md\` in the Markdown format below. I'll copy it back to MemoryOS.

\`\`\`markdown
# About Me

## Basics
- ...

## What I'm working on
- ...

## Work / communication preferences
- ...

## AI collaboration preferences
- ...

## Don't do
- ...
\`\`\`

Output only the Markdown — no extra explanation.`;
  }
  const rebuildPrefaceZh = isRebuild
    ? `**重建模式——我已经有一份 about_me.md。** 规则升级：
- 不要重新问那些现有文件里已经有答案的问题。
- **下面"现有 about_me.md"里的每一条，除非我明确说要改，否则必须原样保留**：稳定偏好、"不要做"规则、身份、长期目标。
- 最多问 1-2 个开放问题，比如"自上次以来有什么要加或改的？"。
- 输出时把现有文件里所有不变项原样保留，只动真正变了的部分。

---

## 现有 about_me.md（除非我推翻，否则必须保留）

${existing}

---

`
    : "";
  return `${rebuildPrefaceZh}我想用 MemoryOS（一个跨 AI 的本地工作记忆工具），需要你帮我整理一份长期身份偏好文件 about_me.md。

请通过对话问我几个问题来了解我：

1. 基本信息（姓名/昵称、所在地、当前身份是学生/工作还是别的）
2. 在做什么（专业、领域、长期目标、最近重点）
3. 工作和沟通偏好（喜欢简洁还是详细、中文还是英文、什么样的反馈最有用）
4. 和 AI 协作的偏好（喜欢 AI 直接给答案还是先问清楚、对什么类型的错误敏感、不喜欢 AI 做什么）
5. 任何你希望所有未来 AI 对话都记住的事情

问完后，请用下面的 Markdown 格式输出 about_me.md 完整内容，我会复制保存到 MemoryOS。

\`\`\`markdown
# About Me

## 基本信息
- ...

## 在做什么
- ...

## 工作和沟通偏好
- ...

## 和 AI 协作的偏好
- ...

## 不要做的事
- ...
\`\`\`

输出时请只给我 Markdown 内容，不要解释。`;
}

/** @deprecated 2026-06-11 退役：项目引导一律产记忆卡片（cardsBootstrapPrompt / cardsRebuildPrompt），不再生成 00_context。保留仅为历史兼容。 */
export function contextBootstrapPrompt(
  projectNameOrOpts:
    | string
    | {
        projectName: string;
        existingContext?: string;
        existingDecisions?: string;
        latestSession?: string;
        lang?: Lang;
      },
  langArg: Lang = "zh"
): string {
  const opts =
    typeof projectNameOrOpts === "string"
      ? { projectName: projectNameOrOpts, lang: langArg }
      : projectNameOrOpts;
  const projectName = opts.projectName;
  const lang: Lang = opts.lang ?? "zh";
  const existingContext = (opts.existingContext ?? "").trim();
  const existingDecisions = (opts.existingDecisions ?? "").trim();
  const latestSession = (opts.latestSession ?? "").trim();
  const isRebuild =
    existingContext.length > 0 ||
    existingDecisions.length > 0 ||
    latestSession.length > 0;

  if (lang === "en") {
    const rebuildPreface = isRebuild
      ? `**Rebuild mode — this project already has prior state.** Rules update:
- **Do NOT make me re-answer questions that already have answers below.**
- **Preserve verbatim** unless I explicitly overrule them: red lines / tech stack / timeline / resources / completed milestones / pinned decisions.
- Ask at most 1–2 open questions: "What has changed since last update?" / "Anything to adjust?"
- In the output, every unchanged item from below must appear unchanged. Only update what genuinely changed.
- If the prior context has a "Last updated: YYYY-MM-DD" line, bump it to today and append the new info under "Done / In progress" — don't drop the old entries.

---

## Existing 00_context.md (preserve unless overruled)

${existingContext || "_(empty)_"}

## Existing decisions.md — MUST be carried forward in full

${existingDecisions || "_(empty)_"}

## Latest session handoff (for recent context only — not for output)

${latestSession || "_(none)_"}

---

`
      : "";
    return `${rebuildPreface}I just created a project "${projectName}" in MemoryOS, but the project context (00_context.md) is still empty. Help me draft an initial version.

Ask me:

1. What this project is (one sentence)
2. Why I started it (background, motivation, what problem it solves)
3. Current state (done, in progress, where I'm stuck)
4. Key constraints (timeline, resources, what I can't do)
5. The 2-3 most important things for the next 1-2 weeks

After the Q&A, output the full 00_context.md in the Markdown format below.

\`\`\`markdown
# ${projectName} — Context

## Goal
One line: ...

## Background / Why
...

## Current state
> Last updated: (today's date)
- Done:
- In progress:
- Stuck on:

## Key constraints
- Timeline:
- Resources:
- Don't do / red lines:

## Next steps
...
\`\`\`

Output only the Markdown — no extra explanation.`;
  }
  const rebuildPrefaceZh = isRebuild
    ? `**重建模式——这个项目已经有过往状态。** 规则升级：
- **不要让我重新回答下面已经有答案的问题。**
- **必须原样保留**（除非我明确推翻）：所有红线 / 技术栈 / 时间线 / 资源约束 / 已完成事项 / 已拍板的决策。
- 最多问 1-2 个开放问题，比如「自上次更新以来有什么变化？」「还有什么要调整？」。
- 输出时下面每一条不变项都要原样出现。只动真正变了的部分。
- 如果旧 context 有「最后更新：YYYY-MM-DD」一行，把日期更新到今天，新信息追加在「已完成 / 进行中」下面——不要把旧条目删掉。

---

## 现有 00_context.md（除非我推翻，否则保留）

${existingContext || "_(空)_"}

## 现有 decisions.md — 必须完整保留下来，不许丢

${existingDecisions || "_(空)_"}

## 最近一次 session handoff（只供你了解最近动态，不要直接抄进输出）

${latestSession || "_(无)_"}

---

`
    : "";
  return `${rebuildPrefaceZh}我刚在 MemoryOS 里新建了一个项目「${projectName}」，但项目背景 00_context.md 还是空的。请帮我整理一份初始内容。

请问我：

1. 这个项目是什么（一句话）
2. 为什么开始（背景、动机、解决什么问题）
3. 目前进展到哪里（已完成、进行中、卡住的地方）
4. 关键约束（时间线、资源、不能做的事）
5. 接下来 1-2 周最重要的 2-3 件事

问完后用下面 Markdown 格式输出 00_context.md 完整内容，我会复制保存。

\`\`\`markdown
# ${projectName} — Context

## 项目目标
一句话：...

## 背景 / 为什么做
...

## 当前状态
> 最后更新：（今天日期）
- 已完成：
- 进行中：
- 卡住的地方：

## 关键约束
- 时间线：
- 资源：
- 不能做的事 / red lines：

## 下一步
...
\`\`\`

输出时请只给我 Markdown 内容，不要解释。`;
}

/**
 * 新项目引导（卡片原生，PRD·记忆质量升级 F3）：和 AI 问答几句，直接产出第一页记忆卡片。
 * 新用户从第一天起就是卡片模式，永远不需要经历"整理旧文档"的迁移步骤。
 */
export function cardsBootstrapPrompt(opts: { projectName: string; lang?: Lang }): string {
  const lang: Lang = opts.lang ?? "zh";
  if (lang === "en") {
    return `I just created a project "${opts.projectName}" in MemoryOS. Help me write its first page of "memory cards" (every future AI session reads this page first).

Ask me a few quick questions:

1. What this is + who it's for (within 3 sentences)
2. Where it stands (done / in progress / stuck on)
3. Anything already decided or constrained (each with a date if you can)
4. Where the next session should start

Rules: don't invent anything I didn't say; decisions I state get \`[date][ratified]\`; keep the whole page ≤ 1200 characters (excluding whitespace).

After the Q&A, output ONLY the memory cards inside one markdown code fence, exactly in this structure:

\`\`\`markdown
# Memory Cards · ${opts.projectName}
> Tidied (today's date)

## Project
…

## Current State
- Done: …
- In progress: …
- Stuck on: …

## Constraints & Decisions
- [date][ratified] …

## Last Session Summary
(first session — where to start)

## Archives
- Decision history → decisions.md / rejected.md in the project folder
- Past session summaries → sessions/ in the project folder
(Fetch on demand — do not read everything.)
\`\`\`
`;
  }
  return `我刚在 MemoryOS 里新建了项目「${opts.projectName}」。请帮我写出它的第一页「记忆卡片」（以后每次新 AI 对话开场只读这一页）。

请先问我几个问题：

1. 这是什么 + 给谁用（三句话以内）
2. 现在到哪了（已完成 / 进行中 / 卡住的地方）
3. 已经定下来的事或约束（能给日期就给日期）
4. 下次对话该从哪开始

规则：我没说过的不许编；我明确说定的事写成 \`[日期][用户拍板]\`；全文 ≤ 1200 字（不计空白）。

问完后，只输出一个 markdown 代码块内的记忆卡片全文，严格用这个结构：

\`\`\`markdown
# 记忆卡片 · ${opts.projectName}
> 整理于 （今天日期）

## 项目卡
…

## 当前状态
- 已完成：…
- 进行中：…
- 当前卡点：…

## 约束与决策
- [日期][用户拍板] …

## 上次对话总结
（首次对话——从哪开始）

## 历史档案
- 决策历史 → 项目文件夹 decisions.md / rejected.md
- 历次对话总结 → 项目文件夹 sessions/
（需要细节再取，勿全读）
\`\`\`
`;
}

/**
 * 旧项目迁移：把现有 00_context.md / decisions.md / 最近交接 蒸馏成第一版现行卡。
 * （PRD·记忆质量升级 F3 边界「旧项目迁移」——AI 出提案、用户确认后保存，旧文件冻结为档案。）
 */
export function cardsRebuildPrompt(opts: {
  projectName: string;
  existingContext: string;
  existingDecisions: string;
  latestSession?: string;
  lang?: Lang;
}): string {
  const lang: Lang = opts.lang ?? "zh";
  const ctx = opts.existingContext.trim() || (lang === "en" ? "_(empty)_" : "_(空)_");
  const dec = opts.existingDecisions.trim() || (lang === "en" ? "_(empty)_" : "_(空)_");
  const last = (opts.latestSession ?? "").trim() || (lang === "en" ? "_(none)_" : "_(无)_");

  if (lang === "en") {
    return `Help me tidy up the messy documents of my project "${opts.projectName}" into ONE clean page of "memory cards" (this is what every future AI session reads first).

Rules:
1. **Only the present survives**: dated "_Updated_" append blocks must be merged — keep the latest state of each topic, drop outdated/duplicated lines. No history narration.
2. **Decisions**: keep only currently-valid ones, each as \`- [YYYY-MM-DD][ratified] …\`. If a decision was clearly superseded by a later one, drop it (it stays in the old files). If you cannot verify something was actually ratified by me, mark it \`[unverified — confirm]\` instead of presenting it as fact.
3. **Never invent**: anything not in the documents below must not appear.
4. **Length**: the whole page ≤ 1200 characters (excluding whitespace).
5. Ask me at most 1-2 questions first if something critical is ambiguous; otherwise output directly.

Output ONLY the memory cards inside one markdown code fence, using exactly this structure:

\`\`\`markdown
# Memory Cards · ${opts.projectName}
> Tidied (today's date)

## Project
(what this is / who it's for / where it stands — within 3 sentences)

## Current State
- Done: (milestone chain only)
- In progress:
- Stuck on:

## Constraints & Decisions
- [date][ratified] …

## Last Session Summary
(latest only: what was done / what was ratified / where to start next)

## Archives
- Decision history (incl. superseded & rejected) → decisions.md / rejected.md in the project folder
- Past session summaries → sessions/ in the project folder
(Fetch on demand — do not read everything.)
\`\`\`

---

## Old 00_context.md
${ctx}

## Old decisions.md
${dec}

## Latest session summary (recent context only)
${last}
`;
  }

  return `请帮我把项目「${opts.projectName}」又长又乱的旧文档，整理成一页干净的「记忆卡片」（以后每次新 AI 对话开场只读这一页）。

整理规则：
1. **只留现在时**：旧文档里按日期追加的「_Updated_」块必须合并——同一主题只保留最新状态，过期和重复的丢掉。不要任何历史过程叙事。
2. **决策**：只保留现在仍有效的，每条写成 \`- [YYYY-MM-DD][用户拍板] …\`。明显被后来决策替代的不要收（它们留在旧文件里）。无法确认是否真由我拍板的，标 \`[来源待核]\`，不许当成既定事实。
3. **禁止编造**：下面文档里没有的内容一律不许出现。
4. **长度**：全文 ≤ 1200 字（不计空白）。
5. 如有关键歧义，最多先问我 1-2 个问题；否则直接输出。

只输出一个 markdown 代码块内的记忆卡片全文，严格用这个结构：

\`\`\`markdown
# 记忆卡片 · ${opts.projectName}
> 整理于 （今天日期）

## 项目卡
（这是什么 / 给谁用 / 现在到哪了——三句话以内）

## 当前状态
- 已完成：（只列里程碑链）
- 进行中：
- 当前卡点：

## 约束与决策
- [日期][用户拍板] …

## 上次对话总结
（只保留最近一次：上次做了什么 / 拍了什么板 / 本次从哪开始）

## 历史档案
- 决策历史（含已作废、已驳回）→ 项目文件夹 decisions.md / rejected.md
- 历次对话总结 → 项目文件夹 sessions/
（需要细节再取，勿全读）
\`\`\`

---

## 旧 00_context.md
${ctx}

## 旧 decisions.md
${dec}

## 最近一次对话总结（只供了解近况）
${last}
`;
}

export function buildStartSessionPrompt(opts: {
  projectName: string;
  aboutMe: string;
  context: string;
  decisions: string;
  latestCompactContext: string;
  /** 现行卡全文。非空 = 现行卡模式：开场注入 = 关于我 + 卡片原文（所见即所注），不再拼 context/decisions。 */
  cards?: string;
  /** 注入来源为条目库时传 false，跳过历史档案卡那句提示（条目注入没有档案卡）。默认 true。 */
  archiveHint?: boolean;
  lang?: Lang;
}): string {
  const lang: Lang = opts.lang ?? "zh";
  const parts: string[] = [];

  // ── 现行卡模式（PRD·记忆质量升级 F3：黄金输出 + 三问测试）──
  if (opts.cards?.trim()) {
    if (lang === "en") {
      parts.push(`Please read my working context below, then continue helping me.`);
      parts.push(``);
      parts.push(`---`);
      parts.push(``);
      if (opts.aboutMe.trim()) {
        parts.push(`## About me`);
        parts.push(opts.aboutMe.trim());
        parts.push(``);
      }
      parts.push(opts.cards.trim());
      parts.push(``);
      parts.push(`---`);
      parts.push(``);
      parts.push(`After reading, answer in one sentence each — without asking me anything:`);
      parts.push(`1. Who I am and how to work with me`);
      parts.push(`2. The project's goal, current state, and current blocker`);
      parts.push(`3. Where we left off and where this session starts`);
      parts.push(``);
      if (opts.archiveHint !== false) {
        parts.push(`The "Archives" card lists deeper records — fetch them only when needed, don't read everything.`);
        parts.push(``);
      }
      parts.push(`Once confirmed, let's start today's work.`);
      return parts.join("\n");
    }
    parts.push(`请先读取以下我的工作上下文，理解后再继续帮我工作。`);
    parts.push(``);
    parts.push(`---`);
    parts.push(``);
    if (opts.aboutMe.trim()) {
      parts.push(`## 关于我`);
      parts.push(opts.aboutMe.trim());
      parts.push(``);
    }
    parts.push(opts.cards.trim());
    parts.push(``);
    parts.push(`---`);
    parts.push(``);
    parts.push(`读完后，请不要追问，直接用一句话告诉我你理解的：`);
    parts.push(`1. 我是谁、怎么和我协作`);
    parts.push(`2. 项目目标、当前状态和当前卡点`);
    parts.push(`3. 上次停在哪里、本次从哪开始`);
    parts.push(``);
    if (opts.archiveHint !== false) {
      parts.push(`「历史档案」卡里列了更深的资料，需要时再调取，不要全部读。`);
      parts.push(``);
    }
    parts.push(`确认无误后，我们开始今天的工作。`);
    return parts.join("\n");
  }

  if (lang === "en") {
    parts.push(`Please read my working context below, then continue helping me.`);
    parts.push(``);
    parts.push(`---`);
    parts.push(``);
    if (opts.aboutMe.trim()) {
      parts.push(`## About me`);
      parts.push(opts.aboutMe);
      parts.push(``);
    }
    parts.push(`## Current project`);
    parts.push(`**${opts.projectName}**`);
    parts.push(``);
    if (opts.context.trim()) {
      parts.push(`### Project context`);
      parts.push(opts.context);
      parts.push(``);
    }
    if (opts.decisions.trim()) {
      parts.push(`### Key decisions`);
      parts.push(opts.decisions);
      parts.push(``);
    }
    if (opts.latestCompactContext.trim()) {
      parts.push(`### Last session summary`);
      parts.push(opts.latestCompactContext);
      parts.push(``);
    }
    parts.push(`---`);
    parts.push(``);
    parts.push(`After reading, tell me in one sentence what you understand:`);
    parts.push(`1. Who I am`);
    parts.push(`2. The project's goal and biggest blocker`);
    if (opts.latestCompactContext.trim()) {
      parts.push(`3. Where the last session left off`);
    }
    parts.push(``);
    parts.push(`Once confirmed, let's start today's work.`);
    return parts.join("\n");
  }

  parts.push(`请先读取以下我的工作上下文，理解后再继续帮我工作。`);
  parts.push(``);
  parts.push(`---`);
  parts.push(``);
  if (opts.aboutMe.trim()) {
    parts.push(`## 关于我`);
    parts.push(opts.aboutMe);
    parts.push(``);
  }
  parts.push(`## 当前项目`);
  parts.push(`**${opts.projectName}**`);
  parts.push(``);
  if (opts.context.trim()) {
    parts.push(`### 项目状态`);
    parts.push(opts.context);
    parts.push(``);
  }
  if (opts.decisions.trim()) {
    parts.push(`### 关键决策记录`);
    parts.push(opts.decisions);
    parts.push(``);
  }
  if (opts.latestCompactContext.trim()) {
    parts.push(`### 上次工作的总结`);
    parts.push(opts.latestCompactContext);
    parts.push(``);
  }
  parts.push(`---`);
  parts.push(``);
  parts.push(`读完后，请用一句话告诉我你理解的：`);
  parts.push(`1. 我是谁`);
  parts.push(`2. 当前项目的目标和最大卡点`);
  if (opts.latestCompactContext.trim()) {
    parts.push(`3. 上次工作进行到哪里`);
  }
  parts.push(``);
  parts.push(`确认无误后，我们开始今天的工作。`);
  return parts.join("\n");
}

export function buildEndSessionPrompt(opts: {
  projectName: string;
  context: string;
  decisions: string;
  latestSession: string;
  /** 现行卡全文。非空 = 现行卡模式：生成四栏交接 + 六卡更新提案（PRD·记忆质量升级 F1）。 */
  cards?: string;
  /** 当前条目库导出 md。非空 = 条目模式（07-11 写入口条目原生化）：AI 直接产条目行，优先于卡片模式。 */
  entriesMd?: string;
  /** 用户在 CopyPromptModal 选的来源工具，预填进 handoff 的 Metadata。 */
  sourceTool?: string;
  lang?: Lang;
}): string {
  const lang: Lang = opts.lang ?? "zh";
  // 把选中的来源工具预填进 Metadata，避免选择被丢弃（Phase 0：sourceTool → sourceClient 接通）。
  const sourceToolLine = opts.sourceTool?.trim()
    ? `- Source Tool: ${opts.sourceTool.trim()}`
    : `- Source Tool:`;

  // ── 条目模式（07-11 写入口条目原生化）：AI 直接产记忆条目行，来源类型全保真 ──
  if (opts.entriesMd?.trim()) {
    const zhBody = `你现在需要根据我们本轮对话，生成一份 MemoryOS Session Handoff（记忆条目模式）。

规则：
1. 不要复述完整聊天记录，只保留下次继续工作真正需要的信息。
2. 第 2 节只收我**明确确认**的决定，每条附我的原话（或紧贴转述）+ 日期。
3. 禁止把建议、推测、未经我确认的计划写入第 1、2 节；不确定归属时一律放第 3 节。
4. 不要编造本轮对话中没有出现的信息。
5. 严格使用下方 Markdown 格式——我的 App 按标题解析（每节 \`## 数字. 标题\`，标题保持英文原文）。

---

# MemoryOS Session Handoff

## Metadata
- Date:
${sourceToolLine}
- Project: ${opts.projectName}
- Session Goal:

## 1. What We Worked On
（只写已发生的事实，过去时，3-6 条）

## 2. Key Decisions
（只收我明确确认的，每条格式：）
- Decision: …
  - Date: …
  - Quote: 「我的原话或紧贴转述」

## 3. AI Suggestions
（你认为该做但我**没有确认**的，全部放这里，每条一行；没有就写 "None"）

## 4. Compact Context for Next Session
（150-250 字：上次做了什么 / 确认了什么 / 本次建议起点；待办只列我确认过的）

## 5. Proposed Memory Entries
把本轮值得记住的新记忆放在 markdown 代码块里输出，一行一条，格式固定：

- 正文 #类型 @来源

规则：
- 类型从八类挑，可多个：#决策 #约束 #状态 #交接 #事实 #偏好 #技能 #零散
- 来源如实标：我确认过的标 @用户，你自己的建议标 @AI建议，你推断出来的标 @AI推论，来自外部资料的标 @三方
- 新行**不要带编号**，编号由 App 发
- 对照下方「当前记忆条目」：已有的不要重写；某条已过时就引用它的编号加标记，如 \`- [m-0012] 原正文 !归档\`；两条重复在该保留的那条编号行尾加 \`!并入\` 另一条编号
- 没有值得记的就只写 "None"

## 6. Suggested Updates to about_me.md
（仅当本轮出现明确、长期、稳定的用户偏好时才写；否则写 "No update needed."）

---

以下是当前项目上下文：

## 当前记忆条目
${opts.entriesMd}

## 最近一次对话总结
${opts.latestSession}
`;
    const enBody = `Based on our conversation, generate a MemoryOS Session Handoff (memory-entries mode).

Rules:
1. Don't rehash the transcript — keep only what the next session truly needs.
2. Section 2 accepts ONLY decisions I explicitly confirmed, each with my quote (or close paraphrase) + date.
3. NEVER put suggestions, guesses, or unconfirmed plans into sections 1 or 2. When unsure, it goes to section 3.
4. Don't invent anything that wasn't in this conversation.
5. Use the exact Markdown structure below — my app parses your output by these headings (\`## N. Title\`, keep the English titles).

---

# MemoryOS Session Handoff

## Metadata
- Date:
${sourceToolLine}
- Project: ${opts.projectName}
- Session Goal:

## 1. What We Worked On
(Facts only — past tense, 3-6 bullets)

## 2. Key Decisions
(ONLY what I explicitly confirmed. Format per entry:)
- Decision: …
  - Date: …
  - Quote: "my words or a close paraphrase"

## 3. AI Suggestions
(Everything you think we should do but I did NOT confirm — one per line. Write "None" if empty.)

## 4. Compact Context for Next Session
(150-250 words: what we did / what was confirmed / suggested starting point.)

## 5. Proposed Memory Entries
Output this session's new memories inside a markdown code fence, one per line:

- text #type @source

Rules:
- Types (multiple allowed): #决策 #约束 #状态 #交接 #事实 #偏好 #技能 #零散
- Source honestly: @用户 for things I confirmed, @AI建议 for your suggestions, @AI推论 for your inferences, @三方 for external material
- New lines must NOT carry an id — the app assigns them
- Against the "Current memory entries" below: don't rewrite existing ones; mark an outdated entry by its id like \`- [m-0012] original text !归档\`; for duplicates add \`!并入\` + the other id on the line to keep
- Write "None" if nothing is worth keeping

## 6. Suggested Updates to about_me.md
(ONLY if a clear, stable, long-term preference surfaced; otherwise "No update needed.")

---

Current project context:

## Current memory entries
${opts.entriesMd}

## Latest session summary
${opts.latestSession}
`;
    return lang === "en" ? enBody : zhBody;
  }

  // ── 现行卡模式 ──
  if (opts.cards?.trim()) {
    if (lang === "en") {
      return `Based on our conversation, generate a MemoryOS Session Handoff (cards mode).

Rules:
1. Don't rehash the transcript — keep only what the next session truly needs.
2. Section 2 accepts ONLY decisions I explicitly ratified, each with my quote (or a close paraphrase) + date.
3. NEVER put suggestions, guesses, or unconfirmed plans into sections 1 or 2. When unsure where something belongs, it goes to section 3.
4. Don't invent anything that wasn't in this conversation.
5. Use the exact Markdown structure below — my app parses your output by these headings (\`## N. Title\`, keep the English titles).

---

# MemoryOS Session Handoff

## Metadata
- Date:
${sourceToolLine}
- Project: ${opts.projectName}
- Session Goal:

## 1. What We Worked On
(Facts only — things that actually happened, past tense, 3-6 bullets)

## 2. Key Decisions
(ONLY what I explicitly ratified. Format per entry:)
- Decision: …
  - Date: …
  - Quote: "my words or a close paraphrase"

## 3. AI Suggestions
(Everything you think we should do but I did NOT ratify — one per line. Write "None" if empty.)

## 4. Compact Context for Next Session
(150-250 words: what we did / what was ratified / suggested starting point. To-dos: only ones I ratified.)

## 5. Proposed cards.md Update
Based on the "Current memory cards" below, output the tidied NEW full version inside a markdown code fence:
- Current State card: replace-style update (done items move to Done; new work into In progress; resolved blockers removed) — present tense only
- Constraints & Decisions card: append new ratified decisions with dates; REMOVE entries contradicted this session (list them after the fence as Superseded)
- Last Session Summary card: replace wholesale with this session
- Keep the "> Tidied …" line exactly as-is — do not change its date
- Keep the whole file within 1200 characters (excluding whitespace)
After the code fence, list every removed/replaced old entry:
**Superseded:** one-line description (one per line; write "None" if nothing)

## 6. Suggested Updates to about_me.md
(ONLY if a clear, stable, long-term user preference surfaced this session; otherwise write "No update needed.")

---

Current project context:

## Current memory cards (cards.md)
${opts.cards}

## Latest session summary
${opts.latestSession}
`;
    }
    return `你现在需要根据我们本轮对话，生成一份 MemoryOS Session Handoff（记忆卡片模式）。

规则：
1. 不要复述完整聊天记录，只保留下次继续工作真正需要的信息。
2. 第 2 节只收我**明确拍板**的决定，每条附我的原话（或紧贴转述）+ 日期。
3. 禁止把建议、推测、未经我确认的计划写入第 1、2 节；不确定归属时一律放第 3 节。
4. 不要编造本轮对话中没有出现的信息。
5. 严格使用下方 Markdown 格式——我的 App 按标题解析（每节 \`## 数字. 标题\`，标题保持英文原文）。

---

# MemoryOS Session Handoff

## Metadata
- Date:
${sourceToolLine}
- Project: ${opts.projectName}
- Session Goal:

## 1. What We Worked On
（只写已发生的事实，过去时，3-6 条）

## 2. Key Decisions
（只收我明确拍板的，每条格式：）
- Decision: …
  - Date: …
  - Quote: 「我的原话或紧贴转述」

## 3. AI Suggestions
（你认为该做但我**没有拍板**的，全部放这里，每条一行；没有就写 "None"）

## 4. Compact Context for Next Session
（150-250 字：上次做了什么 / 拍了什么板 / 本次建议起点；待办只列我拍过板的）

## 5. Proposed cards.md Update
基于下方「当前记忆卡片」，把整理后的**完整新版**放在 markdown 代码块里输出：
- 当前状态卡：替换式更新（完成的移入已完成、新开的进进行中、解决的卡点移除）——只保留现在时
- 约束与决策卡：新拍板的带日期追加；本轮被推翻的旧条目从卡上移除（在代码块后用 Superseded 列出）
- 上次对话总结卡：整卡替换为本次内容
- 「> 整理于 …」这一行原样保留，不要自己改日期
- 全文控制在 1200 字以内（不计空白）
代码块之后，逐条列出被替换/移除的旧条目：
**Superseded:** 一句话描述（每条一行；没有就写 "None"）

## 6. Suggested Updates to about_me.md
（仅当本轮出现明确、长期、稳定的用户偏好时才写；否则写 "No update needed."）

---

以下是当前项目上下文：

## 当前记忆卡片（cards.md）
${opts.cards}

## 最近一次对话总结
${opts.latestSession}
`;
  }

  // ── 无卡片项目（旧项目/跳过引导的新项目）：结束指令顺手完成迁移——
  // 除四栏交接外，让 AI 把旧资料 + 本轮对话蒸馏成第一页记忆卡片提案。
  // 旧 9 段格式从此退役为解析容错（parseHandoff 仍认，但不再有任何入口生成它）。
  if (lang === "en") {
    return `Based on our conversation, generate a MemoryOS Session Handoff (first Memory Cards page).

This project has no Memory Cards yet. Besides the handoff, distill the legacy material below plus this conversation into the FIRST page of memory cards — every future session starts from that page.

Rules:
1. Don't rehash the transcript — keep only what the next session truly needs.
2. Section 2 accepts ONLY decisions I explicitly ratified, each with my quote (or close paraphrase) + date.
3. NEVER put suggestions, guesses, or unconfirmed plans into sections 1 or 2. When unsure, it goes to section 3.
4. Don't invent anything that isn't in this conversation or the legacy material below.
5. Use the exact Markdown structure below — my app parses your output by these headings (\`## N. Title\`, keep the English titles).

---

# MemoryOS Session Handoff

## Metadata
- Date:
${sourceToolLine}
- Project: ${opts.projectName}
- Session Goal:

## 1. What We Worked On
(Facts only — things that actually happened, past tense, 3-6 bullets)

## 2. Key Decisions
(ONLY what I explicitly ratified. Format per entry:)
- Decision: …
  - Date: …
  - Quote: "my words or a close paraphrase"

## 3. AI Suggestions
(Everything you think we should do but I did NOT ratify — one per line. Write "None" if empty.)

## 4. Compact Context for Next Session
(150-250 words: what we did / what was ratified / suggested starting point. To-dos: only ones I ratified.)

## 5. Proposed cards.md Update
Output the FIRST page of memory cards inside a markdown code fence. Distillation rules:
- From the legacy material, keep only the latest state of each topic (merge dated "_Updated_" blocks, drop outdated/duplicated lines), then fold in this session's progress
- Decisions: only currently-valid ones as \`- [date][ratified] …\`; mark \`[unverified — confirm]\` if you can't confirm I actually ratified it
- Fixed structure: \`# Memory Cards · ${opts.projectName}\` / \`> Tidied (today's date)\` / \`## Project\` / \`## Current State\` / \`## Constraints & Decisions\` / \`## Last Session Summary\` / \`## Archives\` (Archives card is fixed: decision history → decisions.md / rejected.md; past sessions → sessions/; fetch on demand)
- Whole file ≤ 1200 characters (excluding whitespace)
After the code fence write one line: **Superseded:** None

## 6. Suggested Updates to about_me.md
(ONLY if a clear, stable, long-term user preference surfaced; otherwise write "No update needed.")

---

Legacy material to distill:

## Legacy 00_context.md
${opts.context}

## Legacy decisions.md
${opts.decisions}

## Latest session handoff
${opts.latestSession}
`;
  }

  return `你现在需要根据我们本轮对话，生成一份 MemoryOS Session Handoff（首次生成记忆卡片）。

这个项目还没有「记忆卡片」。除了整理本轮交接，你还要把下方旧资料 + 本轮对话蒸馏成**第一页记忆卡片**——以后每次对话开场只读这一页。

规则：
1. 不要复述完整聊天记录，只保留下次继续工作真正需要的信息。
2. 第 2 节只收我**明确拍板**的决定，每条附我的原话（或紧贴转述）+ 日期。
3. 禁止把建议、推测、未经我确认的计划写入第 1、2 节；不确定归属时一律放第 3 节。
4. 不要编造本轮对话和下方旧资料中没有出现的信息。
5. 严格使用下方 Markdown 格式——我的 App 按标题解析（每节 \`## 数字. 标题\`，标题保持英文原文）。

---

# MemoryOS Session Handoff

## Metadata
- Date:
${sourceToolLine}
- Project: ${opts.projectName}
- Session Goal:

## 1. What We Worked On
（只写已发生的事实，过去时，3-6 条）

## 2. Key Decisions
（只收我明确拍板的，每条格式：）
- Decision: …
  - Date: …
  - Quote: 「我的原话或紧贴转述」

## 3. AI Suggestions
（你认为该做但我**没有拍板**的，全部放这里，每条一行；没有就写 "None"）

## 4. Compact Context for Next Session
（150-250 字：上次做了什么 / 拍了什么板 / 本次建议起点；待办只列我拍过板的）

## 5. Proposed cards.md Update
把**第一页记忆卡片**放在 markdown 代码块里输出，蒸馏规则：
- 旧资料里同一主题只保留最新状态（按日期追加的「_Updated_」块要合并，过期/重复的丢掉），再并入本轮新进展
- 决策只收现在仍有效的，每条 \`- [日期][用户拍板] …\`；无法确认我拍过板的标 \`[来源待核]\`
- 结构固定：\`# 记忆卡片 · ${opts.projectName}\` / \`> 整理于 （今天日期）\` / \`## 项目卡\` / \`## 当前状态\` / \`## 约束与决策\` / \`## 上次对话总结\` / \`## 历史档案\`（历史档案卡固定写：决策历史 → decisions.md / rejected.md；历次对话总结 → sessions/；需要细节再取，勿全读）
- 全文 ≤1200 字（不计空白）
代码块之后写一行：**Superseded:** None

## 6. Suggested Updates to about_me.md
（仅当本轮出现明确、长期、稳定的用户偏好时才写；否则写 "No update needed."）

---

以下是这个项目的旧资料（蒸馏原料）：

## 旧项目说明（00_context.md）
${opts.context}

## 旧决策记录（decisions.md）
${opts.decisions}

## 最近一次对话总结
${opts.latestSession}
`;
}
