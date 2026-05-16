// MemoryOS handoff Markdown parser.
// Splits the standard 9-section handoff into structured fields.

import type { ParsedHandoff } from "../types";

function extract(text: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&");
  const re = new RegExp(
    `##\\s*\\d+\\.\\s*${escaped}[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s|$)`,
    "i"
  );
  const m = text.match(re);
  return (m?.[1] ?? "").trim();
}

export function parseHandoff(raw: string): ParsedHandoff {
  const metaBlock =
    raw.match(/##\s*Metadata\s*\n([\s\S]*?)(?=\n##\s|$)/i)?.[1] ?? "";
  const metadata: Record<string, string> = {};
  for (const line of metaBlock.split("\n")) {
    const m = line.match(/^-\s*([^:]+):\s*(.+)$/);
    if (m) metadata[m[1].trim()] = m[2].trim();
  }
  return {
    metadata,
    whatWeWorkedOn: extract(raw, "What We Worked On"),
    keyDecisions: extract(raw, "Key Decisions"),
    currentState:
      extract(raw, "Current Project State") || extract(raw, "Current State"),
    openQuestions: extract(raw, "Open Questions"),
    nextActions: extract(raw, "Next Actions"),
    suggestedContextUpdate: extract(raw, "Suggested Updates to 00_context.md"),
    suggestedDecisionsUpdate: extract(raw, "Suggested Updates to decisions.md"),
    suggestedAboutMeUpdate: extract(raw, "Suggested Updates to about_me.md"),
    compactContext: extract(raw, "Compact Context for Next Session"),
  };
}

export function aboutMeBootstrapPrompt(): string {
  return `我想用 MemoryOS（一个跨 AI 的本地工作记忆工具），需要你帮我整理一份长期身份偏好文件 about_me.md。

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

export function contextBootstrapPrompt(projectName: string): string {
  return `我刚在 MemoryOS 里新建了一个项目「${projectName}」，但项目背景 00_context.md 还是空的。请帮我整理一份初始内容。

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
}): string {
  const parts: string[] = [];
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
}): string {
  return `你现在需要根据我们本轮对话，生成一份 MemoryOS Session Handoff。

规则：
1. 不要复述完整聊天记录。
2. 只保留下一次继续工作真正需要继承的信息。
3. 提取目标、进展、重要决策、未解决问题、下一步行动。
4. 如果本轮对话出现需要长期保存的信息，放入 Suggested Updates。
5. 不要编造未在本轮对话中出现的信息。
6. 严格使用下方 Markdown 格式。

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

## 7. Suggested Updates to decisions.md
（如无，写 "No update needed."）

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
