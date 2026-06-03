// 共享纯逻辑（PRD v0.3.1 §0.5.5/§4.2）：session 文件解析 + Compact Context 抽取。
// **不依赖 Tauri**，app（fs.ts）与 Node 版 MCP server 共用同一份，保证输出逐字一致。

import type { Session, SourceTool } from "../types";

/** sessions/ 里哪些 .md 算 session 文件（跳过 README/NOTES/INDEX/TEMPLATE）。 */
export function isSessionFile(name: string): boolean {
  if (!name.endsWith(".md")) return false;
  if (/^(README|NOTES?|INDEX|TEMPLATE)/i.test(name)) return false;
  return true;
}

/** 把 session 文件名 + 内容解析成结构化 Session。 */
export function parseSessionFile(filename: string, raw: string): Session {
  // Try multiple historical naming conventions:
  //   session_2026-05-15_1746.md       → date 2026-05-15, time 17:46  (V1 spec)
  //   Session_Handoff_2026-04-30.md    → date 2026-04-30, no time
  //   2026-03-23.md                    → date 2026-03-23, no time
  let date = "";
  let time = "";

  const v1 = filename.match(/session_(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})/i);
  if (v1) {
    date = v1[1];
    time = `${v1[2]}:${v1[3]}`;
  } else {
    const dateOnly = filename.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateOnly) date = dateOnly[1];
  }

  const toolMatch = raw.match(/Source Tool:\s*(\w+)/i);
  const goalMatch =
    raw.match(/Session Goal:\s*(.+)/i) ??
    raw.match(/^#\s+(.+)/m); // fall back to first H1 in the file
  return {
    filename,
    date,
    time,
    sourceTool: ((toolMatch?.[1] ?? "Claude") as SourceTool),
    sessionGoal: goalMatch?.[1]?.trim() ?? filename.replace(/\.md$/, ""),
    rawMarkdown: raw,
  };
}

/** 最新优先排序的比较器（date+time 字典序倒序）。 */
export function compareSessionsDesc(a: Session, b: Session): number {
  return a.date + a.time < b.date + b.time ? 1 : -1;
}

/**
 * 从最新 session 的原文里抽取 Compact Context 段；抽不到则退回前 800 字。
 * （与 readContextForStartPrompt 一致，供 start prompt / get_project_memory 共用。）
 */
export function extractLatestCompactContext(latestRaw: string): string {
  const m = (latestRaw ?? "").match(
    /##\s*\d*\.?\s*Compact Context[^\n]*\n([\s\S]*?)(?=\n##\s|$)/i
  );
  if (m) return m[1].trim();
  return (latestRaw ?? "").slice(0, 800);
}
