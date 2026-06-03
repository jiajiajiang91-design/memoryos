// Server 埋点（PRD v0.3.1 §4.2）。通道无关、纯本地、best-effort（绝不抛错影响工具）。
// 按写入进程分文件避免并发写竞争：**server 写 telemetry.server.jsonl**，app 写 telemetry.jsonl。
// 每条事件带 channel 字段（此进程恒为 "mcp"）。
//
// 路径对齐 app 的 Tauri appDataDir()/memoryos/：
//   Windows %APPDATA%/<bundleId>/memoryos/ · macOS ~/Library/Application Support/<bundleId>/memoryos/
//   Linux $XDG_DATA_HOME(or ~/.local/share)/<bundleId>/memoryos/
// 可用 MEMORYOS_TELEMETRY_DIR 覆盖（app/打包可注入精确目录）。

import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

const BUNDLE_ID = "com.memoryos.app"; // 与 tauri.conf.json identifier 一致
const APP_FOLDER = "memoryos";
const FILE_NAME = "telemetry.server.jsonl";

function appDataBase(): string {
  if (process.platform === "win32") {
    return process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support");
  }
  return process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
}

function telemetryDir(): string {
  if (process.env.MEMORYOS_TELEMETRY_DIR) return process.env.MEMORYOS_TELEMETRY_DIR;
  return path.join(appDataBase(), BUNDLE_ID, APP_FOLDER);
}

/** 追加一条事件到 telemetry.server.jsonl。失败只 stderr 警告，不抛。 */
export async function logServerEvent(
  event: string,
  payload: Record<string, unknown> = {}
): Promise<void> {
  try {
    const dir = telemetryDir();
    await fsp.mkdir(dir, { recursive: true });
    const line =
      JSON.stringify({ ts: new Date().toISOString(), event, channel: "mcp", ...payload }) + "\n";
    await fsp.appendFile(path.join(dir, FILE_NAME), line);
  } catch (e) {
    console.error("[memoryos-mcp] telemetry log failed:", e);
  }
}
