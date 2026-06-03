// Memory Inbox 纯逻辑（PRD v0.3.1 §4.2/§5.1）。
//
// 通道无关的核心：所有通道（manual / mcp / browser）把一份 handoff 转成统一的
// 结构化 InboxItem，写进 .memoryos/inbox/，review 后才入库。本文件**不依赖 Tauri**，
// 只依赖类型 + 纯函数，以便 Node 版 MCP server（Phase 2+）按同一契约复用。
//
// 三个转换函数：
//   parsedToInboxHandoff(parsed)   → Inbox handoff（结构化字段，= ParsedHandoff）
//   inboxHandoffToMarkdown(handoff)→ 标准 9 段 Markdown（apply 写 session 文件用）
//   inboxItemToReviewState(item)   → 现有 ReviewPage 需要的 { raw, parsed }

import type { ParsedHandoff, InboxItem } from "../types";

/**
 * parsed → Inbox handoff。
 * 当前 Inbox handoff 与 ParsedHandoff 同名同构，做一次防御性深拷贝（含字段兜底），
 * 保证写进 inbox 的对象是干净、完整的结构，不残留外部引用。
 */
export function parsedToInboxHandoff(parsed: ParsedHandoff): ParsedHandoff {
  return {
    metadata: { ...(parsed.metadata ?? {}) },
    whatWeWorkedOn: parsed.whatWeWorkedOn ?? "",
    keyDecisions: parsed.keyDecisions ?? "",
    currentState: parsed.currentState ?? "",
    openQuestions: parsed.openQuestions ?? "",
    nextActions: parsed.nextActions ?? "",
    suggestedContextUpdate: parsed.suggestedContextUpdate ?? "",
    suggestedDecisionsUpdate: parsed.suggestedDecisionsUpdate ?? "",
    suggestedAboutMeUpdate: parsed.suggestedAboutMeUpdate ?? "",
    compactContext: parsed.compactContext ?? "",
  };
}

/**
 * Inbox handoff → 标准 9 段 Markdown。
 * 标题与 buildEndSessionPrompt / parseHandoff 对齐，保证 round-trip 可再解析、
 * 且 readContextForStartPrompt 的 "Compact Context" 抽取正则能命中。
 * 6/7/8 三个 Suggested Updates 段为空时写 "No update needed."（与 review 的 /no update/i 跳过逻辑对齐）。
 */
export function inboxHandoffToMarkdown(h: ParsedHandoff): string {
  const lines: string[] = ["# MemoryOS Session Handoff", ""];

  lines.push("## Metadata");
  const meta = h.metadata ?? {};
  const keys = Object.keys(meta);
  if (keys.length) {
    for (const k of keys) lines.push(`- ${k}: ${meta[k]}`);
  } else {
    lines.push("- Date:", "- Source Tool:", "- Project:", "- Session Goal:");
  }
  lines.push("");

  const section = (title: string, body: string | undefined, fallback = "") => {
    lines.push(`## ${title}`);
    const b = (body ?? "").trim();
    lines.push(b || fallback);
    lines.push("");
  };

  section("1. What We Worked On", h.whatWeWorkedOn);
  section("2. Key Decisions", h.keyDecisions);
  section("3. Current Project State", h.currentState);
  section("4. Open Questions", h.openQuestions);
  section("5. Next Actions", h.nextActions);
  section("6. Suggested Updates to 00_context.md", h.suggestedContextUpdate, "No update needed.");
  section("7. Suggested Updates to decisions.md", h.suggestedDecisionsUpdate, "No update needed.");
  section("8. Suggested Updates to about_me.md", h.suggestedAboutMeUpdate, "No update needed.");
  section("9. Compact Context for Next Session", h.compactContext);

  return lines.join("\n").trimEnd() + "\n";
}

/**
 * Inbox item → ReviewPage 所需输入。
 * ReviewPage 内部用 parsed + 当前文件自行构造 UpdateSuggestion[]（含 supersede 划线），
 * 这里提供它需要的 { raw, parsed }：raw 用标准 9 段 Markdown 渲染，apply 时即写成 session 文件。
 */
export function inboxItemToReviewState(item: InboxItem): { raw: string; parsed: ParsedHandoff } {
  const parsed = item.handoff;
  return { raw: inboxHandoffToMarkdown(parsed), parsed };
}

/**
 * ISO 时间戳 → filename-safe（Windows 不允许冒号）。
 * 2026-06-02T20:31:02.123Z → 20260602T203102_123Z
 */
export function safeTimestamp(iso: string): string {
  return iso.replace(/[-:]/g, "").replace(".", "_");
}

/** Inbox / archive 文件名：<safe-ts>_<uuid>.json，保证跨平台合法。 */
export function inboxFilename(item: Pick<InboxItem, "createdAt" | "id">): string {
  return `${safeTimestamp(item.createdAt)}_${item.id}.json`;
}
