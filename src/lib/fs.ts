// All Tauri filesystem + clipboard + dialog interactions live here.
// Workspace layout on disk:
//   workspace/
//     about_me.md
//     projects/
//       <slug>/
//         project.json
//         cards.md          ← 现行卡（存在 = 该项目启用现行卡模式，PRD·记忆质量升级）
//         00_context.md     ← 旧模式主文件；现行卡模式下冻结为历史档案
//         decisions.md      ← 旧模式主文件；现行卡模式下作为决策档案（作废条目去处）
//         rejected.md       ← 已驳回的 AI 建议（防复提名单，现行卡模式）
//         sessions/
//           session_YYYY-MM-DD_HHmm.md

import { open } from "@tauri-apps/api/dialog";
import {
  readDir,
  readTextFile,
  writeTextFile,
  createDir,
  exists,
  renameFile,
  removeFile,
} from "@tauri-apps/api/fs";
import { writeText } from "@tauri-apps/api/clipboard";
import { invoke } from "@tauri-apps/api/tauri";
import { join, documentDir } from "@tauri-apps/api/path";
import type { Project, ProjectMeta, Session, InboxItem, InboxStatus, McpState } from "../types";
import { inboxFilename, inboxHandoffToMarkdown, looksGarbled } from "./inbox";
import { parseCardsStamp, stampCards } from "./cards";
import {
  parseSessionFile,
  isSessionFile,
  compareSessionsDesc,
  extractLatestCompactContext,
} from "./sessionParse";
import { tSync } from "./i18n";

// 兼容旧导入路径：parseSessionFile 现住在 sessionParse.ts（app 与 MCP server 共享）。
export { parseSessionFile };

// 示例项目的固定 slug + 默认中文 name(用来判断"用户没改过示例") 。
// 一旦用户重命名,name 就不再等于这个常量,override 就跳过,展示用户输入的值。
const SAMPLE_SLUG = "我的第一个项目";
const SAMPLE_DEFAULT_NAME = "我的第一个项目";

function isUneditedSample(meta: ProjectMeta): boolean {
  return meta.slug === SAMPLE_SLUG && meta.name === SAMPLE_DEFAULT_NAME;
}

// 把示例项目的展示字段换成当前语言。不改磁盘,只改返回给 UI 的内容。
function localizeSampleDisplay(meta: ProjectMeta): ProjectMeta {
  if (!isUneditedSample(meta)) return meta;
  return {
    ...meta,
    name: tSync("sample.name"),
    description: tSync("sample.description"),
    currentGoal: tSync("sample.currentGoal"),
    currentGoalBullets: [
      tSync("sample.bullet1"),
      tSync("sample.bullet2"),
      tSync("sample.bullet3"),
      tSync("sample.bullet4"),
    ],
    focus: tSync("sample.focus"),
    statusLabel: tSync("sample.statusLabel"),
  };
}

const WORKSPACE_KEY = "memoryos.workspace";

export function loadWorkspace(): string | null {
  return localStorage.getItem(WORKSPACE_KEY);
}

export async function selectWorkspace(title = "Select MemoryOS Workspace"): Promise<string | null> {
  const picked = await open({
    directory: true,
    multiple: false,
    title,
  });
  if (typeof picked === "string") {
    localStorage.setItem(WORKSPACE_KEY, picked);
    await ensureWorkspaceLayout(picked);
    return picked;
  }
  return null;
}

export async function createWorkspace(): Promise<string | null> {
  // identical to select — Tauri's open dialog with directory:true lets the
  // user create a new folder inside the picker on every OS.
  return selectWorkspace();
}

/** 默认 workspace 路径预览(只查不创建) */
export async function getDefaultWorkspacePath(): Promise<string> {
  const docDir = await documentDir();
  return await join(docDir, "MemoryOS");
}

/**
 * 在指定路径(如果不传则用默认路径)建 workspace 文件结构 + 示例项目。
 */
export async function quickSetupWorkspace(customPath?: string): Promise<string> {
  const workspace = customPath ?? (await getDefaultWorkspacePath());
  await ensureWorkspaceLayout(workspace);
  await ensureSampleProject(workspace);
  localStorage.setItem(WORKSPACE_KEY, workspace);
  return workspace;
}

