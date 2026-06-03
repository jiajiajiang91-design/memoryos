// MCP prompts（PRD v0.3.1 §5.2）。
// end_session：指示模型把本轮整理成 9 段结构，并**调用 save_session_handoff 工具**（传结构化字段，
// 不粘贴 Markdown）。与复制粘贴路径区分：复制粘贴产 Markdown 走 ImportHandoffModal，MCP 路径调结构化工具，
// 两者都进同一结构化 Inbox。章节定义对齐 buildEndSessionPrompt，但产物是工具调用。
//
// start_session：注入式开始提示（无副作用），复用 app 的纯逻辑 buildStartSessionPrompt。

import { buildStartSessionPrompt } from "../../src/lib/parser";
import type { ProjectMemory } from "./workspace";

// 把项目记忆注入成一段开始提示。server 不知道 UI 语言，默认 zh（app UI 全中文）。
export function buildStartSessionToolPrompt(memory: ProjectMemory): string {
  return buildStartSessionPrompt({
    projectName: memory.projectName,
    aboutMe: memory.aboutMe,
    context: memory.context,
    decisions: memory.decisions,
    latestCompactContext: memory.latestCompactContext,
    lang: "zh",
  });
}

export function buildEndSessionToolPrompt(projectName?: string): string {
  const proj = projectName?.trim();
  const projLine = proj ? `"${proj}"` : "（当前项目的名字或 slug）";
  return `请根据我们本轮对话，整理一份 MemoryOS Session Handoff，然后**调用 \`save_session_handoff\` 工具**把它暂存进 MemoryOS。它会进入待审 Inbox（status=pending），由我回桌面 app 确认后才正式入库——你这一步不会直接改我的记忆文件。

规则：
1. 不要复述完整聊天记录，只保留下次继续工作真正需要继承的信息。
2. 不要编造未在本轮对话中出现的信息。
3. **不要粘贴 Markdown** —— 直接用结构化字段调用 \`save_session_handoff\` 工具。

按下面字段组织内容传给工具（字段名即工具入参名）：
- project: ${projLine}
- whatWeWorkedOn：本轮做了什么（3-6 条）
- keyDecisions：关键决策（每条含原因 / 影响）
- currentState：当前项目状态
- openQuestions：未解决问题
- nextActions：下一步行动（按优先级）
- suggestedContextUpdate：对 00_context.md 的更新建议（无则留空；若有可用 "Superseded:" 标注要删的旧内容）
- suggestedDecisionsUpdate：对 decisions.md 的更新建议（无则留空）
- suggestedAboutMeUpdate：对 about_me.md 的更新建议（仅当出现明确、长期、稳定的偏好时）
- compactContext：给下一次对话的压缩上下文（150-250 字）

调用工具后，告诉我已暂存、以及还需我回桌面 app 确认入库。`;
}
