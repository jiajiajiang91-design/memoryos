// Node 版 workspace 读取（PRD v0.3.1 §0.5.5/§4.2）。
// fs.ts 依赖 Tauri 不能给 Node server 用，这里用 node:fs 按**同一路径/命名契约**重写，
// 并复用共享纯逻辑（sessionParse.ts，与 app 逐字一致）。本期只读（pull）。

import * as fsp from "node:fs/promises";
import * as path from "node:path";
import {
  parseSessionFile,
  isSessionFile,
  compareSessionsDesc,
  extractLatestCompactContext,
} from "../../src/lib/sessionParse";
import type { Session } from "../../src/types";

export type ProjectListEntry = {
  slug: string;
  name: string;
  currentGoal: string;
  updatedAt: string;
  /** 信任模式（06-10 用户拍板）：true = app 会把该项目的 MCP 写回自动入库。 */
  mcpAutoApply: boolean;
};

export type ProjectMemory = {
  aboutMe: string;
  context: string;
  decisions: string;
  /** 现行卡（cards.md）全文；空串 = 该项目未启用现行卡模式（PRD·记忆质量升级）。
   *  非空时开场注入 = aboutMe + cards（context/decisions 退为档案层，按需另查）。 */
  cards: string;
  latestCompactContext: string;
  projectName: string;
};

async function readTextSafe(p: string): Promise<string> {
  try {
    return await fsp.readFile(p, "utf8");
  } catch {
    return "";
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * 列出 workspace/projects/ 下的项目（只读）。返回 slug/name/currentGoal/updatedAt。
 * 注：app 的 listProjects 会对未改名的示例项目做 UI 本地化（localizeSampleDisplay），
 * server 不知道 UI 语言、也不该改盘上内容，**一律返回 project.json 原值**——
 * 对真实用户项目与 app 输出逐字一致（示例项目的本地化差异仅存在于 UI 层）。
 */
export async function listProjects(workspace: string): Promise<ProjectListEntry[]> {
  const projectsDir = path.join(workspace, "projects");
  if (!(await pathExists(projectsDir))) return [];
  const entries = await fsp.readdir(projectsDir, { withFileTypes: true });
  const out: ProjectListEntry[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const slug = e.name;
    const metaPath = path.join(projectsDir, slug, "project.json");
    if (!(await pathExists(metaPath))) continue;
    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(await readTextSafe(metaPath));
    } catch {
      continue; // 坏 project.json 跳过（与 app 行为一致）
    }
    out.push({
      slug,
      name: (meta.name as string) ?? slug,
      currentGoal: (meta.currentGoal as string) ?? "",
      updatedAt: (meta.updatedAt as string) ?? "",
      mcpAutoApply: (meta.mcpAutoApply as boolean) ?? false,
    });
  }
  // 按 slug 稳定排序：readdir 顺序依赖 OS/文件系统，排序后 matchProject 的
  // 包含匹配在多项目歧义时也跨机器确定。
  out.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  return out;
}

/**
 * 容错匹配项目：精确 slug → 精确 name → 包含（slug 或 name），全部大小写不敏感。
 * 只在**已枚举的真实项目**里选，绝不把用户输入直接拼进路径（无 `..` 穿越风险）。
 */
export function matchProject(
  projects: ProjectListEntry[],
  query: string
): ProjectListEntry | null {
  const q = (query ?? "").trim().toLowerCase();
  if (!q) return null;
  return (
    projects.find((p) => p.slug.toLowerCase() === q) ??
    projects.find((p) => p.name.toLowerCase() === q) ??
    projects.find(
      (p) => p.slug.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
    ) ??
    null
  );
}

/**
 * 读取某项目的工作记忆（只读 pull）：about_me + 00_context + decisions + 最新 Compact Context + 项目名。
 * 与 app 的 readContextForStartPrompt / readProject 同契约：最新 session 取 date+time 倒序第一条，
 * Compact Context 抽取退回前 800 字。匹配不到返回 null。
 */
export async function getProjectMemory(
  workspace: string,
  query: string
): Promise<ProjectMemory | null> {
  const projects = await listProjects(workspace);
  const match = matchProject(projects, query);
  if (!match) return null;

  const dir = path.join(workspace, "projects", match.slug);
  const aboutMe = await readTextSafe(path.join(workspace, "about_me.md"));
  const context = await readTextSafe(path.join(dir, "00_context.md"));
  const decisions = await readTextSafe(path.join(dir, "decisions.md"));
  const cards = await readTextSafe(path.join(dir, "cards.md"));

  const sessions: Session[] = [];
  const sessionsDir = path.join(dir, "sessions");
  if (await pathExists(sessionsDir)) {
    for (const name of await fsp.readdir(sessionsDir)) {
      if (!isSessionFile(name)) continue;
      const raw = await readTextSafe(path.join(sessionsDir, name));
      sessions.push(parseSessionFile(name, raw));
    }
    sessions.sort(compareSessionsDesc);
  }
  const latestCompactContext = extractLatestCompactContext(
    sessions[0]?.rawMarkdown ?? ""
  );

  return {
    aboutMe,
    context,
    decisions,
    cards,
    latestCompactContext,
    projectName: match.name,
  };
}
