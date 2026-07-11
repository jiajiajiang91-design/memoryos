// Phase 1 自测（PRD v0.3.1 §8 M0 + 转换函数 + 导入体验）。
// 运行：npx esbuild scripts/phase1.selftest.ts --bundle --platform=node --format=esm --outfile=tmp.selftest.mjs && node tmp.selftest.mjs
//
// 纯逻辑（inbox.ts / parser.ts）直接 import 测；Tauri 绑定的 fs IO 无法在 Node 跑，
// 这里用 node:fs 对临时目录复刻 fs.ts 里**完全相同的算法**（共用 inboxFilename/safeTimestamp），
// 验证 write/read/apply/discard 闭环、幂等、文件名合法、badge 只数 pending、session 防覆盖。

import {
  parsedToInboxHandoff,
  inboxHandoffToMarkdown,
  inboxItemToReviewState,
  safeTimestamp,
  inboxFilename,
} from "../src/lib/inbox";
import { parseHandoff } from "../src/lib/parser";
import type { InboxItem, ParsedHandoff } from "../src/types";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

let pass = 0;
let fail = 0;
function ok(cond: boolean, msg: string) {
  if (cond) { pass++; console.log("  ✓ " + msg); }
  else { fail++; console.error("  ✗ FAIL: " + msg); }
}
function eq(a: unknown, b: unknown, msg: string) {
  ok(JSON.stringify(a) === JSON.stringify(b), `${msg}  (got ${JSON.stringify(a)} want ${JSON.stringify(b)})`);
}

const SAMPLE = `# MemoryOS Session Handoff

## Metadata
- Date: 2026-06-02
- Source Tool: Codex
- Project: 测试项目
- Session Goal: 跑通 Inbox

## 1. What We Worked On
- 实现了 Memory Inbox 核心
- 写了三个转换函数

## 2. Key Decisions
- Decision: 用 ParsedHandoff 作为 Inbox handoff 结构
  - Reason: 复用现有解析
  - Impact: review 不区分来源

## 3. Current Project State
Phase 1 进行中，转换函数已写完。

## 4. Open Questions
- session 防覆盖用 _2/_3 还是加秒？

## 5. Next Actions
1. 跑自测
2. 汇报

## 6. Suggested Updates to 00_context.md
新增：Inbox 已落地。
**Superseded:** 进行中的 Inbox 设计

## 7. Suggested Updates to decisions.md
No update needed.

## 8. Suggested Updates to about_me.md
No update needed.

## 9. Compact Context for Next Session
本轮把 Memory Inbox 核心做完了：三个转换函数 + fs 读写 + 立即 Review。下次接 MCP。
`;

console.log("\n[A] 纯逻辑：parseHandoff / 三个转换函数 / 文件名安全");

const parsed: ParsedHandoff = parseHandoff(SAMPLE);
ok(parsed.whatWeWorkedOn.includes("Memory Inbox"), "parseHandoff 抓到 whatWeWorkedOn");
ok(parsed.compactContext.includes("下次接 MCP"), "parseHandoff 抓到 compactContext");
ok(parsed.metadata["Source Tool"] === "Codex", "parseHandoff 抓到 Source Tool=Codex");

// parsedToInboxHandoff：同名同构 + 深拷贝（改副本不影响原对象）
const handoff = parsedToInboxHandoff(parsed);
eq(Object.keys(handoff).sort(), Object.keys(parsed).sort(), "parsedToInboxHandoff 字段名与 ParsedHandoff 一致");
eq(handoff.whatWeWorkedOn, parsed.whatWeWorkedOn, "parsedToInboxHandoff 内容一致");
handoff.metadata["Source Tool"] = "TAMPERED";
ok(parsed.metadata["Source Tool"] === "Codex", "parsedToInboxHandoff 是深拷贝（改副本 metadata 不影响原对象）");
handoff.metadata["Source Tool"] = "Codex"; // 还原