/** 让用户挑一个文件夹位置(然后在那个位置下面建 MemoryOS 子文件夹) */
export async function pickCustomWorkspaceLocation(title = "Pick a save location"): Promise<string | null> {
  const picked = await open({
    directory: true,
    multiple: false,
    title,
  });
  if (typeof picked !== "string") return null;
  return await join(picked, "MemoryOS");
}

export async function ensureWorkspaceLayout(workspace: string) {
  if (!(await exists(workspace))) await createDir(workspace, { recursive: true });
  const projectsDir = await join(workspace, "projects");
  if (!(await exists(projectsDir))) await createDir(projectsDir, { recursive: true });
  const aboutMe = await join(workspace, "about_me.md");
  if (!(await exists(aboutMe))) {
    await writeTextFile(aboutMe, tSync("template.aboutMe"));
  }
}

/** 给一键开始的新用户建一个示例项目,让他们立刻看到完整界面 */
async function ensureSampleProject(workspace: string) {
  const slug = "我的第一个项目";
  const projectDir = await join(workspace, "projects", slug);
  const metaPath = await join(projectDir, "project.json");
  if (await exists(metaPath)) return; // 已经建过
  await createDir(await join(projectDir, "sessions"), { recursive: true });
  const now = new Date().toISOString();
  await writeTextFile(
    metaPath,
    JSON.stringify(
      {
        name: "我的第一个项目",
        description: "示例项目 — 跑通一次完整流程后,可以删掉再建你自己的",
        currentGoal: "试一次完整流程:在 ChatGPT 或 Claude 聊几句,回到这里点「复制结束对话指令」,把生成的对话总结粘贴回来。",
        currentGoalBullets: [
          "第 1 步:在外部 AI 完成一段工作",
          "第 2 步:回来点主按钮,复制结束指令",
          "第 3 步:粘贴到 AI,让它生成总结",
          "第 4 步:复制总结回来,点导入",
        ],
        focus: "走完一次完整流程",
        progress: 0,
        statusLabel: tSync("meta.statusProgress"),
        createdAt: now,
        updatedAt: now,
      },
      null,
      2
    )
  );
  await writeTextFile(
    await join(projectDir, "00_context.md"),
    tSync("template.sampleContext")
  );
  await writeTextFile(
    await join(projectDir, "decisions.md"),
    tSync("template.sampleDecisions")
  );
  // 示例项目自带记忆卡片：新用户第一眼看到的就是卡片模式（PRD·记忆质量升级 F3）
  await writeTextFile(
    await join(projectDir, "cards.md"),
    tSync("template.sampleCards", { date: new Date().toISOString().slice(0, 10) })
  );
}

export async function listProjects(workspace: string): Promise<ProjectMeta[]> {
  const projectsDir = await join(workspace, "projects");
  if (!(await exists(projectsDir))) return [];
  const entries = await readDir(projectsDir);
  const out: ProjectMeta[] = [];
  for (const e of entries) {
    const slug = e.name ?? "";
    if (!slug) continue;
    const metaPath = await join(projectsDir, slug, "project.json");
    if (!(await exists(metaPath))) continue;
    let meta: Partial<ProjectMeta> = {};
    try {
      meta = JSON.parse(await readTextFile(metaPath));
    } catch (err) {
      console.warn("Bad project.json for", slug, err);
      continue;
    }
    out.push(localizeSampleDisplay({
      slug,
      name: meta.name ?? slug,
      description: meta.description ?? "",
      currentGoal: meta.currentGoal ?? "",
      currentGoalBullets: meta.currentGoalBullets ?? [],
      focus: meta.focus ?? "",
      progress: meta.progress ?? 0,
      statusLabel: meta.statusLabel ?? tSync("meta.statusProgress"),
      createdAt: meta.createdAt ?? new Date().toISOString(),
      updatedAt: meta.updatedAt ?? new Date().toISOString(),
      mcpAutoApply: meta.mcpAutoApply ?? false,
      entryInjection: meta.entryInjection ?? false,
    }));
  }
  return out;
}

