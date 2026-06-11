// 现行卡模式 round-trip 验证（一次性脚本，PRD·记忆质量升级 F1/F2 咽喉路径）：
// ① 模拟 AI 按结束指令输出的 5 段 handoff（含围栏内 cards 提案 + Superseded 行）
// ② parseHandoff 抽取 → ③ inboxHandoffToMarkdown 渲染 → ④ 再 parseHandoff，断言三处一致。
// 跑法：npx esbuild src/roundtrip.cards.test.ts --bundle --platform=node --format=esm --outfile=dist/rt.mjs && node dist/rt.mjs

import { parseHandoff } from "../../src/lib/parser";
import { parsedToInboxHandoff, inboxHandoffToMarkdown } from "../../src/lib/inbox";
import { parseCardsStamp, stampCards, adoptSuggestionsIntoCards, cardsCharCount } from "../../src/lib/cards";
import { normalizeSourceTool } from "../../src/lib/sourceTools";

let passed = 0, failed = 0;
function ok(cond: boolean, msg: string) {
  if (cond) { passed++; console.log("  ✓ " + msg); }
  else { failed++; console.error("  ✗ FAIL: " + msg); }
}

const proposedCards = `# 记忆卡片 · 测试项目
> 整理于 2026-06-09

## 项目卡
桌面应用，把工作记忆带去多个 AI。给在多个 AI 间切换的人用。当前 v0.2.0。

## 当前状态
- 已完成：v0.1.0→v0.2.0
- 进行中：记忆质量闭环
- 当前卡点：无

## 约束与决策
- [2026-06-03][用户拍板] 外部写回必经收件箱 Review
- [2026-06-10][用户拍板] 现行层六卡合成一个文件

## 上次对话总结
拍板了管线四件套设计；本次从写入 schema 实施开始。

## 历史档案
- 决策历史 → decisions.md
（需要细节再取，勿全读）`;

// ① 模拟 AI 输出（与 buildEndSessionPrompt 现行卡模式模板格式一致）
const aiOutput = `# MemoryOS Session Handoff

## Metadata
- Date: 2026-06-10
- Source Tool: Claude
- Project: 测试项目
- Session Goal: 实施记忆质量闭环

## 1. What We Worked On
- 实现了 cards.md 读写层
- 改了开始/结束指令模板

## 2. Key Decisions
- Decision: 现行层六卡合成一个文件
  - Date: 2026-06-10
  - Quote: 「a 现行层（六卡）合成一个文件」

## 3. AI Suggestions
- 给迁移弹窗加预览功能
- 把 rejected.md 也展示在 UI 里

## 4. Compact Context for Next Session
本轮完成了现行卡模式的数据层与指令模板改造，下次从 Review 蒸馏入库逻辑继续。

## 5. Proposed cards.md Update
\`\`\`markdown
${proposedCards}
\`\`\`
**Superseded:** 进行中的「MCP 通道 A」已完成
**Superseded:** None

## 6. Suggested Updates to about_me.md
建议追加：先给答案再给细节。

以上。`;

console.log("[A] parseHandoff 抽取现行卡模式字段");
const p1 = parseHandoff(aiOutput);
ok(p1.whatWeWorkedOn.includes("cards.md 读写层"), "What We Worked On 正常抽取");
ok(p1.keyDecisions.includes("六卡合成一个文件"), "Key Decisions 正常抽取");
ok((p1.aiSuggestions ?? "").includes("迁移弹窗"), "AI Suggestions 抽到第 1 条");
ok((p1.aiSuggestions ?? "").includes("rejected.md"), "AI Suggestions 抽到第 2 条");
ok(p1.compactContext.includes("数据层与指令模板"), "Compact Context 正常抽取");
ok((p1.proposedCards ?? "") === proposedCards, "proposedCards 围栏内全文逐字一致（含内部 ## 标题不被切碎）");
ok((p1.proposedCardsSuperseded ?? []).length === 1, "Superseded 抽到 1 条（None 占位被过滤）");
ok((p1.proposedCardsSuperseded ?? [])[0].includes("MCP 通道 A"), "Superseded 内容正确");
ok((p1.suggestedAboutMeUpdate ?? "").includes("先给答案"), "卡片版式下 about_me 建议（第 6 段）正常抽取");

