// MCP prompts（PRD v0.3.1 §5.2）。
// end_session：指示模型把本轮整理成 9 段结构，并**调用 save_session_handoff 工具**（传结构化字段，
// 不粘贴 Markdown）。与复制粘贴路径区分：复制粘贴产 Markdown 走 ImportHandoffModal，MCP 路径调结构化工具，
// 两者都进同一结构化 Inbox。章节定义对齐 buildEndSessionPrompt，但产物是工具调用。
//
// start_session：注入式开始提示（无副作用），复用 app 的纯逻辑 buildStartSessionPrompt。

import { buildStartSessionPrompt } from "../../src/lib/parser";
import type { ProjectMemory } from "./workspace";

// 把项目记忆注入成一段开始提示。server 不知道 UI 语言，默认 zh（app UI 全中文）。
// cards 非空 = 现行卡模式：buildStartSessionPrompt 自动走 关于我+卡片原文 注入（与 app 同一函数，逐字一致）。
// MCP 通道多一句拉取提示（复制粘贴路径的 AI 没工具可调，app 侧不加）。
export function buildStartSessionToolPrompt(memory: ProjectMemory): string {
  return (
    buildStartSessionPrompt({
      projectName: memory.projectName,
      aboutMe: memory.aboutMe,
      context: memory.context,
      decisions: memory.decisions,
      cards: memory.cards,
      latestCompactContext: memory.latestCompactContext,
      lang: "zh",
    }) +
    "\n\n提醒：上面的记忆是按重要程度挑选的摘要，不是全部。会话中聊到这里没有的旧决策、旧约定、做事方法时，先调用 search_memory 工具检索再回答，不要凭空补。"
  );
}

export function buildEndSessionToolPrompt(projectName?: string, entriesMode = false): string {
  const proj = projectName?.trim();
  const projLine = proj ? `"${proj}"` : "（当前项目的名字或 slug）";
  // 条目模式（07-11 写入口条目原生化）：产条目行而非六卡提案，来源类型全保真
  if (entriesMode) {
    return `请根据我们本轮对话，整理一份 MemoryOS Session Handoff（记忆条目模式），然后**调用 \`save_session_handoff\` 工具**把它暂存进 MemoryOS。它会进入待审 Inbox（status=pending），由我确认后才正式入库。

规则：
1. 不要复述完整聊天记录，只保留下次继续工作真正需要继承的信息。
2. 不要编造未在本轮对话中出现的信息。
3. **来源纪律**：keyDecisions 只收我**明确确认**的决定（附原话或紧贴转述 + 日期）；你认为该做但我没确认的一律放 aiSuggestions。

按下面字段组织内容传给工具（字段名即工具入参名）：
- project: ${projLine}
- whatWeWorkedOn：本轮做了什么（只写已发生的事实，过去时，3-6 条）
- keyDecisions：我明确确认的决策（原话 + 日期）
- currentState / openQuestions / nextActions / compactContext：照常
- aiSuggestions：你的建议（我没确认的全放这里，每条一行；没有写 "None"）

**记忆条目（proposedEntries）必传**：本轮值得记住的新记忆，一行一条，格式 \`- 正文 #类型 @来源\`：
- 类型八类可多个：#决策 #约束 #状态 #交接 #事实 #偏好 #技能 #零散
- 来源如实标：我确认过的 @用户、你的建议 @AI建议、你的推断 @AI推论、外部资料 @三方
- 新行**不带编号**（App 发号）；本轮发现某条现有记忆过时/重复的（编号可从 search_memory 命中里拿），加调整行 \`- [编号] 原正文 !归档\` 或在保留行尾加 !并入 加编号
- 没有值得记的传 "None"。proposedCards 不需要传。

调用工具后，告诉我已暂存、以及还需我确认入库。`;
  }
  return `请根据我们本轮对话，整理一份 MemoryOS Session Handoff，然后**调用 \`save_session_handoff\` 工具**把它暂存进 MemoryOS。它会进入待审 Inbox（status=pending），由我回桌面 app 确认后才正式入库——你这一步不会直接改我的记忆文件。

规则：
1. 不要复述完整聊天记录，只保留下次继续工作真正需要继承的信息。
2. 不要编造未在本轮对话中出现的信息。
3. **不要粘贴 Markdown** —— 直接用结构化字段调用 \`save_session_handoff\` 工具。
4. **来源纪律**：keyDecisions 只收我**明确拍板**的决定（每条附我的原话或紧贴转述 + 日期）；你认为该做但我没拍板的，一律放 aiSuggestions，禁止混入 keyDecisions 或写成既定计划。

按下面字段组织内容传给工具（字段名即工具入参名）：
- project: ${projLine}
- whatWeWorkedOn：本轮做了什么（只写已发生的事实，过去时，3-6 条）
- keyDecisions：我明确拍板的决策（原话 + 日期）
- currentState：当前项目状态
- openQuestions：未解决问题
- nextActions：下一步行动（只列我拍过板的）
- compactContext：给下一次对话的压缩上下文（150-250 字）
- aiSuggestions：你的建议（我没拍板的全放这里，每条一行；没有写 "None"）

**记忆卡片（proposedCards）必传**，分两种情况：
- 项目已有记忆卡片（cards 非空）：基于它整理出完整新版——当前状态卡替换式更新、约束与决策卡追加新拍板条目、上次对话总结卡整卡替换；「> 整理于 …」行原样保留不改日期；全文 ≤1200 字。
- 项目还没有记忆卡片（cards 为空）：基于 context / decisions / 本轮对话，生成**第一页**记忆卡片（结构：# 记忆卡片 · 项目名 / > 整理于 今天 / ## 项目卡 / ## 当前状态 / ## 约束与决策 / ## 上次对话总结 / ## 历史档案）。旧文档里无法确认我拍板过的决策标 \`[来源待核]\`。
- proposedCardsSuperseded：被替换/移除的旧条目（每条一句话；首版生成则传空）

若你本轮**没有**载入过这个项目的记忆，先调用 \`get_project_memory\`，再生成 proposedCards——不要凭空写。

- suggestedAboutMeUpdate：仅当本轮出现明确、长期、稳定的用户偏好时传（关于我是全局身份文件，与项目卡片分开走）
（suggestedContextUpdate / suggestedDecisionsUpdate 已废弃，留空即可。）

调用工具后，告诉我已暂存、以及还需我回桌面 app 确认入库。`;
}