export async function readProject(workspace: string, slug: string): Promise<Project> {
  const dir = await join(workspace, "projects", slug);
  const all = await listProjects(workspace);
  const meta = all.find((p) => p.slug === slug);
  if (!meta) throw new Error("project not found: " + slug);

  const ctxPath = await join(dir, "00_context.md");
  const decPath = await join(dir, "decisions.md");
  const cardsPath = await join(dir, "cards.md");
  const sessionsDir = await join(dir, "sessions");
  const contextMarkdown = (await exists(ctxPath)) ? await readTextFile(ctxPath) : "";
  const decisionsMarkdown = (await exists(decPath)) ? await readTextFile(decPath) : "";
  const cardsMarkdown = (await exists(cardsPath)) ? await readTextFile(cardsPath) : "";

  const sessions: Session[] = [];
  if (await exists(sessionsDir)) {
    const files = await readDir(sessionsDir);
    for (const f of files) {
      const name = f.name ?? "";
      if (!isSessionFile(name)) continue;
      const path = await join(sessionsDir, name);
      const raw = await readTextFile(path);
      sessions.push(parseSessionFile(name, raw));
    }
    sessions.sort(compareSessionsDesc);
  }
  return { ...meta, contextMarkdown, decisionsMarkdown, cardsMarkdown, sessions };
}

export async function saveSession(workspace: string, slug: string, raw: string): Promise<string> {
  const now = new Date();
  const ymd = now.toISOString().slice(0, 10);
  const hm = now.toTimeString().slice(0, 5).replace(":", "");
  const dir = await join(workspace, "projects", slug, "sessions");
  if (!(await exists(dir))) await createDir(dir, { recursive: true });
  // 防覆盖（PRD §7）：同分钟 apply 多条时自动加 _2/_3…，与 createProject 去重一致，
  // 文件名仍是 session_YYYY-MM-DD_HHmm[_n].md，parseSessionFile 仍能解析。
  const base = `session_${ymd}_${hm}`;
  let filename = `${base}.md`;
  let n = 2;
  while (await exists(await join(dir, filename))) {
    filename = `${base}_${n}.md`;
    n++;
  }
  const path = await join(dir, filename);
  await writeTextFile(path, raw);
  await touchProjectUpdatedAt(workspace, slug);
  return filename;
}

export async function appendToFile(
  workspace: string,
  slug: string,
  file: string,
  content: string
): Promise<void> {
  const base =
    file === "about_me.md"
      ? await join(workspace, "about_me.md")
      : await join(workspace, "projects", slug, file);
  let existing = "";
  if (await exists(base)) existing = await readTextFile(base);
  const stamp = `\n\n---\n_Updated ${new Date().toISOString().slice(0, 10)}_\n\n${content}\n`;
  await writeTextFile(base, existing + stamp);
  await touchProjectUpdatedAt(workspace, slug);
}

async function touchProjectUpdatedAt(workspace: string, slug: string) {
  try {
    const metaPath = await join(workspace, "projects", slug, "project.json");
    if (!(await exists(metaPath))) return;
    const meta = JSON.parse(await readTextFile(metaPath));
    meta.updatedAt = new Date().toISOString();
    await writeTextFile(metaPath, JSON.stringify(meta, null, 2));
  } catch (e) {
    console.warn("touch updatedAt failed", e);
  }
}

export async function copyToClipboard(text: string): Promise<void> {
  await writeText(text);
}