console.log("[B] inboxHandoffToMarkdown 渲染（5 段版式）→ 再解析一致");
const h = parsedToInboxHandoff(p1);
const md = inboxHandoffToMarkdown(h);
ok(md.includes("## 3. AI Suggestions"), "渲染含 AI Suggestions 段");
ok(md.includes("## 5. Proposed cards.md Update"), "渲染含提案段");
ok(md.includes("## 6. Suggested Updates to about_me.md"), "渲染含 about_me 段");
const p2 = parseHandoff(md);
ok((p2.proposedCards ?? "") === proposedCards, "round-trip 后 proposedCards 仍逐字一致");
ok((p2.aiSuggestions ?? "").includes("迁移弹窗"), "round-trip 后 aiSuggestions 一致");
ok((p2.proposedCardsSuperseded ?? []).length === 1, "round-trip 后 Superseded 仍 1 条");
ok(p2.compactContext === p1.compactContext, "round-trip 后 compactContext 一致");
ok((p2.suggestedAboutMeUpdate ?? "").includes("先给答案"), "round-trip 后 about_me 建议一致");

console.log("[C] 旧 9 段格式不受影响（回归）");
const legacy = `# MemoryOS Session Handoff

## Metadata
- Date: 2026-06-01

## 1. What We Worked On
- 旧格式工作

## 2. Key Decisions
- Decision: 旧决策

## 3. Current Project State
状态一切正常。

## 4. Open Questions
无。

## 5. Next Actions
继续。

## 6. Suggested Updates to 00_context.md
No update needed.

## 7. Suggested Updates to decisions.md
No update needed.

## 8. Suggested Updates to about_me.md
No update needed.

## 9. Compact Context for Next Session
旧格式压缩上下文。`;
const p3 = parseHandoff(legacy);
ok(p3.currentState.includes("一切正常"), "旧格式 Current State 正常");
ok((p3.proposedCards ?? "") === "", "旧格式 proposedCards 为空");
ok((p3.aiSuggestions ?? "") === "", "旧格式 aiSuggestions 为空");
const md3 = inboxHandoffToMarkdown(parsedToInboxHandoff(p3));
ok(md3.includes("## 9. Compact Context for Next Session"), "旧格式仍走 9 段渲染");

console.log("[D] cards 工具函数");
const stamp = parseCardsStamp(proposedCards);
ok(stamp?.distilledOn === "2026-06-09", "整理日期行解析 2026-06-09");
ok(parseCardsStamp("> 版本: v1 · 整理于 2026-06-10")?.distilledOn === "2026-06-10", "旧版本号写法兼容可读");
const stamped = stampCards(proposedCards, "2026-06-10");
ok(parseCardsStamp(stamped)?.distilledOn === "2026-06-10", "stampCards 重写整理日期");
ok(!stamped.includes("版本:"), "新戳不再含版本号");
const adopted = adoptSuggestionsIntoCards(proposedCards, ["给迁移弹窗加预览功能"], "2026-06-10");
ok(adopted.includes("[2026-06-10][用户拍板·Review 采纳] 给迁移弹窗加预览功能"), "采纳建议升格进决策卡");
ok(adopted.indexOf("Review 采纳") > adopted.indexOf("## 约束与决策"), "插在决策卡标题之后");
ok(cardsCharCount("a b\nc") === 3, "cardsCharCount 去空白计数");

console.log("[E] 来源名归一（机器口径 → 用户认识的工具名）");
ok(normalizeSourceTool("codex") === "Codex", "codex → Codex");
ok(normalizeSourceTool("cowork") === "Claude", "cowork → Claude");
ok(normalizeSourceTool("claude-desktop") === "Claude", "claude-desktop → Claude");
ok(normalizeSourceTool("openai-codex") === "Codex", "openai-codex → Codex（codex 优先于 openai）");
ok(normalizeSourceTool("Manus") === "Manus", "自定义名原样保留");
ok(normalizeSourceTool("kimi-cli") === "Kimi", "kimi-cli → Kimi");

console.log(`\n结果：${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
