// MCP 连接状态（PRD v0.3.1 §4.2 .memoryos/mcp_state.json）。
// server↔app 无 RPC，只通过 workspace 文件通信：server 每次工具调用后写 mcp_state.json，
// app 在 focus 时读它来显示「最近 MCP 活动」。这是「最近一次检测到的活动」，不是实时 socket。
// 原子写 tmp→rename + containment（与 inbox 同纪律），best-effort 不抛错。

import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { assertWithinWorkspace } from "./inbox";
import type { McpState } from "../../src/types";

export type { McpState };

/** 写 .memoryos/mcp_state.json（原子 + containment）。失败只警告，不影响工具返回。 */
export async function writeMcpState(workspace: string, state: McpState): Promise<void> {
  try {
    const wsReal = await fsp.realpath(workspace);
    const dir = path.join(wsReal, ".memoryos");
    await fsp.mkdir(dir, { recursive: true });
    const dirReal = await fsp.realpath(dir);
    assertWithinWorkspace(wsReal, dirReal); // 拒 symlink 逃逸
    const finalPath = path.join(dirReal, "mcp_state.json");
    const tmpPath = path.join(dirReal, ".mcp_state.json.tmp");
    await fsp.writeFile(tmpPath, JSON.stringify(state, null, 2));
    await fsp.rename(tmpPath, finalPath);
  } catch (e) {
    console.error("[memoryos-mcp] mcp_state write failed:", e);
  }
}