/** 判断一段 markdown 内容是不是"空的"——只有标题和占位说明,没有真实内容 */
function isMarkdownEffectivelyEmpty(content: string): boolean {
  if (!content) return true;
  // 去掉标题、空行、括号说明、注释,看剩下多少字符
  const stripped = content
    .replace(/^#.*$/gm, "")                   // 标题
    .replace(/^>.*$/gm, "")                   // blockquote
    .replace(/[（(].*?[)）]/gs, "")             // 中英文括号说明
    .replace(/<!--[\s\S]*?-->/g, "")          // html 注释
    .replace(/\s+/g, "");
  return stripped.length < 30;
}

export async function detectBootstrapNeeds(
  workspace: string,
  slug: string | null
): Promise<{ needsAboutMe: boolean; needsContext: boolean }> {
  const aboutMePath = await join(workspace, "about_me.md");
  const aboutMe = (await exists(aboutMePath)) ? await readTextFile(aboutMePath) : "";
  const needsAboutMe = isMarkdownEffectivelyEmpty(aboutMe);

  let needsContext = false;
  if (slug) {
    const ctxPath = await join(workspace, "projects", slug, "00_context.md");
    const ctx = (await exists(ctxPath)) ? await readTextFile(ctxPath) : "";
    // 记忆卡片已存在 = 项目记忆已建好（卡片原生项目没有 00_context 正文，不该再催引导）
    const cardsPath = await join(workspace, "projects", slug, "cards.md");
    const cards = (await exists(cardsPath)) ? await readTextFile(cardsPath) : "";
    needsContext = isMarkdownEffectivelyEmpty(ctx) && !cards.trim();
  }
  return { needsAboutMe, needsContext };
}

/** 写入 about_me.md (覆盖) */
export async function writeAboutMe(workspace: string, content: string): Promise<void> {
  const path = await join(workspace, "about_me.md");
  await writeTextFile(path, content);
}

/**
 * 把任意 name 转成相对安全的文件夹名 — 主要是去掉 OS 不允许的字符。
 * 中文 / 空格 / 横杠 全部保留 (Windows / Mac / Linux 都允许)。
 */
function slugify(name: string): string {
  return name
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")  // 去掉 Windows 不允许的字符
    .replace(/\s+/g, " ")            // 多个空白合一
    .slice(0, 80);                   // 限制长度
}

/** 检查 slug 是否已被占用 (不区分大小写) */
async function slugTaken(workspace: string, slug: string): Promise<boolean> {
  const dir = await join(workspace, "projects", slug);
  return await exists(dir);
}

/** 新建项目 — 用户输入 name + optional description/goal */
export async function createProject(
  workspace: string,
  opts: { name: string; description?: string; currentGoal?: string }
): Promise<string> {
  let slug = slugify(opts.name);
  if (!slug) throw new Error(tSync("error.projectNameEmpty"));
  // 如果重名,自动加数字后缀
  let candidate = slug;
  let i = 2;
  while (await slugTaken(workspace, candidate)) {
    candidate = `${slug} ${i}`;
    i++;
  }
  slug = candidate;
  const dir = await join(workspace, "projects", slug);
  await createDir(await join(dir, "sessions"), { recursive: true });
  const now = new Date().toISOString();
  await writeTextFile(
    await join(dir, "project.json"),
    JSON.stringify(
      {
        name: opts.name,
        description: opts.description ?? "",
        currentGoal: opts.currentGoal ?? "",
        currentGoalBullets: [],
        focus: "",
        progress: 0,
        statusLabel: tSync("meta.statusProgress"),
        createdAt: now,
        updatedAt: now,
      },
      null,
      2
    )
  );
  await writeTextFile(
    await join(dir, "00_context.md"),
    tSync("template.newContextHeading", { name: opts.name })
  );
  await writeTextFile(
    await join(dir, "decisions.md"),
    tSync("template.newDecisionsHeading")
  );
  return slug;
}

/** 重命名项目 — 只改 project.json 的 name,不动文件夹路径 (避免移动文件) */
export async function renameProject(
  workspace: string,
  slug: string,
  newName: string
): Promise<void> {
  const trimmed = newName.trim();
  if (!trimmed) throw new Error(tSync("error.projectNameEmpty"));
  const metaPath = await join(workspace, "projects", slug, "project.json");
  if (!(await exists(metaPath))) throw new Error(tSync("error.projectNotFound"));
  const meta = JSON.parse(await readTextFile(metaPath));
  meta.name = trimmed;
  meta.updatedAt = new Date().toISOString();
  await writeTextFile(metaPath, JSON.stringify(meta, null, 2));
}

/**
 * 删除项目 — 整个项目文件夹移到系统回收站（不是永久删）。
 * 返回被删的完整路径,前端用它在 5 秒内调 restoreProject 还原。
 */
export async function deleteProject(workspace: string, slug: string): Promise<string | null> {
  const dir = await join(workspace, "projects", slug);
  if (!(await exists(dir))) return null;
  await invoke("move_to_trash", { path: dir });
  return dir;
}

/** 从系统回收站还原最近被 deleteProject 删掉的文件夹。 */
export async function restoreProject(originalPath: string): Promise<void> {
  await invoke("restore_from_trash", { originalPath });
}

/** 写入项目的 00_context.md (覆盖) */
export async function writeProjectContext(
  workspace: string,
  slug: string,
  content: string
): Promise<void> {
  const path = await join(workspace, "projects", slug, "00_context.md");
  await writeTextFile(path, content);
}

export async function writeProjectDecisions(
  workspace: string,
  slug: string,
  content: string
): Promise<void> {
  const path = await join(workspace, "projects", slug, "decisions.md");
  await writeTextFile(path, content);
}

// ── 现行卡（cards.md，PRD·记忆质量升级 F3）──────────────────

/** 读项目现行卡；不存在返回空串（= 未启用现行卡模式）。 */
export async function readProjectCards(workspace: string, slug: string): Promise<string> {
  const path = await join(workspace, "projects", slug, "cards.md");
  return (await exists(path)) ? await readTextFile(path) : "";
}

/** 写入项目现行卡（覆盖）。蒸馏入库 / 迁移重建走这里。 */
export async function writeProjectCards(
  workspace: string,
  slug: string,
  content: string
): Promise<void> {
  const path = await join(workspace, "projects", slug, "cards.md");
  await writeTextFile(path, content);
  await touchProjectUpdatedAt(workspace, slug);
}

/**
 * 蒸馏入库时：被替换/移除的旧条目落进决策档案（decisions.md，作废章 + 日期）。
 * 现行卡模式下 decisions.md 不再是开场注入文件，而是「档案层」——遗忘 = 归档，不是删除。
 */
export async function appendDecisionsArchive(
  workspace: string,
  slug: string,
  items: string[],
  today: string
): Promise<void> {
  if (!items.length) return;
  const path = await join(workspace, "projects", slug, "decisions.md");
  let existing = "";
  if (await exists(path)) existing = await readTextFile(path);
  const lines = items.map((it) => `- [作废 ${today}] ${it.trim()}（被新版现行卡替代）`);
  await writeTextFile(path, existing.trimEnd() + "\n" + lines.join("\n") + "\n");
}

/** 追加一条被驳回的 AI 建议到防复提名单（rejected.md，带日期）。 */
export async function appendRejectedSuggestion(
  workspace: string,
  slug: string,
  content: string
): Promise<void> {
  const path = await join(workspace, "projects", slug, "rejected.md");
  let existing = "";
  if (await exists(path)) existing = await readTextFile(path);
  if (!existing.trim()) existing = "# 已驳回的建议\n（记录在案，AI 之后不应再重复提这些）\n";
  const line = `\n- [${new Date().toISOString().slice(0, 10)} 驳回] ${content.trim()}`;
  await writeTextFile(path, existing.trimEnd() + line + "\n");
}

/** 读防复提名单；不存在返回空串。 */
export async function readRejectedSuggestions(workspace: string, slug: string): Promise<string> {
  const path = await join(workspace, "projects", slug, "rejected.md");
  return (await exists(path)) ? await readTextFile(path) : "";
}

/** 开场注入来源开关（07-04 确认）：写 project.json 的 entryInjection。 */
export async function setProjectEntryInjection(
  workspace: string,
  slug: string,
  on: boolean
): Promise<void> {
  const metaPath = await join(workspace, "projects", slug, "project.json");
  if (!(await exists(metaPath))) throw new Error(tSync("error.projectNotFound"));
  const meta = JSON.parse(await readTextFile(metaPath));
  meta.entryInjection = on;
  meta.updatedAt = new Date().toISOString();
  await writeTextFile(metaPath, JSON.stringify(meta, null, 2));
}

/** 信任模式开关（06-10 用户拍板）：写 project.json 的 mcpAutoApply。 */
export async function setProjectTrustMode(
  workspace: string,
  slug: string,
  on: boolean
): Promise<void> {
  const metaPath = await join(workspace, "projects", slug, "project.json");
  if (!(await exists(metaPath))) throw new Error(tSync("error.projectNotFound"));
  const meta = JSON.parse(await readTextFile(metaPath));
  meta.mcpAutoApply = on;
  meta.updatedAt = new Date().toISOString();
  await writeTextFile(metaPath, JSON.stringify(meta, null, 2));
}

/**
 * 信任模式自动入库（06-10 用户拍板，PRD·记忆质量升级）：
 * 扫 pending 收件箱，对开了信任模式的项目、来自 MCP 通道的条目自动入库——
 * 卡片提案直接应用（重写整理日期）+ 被替换条目归档 + 对话总结照存 + 条目移 archive(applied)。
 * 安全阀（保持不变的纪律）：
 *  - 只处理 sourceChannel === "mcp"（手动导入的人就在 app 前，仍走 Review）
 *  - AI 建议（aiSuggestions）一律不自动采纳、不驳回——留在归档交接里待人看
 *  - 提案保留的整理日期 ≠ 当前文件日期（提案产生后卡片又变过）→ 跳过，留人工 Review
 * 返回自动入库条数。
 */
export async function autoApplyTrustedInbox(workspace: string): Promise<number> {
  const pending = await listInboxItems(workspace, "pending");
  if (!pending.length) return 0;
  const metas = await listProjects(workspace);
  const today = new Date().toISOString().slice(0, 10);
  let applied = 0;
  for (const { filename, item } of pending) {
    if (item.sourceChannel !== "mcp") continue;
    const meta = metas.find((m) => m.slug === item.slug);
    if (!meta?.mcpAutoApply) continue;
    // 纵深防御：乱码条目绝不自动入库（server 门禁之外的第二道），留给人工 Review 处置
    if (looksGarbled(inboxHandoffToMarkdown(item.handoff))) continue;
    const proposed = (item.handoff.proposedCards ?? "").trim();
    if (proposed) {
      const cur = await readProjectCards(workspace, item.slug);
      const curStamp = parseCardsStamp(cur);
      const propStamp = parseCardsStamp(proposed);
      if (cur.trim() && curStamp && propStamp && curStamp.distilledOn !== propStamp.distilledOn) {
        continue; // 日期不一致：可能盖掉别的会话的更新，降级人工
      }
      const stamped = stampCards(proposed, today);
      await writeProjectCards(workspace, item.slug, stamped);
      const sup = item.handoff.proposedCardsSuperseded ?? [];
      if (sup.length) await appendDecisionsArchive(workspace, item.slug, sup, today);
      // 写入闭环：条目库已启用则同步（信任模式路径同样不落下）
      await syncProjectEntriesFromCards(workspace, item.slug, stamped, sup);
    }
    await saveSession(workspace, item.slug, inboxHandoffToMarkdown(item.handoff));
    await archiveInboxItem(workspace, filename, "applied");
    applied++;
  }
  return applied;
}

// ── 条目库存储（记忆展示形态第 1 轮：jsonl，一条一行，坏行隔离）────────
// 三种库平级：项目库 projects/<slug>/entries.jsonl；
// 全局库 entries/global.jsonl；技能库 entries/skill.jsonl。

import { toJsonl, fromJsonl, syncEntriesWithCards, EMPTY_SUGGESTIONS, type MemoryEntry, type JsonlParseResult, type EntrySuggestions } from "./entry";

/** 库标识：项目 slug、"global" 全局库、"skill" 技能库。 */
export type EntryLib = { kind: "project"; slug: string } | { kind: "global" } | { kind: "skill" };

async function entriesFilePath(workspace: string, lib: EntryLib): Promise<string> {
  if (lib.kind === "project") {
    return await join(workspace, "projects", lib.slug, "entries.jsonl");
  }
  const dir = await join(workspace, "entries");
  if (!(await exists(dir))) await createDir(dir, { recursive: true });
  return await join(dir, lib.kind === "global" ? "global.jsonl" : "skill.jsonl");
}

/** 读一个库。文件不存在返回空库；坏行跳过并报行号，好行不丢。 */
export async function readEntriesLib(
  workspace: string,
  lib: EntryLib
): Promise<JsonlParseResult> {
  const path = await entriesFilePath(workspace, lib);
  if (!(await exists(path))) return { entries: [], badLines: [] };
  return fromJsonl(await readTextFile(path));
}

/** 写一个库（覆盖）。原子写：先写 .tmp 再改名，避免读到半写文件。 */
export async function writeEntriesLib(
  workspace: string,
  lib: EntryLib,
  entries: MemoryEntry[]
): Promise<void> {
  const path = await entriesFilePath(workspace, lib);
  const tmp = path + ".tmp";
  await writeTextFile(tmp, toJsonl(entries));
  await renameFile(tmp, path);
  if (lib.kind === "project") await touchProjectUpdatedAt(workspace, lib.slug);
}

// 关联提案旁挂文件（07-10 提案走审核）：待确认队列 + 已驳回防复提名单，
// 提案不进 entries.jsonl，接受才建边。项目库 entry-suggestions.json，
// 全局/技能库 entries/<kind>.suggestions.json。

async function suggestionsFilePath(workspace: string, lib: EntryLib): Promise<string> {
  if (lib.kind === "project") {
    return await join(workspace, "projects", lib.slug, "entry-suggestions.json");
  }
  const dir = await join(workspace, "entries");
  if (!(await exists(dir))) await createDir(dir, { recursive: true });
  return await join(dir, `${lib.kind}.suggestions.json`);
}

/** 读一个库的提案文件。不存在或损坏都回空，不阻塞主流程。 */
export async function readEntrySuggestions(
  workspace: string,
  lib: EntryLib
): Promise<EntrySuggestions> {
  const path = await suggestionsFilePath(workspace, lib);
  if (!(await exists(path))) return { ...EMPTY_SUGGESTIONS };
  try {
    const obj = JSON.parse(await readTextFile(path));
    return {
      pendingRelations: Array.isArray(obj?.pendingRelations) ? obj.pendingRelations : [],
      rejectedRelations: Array.isArray(obj?.rejectedRelations) ? obj.rejectedRelations : [],
      pendingMerges: Array.isArray(obj?.pendingMerges) ? obj.pendingMerges : [],
      rejectedMerges: Array.isArray(obj?.rejectedMerges) ? obj.rejectedMerges : [],
      pendingArchives: Array.isArray(obj?.pendingArchives) ? obj.pendingArchives : [],
      rejectedArchives: Array.isArray(obj?.rejectedArchives) ? obj.rejectedArchives : [],
    };
  } catch {
    return { ...EMPTY_SUGGESTIONS };
  }
}

/** 写一个库的提案文件（覆盖，原子写同 entries）。 */
export async function writeEntrySuggestions(
  workspace: string,
  lib: EntryLib,
  s: EntrySuggestions
): Promise<void> {
  const path = await suggestionsFilePath(workspace, lib);
  const tmp = path + ".tmp";
  await writeTextFile(tmp, JSON.stringify(s, null, 2));
  await renameFile(tmp, path);
}

/**
 * 写入闭环：卡片入库后同步项目条目库。库文件不存在说明还没启用条目库，跳过。
 * 新行补进、被替代的盖作废归档章、钉住的豁免。返回补进条数，负一表示未启用。
 */
export async function syncProjectEntriesFromCards(
  workspace: string,
  slug: string,
  cardsMd: string,
  superseded: string[] = []
): Promise<number> {
  const path = await join(workspace, "projects", slug, "entries.jsonl");
  if (!(await exists(path))) return -1;
  const cur = fromJsonl(await readTextFile(path));
  const today = new Date().toISOString().slice(0, 10);
  const res = syncEntriesWithCards(cur.entries, cardsMd, slug, today, superseded);
  if (res.added === 0 && res.archivedCount === 0) return 0;
  await writeEntriesLib(workspace, { kind: "project", slug }, res.entries);
  return res.added;
}

export async function readAboutMe(workspace: string): Promise<string> {
  const path = await join(workspace, "about_me.md");
  return (await exists(path)) ? await readTextFile(path) : "";
}

export async function readContextForPrompt(workspace: string, slug: string) {
  const proj = await readProject(workspace, slug);
  return {
    context: proj.contextMarkdown,
    decisions: proj.decisionsMarkdown,
    cards: proj.cardsMarkdown,
    latestSession: proj.sessions[0]?.rawMarkdown ?? "",
  };
}

export async function readContextForStartPrompt(workspace: string, slug: string) {
  const aboutMePath = await join(workspace, "about_me.md");
  const aboutMe = (await exists(aboutMePath)) ? await readTextFile(aboutMePath) : "";
  const proj = await readProject(workspace, slug);
  const latestCompact = extractLatestCompactContext(proj.sessions[0]?.rawMarkdown ?? "");
  return {
    aboutMe,
    context: proj.contextMarkdown,
    decisions: proj.decisionsMarkdown,
    // 现行卡模式：开场注入 = 关于我 + cards 原文（所见即所注），context/decisions 不再进开场
    cards: proj.cardsMarkdown,
    latestCompactContext: latestCompact,
  };
}

// ── Memory Inbox（PRD v0.3.1 §4.2/§7）─────────────────────
// .memoryos/inbox/   待审结构化 handoff（filename-safe JSON）
// .memoryos/archive/ apply/discard 后移到这里（幂等）
// 埋点不在这里——在 %APPDATA%/memoryos/（见 telemetry.ts）。

async function inboxDir(workspace: string): Promise<string> {
  const dir = await join(workspace, ".memoryos", "inbox");
  if (!(await exists(dir))) await createDir(dir, { recursive: true });
  return dir;
}

async function archiveDir(workspace: string): Promise<string> {
  const dir = await join(workspace, ".memoryos", "archive");
  if (!(await exists(dir))) await createDir(dir, { recursive: true });
  return dir;
}

/**
 * 写一个 InboxItem 到 inbox/。原子写：先写 .tmp 再 rename，避免 app 读到半写 JSON。
 * 返回写入的文件名。
 */
export async function writeInboxItem(workspace: string, item: InboxItem): Promise<string> {
  const dir = await inboxDir(workspace);
  const filename = inboxFilename(item);
  const finalPath = await join(dir, filename);
  const tmpPath = await join(dir, `.${filename}.tmp`);
  await writeTextFile(tmpPath, JSON.stringify(item, null, 2));
  await renameFile(tmpPath, finalPath);
  return filename;
}

/** 读 inbox/ 里所有 item（可按 status 过滤）。坏 JSON 跳过。 */
export async function listInboxItems(
  workspace: string,
  status?: InboxStatus
): Promise<{ filename: string; item: InboxItem }[]> {
  const dir = await join(workspace, ".memoryos", "inbox");
  if (!(await exists(dir))) return [];
  const entries = await readDir(dir);
  const out: { filename: string; item: InboxItem }[] = [];
  for (const e of entries) {
    const name = e.name ?? "";
    if (!name.endsWith(".json") || name.startsWith(".")) continue;
    try {
      const item = JSON.parse(await readTextFile(await join(dir, name))) as InboxItem;
      if (status && item.status !== status) continue;
      out.push({ filename: name, item });
    } catch (err) {
      console.warn("bad inbox item", name, err);
    }
  }
  // 新的在前
  out.sort((a, b) => (a.item.createdAt < b.item.createdAt ? 1 : -1));
  return out;
}

/** badge 只数 pending。 */
export async function countPendingInbox(workspace: string): Promise<number> {
  return (await listInboxItems(workspace, "pending")).length;
}

/**
 * 读 .memoryos/mcp_state.json（连接状态）。server 每次工具调用后写，app focus 时读。
 * 文件不存在 / 坏 JSON → null（= 还没检测到任何 MCP 活动）。
 */
export async function readMcpState(workspace: string): Promise<McpState | null> {
  const path = await join(workspace, ".memoryos", "mcp_state.json");
  if (!(await exists(path))) return null;
  try {
    return JSON.parse(await readTextFile(path)) as McpState;
  } catch {
    return null;
  }
}

/**
 * 把 inbox/ 里的某个 item 标记 applied/discarded 并移到 archive/（幂等）。
 * 文件已不在 inbox（已处理）时静默返回，避免重复入库/重复归档。
 */
export async function archiveInboxItem(
  workspace: string,
  filename: string,
  status: Exclude<InboxStatus, "pending">
): Promise<void> {
  const inPath = await join(workspace, ".memoryos", "inbox", filename);
  if (!(await exists(inPath))) return; // 幂等：已处理过
  let item: InboxItem;
  try {
    item = JSON.parse(await readTextFile(inPath)) as InboxItem;
  } catch {
    // 坏 JSON：直接删掉避免卡住
    await removeFile(inPath);
    return;
  }
  item.status = status;
  const arch = await archiveDir(workspace);
  const tmpPath = await join(arch, `.${filename}.tmp`);
  const finalPath = await join(arch, filename);
  await writeTextFile(tmpPath, JSON.stringify(item, null, 2));
  await renameFile(tmpPath, finalPath);
  await removeFile(inPath);
}