// inboxHandoffToMarkdown：9 段 + 标题对齐
const md = inboxHandoffToMarkdown(handoff);
ok(md.startsWith("# MemoryOS Session Handoff"), "渲染出 handoff 标题");
for (let i = 1; i <= 9; i++) ok(md.includes(`## ${i}.`), `渲染出第 ${i} 段标题`);
ok(/##\s*9\.\s*Compact Context for Next Session/.test(md), "Compact Context 标题命中 readContextForStartPrompt 正则前缀");
// readContextForStartPrompt 用的正则能抽到 Compact Context
const compactRe = /##\s*\d*\.?\s*Compact Context[^\n]*\n([\s\S]*?)(?=\n##\s|$)/i;
ok(compactRe.test(md), "readContextForStartPrompt 的 Compact Context 抽取正则能命中渲染结果");

// round-trip：md 再 parse，关键字段还原
const reparsed = parseHandoff(md);
eq(reparsed.whatWeWorkedOn, parsed.whatWeWorkedOn, "round-trip whatWeWorkedOn 一致");
eq(reparsed.keyDecisions, parsed.keyDecisions, "round-trip keyDecisions 一致");
eq(reparsed.currentState, parsed.currentState, "round-trip currentState 一致");
eq(reparsed.nextActions, parsed.nextActions, "round-trip nextActions 一致");
eq(reparsed.compactContext, parsed.compactContext, "round-trip compactContext 一致");
ok(reparsed.suggestedContextUpdate.includes("Superseded"), "round-trip 保留 Superseded 标记（supersede 可用）");

// inboxItemToReviewState
const item: InboxItem = {
  id: crypto.randomUUID(),
  slug: "测试项目",
  sourceChannel: "manual",
  sourceClient: "Codex",
  sourcePlatform: null,
  createdAt: "2026-06-02T20:31:02.123Z",
  handoff,
  status: "pending",
};
const rs = inboxItemToReviewState(item);
eq(rs.raw, inboxHandoffToMarkdown(handoff), "inboxItemToReviewState.raw == inboxHandoffToMarkdown");
ok(rs.parsed === item.handoff, "inboxItemToReviewState.parsed 直接是 item.handoff");

// 文件名 safe（Windows 无冒号等非法字符）
eq(safeTimestamp("2026-06-02T20:31:02.123Z"), "20260602T203102_123Z", "safeTimestamp 格式正确");
const fname = inboxFilename(item);
ok(!/[\\/:*?"<>|]/.test(fname), `inboxFilename 无非法字符: ${fname}`);
ok(fname.endsWith(".json"), "inboxFilename 以 .json 结尾");

console.log("\n[B] fs 算法（node:fs 复刻 fs.ts 契约，临时目录）：write/read/apply/discard/幂等/防覆盖");

const ws = fs.mkdtempSync(path.join(os.tmpdir(), "memoryos-selftest-"));
const inboxPath = path.join(ws, ".memoryos", "inbox");
const archivePath = path.join(ws, ".memoryos", "archive");

// 复刻 fs.ts：writeInboxItem（tmp→rename）
function simWriteInboxItem(it: InboxItem): string {
  fs.mkdirSync(inboxPath, { recursive: true });
  const fn = inboxFilename(it);
  const tmp = path.join(inboxPath, `.${fn}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(it, null, 2));
  fs.renameSync(tmp, path.join(inboxPath, fn));
  return fn;
}
function simList(status?: string): { filename: string; item: InboxItem }[] {
  if (!fs.existsSync(inboxPath)) return [];
  const out: { filename: string; item: InboxItem }[] = [];
  for (const name of fs.readdirSync(inboxPath)) {
    if (!name.endsWith(".json") || name.startsWith(".")) continue;
    const it = JSON.parse(fs.readFileSync(path.join(inboxPath, name), "utf8")) as InboxItem;
    if (status && it.status !== status) continue;
    out.push({ filename: name, item: it });
  }
  out.sort((a, b) => (a.item.createdAt < b.item.createdAt ? 1 : -1));
  return out;
}
function simCountPending(): number { return simList("pending").length; }
function simArchive(filename: string, status: "applied" | "discarded"): void {
  const inP = path.join(inboxPath, filename);
  if (!fs.existsSync(inP)) return; // 幂等
  const it = JSON.parse(fs.readFileSync(inP, "utf8")) as InboxItem;
  it.status = status;
  fs.mkdirSync(archivePath, { recursive: true });
  const tmp = path.join(archivePath, `.${filename}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(it, null, 2));
  fs.renameSync(tmp, path.join(archivePath, filename));
  fs.rmSync(inP);
}

// 同分钟两条 → 文件名不冲突（uuid 不同），不互相覆盖
const itA: InboxItem = { ...item, id: crypto.randomUUID(), status: "pending" };
const itB: InboxItem = { ...item, id: crypto.randomUUID(), status: "pending", createdAt: "2026-06-02T20:31:02.123Z" };
const fnA = simWriteInboxItem(itA);
const fnB = simWriteInboxItem(itB);
ok(fnA !== fnB, "同分钟两条 inbox item 文件名不同（uuid 区分，不覆盖）");
eq(simList().length, 2, "write/read：inbox 里有 2 条");
eq(simCountPending(), 2, "badge 只数 pending：2");
ok(!fs.readdirSync(inboxPath).some((n) => n.endsWith(".tmp")), "无残留 .tmp（原子写后已 rename）");

// apply：移 archive(applied)，pending 减 1
simArchive(fnA, "applied");
eq(simCountPending(), 1, "apply 后 pending 减到 1");
ok(fs.existsSync(path.join(archivePath, fnA)), "apply 后文件出现在 archive/");
ok(!fs.existsSync(path.join(inboxPath, fnA)), "apply 后文件已从 inbox/ 移走");
eq(JSON.parse(fs.readFileSync(path.join(archivePath, fnA), "utf8")).status, "applied", "archive 里 status=applied");

// apply 幂等：再 archive 同一条不报错、不重复入库
simArchive(fnA, "applied");
eq(simCountPending(), 1, "apply 幂等：重复 archive 不影响 pending 计数");
eq(fs.readdirSync(archivePath).filter((n) => n === fnA).length, 1, "apply 幂等：archive 里不重复");

// discard：移 archive(discarded)，不入库
simArchive(fnB, "discarded");
eq(simCountPending(), 0, "discard 后 pending 归 0");
eq(JSON.parse(fs.readFileSync(path.join(archivePath, fnB), "utf8")).status, "discarded", "discard 的 status=discarded");

// session 防覆盖算法（复刻 saveSession 的 base/_2 逻辑）
function simSaveSession(slug: string, raw: string): string {
  const dir = path.join(ws, "projects", slug, "sessions");
  fs.mkdirSync(dir, { recursive: true });
  const now = new Date("2026-06-02T20:31:02.123Z");
  const ymd = now.toISOString().slice(0, 10);
  const hm = now.toTimeString().slice(0, 5).replace(":", "");
  const base = `session_${ymd}_${hm}`;
  let fn = `${base}.md`;
  let n = 2;
  while (fs.existsSync(path.join(dir, fn))) { fn = `${base}_${n}.md`; n++; }
  fs.writeFileSync(path.join(dir, fn), raw);
  return fn;
}
const s1 = simSaveSession("测试项目", md);
const s2 = simSaveSession("测试项目", md);
ok(s1 !== s2, `同分钟连续 apply 两条 session 不覆盖: ${s1} / ${s2}`);
ok(!/[:]/.test(s1) && !/[:]/.test(s2), "session 文件名无冒号");

fs.rmSync(ws, { recursive: true, force: true });

console.log("\n[C] 条目模式 handoff（07-11 写入口条目原生化）：解析 → 渲染 → 再解析闭环");
const entriesRaw = `# MemoryOS Session Handoff

## Metadata
- Date: 2026-07-11
- Source Tool: Claude
- Project: 测试项目

## 1. What We Worked On
- 做了写入口条目原生化

## 2. Key Decisions
- Decision: 写入口跟条目注入开关走
  - Date: 2026-07-11

## 3. AI Suggestions
None

## 4. Compact Context for Next Session
写入口条目原生化完成，下次试用。

## 5. Proposed Memory Entries
\`\`\`markdown
- 本轮确认了写入口条目原生化 #决策 @用户
- 建议试用一轮再并主干 #决策 @AI建议
- [m-0002] 过时状态 !归档
\`\`\`

## 6. Suggested Updates to about_me.md
No update needed.
`;
const pe = parseHandoff(entriesRaw);
ok((pe.proposedEntries ?? "").includes("写入口条目原生化 #决策 @用户"), "parseHandoff 抓到条目提案围栏");
ok((pe.proposedEntries ?? "").includes("!归档"), "调整标记原样保留");
ok(!(pe.proposedCards ?? "").trim(), "条目模式不误认成卡片提案");
const peHandoff = parsedToInboxHandoff(pe);
eq(peHandoff.proposedEntries, pe.proposedEntries, "parsedToInboxHandoff 带上条目提案");
const peMd = inboxHandoffToMarkdown(peHandoff);
ok(peMd.includes("## 5. Proposed Memory Entries"), "渲染出条目提案段");
const peAgain = parseHandoff(peMd);
eq(peAgain.proposedEntries, pe.proposedEntries, "条目提案 round-trip 一致");
eq(peAgain.compactContext, pe.compactContext, "条目版式 compactContext round-trip 一致");
ok(/##\s*(?:9|4)\.\s*Compact Context/.test(peMd), "条目版式 Compact Context 段渲染在位");

console.log(`\n结果：${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
