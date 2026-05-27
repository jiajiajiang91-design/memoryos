// MemoryOS handoff Markdown parser + prompt builders.
// Splits the standard 9-section handoff into structured fields.
// Prompt builders accept lang for zh/en switching.

import type { ParsedHandoff } from "../types";
import type { Lang } from "./i18n";

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
  };
}

export function extractSuperseded(suggestedUpdate: string): string[] {
  const out: string[] = [];
  const re = /(?:\*\*)?Superseded:?(?:\*\*)?\s*(.+)/gi;
  let m;
  while ((m = re.exec(suggestedUpdate)) !== null) {
    for (const part of m[1].split(/[;；,，]/)) {
      const trimmed = part.replace(/^["'「」"']+|["'「」"']+$/g, "").trim();
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

export function buildStartSessionPrompt(opts: {
  projectName: string;
  aboutMe: string;
  context: string;
  decisions: string;
  latestCompactContext: string;
  lang?: Lang;
}): string {
  const lang: Lang = opts.lang ?? "zh";
  const parts: string[] = [];

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
  lang?: Lang;
}): string {
  const lang: Lang = opts.lang ?? "zh";

  if (lang === "en") {
    return `Based on our conversation, generate a MemoryOS Session Handoff.

Rules:
1. Don't rehash the entire transcript.
2. Keep only what's truly needed to continue work next time.
3. Extract goals, progress, key decisions, open questions, next actions.
4. If long-term-worthy info surfaced, put it in Suggested Updates.
5. Don't invent anything that wasn't in this conversation.
6. Use the Markdown structure below exactly.

**FORMAT IS CRITICAL — my app parses your output by these headings:**
- Every section MUST start with \`## N. Title\` (e.g. \`## 1. What We Worked On\`)
- Do NOT drop the \`##\` or the section number
- Do NOT output plain text without Markdown headings
- Keep the English section titles exactly as shown below

---

# MemoryOS Session Handoff

## Metadata
- Date:
- Source Tool:
- Project: ${opts.projectName}
- Session Goal:

## 1. What We Worked On
(3-6 bullets)

## 2. Key Decisions
- Decision:
  - Reason:
  - Impact:

## 3. Current Project State

## 4. Open Questions

## 5. Next Actions
(ordered by priority)

## 6. Suggested Updates to 00_context.md
(if none, write "No update needed.")
If updating, also list what old content is now outdated:
**Superseded:** one-line description of what to remove (e.g. "task XX in 'In progress' is now done")

## 7. Suggested Updates to decisions.md
(if none, write "No update needed.")
If updating, also list which old decisions were overturned or modified this session:
**Superseded:** old decision title or keyword (e.g. "PRD path B")

## 8. Suggested Updates to about_me.md
(only if a clear, stable, long-term user preference surfaced)

## 9. Compact Context for Next Session
(150-250 words, the must-read briefing for the next AI session)

---

Here's the current project context:

## Current 00_context.md
${opts.context}

## Current decisions.md
${opts.decisions}

## Latest session handoff
${opts.latestSession}
`;
  }

  return `你现在需要根据我们本轮对话，生成一份 MemoryOS Session Handoff。

规则：
1. 不要复述完整聊天记录。
2. 只保留下一次继续工作真正需要继承的信息。
3. 提取目标、进展、重要决策、未解决问题、下一步行动。
4. 如果本轮对话出现需要长期保存的信息，放入 Suggested Updates。
5. 不要编造未在本轮对话中出现的信息。
6. 严格使用下方 Markdown 格式。

**格式非常重要——我的 App 靠这些标题来解析你的输出：**
- 每个章节必须用 \`## 数字. 标题\` 开头（例如 \`## 1. What We Worked On\`）
- 不要省略 \`##\` 和章节编号
- 不要输出没有 Markdown 标题的纯文字
- 章节标题请保持下方模板中的英文原文

---

# MemoryOS Session Handoff

## Metadata
- Date:
- Source Tool:
- Project: ${opts.projectName}
- Session Goal:

## 1. What We Worked On
（3-6 条 bullet）

## 2. Key Decisions
- Decision:
  - Reason:
  - Impact:

## 3. Current Project State

## 4. Open Questions

## 5. Next Actions
（按优先级排序）

## 6. Suggested Updates to 00_context.md
（如无，写 "No update needed."）
如果有更新，请同时列出哪些旧内容已过时需要删除，格式：
**Superseded:** 用一句话描述要删的旧内容（例如"进行中的 XX 任务已完成"）

## 7. Suggested Updates to decisions.md
（如无，写 "No update needed."）
如果有更新，请同时列出哪些旧决策已被本轮推翻或修改，格式：
**Superseded:** 旧决策标题或关键词（例如"PRD 路径选择 B"）

## 8. Suggested Updates to about_me.md
（仅当出现明确、长期、稳定的用户偏好时才建议）

## 9. Compact Context for Next Session
（150-250 字一段，下次 AI 接手必读）

---

以下是当前项目上下文：

## Current 00_context.md
${opts.context}

## Current decisions.md
${opts.decisions}

## Latest session handoff
${opts.latestSession}
`;
}
