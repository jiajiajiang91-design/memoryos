// Phase 2 自测（PRD v0.3.1 §8 M1 读取部分）。
// 运行：npm run selftest（在 server/ 下）。
//
// 覆盖：
//  - MCP 协议端到端（in-memory transport：真 Client ↔ createServer，listTools / callTool）
//  - list_projects / get_project_memory 输出与"直接读盘 + 共享纯逻辑"逐字一致
//  - 容错匹配（slug / name / 大小写 / 包含）
//  - 只读红线：跑完 workspace 文件无新增/改动

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "./server";
import { listProjects, getProjectMemory, matchProject } from "./workspace";
import { assertWithinWorkspace } from "./inbox";
import { extractLatestCompactContext } from "../../src/lib/sessionParse";
import { inboxItemToReviewState, inboxHandoffToMarkdown } from "../../src/lib/inbox";
import type { InboxItem } from "../../src/types";

let pass = 0;
let fail = 0;
function ok(cond: boolean, msg: string) {
  if (cond) {
    pass++;
    console.log("  ✓ " + msg);
  } else {
    fail++;
    console.error("  ✗ FAIL: " + msg);
  }
}
function eq(a: unknown, b: unknown, msg: string) {
  ok(JSON.stringify(a) === JSON.stringify(b), `${msg}`);
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    console.error("      got :", JSON.stringify(a));
    console.error("      want:", JSON.stringify(b));
  }
}

// ── 造一个 fixture workspace ─────────────────────────────
const ws = fs.mkdtempSync(path.join(os.tmpdir(), "memoryos-mcp-selftest-"));
const ABOUT_ME = "# About Me\n\n- 我是 Jiajia，建筑/计算设计。\n";
const CONTEXT = "# Demo 项目 — Context\n\n## 当前状态\n- 进行中：MCP pull\n";
const DECISIONS = "# Decisions\n\n- Decision: Inbox 为核心\n";
const OLD_SESSION = `# MemoryOS Session Handoff

## Metadata
- Date: 2026-05-01
- Source Tool: Claude

## 9. Compact Context for Next Session
旧的一轮，不该被选中。
`;
const NEW_SESSION = `# MemoryOS Session Handoff

## Metadata
- Date: 2026-06-01
- Source Tool: Codex

## 9. Compact Context for Next Session
最新一轮：MCP 只读骨架做完了，下一步接 save_session_handoff。
`;

const projDir = path.join(ws, "projects", "demo-proj");
fs.mkdirSync(path.join(projDir, "sessions"), { recursive: true });
fs.writeFileSync(path.join(ws, "about_me.md"), ABOUT_ME);
fs.writeFileSync(
  path.join(projDir, "project.json"),
  JSON.stringify(
    {
      name: "Demo 项目",
      description: "fixture",
      currentGoal: "跑通 MCP pull",
      currentGoalBullets: [],
      focus: "",
      progress: 0,
      statusLabel: "进行中",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-06-01T10:30:00.000Z",
    },
    null,
    2
  )
);
fs.writeFileSync(path.join(projDir, "00_context.md"), CONTEXT);
fs.writeFileSync(path.join(projDir, "decisions.md"), DECISIONS);
fs.writeFileSync(path.join(projDir, "sessions", "session_2026-05-01_0900.md"), OLD_SESSION);
fs.writeFileSync(path.join(projDir, "sessions", "session_2026-06-01_1030.md"), NEW_SESSION);
// 干扰文件：非 session 的 README 应被忽略
fs.writeFileSync(path.join(projDir, "sessions", "README.md"), "# not a session\n");

// 埋点写到临时目录，便于断言（覆盖 appData 推断）。telemetry / mcp_state 都不许进 workspace 正式区。
const telemetryDir = fs.mkdtempSync(path.join(os.tmpdir(), "memoryos-telemetry-"));
process.env.MEMORYOS_TELEMETRY_DIR = telemetryDir;

