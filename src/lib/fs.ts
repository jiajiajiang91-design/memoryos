// All Tauri filesystem + clipboard + dialog interactions live here.
// Workspace layout on disk:
//   workspace/
//     about_me.md
//     projects/
//       <slug>/
//         project.json
//         00_context.md
//         decisions.md
//         sessions/
//           session_YYYY-MM-DD_HHmm.md

import { open } from "@tauri-apps/api/dialog";
import {
  readDir,
  readTextFile,
  writeTextFile,
  createDir,
  exists,
} from "@tauri-apps/api/fs";
import { writeText } from "@tauri-apps/api/clipboard";
import { invoke } from "@tauri-apps/api/tauri";
import { join, documentDir } from "@tauri-apps/api/path";
import type { Project, ProjectMeta, Session, SourceTool } from "../types";
import { tSync } from "./i18n";

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
  const sessionsDir = await join(dir, "sessions");
  const contextMarkdown = (await exists(ctxPath)) ? await readTextFile(ctxPath) : "";
  const decisionsMarkdown = (await exists(decPath)) ? await readTextFile(decPath) : "";

  const sessions: Session[] = [];
  if (await exists(sessionsDir)) {
    const files = await readDir(sessionsDir);
    for (const f of files) {
      const name = f.name ?? "";
      if (!name.endsWith(".md")) continue;
      // skip non-session files like README.md, notes.md, INDEX.md
      if (/^(README|NOTES?|INDEX|TEMPLATE)/i.test(name)) continue;
      const path = await join(sessionsDir, name);
      const raw = await readTextFile(path);
      sessions.push(parseSessionFile(name, raw));
    }
    sessions.sort((a, b) => (a.date + a.time < b.date + b.time ? 1 : -1));
  }
  return { ...meta, contextMarkdown, decisionsMarkdown, sessions };
}

export function parseSessionFile(filename: string, raw: string): Session {
  // Try multiple historical naming conventions:
  //   session_2026-05-15_1746.md       → date 2026-05-15, time 17:46  (V1 spec)
  //   Session_Handoff_2026-04-30.md    → date 2026-04-30, no time
  //   2026-03-23.md                    → date 2026-03-23, no time
  let date = "";
  let time = "";

  // try full v1 spec
  const v1 = filename.match(/session_(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})/i);
  if (v1) {
    date = v1[1];
    time = `${v1[2]}:${v1[3]}`;
  } else {
    // fall back: any YYYY-MM-DD anywhere in the name
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

export async function saveSession(workspace: string, slug: string, raw: string): Promise<string> {
  const now = new Date();
  const ymd = now.toISOString().slice(0, 10);
  const hm = now.toTimeString().slice(0, 5).replace(":", "");
  const filename = `session_${ymd}_${hm}.md`;
  const dir = await join(workspace, "projects", slug, "sessions");
  if (!(await exists(dir))) await createDir(dir, { recursive: true });
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
    needsContext = isMarkdownEffectivelyEmpty(ctx);
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

export async function readAboutMe(workspace: string): Promise<string> {
  const path = await join(workspace, "about_me.md");
  return (await exists(path)) ? await readTextFile(path) : "";
}

export async function readContextForPrompt(workspace: string, slug: string) {
  const proj = await readProject(workspace, slug);
  return {
    context: proj.contextMarkdown,
    decisions: proj.decisionsMarkdown,
    latestSession: proj.sessions[0]?.rawMarkdown ?? "",
  };
}

export async function readContextForStartPrompt(workspace: string, slug: string) {
  const aboutMePath = await join(workspace, "about_me.md");
  const aboutMe = (await exists(aboutMePath)) ? await readTextFile(aboutMePath) : "";
  const proj = await readProject(workspace, slug);
  // Try to extract Compact Context section from latest session
  let latestCompact = "";
  const latestRaw = proj.sessions[0]?.rawMarkdown ?? "";
  const m = latestRaw.match(
    /##\s*\d*\.?\s*Compact Context[^\n]*\n([\s\S]*?)(?=\n##\s|$)/i
  );
  if (m) latestCompact = m[1].trim();
  else latestCompact = latestRaw.slice(0, 800); // fallback: first 800 chars
  return {
    aboutMe,
    context: proj.contextMarkdown,
    decisions: proj.decisionsMarkdown,
    latestCompactContext: latestCompact,
  };
}
