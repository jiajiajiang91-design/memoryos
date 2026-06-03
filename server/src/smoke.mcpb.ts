// Phase 4 MCPB smoke test:
// 1. Extract server/mcpb/memoryos.mcpb.
// 2. Validate manifest mcp_config and user_config.workspace_path.
// 3. Start the bundled server/index.mjs from the extracted package.
// 4. Exercise tools/list, get_project_memory, and save_session_handoff over MCP.

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

let pass = 0;
let fail = 0;
const ok = (cond: boolean, msg: string) => {
  if (cond) {
    pass++;
    console.log("  [ok] " + msg);
  } else {
    fail++;
    console.error("  [fail] " + msg);
  }
};
const eq = (a: unknown, b: unknown, msg: string) => {
  ok(JSON.stringify(a) === JSON.stringify(b), msg);
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    console.error("      got :", JSON.stringify(a));
    console.error("      want:", JSON.stringify(b));
  }
};

type Manifest = {
  manifest_version: string;
  name: string;
  version: string;
  server: {
    type: string;
    entry_point: string;
    mcp_config: {
      command: string;
      args: string[];
      env?: Record<string, string>;
    };
  };
  tools?: { name: string }[];
  prompts?: { name: string }[];
  user_config?: Record<string, { type: string; required?: boolean; default?: string }>;
};

// 解压 .mcpb（= 标准 zip）。build-mcpb.mjs 写的是 STORE（method 0，不压缩）条目，
// 所以只需顺序读 local file header（签名 0x04034b50）即可，无需任何 zip 依赖。
// 不依赖外部 `tar`——GNU tar 会把 Windows 盘符 `D:` 误判成远程主机。
function extractStoredZip(zipPath: string, destDir: string): void {
  const buf = fs.readFileSync(zipPath);
  let off = 0;
  while (off + 4 <= buf.length && buf.readUInt32LE(off) === 0x04034b50) {
    const method = buf.readUInt16LE(off + 8);
    const compSize = buf.readUInt32LE(off + 18);
    const nameLen = buf.readUInt16LE(off + 26);
    const extraLen = buf.readUInt16LE(off + 28);
    const nameStart = off + 30;
    const name = buf.toString("utf8", nameStart, nameStart + nameLen);
    const dataStart = nameStart + nameLen + extraLen;
    if (method !== 0) throw new Error(`unexpected compression method ${method} for ${name}`);
    const data = buf.subarray(dataStart, dataStart + compSize);
    const outPath = path.join(destDir, name);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, data);
    off = dataStart + compSize;
  }
}

function makeWorkspace(): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "memoryos-mcpb-ws-"));
  const projDir = path.join(ws, "projects", "bundle-proj");
  fs.mkdirSync(path.join(projDir, "sessions"), { recursive: true });
  fs.writeFileSync(path.join(ws, "about_me.md"), "# About Me\n- MCPB smoke\n");
  fs.writeFileSync(
    path.join(projDir, "project.json"),
    JSON.stringify({
      name: "Bundle Project",
      currentGoal: "verify bundled MCP server",
      updatedAt: "2026-06-03T00:00:00.000Z",
    })
  );
  fs.writeFileSync(path.join(projDir, "00_context.md"), "# Context\nBundle context\n");
  fs.writeFileSync(path.join(projDir, "decisions.md"), "# Decisions\nBundle decision\n");
  fs.writeFileSync(
    path.join(projDir, "sessions", "session_2026-06-03_0001.md"),
    "## 9. Compact Context for Next Session\nBundled compact context\n"
  );
  return ws;
}

