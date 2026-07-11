// Phase 2 stdio 冒烟测试：把已构建的 dist/index.mjs 当成真客户端那样 spawn 起来，
// 经 StdioClientTransport 走完 initialize → tools/list → tools/call 全流程。
// 证明"dev 客户端配置（node dist/index.mjs + env MEMORYOS_WORKSPACE）能跑通 pull"。
//
// 运行：node dist/smoke.stdio.mjs（由 npm run smoke 构建后调用）

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

let pass = 0;
let fail = 0;
const ok = (c: boolean, m: string) => (c ? (pass++, console.log("  ✓ " + m)) : (fail++, console.error("  ✗ FAIL: " + m)));

const ws = fs.mkdtempSync(path.join(os.tmpdir(), "memoryos-smoke-"));
const projDir = path.join(ws, "projects", "smoke-proj");
fs.mkdirSync(path.join(projDir, "sessions"), { recursive: true });
fs.writeFileSync(path.join(ws, "about_me.md"), "# About Me\n- smoke\n");
fs.writeFileSync(
  path.join(projDir, "project.json"),
  JSON.stringify({ name: "Smoke 项目", currentGoal: "g", updatedAt: "2026-06-01T00:00:00.000Z" })
);
fs.writeFileSync(path.join(projDir, "00_context.md"), "# ctx\n");
fs.writeFileSync(path.join(projDir, "decisions.md"), "# dec\n");
fs.writeFileSync(
  path.join(projDir, "sessions", "session_2026-06-01_1200.md"),
  "## 9. Compact Context for Next Session\nsmoke compact\n"
);
fs.writeFileSync(
  path.join(projDir, "entries.jsonl"),
  JSON.stringify({
    id: "m-0001", text: "冒烟条目一号", kinds: ["fact"], scopes: ["smoke-proj"],
    source: "user", modality: "text", relations: [], createdAt: "2026-07-10", updatedAt: "2026-07-10",
  }) + "\n"
);

// dist/index.mjs 与本文件同目录（都在 dist/）
const entry = path.join(path.dirname(fileURLToPath(import.meta.url)), "index.mjs");

async function run() {
  // 把埋点重定向到临时目录，避免冒烟测试污染真实 appData。
  const telDir = fs.mkdtempSync(path.join(os.tmpdir(), "memoryos-smoke-tel-"));
  const transport = new StdioClientTransport({
    command: process.execPath, // node
    args: [entry],
    env: { ...process.env, MEMORYOS_WORKSPACE: ws, MEMORYOS_TELEMETRY_DIR: telDir },
  });
  const client = new Client({ name: "smoke", version: "1.0.0" });
  await client.connect(transport); // 触发 initialize 握手
  ok(true, "initialize 握手成功（真子进程 + stdio）");

  const tools = await client.listTools();
  ok(
    tools.tools.map((t) => t.name).sort().join(",") ===
      "get_project_memory,list_projects,save_session_handoff,search_memory",
    "tools/list 返回 4 个工具（list / get / search / save）"
  );

  const gp = await client.callTool({ name: "get_project_memory", arguments: { project: "smoke" } });
  const mem = (gp as any).structuredContent;
  ok(mem?.projectName === "Smoke 项目", "tools/call get_project_memory 容错匹配 'smoke' 命中");
  ok(mem?.latestCompactContext === "smoke compact", "pull 拿到最新 Compact Context");

  const sr = await client.callTool({ name: "search_memory", arguments: { query: "冒烟条目" } });
  const srs = (sr as any).structuredContent;
  ok(srs?.hits?.[0]?.text === "冒烟条目一号", "tools/call search_memory 真 stdio 命中条目");

  await client.close();
  fs.rmSync(ws, { recursive: true, force: true });
  fs.rmSync(telDir, { recursive: true, force: true });
  console.log(`\n结果：${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  fs.rmSync(ws, { recursive: true, force: true });
  process.exit(1);
});
