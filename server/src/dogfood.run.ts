// 真实工作区 dogfood 一次性脚本（PRD·记忆质量升级 总验收 · 三问测试）：
// ① 用真实 buildStartSessionPrompt 构建 旧整包 / 新记忆卡片 两版开始指令 → 写临时文件（喂给测试 agent）
// ② spawn 新版 dist/index.mjs（0.4.0）连真实工作区，验证 get_project_memory 返回 cards（只读，不写 inbox）
// 跑法：esbuild 打包后 node dist/dogfood.run.mjs

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { buildStartSessionPrompt } from "../../src/lib/parser";
import {
  parseSessionFile,
  isSessionFile,
  compareSessionsDesc,
  extractLatestCompactContext,
} from "../../src/lib/sessionParse";
import { cardsCharCount, parseCardsStamp } from "../../src/lib/cards";

const WS = "D:\\Claude_jiajia\\转行实践\\Memory";
const SLUG = "04_MemoryOS_V1";

const read = (p: string) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");

const projDir = path.join(WS, "projects", SLUG);
const aboutMe = read(path.join(WS, "about_me.md"));
const context = read(path.join(projDir, "00_context.md"));
const decisions = read(path.join(projDir, "decisions.md"));
const cards = read(path.join(projDir, "cards.md"));
const meta = JSON.parse(read(path.join(projDir, "project.json")));

const sessions = fs
  .readdirSync(path.join(projDir, "sessions"))
  .filter(isSessionFile)
  .map((n) => parseSessionFile(n, read(path.join(projDir, "sessions", n))))
  .sort(compareSessionsDesc);
const latestCompact = extractLatestCompactContext(sessions[0]?.rawMarkdown ?? "");

// 旧整包（cards 传空 → 走旧分支）vs 新卡片（cards 非空 → 新分支）
const oldPrompt = buildStartSessionPrompt({
  projectName: meta.name, aboutMe, context, decisions,
  latestCompactContext: latestCompact, cards: "", lang: "zh",
});
const newPrompt = buildStartSessionPrompt({
  projectName: meta.name, aboutMe, context, decisions,
  latestCompactContext: latestCompact, cards, lang: "zh",
});

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "memoryos-dogfood-"));
fs.writeFileSync(path.join(outDir, "old-prompt.txt"), oldPrompt);
fs.writeFileSync(path.join(outDir, "new-prompt.txt"), newPrompt);

console.log("PROMPT_DIR=" + outDir);
console.log(`old prompt: ${oldPrompt.length} chars (注入全文，含空白)`);
console.log(`new prompt: ${newPrompt.length} chars (注入全文，含空白)`);
console.log(`cards 正文（不计空白）: ${cardsCharCount(cards)} 字 / 预算 1200`);
const stamp = parseCardsStamp(cards);
console.log(`cards 整理日期: ${stamp ? stamp.distilledOn : "缺失!"}`);
console.log(`新版是旧版的 ${(100 * newPrompt.length / oldPrompt.length).toFixed(0)}%`);

// ── MCP 实测（只读工具，不碰 inbox）──
const entry = path.join(path.dirname(fileURLToPath(import.meta.url)), "index.mjs");
let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => (c ? (pass++, console.log("  ✓ " + m)) : (fail++, console.error("  ✗ FAIL: " + m)));

async function run() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [entry],
    env: { ...process.env, MEMORYOS_WORKSPACE: WS },
  });
  const client = new Client({ name: "dogfood-test", version: "1.0.0" });
  await client.connect(transport);
  ok(true, "0.4.0 server 连接真实工作区成功");

  const gp = await client.callTool({ name: "get_project_memory", arguments: { project: "MemoryOS" } });
  const mem = (gp as any).structuredContent;
  ok(mem?.projectName === meta.name, `容错匹配 'MemoryOS' → ${mem?.projectName}`);
  ok(typeof mem?.cards === "string" && mem.cards.includes("# 记忆卡片"), "返回 cards 字段且为记忆卡片内容");
  ok(mem.cards === cards, "MCP 返回的 cards 与磁盘文件逐字一致（所见即所注）");
  await client.close();
  console.log(`\nMCP 实测：${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
run().catch((e) => { console.error(e); process.exit(1); });