// 记录跑测前 workspace 的文件指纹（只读红线校验用）。
// skipMeta=true 时跳过 .memoryos/（mcp_state.json 等 server↔app 协调状态，非用户记忆，PRD §4.2 允许写）。
function snapshot(dir: string, skipMeta = false): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipMeta && e.name === ".memoryos") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) Object.assign(out, snapshot(p, skipMeta));
    else out[p] = `${fs.statSync(p).size}:${fs.statSync(p).mtimeMs}`;
  }
  return out;
}
// 正式记忆文件指纹（排除 .memoryos 协调区）。
const formalBeforeAll = snapshot(ws, true);

function readServerTelemetry(): Record<string, unknown>[] {
  const f = path.join(telemetryDir, "telemetry.server.jsonl");
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

async function run() {
  console.log("\n[A] 直接调 workspace 纯函数：list/get/match");

  const projects = await listProjects(ws);
  eq(projects, [
    { slug: "demo-proj", name: "Demo 项目", currentGoal: "跑通 MCP pull", updatedAt: "2026-06-01T10:30:00.000Z", mcpAutoApply: false },
  ], "list_projects 输出 = project.json 原值（slug/name/currentGoal/updatedAt/mcpAutoApply）");

  const mem = await getProjectMemory(ws, "demo-proj");
  ok(mem !== null, "get_project_memory 命中");
  eq(mem!.aboutMe, ABOUT_ME, "aboutMe 与盘上逐字一致");
  eq(mem!.context, CONTEXT, "context 与盘上逐字一致");
  eq(mem!.decisions, DECISIONS, "decisions 与盘上逐字一致");
  eq(mem!.projectName, "Demo 项目", "projectName = project.json name");
  // 最新一轮 = 2026-06-01（不是 05-01），Compact Context 用共享纯逻辑算
  eq(
    mem!.latestCompactContext,
    extractLatestCompactContext(NEW_SESSION),
    "latestCompactContext 取最新 session 且与共享纯逻辑一致"
  );
  ok(mem!.latestCompactContext.includes("最新一轮"), "latestCompactContext 内容是最新一轮");
  ok(!mem!.latestCompactContext.includes("旧的一轮"), "latestCompactContext 没取到旧 session");

  console.log("\n[B] 容错匹配");
  ok(matchProject(projects, "demo-proj")?.slug === "demo-proj", "精确 slug 命中");
  ok(matchProject(projects, "Demo 项目")?.slug === "demo-proj", "精确 name 命中");
  ok(matchProject(projects, "DEMO-PROJ")?.slug === "demo-proj", "大小写不敏感命中");
  ok(matchProject(projects, "demo")?.slug === "demo-proj", "包含匹配命中");
  ok(matchProject(projects, "不存在的项目xyz") === null, "匹配不到返回 null");
  ok((await getProjectMemory(ws, "nope")) === null, "get_project_memory 匹配不到返回 null");

  console.log("\n[C] MCP 协议端到端（in-memory Client ↔ server）");
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const server = createServer(ws);
  await server.connect(serverT);
  const client = new Client({ name: "selftest-client", version: "1.0.0" });
  await client.connect(clientT);

  const toolList = await client.listTools();
  const toolNames = toolList.tools.map((t) => t.name).sort();
  eq(
    toolNames,
    ["get_project_memory", "list_projects", "save_session_handoff"],
    "listTools 暴露 3 个工具（含 save_session_handoff）"
  );

  const lp = await client.callTool({ name: "list_projects", arguments: {} });
  const lpStruct = (lp as any).structuredContent;
  eq(lpStruct.projects, projects, "callTool(list_projects).structuredContent 与纯函数一致");
  const lpText = JSON.parse((lp as any).content[0].text);
  eq(lpText, projects, "callTool(list_projects).content[0].text 是同样的 JSON");

  const gp = await client.callTool({ name: "get_project_memory", arguments: { project: "demo" } });
  const gpStruct = (gp as any).structuredContent;
  eq(gpStruct, mem, "callTool(get_project_memory).structuredContent 与纯函数一致（容错匹配 'demo'）");

  const miss = await client.callTool({ name: "get_project_memory", arguments: { project: "无此项目zzz" } });
  ok((miss as any).isError === true, "get_project_memory 未命中 → isError=true");
  ok(String((miss as any).content[0].text).includes("未找到"), "未命中返回友好提示文案");

  await client.close();
  await server.close();

  console.log("\n[D] 只读红线：list/get 跑完正式记忆文件无新增/改动（.memoryos 协调区允许变）");
  const formalAfterRead = snapshot(ws, true);
  eq(Object.keys(formalAfterRead).sort(), Object.keys(formalBeforeAll).sort(), "读工具跑完正式区无文件新增/删除");
  let unchanged = true;
  for (const k of Object.keys(formalBeforeAll)) if (formalBeforeAll[k] !== formalAfterRead[k]) unchanged = false;
  ok(unchanged, "读工具跑完所有正式文件大小/mtime 不变（about_me / projects/** 未动）");

  // 连接状态：MCP get_project_memory 后写了 mcp_state.json（server↔app 协调，非用户记忆）
  const statePath = path.join(ws, ".memoryos", "mcp_state.json");
  ok(fs.existsSync(statePath), "MCP 工具调用后写了 .memoryos/mcp_state.json");
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  eq(state.lastClient, "selftest-client", "mcp_state.lastClient = 握手 clientInfo.name");
  eq(state.lastTool, "get_project_memory", "mcp_state.lastTool = 最近一次工具");
  ok(typeof state.lastActivityAt === "string" && state.lastActivityAt.length > 0, "mcp_state.lastActivityAt 有值");

  // ── Phase 3：save_session_handoff（push → 待审 Inbox）──
  console.log("\n[E] save_session_handoff：结构化入参 → 原子写 inbox（不碰正式文件）");
  // 正式文件（about_me + 项目 context/decisions/sessions）的指纹，写 handoff 后必须不变
  const formalBefore = snapshot(projDir); // projDir 不含 .memoryos
  const aboutMeBefore = `${fs.statSync(path.join(ws, "about_me.md")).size}:${fs.statSync(path.join(ws, "about_me.md")).mtimeMs}`;

  const [clientT2, serverT2] = InMemoryTransport.createLinkedPair();
  const server2 = createServer(ws);
  await server2.connect(serverT2);
  const client2 = new Client({ name: "selftest-client", version: "1.0.0" });
  await client2.connect(clientT2);

  const saveInputNoCards = {
    project: "demo", // 容错匹配
    metadata: { Date: "2026-06-02" }, // 故意不填 Source Tool：测握手名兜底（Codex 误标 Claude 的回归）
    whatWeWorkedOn: "实现 save_session_handoff",
    keyDecisions: "Decision: server 直接构造 Inbox item",
    currentState: "Phase 3 进行中",
    openQuestions: "无",
    nextActions: "1. 跑自测",
    suggestedContextUpdate: "新增：MCP push 已落地",
    compactContext: "本轮把 MCP push 做完了，下一步打包。",
  };

  // 工具契约强制：缺 proposedCards → 退回教学（isError），不写盘
  const bounce = await client2.callTool({ name: "save_session_handoff", arguments: saveInputNoCards });
  ok((bounce as any).isError === true, "缺 proposedCards → isError=true（契约强制，旧格式保存被退回）");
  ok(String((bounce as any).content[0].text).includes("缺少记忆卡片"), "退回文案教 AI 如何补全（先 get_project_memory）");
  ok(
    !fs.existsSync(path.join(ws, ".memoryos", "inbox")) ||
      fs.readdirSync(path.join(ws, ".memoryos", "inbox")).filter((n) => n.endsWith(".json") && !n.startsWith(".")).length === 0,
    "被退回的调用不写 inbox"
  );

  // 乱码门禁：CJK 被编码降级成成串 '?'（Codex Windows 真实 bug）→ 拒收不写盘
  const garbled = await client2.callTool({
    name: "save_session_handoff",
    arguments: {
      ...saveInputNoCards,
      whatWeWorkedOn: "- ?? MemoryOS ?????? ??????????",
      proposedCards: "# ???? · ????\n> ??? 2026-06-10\n\n## ????\n- ??????????",
    },
  });
  ok((garbled as any).isError === true, "乱码内容（成串 ?）→ isError 拒收");
  ok(String((garbled as any).content[0].text).includes("乱码"), "拒收文案点明编码问题并给修复方法");
  ok(
    !fs.existsSync(path.join(ws, ".memoryos", "inbox")) ||
      fs.readdirSync(path.join(ws, ".memoryos", "inbox")).filter((n) => n.endsWith(".json") && !n.startsWith(".")).length === 0,
    "乱码调用不写 inbox"
  );

  const SELFTEST_CARDS = "# 记忆卡片 · Demo 项目\n> 整理于 2026-06-02\n\n## 项目卡\nselftest 用例。\n\n## 当前状态\n- 进行中：Phase 3\n\n## 约束与决策\n- [2026-06-02][用户拍板] 测试决策\n\n## 上次对话总结\nMCP push 做完。\n\n## 历史档案\n- 决策历史 → decisions.md\n";
  const saveInput = { ...saveInputNoCards, proposedCards: SELFTEST_CARDS };
  const saveRes = await client2.callTool({ name: "save_session_handoff", arguments: saveInput });
  const saveStruct = (saveRes as any).structuredContent;
  ok(saveStruct?.staged === true, "返回 staged=true");
  ok(saveStruct?.pendingCount === 1, "返回 pendingCount=1");
  ok(saveStruct?.slug === "demo-proj", "容错匹配 'demo' → slug=demo-proj");
  const saveText = String((saveRes as any).content[0].text);
  ok(saveText.includes("尚未入库"), "返回文案明确『尚未入库』（红线）");
  ok(saveText.includes("1 条待审"), "返回文案含待审条数");

  // 落盘检查：inbox 里恰好 1 个 json，且字段对齐
  const inboxDir = path.join(ws, ".memoryos", "inbox");
  const inboxFiles = fs.readdirSync(inboxDir).filter((n) => n.endsWith(".json") && !n.startsWith("."));
  eq(inboxFiles.length, 1, "inbox 里恰好 1 个 item 文件");
  ok(!fs.readdirSync(inboxDir).some((n) => n.endsWith(".tmp")), "无残留 .tmp（原子写后已 rename）");
  ok(!/[\\/:*?"<>|]/.test(inboxFiles[0]), `inbox 文件名 filename-safe: ${inboxFiles[0]}`);
  const item = JSON.parse(fs.readFileSync(path.join(inboxDir, inboxFiles[0]), "utf8")) as InboxItem;
  eq(item.sourceChannel, "mcp", "sourceChannel=mcp");
  eq(item.sourceClient, "selftest-client", "sourceClient 来自 initialize 握手的 clientInfo.name");
  eq(item.sourcePlatform, null, "sourcePlatform=null");
  eq(item.status, "pending", "status=pending");
  eq(item.slug, "demo-proj", "item.slug=demo-proj");
  eq(item.handoff.whatWeWorkedOn, saveInput.whatWeWorkedOn, "handoff.whatWeWorkedOn 对齐入参");
  eq(item.handoff.compactContext, saveInput.compactContext, "handoff.compactContext 对齐入参");
  eq(item.handoff.suggestedDecisionsUpdate, "", "未传的 suggested 字段补空串（对齐 ParsedHandoff）");
  // 13 = 旧 10 字段 + 现行卡模式 3 字段（aiSuggestions / proposedCards / proposedCardsSuperseded，PRD·记忆质量升级 F1）
  ok(Object.keys(item.handoff).length === 13, "handoff 恰好 13 个字段（= ParsedHandoff 含现行卡字段）");
  eq(item.handoff.aiSuggestions, "", "未传 aiSuggestions 补空串");
  eq(item.handoff.proposedCards, saveInput.proposedCards, "proposedCards 对齐入参（契约强制后必有）");
  ok(Array.isArray(item.handoff.proposedCardsSuperseded) && item.handoff.proposedCardsSuperseded.length === 0, "未传 proposedCardsSuperseded 补空数组");
  eq(item.handoff.metadata["Source Tool"], "selftest-client", "AI 没填 Source Tool → 用 MCP 握手客户端名兜底（Codex 误标 Claude 的回归）");

  // 跨模块：server 写出的 item 能被 app 的 review 路径直接消费（server → app 闭环）
  const reviewState = inboxItemToReviewState(item);
  eq(reviewState.raw, inboxHandoffToMarkdown(item.handoff), "server item → app inboxItemToReviewState 可渲染出 9 段 Markdown");
  ok(reviewState.parsed === item.handoff, "review.parsed 直接是 server 写入的 handoff（结构一致，review 不区分来源）");

  // 红线：写 handoff 没动任何正式文件
  const formalAfter = snapshot(projDir);
  eq(Object.keys(formalAfter).sort(), Object.keys(formalBefore).sort(), "未在项目目录新增/删除文件");
  let formalUnchanged = true;
  for (const k of Object.keys(formalBefore)) if (formalBefore[k] !== formalAfter[k]) formalUnchanged = false;
  ok(formalUnchanged, "项目正式文件（context/decisions/sessions）全部未变");
  const aboutMeAfter = `${fs.statSync(path.join(ws, "about_me.md")).size}:${fs.statSync(path.join(ws, "about_me.md")).mtimeMs}`;
  ok(aboutMeBefore === aboutMeAfter, "about_me.md 未变");

  // 未匹配项目 → isError，不写盘
  const missSave = await client2.callTool({ name: "save_session_handoff", arguments: { ...saveInput, project: "不存在zzz" } });
  ok((missSave as any).isError === true, "未匹配项目 → isError=true");
  ok(String((missSave as any).content[0].text).includes("未暂存"), "未匹配返回『未暂存』提示");
  eq(
    fs.readdirSync(inboxDir).filter((n) => n.endsWith(".json") && !n.startsWith(".")).length,
    1,
    "未匹配不写盘（inbox 仍只有 1 条）"
  );

  console.log("\n[F] 路径 containment：拒 workspace 外 / symlink 逃逸");
  const wsReal = fs.realpathSync(ws);
  let threw = false;
  try { assertWithinWorkspace(wsReal, path.join(os.tmpdir(), "somewhere-else")); } catch { threw = true; }
  ok(threw, "assertWithinWorkspace 拒绝 workspace 外的真实路径");
  ok((() => { try { assertWithinWorkspace(wsReal, path.join(wsReal, ".memoryos", "inbox")); return true; } catch { return false; } })(), "assertWithinWorkspace 放行 workspace 内的 inbox 目录");
  // best-effort symlink 逃逸（Windows 无权限建符号链接时跳过）
  try {
    const ws2 = fs.mkdtempSync(path.join(os.tmpdir(), "memoryos-escape-"));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "memoryos-outside-"));
    fs.mkdirSync(path.join(ws2, ".memoryos"), { recursive: true });
    fs.symlinkSync(outside, path.join(ws2, ".memoryos", "inbox"), "dir");
    let escaped = false;
    try {
      const { writeInboxItem } = await import("./inbox");
      await writeInboxItem(ws2, item);
    } catch { escaped = true; }
    ok(escaped, "symlink 把 inbox 指向 workspace 外时 writeInboxItem 抛错（拒逃逸）");
    fs.rmSync(ws2, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  } catch {
    console.log("  · (跳过 symlink 用例：当前环境无创建符号链接权限)");
  }

  console.log("\n[G] prompts：start_session（注入式）+ end_session（调工具版）");
  const prompts = await client2.listPrompts();
  ok(prompts.prompts.some((p) => p.name === "end_session"), "listPrompts 暴露 end_session");
  ok(prompts.prompts.some((p) => p.name === "start_session"), "listPrompts 暴露 start_session");
  const gp2 = await client2.getPrompt({ name: "end_session", arguments: { project: "Demo 项目" } });
  const ptext = (gp2.messages[0].content as any).text as string;
  ok(ptext.includes("save_session_handoff"), "end_session 指示调用 save_session_handoff 工具");
  ok(ptext.includes("不要粘贴 Markdown"), "end_session 明确『不要粘贴 Markdown』");
  ok(ptext.includes("Demo 项目"), "end_session 注入了 project 名");

  const sp = await client2.getPrompt({ name: "start_session", arguments: { project: "demo" } });
  const stext = (sp.messages[0].content as any).text as string;
  ok(stext.includes("Demo 项目"), "start_session 注入项目名（容错匹配 'demo'）");
  ok(stext.includes(CONTEXT.trim().split("\n")[0]) || stext.includes("项目状态"), "start_session 注入了项目 context");
  ok(stext.includes("最新一轮") || stext.includes("上次工作"), "start_session 注入了最新 Compact Context");
  const spMiss = await client2.getPrompt({ name: "start_session", arguments: { project: "无此项目zzz" } });
  ok(String((spMiss.messages[0].content as any).text).includes("未找到"), "start_session 未命中返回友好提示（不抛错）");

  console.log("\n[H] 埋点：telemetry.server.jsonl（带 channel=mcp，按写入进程分文件）");
  const events = readServerTelemetry();
  ok(events.length > 0, "server 埋点写到了 telemetry.server.jsonl");
  ok(events.every((e) => e.channel === "mcp"), "每条事件都带 channel=mcp");
  ok(events.every((e) => typeof e.ts === "string"), "每条事件都带 ts");
  ok(events.some((e) => e.event === "list_projects"), "记录了 list_projects 事件");
  const pulls = events.filter((e) => e.event === "pull");
  ok(pulls.length >= 2, "记录了 pull 事件");
  ok(pulls.some((e) => e.success === true) && pulls.some((e) => e.success === false), "pull 事件区分 success true/false");
  ok(pulls.every((e) => typeof e.sourceClient === "string"), "pull 带 sourceClient（cross_ai_reuse 用）");
  const pushes = events.filter((e) => e.event === "push_to_inbox");
  ok(pushes.some((e) => e.staged === true), "记录了 push_to_inbox（staged=true，北极星分母）");
  ok(pushes.some((e) => e.staged === false), "未匹配的 push 也记录（staged=false）");

  console.log("\n[I] 红线回归");
  // 1) 整轮跑完，workspace 里**正式记忆文件**一个字节都没动（只 .memoryos 协调区 + inbox 变了）
  const formalEnd = snapshot(ws, true);
  eq(Object.keys(formalEnd).sort(), Object.keys(formalBeforeAll).sort(), "整轮跑完正式记忆文件无新增/删除");
  let formalIntact = true;
  for (const k of Object.keys(formalBeforeAll)) if (formalBeforeAll[k] !== formalEnd[k]) formalIntact = false;
  ok(formalIntact, "整轮跑完 about_me / projects/** 全部未变（无 handoff 绕过 review 入库）");
  // 2) 埋点写在 workspace 之外（不污染用户 workspace）
  ok(!fs.existsSync(path.join(ws, "telemetry.server.jsonl")), "埋点不在 workspace 内");
  ok(fs.existsSync(path.join(telemetryDir, "telemetry.server.jsonl")), "埋点在独立的 appData/telemetry 目录");
  // 3) 静态：运行期 server 源码不引入任何网络/监听原语（无端口、无外传）。
  //    只扫运行期文件（排除 selftest/smoke 测试 harness）。注意 createServer 须带 http/net/https 前缀才算
  //    网络原语——本项目自己的 MCP 工厂也叫 createServer，不能误伤。
  const srcDir = path.resolve("src");
  const runtimeFiles = fs
    .readdirSync(srcDir)
    .filter((f) => f.endsWith(".ts") && !/selftest|smoke/.test(f));
  const netRe = /\bfrom\s+['"](node:)?(net|http|https|dgram|tls|ws)['"]|\brequire\(\s*['"](node:)?(net|http|https|dgram|tls|ws)['"]\s*\)|\.listen\s*\(|\b(http|https|net)\.createServer\s*\(/;
  const offenders = runtimeFiles.filter((f) => netRe.test(fs.readFileSync(path.join(srcDir, f), "utf8")));
  eq(offenders, [], "运行期 server 源码无 net/http/listen 等网络/监听原语");

  await client2.close();
  await server2.close();

  fs.rmSync(ws, { recursive: true, force: true });
  fs.rmSync(telemetryDir, { recursive: true, force: true });
  console.log(`\n结果：${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  fs.rmSync(ws, { recursive: true, force: true });
  fs.rmSync(telemetryDir, { recursive: true, force: true });
  process.exit(1);
});