async function run() {
  const repoRoot = path.resolve("..");
  const bundlePath = path.join(repoRoot, "server", "mcpb", "memoryos.mcpb");
  ok(fs.existsSync(bundlePath), "server/mcpb/memoryos.mcpb exists");

  const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), "memoryos-mcpb-extract-"));
  const ws = makeWorkspace();
  try {
    extractStoredZip(bundlePath, extractDir);
    const entries = fs.readdirSync(extractDir).sort();
    ok(entries.includes("manifest.json"), "bundle contains manifest.json");
    ok(fs.existsSync(path.join(extractDir, "server", "index.mjs")), "bundle contains server/index.mjs");
    ok(fs.existsSync(path.join(extractDir, "icon.png")), "bundle contains icon.png");

    const manifest = JSON.parse(
      fs.readFileSync(path.join(extractDir, "manifest.json"), "utf8")
    ) as Manifest;
    eq(manifest.manifest_version, "0.3", "manifest_version=0.3");
    eq(manifest.server.type, "node", "server.type=node");
    eq(manifest.server.entry_point, "server/index.mjs", "server.entry_point=server/index.mjs");
    eq(manifest.server.mcp_config.command, "node", "mcp_config.command=node");
    eq(
      manifest.server.mcp_config.args,
      ["${__dirname}/server/index.mjs"],
      "mcp_config.args uses ${__dirname}/server/index.mjs"
    );
    eq(
      manifest.server.mcp_config.env?.MEMORYOS_WORKSPACE,
      "${user_config.workspace_path}",
      "MEMORYOS_WORKSPACE injected from user_config.workspace_path"
    );
    eq(manifest.user_config?.workspace_path?.type, "directory", "workspace_path is directory user_config");
    ok(manifest.tools?.some((t) => t.name === "save_session_handoff") === true, "manifest declares save_session_handoff");
    ok(manifest.prompts?.some((p) => p.name === "end_session") === true, "manifest declares end_session prompt");

    const command = manifest.server.mcp_config.command;
    const args = manifest.server.mcp_config.args.map((arg) =>
      arg
        .replaceAll("${__dirname}", extractDir)
        .replaceAll("${user_config.workspace_path}", ws)
    );
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(manifest.server.mcp_config.env ?? {})) {
      env[key] = value
        .replaceAll("${__dirname}", extractDir)
        .replaceAll("${user_config.workspace_path}", ws);
    }
    const processEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === "string") processEnv[key] = value;
    }
    // 埋点重定向到解压临时目录，避免冒烟测试污染真实 appData。
    env.MEMORYOS_TELEMETRY_DIR = path.join(extractDir, "telemetry");

    const transport = new StdioClientTransport({
      command,
      args,
      env: { ...processEnv, ...env },
    });
    const client = new Client({ name: "mcpb-smoke", version: "1.0.0" });
    await client.connect(transport);
    ok(true, "bundled server initialize succeeded over stdio");

    const tools = await client.listTools();
    eq(
      tools.tools.map((t) => t.name).sort(),
      ["get_project_memory", "list_projects", "save_session_handoff"],
      "bundled server exposes expected tools"
    );

    const memory = await client.callTool({
      name: "get_project_memory",
      arguments: { project: "bundle" },
    });
    ok((memory as any).structuredContent?.projectName === "Bundle Project", "bundled get_project_memory works");
    ok(
      (memory as any).structuredContent?.latestCompactContext === "Bundled compact context",
      "bundled pull reads latest compact context"
    );

    const save = await client.callTool({
      name: "save_session_handoff",
      arguments: {
        project: "bundle",
        whatWeWorkedOn: "Verified MCPB package",
        keyDecisions: "Decision: use bundled server entry",
        currentState: "Phase 4 smoke running",
        openQuestions: "None",
        nextActions: "Report Phase 4",
        compactContext: "MCPB package can start the bundled server and write Inbox.",
      },
    });
    ok((save as any).structuredContent?.staged === true, "bundled save_session_handoff stages item");
    ok(String((save as any).content[0].text).includes("尚未入库"), "bundled save response keeps review red line");
    const inboxDir = path.join(ws, ".memoryos", "inbox");
    const inboxFiles = fs.readdirSync(inboxDir).filter((n) => n.endsWith(".json"));
    eq(inboxFiles.length, 1, "bundled save writes exactly one inbox item");
    ok(!fs.existsSync(path.join(ws, "projects", "bundle-proj", "sessions", "session_2026-06-03_0002.md")), "bundled save does not write formal session");

    await client.close();
  } finally {
    fs.rmSync(extractDir, { recursive: true, force: true });
    fs.rmSync(ws, { recursive: true, force: true });
  }

  console.log(`\nResult: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
