// Node 版 Inbox 写入（PRD v0.3.1 §5.1/§7）。
// server 收到 save_session_handoff 的结构化入参 → 构造 InboxItem(status=pending) → 原子写 inbox/。
// 复用共享纯逻辑 parsedToInboxHandoff / inboxFilename（与 app 同契约），fs.ts 不可用（依赖 Tauri）。
// 红线：只写 workspace/.memoryos/inbox/，绝不碰正式 memory 文件；写前做路径 containment。

import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { parsedToInboxHandoff, inboxFilename } from "../../src/lib/inbox";
import type { InboxItem, ParsedHandoff } from "../../src/types";

export type SaveHandoffInput = {
  project: string;
  metadata?: Record<string, string>;
  whatWeWorkedOn: string;
  keyDecisions: string;
  currentState: string;
  openQuestions: string;
  nextActions: string;
  suggestedContextUpdate?: string;
  suggestedDecisionsUpdate?: string;
  suggestedAboutMeUpdate?: string;
  compactContext: string;
};

/** 校验 targetReal 真实路径仍在 wsReal（workspace 真实路径）内，拒 `..`/symlink 逃逸。 */
export function assertWithinWorkspace(wsReal: string, targetReal: string): void {
  const rel = path.relative(wsReal, targetReal);
  if (rel === "") return; // 就是 workspace 本身
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`path escapes workspace: ${targetReal}`);
  }
}

/** 把 save_session_handoff 结构化入参 + 已匹配的 slug + 客户端名 → 一个 pending InboxItem。 */
export function buildInboxItem(
  input: SaveHandoffInput,
  slug: string,
  sourceClient: string
): InboxItem {
  const parsed: ParsedHandoff = {
    metadata: input.metadata ?? {},
    whatWeWorkedOn: input.whatWeWorkedOn,
    keyDecisions: input.keyDecisions,
    currentState: input.currentState,
    openQuestions: input.openQuestions,
    nextActions: input.nextActions,
    suggestedContextUpdate: input.suggestedContextUpdate ?? "",
    suggestedDecisionsUpdate: input.suggestedDecisionsUpdate ?? "",
    suggestedAboutMeUpdate: input.suggestedAboutMeUpdate ?? "",
    compactContext: input.compactContext,
  };
  return {
    id: randomUUID(),
    slug,
    sourceChannel: "mcp",
    sourceClient: sourceClient || "MCP Client",
    sourcePlatform: null,
    createdAt: new Date().toISOString(),
    handoff: parsedToInboxHandoff(parsed),
    status: "pending",
  };
}

/** 数 inbox 目录里 status=pending 的条数（给返回文案的「N 条待审」用）。 */
export async function countPendingInbox(inboxRealDir: string): Promise<number> {
  let names: string[];
  try {
    names = await fsp.readdir(inboxRealDir);
  } catch {
    return 0;
  }
  let n = 0;
  for (const name of names) {
    if (!name.endsWith(".json") || name.startsWith(".")) continue;
    try {
      const it = JSON.parse(await fsp.readFile(path.join(inboxRealDir, name), "utf8"));
      if (it.status === "pending") n++;
    } catch {
      /* 坏 JSON 跳过 */
    }
  }
  return n;
}

/**
 * 原子写一个 InboxItem 到 workspace/.memoryos/inbox/（tmp → rename，避免 app 读到半写）。
 * 写前对 inbox 目录做 containment 校验（拒 symlink 逃出 workspace）。
 * 返回文件名 + 写后 pending 计数。
 */
export async function writeInboxItem(
  workspace: string,
  item: InboxItem
): Promise<{ filename: string; pendingCount: number }> {
  const wsReal = await fsp.realpath(workspace);
  const inboxDir = path.join(wsReal, ".memoryos", "inbox");
  await fsp.mkdir(inboxDir, { recursive: true });
  const inboxReal = await fsp.realpath(inboxDir);
  assertWithinWorkspace(wsReal, inboxReal); // 拒 `..`/symlink 逃逸

  const filename = inboxFilename(item);
  const finalPath = path.join(inboxReal, filename);
  const tmpPath = path.join(inboxReal, `.${filename}.tmp`);
  await fsp.writeFile(tmpPath, JSON.stringify(item, null, 2));
  await fsp.rename(tmpPath, finalPath);

  const pendingCount = await countPendingInbox(inboxReal);
  return { filename, pendingCount };
}
