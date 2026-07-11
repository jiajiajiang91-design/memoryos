import { useEffect, useMemo, useRef, useState } from "react";
import { Zap, FolderOpen, ChevronRight, X, Undo2, Layers, PlayCircle, ShieldCheck, FileText } from "lucide-react";
import {
  loadWorkspace,
  selectWorkspace,
  quickSetupWorkspace,
  getDefaultWorkspacePath,
  pickCustomWorkspaceLocation,
  listProjects,
  readProject,
  saveSession,
  appendToFile,
  readContextForStartPrompt,
  copyToClipboard,
  detectBootstrapNeeds,
  createProject,
  renameProject,
  deleteProject,
  restoreProject,
  writeAboutMe,
  writeProjectContext,
  writeProjectDecisions,
  readAboutMe,
  writeInboxItem,
  countPendingInbox,
  listInboxItems,
  archiveInboxItem,
  readMcpState,
  writeProjectCards,
  appendDecisionsArchive,
  appendRejectedSuggestion,
  setProjectTrustMode,
  setProjectEntryInjection,
  autoApplyTrustedInbox,
  readEntriesLib,
  writeEntriesLib,
  readEntrySuggestions,
  writeEntrySuggestions,
  syncProjectEntriesFromCards,
  type EntryLib,
} from "./lib/fs";
import {
  migrateCardsToEntries,
  exportToMarkdown,
  parseMarkdown,
  reconcileImport,
  nextEntryId,
  buildInjectionFromEntries,
  buildRefinePrompt,
  migrateAboutMeToEntries,
  proposeRelationsByOverlap,
  acceptRelationProposal,
  mergeProposals,
  relPairKey,
  proposeMerges,
  applyMerge,
  mergeMergeProposals,
  mergePairKey,
  EMPTY_SUGGESTIONS,
  skillCandidates,
  mergeLibsForInjection,
  type MemoryEntry,
  type EntryKind,
  type EntrySuggestions,
  type RelationProposal,
  type MergeProposal,
} from "./lib/entry";
import EntryLibraryPage from "./components/EntryLibraryPage";
import { ask } from "@tauri-apps/api/dialog";
import { buildStartSessionPrompt } from "./lib/parser";
import { stampCards, adoptSuggestionsIntoCards } from "./lib/cards";
import { normalizeSourceTool } from "./lib/sourceTools";
import { parsedToInboxHandoff, inboxItemToReviewState } from "./lib/inbox";
import { logEvent } from "./lib/telemetry";
import { scoreEntryAt } from "./lib/weight";
import type { Project, ProjectMeta, ParsedHandoff, UpdateSuggestion, InboxItem, McpState } from "./types";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import HelpDrawer from "./components/HelpDrawer";
import CopyPromptModal from "./components/CopyPromptModal";
import ImportHandoffModal from "./components/ImportHandoffModal";
import ReviewPage from "./components/ReviewPage";
import FileViewerModal from "./components/FileViewerModal";
import BootstrapModal from "./components/BootstrapModal";
import MigrateCardsModal from "./components/MigrateCardsModal";
import FeedbackModal from "./components/FeedbackModal";
import NewProjectModal from "./components/NewProjectModal";
import RenameProjectModal from "./components/RenameProjectModal";
import LanguageToggle from "./components/LanguageToggle";
import BrandMark from "./components/BrandMark";
import { useT, useLang } from "./lib/i18n";

// inboxFilename 存在 = 这次 review 来自某个 Inbox item，保存=applied/丢弃=discarded（移 archive）；
// 取消则保留 pending，不动 inbox 文件。
// review 锚定到 Inbox item 自己的目标项目（slug + 该项目的 context/decisions 快照），
// 与当前显示的项目解耦——避免点错项目时把记忆写进别的项目（mis-filing）。
type ReviewState = {
  raw: string;
  parsed: ParsedHandoff;
  aboutMe: string;
  inboxFilename?: string;
  channel?: string;
  slug: string;          // 目标项目 slug（= item.slug），保存只写这里
  projectName: string;   // 目标项目名（review 抬头显示）
  context: string;       // 目标项目 00_context 快照（supersede 合并基线）
  decisions: string;     // 目标项目 decisions 快照
  cards: string;         // 目标项目现行卡快照（蒸馏基线 + 版本戳并发检查）
} | null;

// 欢迎页底部卖点卡（图标 + 标题 + 一句话）
function WelcomeFeature({
  icon: Icon, title, desc,
}: {
  icon: React.ComponentType<any>;
  title: string;
  desc: string;
}) {
  return (
    <div className="px-5 text-center">
      <span className="w-11 h-11 rounded-xl bg-slate/[.07] inline-flex items-center justify-center mb-3">
        <Icon size={20} strokeWidth={1.6} className="text-slate" />
      </span>
      <div className="text-[14px] font-semibold text-ink mb-1.5">{title}</div>
      <div className="text-[12.5px] text-ink-soft leading-[1.7]">{desc}</div>
    </div>
  );
}

// 把路径 "C:\Users\xxx\Documents\MemoryOS" 转成 "Documents / MemoryOS"
function friendlyLocation(path: string): string {
  if (!path) return "...";
  const segs = path.split(/[\\/]/).filter(Boolean);
  return segs.slice(-2).join(" / ");
}

export default function App() {
  const t = useT();
  const [lang] = useLang();
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [currentSlug, setCurrentSlug] = useState<string | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [modal, setModal] = useState<null | "copy" | "import" | "feedback">(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(
    () => localStorage.getItem("memoryos.bannerDismissed") === "1"
  );
  const [toast, setToast] = useState<string | null>(null);
  // 上次在 CopyPromptModal 选的来源工具 — 复制结束指令后记下，导入 Inbox 时作为 sourceClient 默认带入（Phase 0 接通，Phase 1 消费）。
  const [lastSourceClient, setLastSourceClient] = useState<string>(
    () => localStorage.getItem("memoryos.lastSourceClient") || "Claude"
  );
  const rememberSourceClient = (client: string) => {
    setLastSourceClient(client);
    localStorage.setItem("memoryos.lastSourceClient", client);
  };

  const dismissBanner = () => {
    setBannerDismissed(true);
    localStorage.setItem("memoryos.bannerDismissed", "1");
  };
  const [review, setReview] = useState<ReviewState>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  // Inbox 待审计数（badge 只数 status=pending）+ MCP 连接状态（最近一次工具活动）。
  const [pendingCount, setPendingCount] = useState(0);
  const [mcpState, setMcpState] = useState<McpState | null>(null);
  const refreshPending = async () => {
    if (!workspace) { setPendingCount(0); setMcpState(null); return; }
    // 信任模式（06-10 用户拍板）：先把信任项目的 MCP 待审条目自动入库，再刷新计数
    try {
      const auto = await autoApplyTrustedInbox(workspace);
      if (auto > 0) {
        logEvent("auto_apply", { count: auto });
        showToast(t("toast.autoApplied", { n: auto }));
        setRefreshKey((k) => k + 1);
      }
    } catch (e) { console.warn("autoApplyTrustedInbox failed", e); }
    try { setPendingCount(await countPendingInbox(workspace)); }
    catch (e) { console.warn("countPendingInbox failed", e); }
    try { setMcpState(await readMcpState(workspace)); }
    catch (e) { console.warn("readMcpState failed", e); }
  };

  // Restore last workspace on launch
  useEffect(() => {
    const w = loadWorkspace();
    if (w) setWorkspace(w);
  }, []);

  const [setupOpen, setSetupOpen] = useState(false);
  const [setupPath, setSetupPath] = useState<string>("");
  const [viewingSession, setViewingSession] = useState<string | null>(null);
  // 记忆库双视图（记忆展示形态第 1 轮）：null=未打开。三库平级：项目、全局、技能；all=跨库只读回顾。
  const [entryLib, setEntryLib] = useState<{
    lib: EntryLib | { kind: "all" };
    entries: MemoryEntry[];
    badLineCount: number;
    suggestions: EntrySuggestions;
  } | null>(null);
  const [viewingCoreFile, setViewingCoreFile] = useState<
    null | { filename: string; fullPath: string; content: string; rawFile: string }
  >(null);
  const [bootstrapNeeds, setBootstrapNeeds] = useState<{ needsAboutMe: boolean; needsContext: boolean }>({
    needsAboutMe: false,
    needsContext: false,
  });
  const [bootstrapOpen, setBootstrapOpen] = useState(false);
  const [aboutMeContent, setAboutMeContent] = useState("");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [renamingSlug, setRenamingSlug] = useState<string | null>(null);

  // 核心资料友好名 — 根据当前语言动态映射
  const coreFileLabel = (file: string) =>
    file === "about_me.md"
      ? t("sidebar.aboutMe")
      : file === "00_context.md"
      ? t("sidebar.context")
      : file === "decisions.md"
      ? t("sidebar.decisions")
      : file === "cards.md"
      ? t("sidebar.cards")
      : file;

  // 迁移：把旧 context/decisions 蒸馏成第一版现行卡（PRD·记忆质量升级 F3 边界）
  const [migrateCardsOpen, setMigrateCardsOpen] = useState(false);

  // 打开核心资料查看/编辑（Sidebar 行与 Dashboard 卡片区「编辑」共用）
  const openCoreFile = async (file: "about_me.md" | "00_context.md" | "decisions.md" | "cards.md") => {
    if (!workspace) return;
    const { readTextFile, exists } = await import("@tauri-apps/api/fs");
    const { join } = await import("@tauri-apps/api/path");
    const fullPath =
      file === "about_me.md"
        ? await join(workspace, "about_me.md")
        : await join(workspace, "projects", currentSlug ?? "", file);
    const content = (await exists(fullPath)) ? await readTextFile(fullPath) : "";
    setViewingCoreFile({ filename: coreFileLabel(file), fullPath, content, rawFile: file });
  };

  // 删除项目后的 5 秒撤销窗口
  const [undoableDelete, setUndoableDelete] = useState<
    | { name: string; slug: string; originalPath: string; deadline: number }
    | null
  >(null);
  const [undoCountdown, setUndoCountdown] = useState(5);
  const undoTimerRef = useRef<number | null>(null);

  // 倒计时显示
  useEffect(() => {
    if (!undoableDelete) return;
    const tick = () => {
      const remain = Math.max(0, Math.ceil((undoableDelete.deadline - Date.now()) / 1000));
      setUndoCountdown(remain);
      if (remain <= 0) {
        setUndoableDelete(null);
        if (undoTimerRef.current) {
          window.clearInterval(undoTimerRef.current);
          undoTimerRef.current = null;
        }
      }
    };
    tick();
    undoTimerRef.current = window.setInterval(tick, 250);
    return () => {
      if (undoTimerRef.current) {
        window.clearInterval(undoTimerRef.current);
        undoTimerRef.current = null;
      }
    };
  }, [undoableDelete]);

  const handleUndoDelete = async () => {
    if (!undoableDelete) return;
    const target = undoableDelete;
    setUndoableDelete(null);
    try {
      await restoreProject(target.originalPath);
      setRefreshKey((k) => k + 1);
      setCurrentSlug(target.slug);
      showToast(t("toast.restored", { name: target.name }));
    } catch (e: any) {
      showToast(t("toast.restoreFailed", { err: e?.message ?? e }));
    }
  };

  // 两种视图共用的 toast/undo 浮层 — 放在 App 顶层 fixed,无论显示哪个视图都不会被裁掉
  const toastBlock = useMemo(
    () => (
      <>
        {undoableDelete && (
          <div className="fixed bottom-6 right-6 bg-ink text-paper text-[13px] pl-4 pr-1.5 py-1.5 rounded-lg inline-flex items-center gap-3 z-[100] shadow-[0_8px_28px_rgba(0,0,0,0.22)] animate-rise">
            <span>{t("undo.toastPrefix", { name: undoableDelete.name })}</span>
            <button
              onClick={handleUndoDelete}
              className="h-8 px-3 rounded-md bg-white text-ink font-semibold inline-flex items-center gap-1.5 tabular-nums hover:bg-paper transition-colors"
            >
              <Undo2 size={14} strokeWidth={2} />
              {t("undo.button")} · {undoCountdown}s
            </button>
          </div>
        )}
        {toast && !undoableDelete && (
          <div className="fixed bottom-6 right-6 bg-ink text-paper text-[13px] font-medium px-4 py-3 rounded-md inline-flex items-center gap-2 z-[100] shadow-[0_8px_24px_rgba(0,0,0,0.16)] animate-rise">
            <span className="text-ok">✓</span>
            {toast}
          </div>
        )}
      </>
    ),
    [toast, undoableDelete, undoCountdown, t]
  );

  useEffect(() => {
    if (!workspace) return;
    (async () => {
      try {
        const n = await detectBootstrapNeeds(workspace, currentSlug);
        setBootstrapNeeds(n);
      } catch (e) {
        console.warn("bootstrap detect failed", e);
      }
      try {
        const am = await readAboutMe(workspace);
        setAboutMeContent(am);
      } catch (e) {
        console.warn("about_me read failed", e);
      }
    })();
  }, [workspace, currentSlug, refreshKey]);

  useEffect(() => {
    if (setupOpen && !setupPath) {
      getDefaultWorkspacePath().then(setSetupPath);
    }
  }, [setupOpen, setupPath]);

  // Inbox pending 计数：workspace/刷新时扫一遍 + app 重新聚焦时扫（PRD §7：0-1 用 focus 扫 inbox/）。
  useEffect(() => {
    refreshPending();
    const onFocus = () => refreshPending();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace, refreshKey]);

  // Load project list when workspace 或语言切换
  useEffect(() => {
    if (!workspace) return;
    (async () => {
      try {
        const list = await listProjects(workspace);
        setProjects(list);
        if (list.length && !currentSlug) setCurrentSlug(list[0].slug);
      } catch (e) {
        console.warn("listProjects failed", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace, refreshKey, lang]);

  // Load full project when slug 或语言切换
  useEffect(() => {
    if (!workspace || !currentSlug) { setProject(null); return; }
    (async () => {
      try { setProject(await readProject(workspace, currentSlug)); }
      catch (e) { console.error(e); setProject(null); }
    })();
  }, [workspace, currentSlug, refreshKey, lang]);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 3000);
  };

  // 手动导入（通道 manual）：parseHandoff → parsedToInboxHandoff → 写 Inbox（pending）→ 立即打开该 item 的 Review。
  // 红线：任何通道写回的 handoff 一律先进 Inbox，必须 review 后才入库。
  const onParsed = async (raw: string, parsed: ParsedHandoff) => {
    if (!workspace || !currentSlug) return;
    setModal(null);
    const handoff = parsedToInboxHandoff(parsed);
    const item: InboxItem = {
      id: crypto.randomUUID(),
      slug: currentSlug,
      sourceChannel: "manual",
      // sourceClient：优先用 handoff Metadata 里实际的 Source Tool（Phase 0 已把 CopyPromptModal 选择预填进去），
      // 回退到上次复制结束指令时选的 lastSourceClient。
      sourceClient: normalizeSourceTool(parsed.metadata?.["Source Tool"]?.trim() || lastSourceClient),
      sourcePlatform: null,
      createdAt: new Date().toISOString(),
      handoff,
      status: "pending",
    };
    const filename = await writeInboxItem(workspace, item);
    // push_to_inbox 埋点（北极星 push_to_inbox_rate 的分母），带 channel（与 server 端对齐）。
    logEvent("push_to_inbox", { channel: "manual", sourceClient: item.sourceClient, slug: item.slug });
    await refreshPending();
    void raw; // 原始粘贴文本不再直接用——apply 时由 inboxHandoffToMarkdown 渲染标准 9 段
    await openInboxReview(filename, item);
  };

  // 打开某个 Inbox item 的 Review（手动导入后立即调，或点「待审」badge 调）。
  // 关键：review 锚定到 item.slug 对应的**目标项目**，并加载该项目的 context/decisions 作为合并基线，
  // 不依赖当前显示的 project（后者随 currentSlug 异步加载，会滞后→导致写错项目）。
  const openInboxReview = async (filename: string, item: InboxItem) => {
    if (!workspace) return;
    if (item.slug !== currentSlug) setCurrentSlug(item.slug); // 仅为导航到目标项目，保存不依赖它
    const aboutMe = await readAboutMe(workspace);
    let targetName = item.slug;
    let context = "";
    let decisions = "";
    let cards = "";
    try {
      const target = await readProject(workspace, item.slug);
      targetName = target.name;
      context = target.contextMarkdown;
      decisions = target.decisionsMarkdown;
      cards = target.cardsMarkdown;
    } catch (e) {
      console.warn("readProject for inbox item failed", item.slug, e);
    }
    const { raw: mdRaw, parsed } = inboxItemToReviewState(item);
    setReview({
      raw: mdRaw, parsed, aboutMe, inboxFilename: filename, channel: item.sourceChannel,
      slug: item.slug, projectName: targetName, context, decisions, cards,
    });
  };

  // 点 Dashboard「待审」：打开最早一条 pending 的 Review。
  const onReviewPending = async () => {
    if (!workspace) return;
    const pending = await listInboxItems(workspace, "pending");
    if (!pending.length) { await refreshPending(); return; }
    const next = pending[pending.length - 1]; // listInboxItems 新的在前，取最早一条
    await openInboxReview(next.filename, next.item);
  };

  const onReviewSave = async (suggestions: UpdateSuggestion[]) => {
    if (!workspace || !review) return;
    const slug = review.slug; // 锚定目标项目，绝不用滞后的 currentSlug/project
    const today = new Date().toISOString().slice(0, 10);
    let saved = 0;

    // ── 现行卡模式（PRD·记忆质量升级 F2 蒸馏）──
    // 采纳的 AI 建议 → 升格为决策（升格日期 = 今天）；驳回的 → 防复提名单；没动的只留在归档交接里。
    const aiSugs = suggestions.filter((x) => x.targetFile === "ai-suggestion");
    const adopted = aiSugs.filter((x) => x.selected && !x.rejected).map((x) => x.content);
    const cardsSug = suggestions.find((x) => x.targetFile === "cards.md");

    if (cardsSug?.selected && cardsSug.content) {
      // 一键整理：提案（+采纳的建议）落盘，重写整理日期，被替换条目盖作废章入决策档案
      let content = adoptSuggestionsIntoCards(cardsSug.content, adopted, today, lang);
      content = stampCards(content, today, lang);
      await writeProjectCards(workspace, slug, content);
      if (cardsSug.superseded?.length) {
        await appendDecisionsArchive(workspace, slug, cardsSug.superseded, today);
      }
      // 写入闭环：条目库已启用则同步，新行补进、被替代的盖归档章
      await syncProjectEntriesFromCards(workspace, slug, content, cardsSug.superseded ?? []);
      saved++;
    } else if (adopted.length) {
      // 提案没勾但有采纳的建议 → 直接并进当前记忆卡片
      let content = adoptSuggestionsIntoCards(review.cards, adopted, today, lang);
      content = stampCards(content, today, lang);
      await writeProjectCards(workspace, slug, content);
      await syncProjectEntriesFromCards(workspace, slug, content);
      saved++;
    }
    for (const r of aiSugs.filter((x) => x.rejected)) {
      await appendRejectedSuggestion(workspace, slug, r.content);
    }

    for (const s of suggestions.filter((x) => x.selected)) {
      if (s.id === "save-session") {
        await saveSession(workspace, slug, review.raw);
        saved++;
      } else if (s.targetFile === "cards.md" || s.targetFile === "ai-suggestion") {
        continue; // 上面已处理
      } else if (s.targetFile && s.content) {
        if (s.mode === "replace") {
          if (s.targetFile === "00_context.md") await writeProjectContext(workspace, slug, s.content);
          else if (s.targetFile === "decisions.md") await writeProjectDecisions(workspace, slug, s.content);
          else if (s.targetFile === "about_me.md") await writeAboutMe(workspace, s.content);
          else await appendToFile(workspace, slug, s.targetFile, s.content);
        } else {
          await appendToFile(workspace, slug, s.targetFile, s.content);
        }
        saved++;
      }
    }
    // 入库成功 → 把对应 Inbox item 标 applied 并移 archive（幂等）。
    if (review.inboxFilename) await archiveInboxItem(workspace, review.inboxFilename, "applied");
    setReview(null);
    await refreshPending();
    setRefreshKey((k) => k + 1);
    showToast(t("toast.sessionSaved", { n: saved }));
  };

  // 取消 = 保留 pending（不动 inbox 文件），用户可稍后从「待审」继续。
  // 记忆库：打开时读对应库；项目库为空且有卡片时可一键把六卡整理成条目（机械迁移第一版）。
  // all = 全局回顾：合并所有项目库加全局库加技能库，只读（三库编号独立会撞号，不提供编辑）。
  const openEntryLib = async (lib?: EntryLib | { kind: "all" }) => {
    if (!workspace) return;
    if (lib?.kind === "all") {
      const merged: MemoryEntry[] = [];
      let bad = 0;
      for (const p of projects) {
        const r = await readEntriesLib(workspace, { kind: "project", slug: p.slug });
        merged.push(...r.entries);
        bad += r.badLines.length;
      }
      for (const k of ["global", "skill"] as const) {
        const r = await readEntriesLib(workspace, { kind: k });
        merged.push(...r.entries);
        bad += r.badLines.length;
      }
      setEntryLib({ lib: { kind: "all" }, entries: merged, badLineCount: bad, suggestions: { ...EMPTY_SUGGESTIONS } });
      return;
    }
    const target: EntryLib | null =
      lib ?? (project ? { kind: "project", slug: project.slug } : null);
    if (!target) return;
    const r = await readEntriesLib(workspace, target);
    const suggestions = await readEntrySuggestions(workspace, target);
    setEntryLib({ lib: target, entries: r.entries, badLineCount: r.badLines.length, suggestions });
  };
  const onMigrateEntries = async () => {
    if (!workspace || !entryLib) return;
    const today = new Date().toISOString().slice(0, 10);
    if (entryLib.lib.kind === "global") {
      // 全局库：把关于我逐条整理成偏好条目
      const aboutMe = await readAboutMe(workspace);
      const migrated = migrateAboutMeToEntries(aboutMe, today);
      await writeEntriesLib(workspace, { kind: "global" }, migrated);
      setEntryLib({ ...entryLib, lib: { kind: "global" }, entries: migrated, badLineCount: 0 });
      showToast(t("entryLib.migrateDone", { n: migrated.length }));
      return;
    }
    if (!project) return;
    const migrated = migrateCardsToEntries(project.cardsMarkdown, project.slug, today);
    await writeEntriesLib(workspace, { kind: "project", slug: project.slug }, migrated);
    setEntryLib({ ...entryLib, lib: { kind: "project", slug: project.slug }, entries: migrated, badLineCount: 0 });
    showToast(t("entryLib.migrateDone", { n: migrated.length }));
  };

  // 一键找关联（07-10 提案走审核）：机械找相近只产提案进待确认队列，
  // 接受才建边，驳回记防复提名单。已驳回和已有边不再复提。
  const onAutoRelate = async () => {
    if (!workspace || !entryLib || entryLib.lib.kind === "all") return;
    const fresh = proposeRelationsByOverlap(entryLib.entries, entryLib.suggestions.rejectedRelations);
    const pendingRelations = mergeProposals(entryLib.suggestions.pendingRelations, fresh);
    const newCount = pendingRelations.length - entryLib.suggestions.pendingRelations.length;
    if (newCount === 0) {
      showToast(t(pendingRelations.length ? "entryLib.autoRelatePendingOnly" : "entryLib.autoRelateNone", { n: pendingRelations.length }));
      return;
    }
    const suggestions = { ...entryLib.suggestions, pendingRelations };
    await writeEntrySuggestions(workspace, entryLib.lib, suggestions);
    setEntryLib({ ...entryLib, suggestions });
    showToast(t("entryLib.autoRelateProposed", { n: newCount }));
  };

  // 接受一条关联提案：建边写库，提案出队。
  const onAcceptRelation = async (p: RelationProposal) => {
    if (!workspace || !entryLib || entryLib.lib.kind === "all") return;
    const entries = acceptRelationProposal(entryLib.entries, p);
    const suggestions = {
      ...entryLib.suggestions,
      pendingRelations: entryLib.suggestions.pendingRelations.filter(
        (x) => relPairKey(x) !== relPairKey(p)
      ),
    };
    await writeEntriesLib(workspace, entryLib.lib, entries);
    await writeEntrySuggestions(workspace, entryLib.lib, suggestions);
    setEntryLib({ ...entryLib, entries, suggestions });
  };

  // 驳回一条关联提案：出队并记防复提名单，下次一键找关联不再出。
  const onRejectRelation = async (p: RelationProposal) => {
    if (!workspace || !entryLib || entryLib.lib.kind === "all") return;
    const key = relPairKey(p);
    const suggestions: EntrySuggestions = {
      ...entryLib.suggestions,
      pendingRelations: entryLib.suggestions.pendingRelations.filter((x) => relPairKey(x) !== key),
      rejectedRelations: entryLib.suggestions.rejectedRelations.includes(key)
        ? entryLib.suggestions.rejectedRelations
        : [...entryLib.suggestions.rejectedRelations, key],
    };
    await writeEntrySuggestions(workspace, entryLib.lib, suggestions);
    setEntryLib({ ...entryLib, suggestions });
  };

  // 一键找重复：疑似重复对进提案队列（脑图 调整·机械·去重合并 落地）。
  const onFindDuplicates = async () => {
    if (!workspace || !entryLib || entryLib.lib.kind === "all") return;
    const now = Date.now();
    const fresh = proposeMerges(
      entryLib.entries,
      entryLib.suggestions.rejectedMerges,
      (e) => scoreEntryAt(e, now)
    );
    const pendingMerges = mergeMergeProposals(entryLib.suggestions.pendingMerges, fresh);
    const newCount = pendingMerges.length - entryLib.suggestions.pendingMerges.length;
    if (newCount === 0) {
      showToast(t(pendingMerges.length ? "entryLib.dupPendingOnly" : "entryLib.dupNone", { n: pendingMerges.length }));
      return;
    }
    const suggestions = { ...entryLib.suggestions, pendingMerges };
    await writeEntrySuggestions(workspace, entryLib.lib, suggestions);
    setEntryLib({ ...entryLib, suggestions });
    showToast(t("entryLib.dupProposed", { n: newCount }));
  };

  // 确认合并：keep 收下 drop 的关联和高分，drop 盖作废章，指向 drop 的边改道。
  const onAcceptMerge = async (p: MergeProposal) => {
    if (!workspace || !entryLib || entryLib.lib.kind === "all") return;
    const entries = applyMerge(entryLib.entries, p, new Date().toISOString().slice(0, 10));
    const suggestions = {
      ...entryLib.suggestions,
      pendingMerges: entryLib.suggestions.pendingMerges.filter(
        (x) => mergePairKey(x) !== mergePairKey(p)
      ),
    };
    await writeEntriesLib(workspace, entryLib.lib, entries);
    await writeEntrySuggestions(workspace, entryLib.lib, suggestions);
    setEntryLib({ ...entryLib, entries, suggestions });
    showToast(t("entryLib.merged"));
  };

  // 不是重复：出队并记防复提名单。
  const onRejectMerge = async (p: MergeProposal) => {
    if (!workspace || !entryLib || entryLib.lib.kind === "all") return;
    const key = mergePairKey(p);
    const suggestions: EntrySuggestions = {
      ...entryLib.suggestions,
      pendingMerges: entryLib.suggestions.pendingMerges.filter((x) => mergePairKey(x) !== key),
      rejectedMerges: entryLib.suggestions.rejectedMerges.includes(key)
        ? entryLib.suggestions.rejectedMerges
        : [...entryLib.suggestions.rejectedMerges, key],
    };
    await writeEntrySuggestions(workspace, entryLib.lib, suggestions);
    setEntryLib({ ...entryLib, suggestions });
  };

  // 全部接受：队列里的提案逐条建边，一次写库。
  const onAcceptAllRelations = async () => {
    if (!workspace || !entryLib || entryLib.lib.kind === "all") return;
    let entries = entryLib.entries;
    for (const p of entryLib.suggestions.pendingRelations) {
      entries = acceptRelationProposal(entries, p);
    }
    const n = entryLib.suggestions.pendingRelations.length;
    const suggestions = { ...entryLib.suggestions, pendingRelations: [] };
    await writeEntriesLib(workspace, entryLib.lib, entries);
    await writeEntrySuggestions(workspace, entryLib.lib, suggestions);
    setEntryLib({ ...entryLib, entries, suggestions });
    showToast(t("entryLib.relAcceptedAll", { n }));
  };

  // 导出 md：复制到剪贴板，记录导出时间供导回时识别两边都改过的冲突。
  const [entriesExportedAt, setEntriesExportedAt] = useState<string | null>(null);
  const onExportEntriesMd = async () => {
    if (!entryLib || entryLib.lib.kind === "all") return;
    const title =
      entryLib.lib.kind === "project"
        ? `记忆库 · ${project?.name ?? entryLib.lib.slug}`
        : entryLib.lib.kind === "global"
          ? t("entryLib.libGlobal")
          : t("entryLib.libSkill");
    await copyToClipboard(exportToMarkdown(entryLib.entries, title));
    setEntriesExportedAt(new Date().toISOString());
    showToast(t("entryLib.exported"));
  };
  // 复制 AI 整理提示词：导出 md 包上调标签提关联的指令，改完从导回 md 贴回。
  const onCopyRefinePrompt = async () => {
    if (!entryLib) return;
    await copyToClipboard(buildRefinePrompt(exportToMarkdown(entryLib.entries)));
    setEntriesExportedAt(new Date().toISOString());
    showToast(t("entryLib.refineCopied"));
  };
  // 导回 md：按编号对账。删除和两边都改过的都先问，取消则保留。
  const onImportEntriesMd = async (md: string) => {
    if (!workspace || !entryLib || entryLib.lib.kind === "all") return;
    const plan = reconcileImport(entryLib.entries, parseMarkdown(md), {
      exportedAt: entriesExportedAt ?? undefined,
    });
    if (!plan.updates.length && !plan.adds.length && !plan.deletes.length) {
      showToast(t("entryLib.importNothing"));
      return;
    }
    let confirmedDeletes = plan.deletes;
    if (plan.deletes.length > 0) {
      const okDel = await ask(t("entryLib.confirmDeletes", { n: plan.deletes.length }), {
        title: t("entryLib.confirmDeletesTitle"), type: "warning",
      });
      if (!okDel) confirmedDeletes = [];
    }
    let applyConflicts = true;
    const conflictCount = plan.updates.filter((u) => u.conflict).length;
    if (conflictCount > 0) {
      applyConflicts = await ask(t("entryLib.confirmConflicts", { n: conflictCount }), {
        title: t("entryLib.confirmConflictsTitle"), type: "warning",
      });
    }
    const today = new Date().toISOString();
    const deleteIds = new Set(confirmedDeletes.map((e) => e.id));
    const updateById = new Map(
      plan.updates.filter((u) => applyConflicts || !u.conflict).map((u) => [u.current.id, u])
    );
    const next: MemoryEntry[] = entryLib.entries
      .filter((e) => !deleteIds.has(e.id))
      .map((e) => {
        const u = updateById.get(e.id);
        return u ? { ...e, text: u.text, kinds: u.kinds, relations: u.relations, updatedAt: today } : e;
      });
    const addScope =
      entryLib.lib.kind === "project" ? entryLib.lib.slug : entryLib.lib.kind;
    const counter: { id: string }[] = [...entryLib.entries];
    for (const a of plan.adds) {
      const id = nextEntryId(counter);
      counter.push({ id });
      next.push({
        id, text: a.text, kinds: a.kinds, scopes: [addScope], source: a.source,
        modality: "text",
        relations: a.relTargets.map((to) => ({ to, rel: "related" as const })),
        createdAt: today, updatedAt: today,
      });
    }
    await writeEntriesLib(workspace, entryLib.lib, next);
    setEntryLib({ ...entryLib, entries: next, badLineCount: 0 });
    showToast(t("entryLib.importDone", {
      u: updateById.size, a: plan.adds.length, d: confirmedDeletes.length,
    }));
  };

  // 单条更新（调档、钉住等）：改一条写回当前库，同一编号处处生效。
  const onUpdateEntry = async (id: string, patch: Partial<MemoryEntry>) => {
    if (!workspace || !entryLib || entryLib.lib.kind === "all") return;
    const today = new Date().toISOString();
    const next = entryLib.entries.map((e) =>
      e.id === id ? { ...e, ...patch, updatedAt: today } : e
    );
    await writeEntriesLib(workspace, entryLib.lib, next);
    setEntryLib({ ...entryLib, entries: next });
  };

  // 跨库移动：换归属。目标库重发编号避免撞号，写两个库，源库移除目标库追加。
  const onMoveEntry = async (id: string, target: "project" | "global" | "skill") => {
    if (!workspace || !entryLib || entryLib.lib.kind === "all") return;
    const entry = entryLib.entries.find((e) => e.id === id);
    if (!entry) return;
    const targetLib: EntryLib =
      target === "project"
        ? project
          ? { kind: "project", slug: project.slug }
          : null!
        : { kind: target };
    if (!targetLib) return;
    const tgt = await readEntriesLib(workspace, targetLib);
    const newId = nextEntryId(tgt.entries);
    const today = new Date().toISOString();
    const scope = target === "project" ? (project?.slug ?? "") : target;
    await writeEntriesLib(workspace, targetLib, [
      ...tgt.entries,
      { ...entry, id: newId, scopes: [scope], updatedAt: today },
    ]);
    const remaining = entryLib.entries.filter((e) => e.id !== id);
    await writeEntriesLib(workspace, entryLib.lib, remaining);
    setEntryLib({ ...entryLib, entries: remaining });
    showToast(t("entryLib.moved"));
  };

  // 手写一条：进当前库，来源用户，默认类型按库给（标签之后可用编辑器改）。
  const onAddEntry = async (text: string) => {
    if (!workspace || !entryLib || entryLib.lib.kind === "all") return;
    const body = text.trim();
    if (!body) return;
    const today = new Date().toISOString();
    const scope = entryLib.lib.kind === "project" ? entryLib.lib.slug : entryLib.lib.kind;
    const kind: EntryKind =
      entryLib.lib.kind === "skill" ? "skill" : entryLib.lib.kind === "global" ? "preference" : "misc";
    const next: MemoryEntry[] = [
      ...entryLib.entries,
      {
        id: nextEntryId(entryLib.entries),
        text: body, kinds: [kind], scopes: [scope], source: "user",
        modality: "text", relations: [],
        createdAt: today, updatedAt: today,
      },
    ];
    await writeEntriesLib(workspace, entryLib.lib, next);
    setEntryLib({ ...entryLib, entries: next });
    showToast(t("entryLib.addDone"));
  };

  // 一键汇集：把各项目库和全局库里标了技能类型的条目移进技能库。
  // 移动语义同 onMoveEntry：目标库重发编号、源库移除（07-10 确认汇集=移动）。
  const onCollectSkills = async () => {
    if (!workspace || !entryLib || entryLib.lib.kind !== "skill") return;
    const today = new Date().toISOString();
    const sources: EntryLib[] = [
      ...projects.map((p): EntryLib => ({ kind: "project", slug: p.slug })),
      { kind: "global" },
    ];
    const skillEntries = [...entryLib.entries];
    const counter: { id: string }[] = [...skillEntries];
    let moved = 0;
    for (const src of sources) {
      const r = await readEntriesLib(workspace, src);
      const cands = skillCandidates(r.entries);
      if (!cands.length) continue;
      const candIds = new Set(cands.map((c) => c.id));
      for (const c of cands) {
        const id = nextEntryId(counter);
        counter.push({ id });
        skillEntries.push({ ...c, id, scopes: ["skill"], updatedAt: today });
        moved++;
      }
      await writeEntriesLib(workspace, src, r.entries.filter((e) => !candIds.has(e.id)));
    }
    if (!moved) {
      showToast(t("entryLib.collectNone"));
      return;
    }
    await writeEntriesLib(workspace, { kind: "skill" }, skillEntries);
    setEntryLib({ ...entryLib, entries: skillEntries });
    showToast(t("entryLib.collectDone", { n: moved }));
  };

  // AI 开场读什么：记忆卡片 ⇄ 记忆库（主页和记忆库页共用同一开关）。
  const toggleEntryInjection = async () => {
    if (!workspace || !project) return;
    const next = !project.entryInjection;
    await setProjectEntryInjection(workspace, project.slug, next);
    setRefreshKey((k) => k + 1);
    showToast(next ? t("entryLib.injectionOnToast") : t("entryLib.injectionOffToast"));
  };

  const onReviewCancel = async () => {
    setReview(null);
    await refreshPending();
  };

  // 丢弃 = 移 archive(discarded)，不静默丢、不入库。
  const onReviewDiscard = async () => {
    if (workspace && review?.inboxFilename) {
      await archiveInboxItem(workspace, review.inboxFilename, "discarded");
    }
    setReview(null);
    await refreshPending();
  };

  // ── Welcome / 空工作区 ─────────────────────────────
  if (!workspace || !projects.length) {
    const hasWorkspace = !!workspace;
    const primary = hasWorkspace
      ? { label: t("welcome.newFirstProject"), hint: t("welcome.newFirstProjectHint"), onClick: () => setNewProjectOpen(true) }
      : { label: t("welcome.quickStart"), hint: t("welcome.quickStartHint"), onClick: () => setSetupOpen(true) };
    const secondaryLabel = hasWorkspace ? t("welcome.switchWorkspace") : t("welcome.useExisting");

    return (
      <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden bg-gradient-to-b from-[#F8FAFE] via-[#F2F5FB] to-[#EAEEF6] px-12 py-10">
        {/* 右上角语言切换 */}
        <div className="absolute top-5 right-6 z-10">
          <LanguageToggle />
        </div>
        {/* 背景：柔光 + 极淡噪点 + 左上点阵（参考稿氛围，全部纯 CSS/SVG 不联网） */}
        <div className="absolute inset-0 bg-grain pointer-events-none" />
        <div className="absolute -top-28 -left-28 w-[26rem] h-[26rem] rounded-full bg-slate/[.05] blur-3xl pointer-events-none" />
        <div className="absolute -bottom-36 -right-28 w-[30rem] h-[30rem] rounded-full bg-slate/[.06] blur-3xl pointer-events-none" />
        <div className="absolute top-[16%] left-[12%] w-24 h-20 bg-dotgrid opacity-40 pointer-events-none" />

        <div className="relative w-full max-w-[560px] text-center">
          {/* Logo：渐变菱形 + 白色四角星光（按参考稿重做）+ 字标 */}
          <div className="flex items-center justify-center gap-3 mb-5 animate-fade-up">
            <BrandMark size={64} className="drop-shadow-[0_10px_22px_rgba(0,47,167,0.30)]" />
            <span className="font-display text-[44px] font-bold tracking-[-0.02em] text-ink">MemoryOS</span>
          </div>

          <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-ink mb-3 animate-fade-up [animation-delay:80ms]">
            {t("welcome.tagline")}
          </h1>
          <p className="text-[14px] text-ink-soft leading-relaxed mb-10 whitespace-pre-line animate-fade-up [animation-delay:150ms]">
            {t("welcome.subtagline")}
          </p>

          <div className="animate-fade-up [animation-delay:220ms]">
            <button
              onClick={primary.onClick}
              className="w-[400px] max-w-full mx-auto h-[52px] px-5 bg-slate text-white rounded-xl flex items-center justify-center gap-2.5 text-[15px] font-medium hover:opacity-90 hover:-translate-y-px transition-all shadow-ikb"
            >
              <Zap size={17} strokeWidth={1.5} />
              {primary.label}
            </button>
            <p className="text-[12px] text-ink-faint mt-2.5">{primary.hint}</p>

            <button
              onClick={async () => {
                if (hasWorkspace) {
                  localStorage.removeItem("memoryos.workspace");
                  setWorkspace(null);
                  setProjects([]);
                  setCurrentSlug(null);
                  setProject(null);
                }
                const w = await selectWorkspace(t("picker.selectWorkspace"));
                if (w) setWorkspace(w);
              }}
              className="mt-6 h-11 px-6 mx-auto rounded-xl bg-surface/80 border border-hairline text-[13px] text-ink-soft hover:text-slate hover:border-slate/40 hover:-translate-y-px transition-all inline-flex items-center gap-2 shadow-btn hover:shadow-btn-hover"
            >
              <FolderOpen size={15} strokeWidth={1.5} />
              {secondaryLabel}
            </button>
          </div>
        </div>

        {/* 底部卖点四联卡：跨 AI 记忆是主叙事 */}
        <div className="relative w-full max-w-[1040px] mt-14 bg-surface/75 backdrop-blur rounded-2xl shadow-panel px-4 py-7 grid grid-cols-4 divide-x divide-hairline/70 animate-fade-up [animation-delay:320ms]">
          <WelcomeFeature icon={Layers} title={t("welcome.feat1Title")} desc={t("welcome.feat1Desc")} />
          <WelcomeFeature icon={PlayCircle} title={t("welcome.feat2Title")} desc={t("welcome.feat2Desc")} />
          <WelcomeFeature icon={ShieldCheck} title={t("welcome.feat3Title")} desc={t("welcome.feat3Desc")} />
          <WelcomeFeature icon={FileText} title={t("welcome.feat4Title")} desc={t("welcome.feat4Desc")} />
        </div>

        {setupOpen && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setSetupOpen(false)}>
            <div
              className="bg-surface rounded-xl w-[480px] p-7 shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold">{t("setup.title")}</h2>
                <button
                  onClick={() => setSetupOpen(false)}
                  className="w-7 h-7 rounded-md text-ink-faint hover:bg-surface-soft hover:text-ink transition-colors inline-flex items-center justify-center"
                >
                  <X size={18} strokeWidth={1.5} />
                </button>
              </div>

              <div className="bg-surface-soft rounded-lg px-4 py-3 mb-3 text-[13px] text-ink">
                <div className="text-[12px] text-ink-soft mb-1">{t("setup.defaultLocation")}</div>
                <div className="font-medium">{friendlyLocation(setupPath)}</div>
              </div>

              <button
                onClick={async () => {
                  const picked = await pickCustomWorkspaceLocation(t("picker.pickLocation"));
                  if (picked) setSetupPath(picked);
                }}
                className="text-[13px] text-ink-soft hover:text-slate transition-colors inline-flex items-center gap-1.5 mb-6"
              >
                <FolderOpen size={14} strokeWidth={1.5} />
                {t("setup.changeLocation")}
              </button>

              <p className="text-[12px] text-ink-faint mb-6 leading-relaxed">
                {t("setup.description")}
              </p>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setSetupOpen(false)}
                  className="h-10 px-4 rounded-md text-[14px] font-medium text-ink-soft hover:bg-surface-soft transition-colors"
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={async () => {
                    const w = await quickSetupWorkspace(setupPath);
                    setSetupOpen(false);
                    setWorkspace(w);
                  }}
                  className="h-10 px-5 rounded-md bg-slate text-white text-[14px] font-medium hover:opacity-90 transition-opacity inline-flex items-center gap-1.5"
                >
                  {t("setup.useHere")}
                  <ChevronRight size={16} strokeWidth={1.5} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 空工作区也允许直接新建项目 */}
        {newProjectOpen && workspace && (
          <NewProjectModal
            onClose={() => setNewProjectOpen(false)}
            onCreate={async (opts) => {
              try {
                const slug = await createProject(workspace, opts);
                setNewProjectOpen(false);
                setRefreshKey((k) => k + 1);
                setCurrentSlug(slug);
                showToast(t("toast.created", { name: opts.name }));
              } catch (e: any) {
                showToast(t("toast.createFailed", { err: e?.message ?? e }));
              }
            }}
          />
        )}

        {toastBlock}
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-paper min-w-[1280px] p-3 gap-3">
      <Sidebar
        workspace={workspace}
        projects={projects}
        currentSlug={currentSlug}
        sessionsCount={project?.sessions.length ?? 0}
        hasCards={!!project?.cardsMarkdown.trim()}
        mcpState={mcpState}
        onSelectProject={(slug) => { setCurrentSlug(slug); setReview(null); setEntryLib(null); }}
        onNewProject={() => setNewProjectOpen(true)}
        onRefreshProjects={() => {
          setRefreshKey((k) => k + 1);
          showToast(t("sidebar.refreshed"));
        }}
        onRenameProject={(slug) => setRenamingSlug(slug)}
        onDeleteProject={async (slug) => {
          const target = projects.find((p) => p.slug === slug);
          const name = target?.name ?? slug;
          const confirmed = await ask(
            t("confirm.deleteMsg", { name }),
            { title: t("confirm.deleteTitle"), type: "warning", okLabel: t("confirm.deleteOk"), cancelLabel: t("common.cancel") }
          );
          if (!confirmed || !workspace) return;
          try {
            const originalPath = await deleteProject(workspace, slug);
            if (currentSlug === slug) {
              setCurrentSlug(null);
              setProject(null);
            }
            setRefreshKey((k) => k + 1);
            if (originalPath) {
              setUndoableDelete({ name, slug, originalPath, deadline: Date.now() + 5000 });
            }
          } catch (e: any) {
            showToast(t("toast.trashFailed", { err: e?.message ?? e }));
          }
        }}
        onOpenHelp={() => setDrawerOpen(true)}
        onOpenFeedback={() => setModal("feedback")}
        onToast={showToast}
        onSwitchWorkspace={() => {
          localStorage.removeItem("memoryos.workspace");
          setWorkspace(null);
          setProjects([]);
          setCurrentSlug(null);
          setProject(null);
        }}
        onViewCoreFile={openCoreFile}
      />

      {review ? (
        <ReviewPage
          projectName={review.projectName}
          raw={review.raw}
          parsed={review.parsed}
          currentContext={review.context}
          currentDecisions={review.decisions}
          currentAboutMe={review.aboutMe}
          currentCards={review.cards}
          onCancel={onReviewCancel}
          onSave={onReviewSave}
          onDiscard={review.inboxFilename ? onReviewDiscard : undefined}
          channel={review.channel}
        />
      ) : entryLib && project ? (
        <EntryLibraryPage
          projectName={project.name}
          entries={entryLib.entries}
          badLineCount={entryLib.badLineCount}
          libKind={entryLib.lib.kind}
          onSwitchLib={(k) =>
            openEntryLib(k === "project" ? { kind: "project", slug: project.slug } : { kind: k as "global" | "skill" | "all" })
          }
          onBack={() => setEntryLib(null)}
          canMigrate={
            entryLib.lib.kind === "global" ||
            (entryLib.lib.kind === "project" && !!project.cardsMarkdown.trim())
          }
          onMigrate={onMigrateEntries}
          onAutoRelate={onAutoRelate}
          onExportMd={onExportEntriesMd}
          onImportMd={onImportEntriesMd}
          onCopyRefinePrompt={onCopyRefinePrompt}
          onUpdateEntry={onUpdateEntry}
          onMoveEntry={onMoveEntry}
          onAddEntry={onAddEntry}
          onCollectSkills={onCollectSkills}
          pendingRelations={entryLib.suggestions.pendingRelations}
          onAcceptRelation={onAcceptRelation}
          onRejectRelation={onRejectRelation}
          onAcceptAllRelations={onAcceptAllRelations}
          pendingMerges={entryLib.suggestions.pendingMerges}
          onFindDuplicates={onFindDuplicates}
          onAcceptMerge={onAcceptMerge}
          onRejectMerge={onRejectMerge}
          entryInjectionOn={project.entryInjection ?? false}
          onToggleInjection={toggleEntryInjection}
        />
      ) : project ? (
        <Dashboard
          project={project}
          bannerDismissed={bannerDismissed}
          onDismissBanner={dismissBanner}
          onOpenHelp={() => setDrawerOpen(true)}
          onCopyStartPrompt={async () => {
            if (!workspace || !project) return;
            const ctx = await readContextForStartPrompt(workspace, project.slug);
            // 开关开且条目库有现行条目 → 注入用条目按权重拼的文本；否则仍用记忆卡片
            let cards = ctx.cards;
            let archiveHint = true;
            if (project.entryInjection) {
              const lib = await readEntriesLib(workspace, { kind: "project", slug: project.slug });
              const activeEntries = lib.entries.filter((e) => !e.archived);
              // 回落规则以项目库为准；有条目时再拼上技能库，合并按权重挑（07-10 确认）
              if (activeEntries.length) {
                const skillLib = await readEntriesLib(workspace, { kind: "skill" });
                // 挑选尺子 = 界面档位同款合成分（所见档位 = 注入排序）
                const now = Date.now();
                const inj = buildInjectionFromEntries(
                  mergeLibsForInjection(activeEntries, skillLib.entries),
                  undefined,
                  (e) => scoreEntryAt(e, now)
                );
                cards = `# 记忆条目 · ${project.name}\n\n${inj.text}`;
                archiveHint = false;
              }
            }
            const prompt = buildStartSessionPrompt({
              projectName: project.name,
              ...ctx,
              cards,
              archiveHint,
              lang,
            });
            await copyToClipboard(prompt);
            showToast(t("toast.startPromptCopied"));
          }}
          onCopyPrompt={() => setModal("copy")}
          onImport={() => setModal("import")}
          onOpenSession={setViewingSession}
          pendingInboxCount={pendingCount}
          onReviewPending={onReviewPending}
          bootstrapNeeds={bootstrapNeeds}
          onOpenBootstrap={() => setBootstrapOpen(true)}
          onMigrateCards={() => setMigrateCardsOpen(true)}
          onEditCards={() => openCoreFile("cards.md")}
          onOpenEntryLib={() => openEntryLib()}
          entryInjectionOn={project.entryInjection ?? false}
          onToggleInjection={toggleEntryInjection}
          onToggleTrustMode={async () => {
            if (!workspace || !project) return;
            const next = !project.mcpAutoApply;
            await setProjectTrustMode(workspace, project.slug, next);
            logEvent("trust_mode_toggle", { slug: project.slug, on: next });
            setRefreshKey((k) => k + 1);
            showToast(next ? t("toast.trustModeOn") : t("toast.trustModeOff"));
          }}
          onOpenSessionsDir={async () => {
            if (!workspace || !project) return;
            const { createDir, exists } = await import("@tauri-apps/api/fs");
            const { join } = await import("@tauri-apps/api/path");
            const { open: shellOpen } = await import("@tauri-apps/api/shell");
            const p = await join(workspace, "projects", project.slug, "sessions");
            if (!(await exists(p))) await createDir(p, { recursive: true });
            try { await shellOpen(p); } catch (e: any) { showToast(t("toast.openFailed", { err: e?.message ?? e })); }
          }}
        />
      ) : (
        <div className="flex-1" />
      )}

      {modal === "copy" && project && workspace && (
        <CopyPromptModal
          workspace={workspace}
          project={project}
          defaultSourceTool={lastSourceClient}
          onClose={() => setModal(null)}
          onCopied={(client) => {
            rememberSourceClient(client);
            setModal(null);
            showToast(t("toast.endPromptCopied"));
          }}
        />
      )}
      {modal === "import" && (
        <ImportHandoffModal onClose={() => setModal(null)} onParsed={onParsed} />
      )}
      {migrateCardsOpen && project && workspace && (
        <MigrateCardsModal
          workspace={workspace}
          project={project}
          onClose={() => setMigrateCardsOpen(false)}
          onSaved={() => {
            setMigrateCardsOpen(false);
            setRefreshKey((k) => k + 1);
            logEvent("cards.migrated", { slug: project.slug });
            showToast(t("migrate.savedToast"));
          }}
        />
      )}
      {modal === "feedback" && (
        <FeedbackModal onClose={() => setModal(null)} onToast={showToast} />
      )}

      {viewingSession && project && workspace && (() => {
        const s = project.sessions.find((x) => x.filename === viewingSession);
        if (!s) return null;
        return (
          <FileViewerModal
            filename={s.filename}
            fullPath={`${workspace}/projects/${project.slug}/sessions/${s.filename}`}
            content={s.rawMarkdown}
            sessionMeta={{ date: s.date, time: s.time, sourceTool: s.sourceTool, sessionGoal: s.sessionGoal }}
            onClose={() => setViewingSession(null)}
          />
        );
      })()}

      {viewingCoreFile && (
        <FileViewerModal
          filename={viewingCoreFile.filename}
          fullPath={viewingCoreFile.fullPath}
          content={viewingCoreFile.content}
          editable
          onClose={() => setViewingCoreFile(null)}
          onSaveEdit={async (newContent) => {
            if (!workspace || !currentSlug) return;
            const f = viewingCoreFile.rawFile;
            if (f === "about_me.md") await writeAboutMe(workspace, newContent);
            else if (f === "00_context.md") await writeProjectContext(workspace, currentSlug, newContent);
            else if (f === "decisions.md") await writeProjectDecisions(workspace, currentSlug, newContent);
            else if (f === "cards.md") {
              await writeProjectCards(workspace, currentSlug, newContent);
              await syncProjectEntriesFromCards(workspace, currentSlug, newContent);
            }
            setViewingCoreFile(null);
            setRefreshKey((k) => k + 1);
            showToast(t("toast.fileSaved", { name: viewingCoreFile.filename }));
          }}
        />
      )}

      {newProjectOpen && workspace && (
        <NewProjectModal
          onClose={() => setNewProjectOpen(false)}
          onCreate={async (opts) => {
            try {
              const slug = await createProject(workspace, opts);
              setNewProjectOpen(false);
              setRefreshKey((k) => k + 1);
              setCurrentSlug(slug);
              showToast(t("toast.created", { name: opts.name }));
            } catch (e: any) {
              showToast(t("toast.createFailed", { err: e?.message ?? e }));
            }
          }}
        />
      )}

      {renamingSlug && workspace && (() => {
        const target = projects.find((p) => p.slug === renamingSlug);
        if (!target) { setRenamingSlug(null); return null; }
        return (
          <RenameProjectModal
            initialName={target.name}
            onClose={() => setRenamingSlug(null)}
            onRename={async (newName) => {
              try {
                await renameProject(workspace, renamingSlug, newName);
                setRenamingSlug(null);
                setRefreshKey((k) => k + 1);
                showToast(t("toast.renamed", { name: newName }));
              } catch (e: any) {
                showToast(t("toast.renameFailed", { err: e?.message ?? e }));
              }
            }}
          />
        );
      })()}

      {bootstrapOpen && workspace && (
        <BootstrapModal
          workspace={workspace}
          projectSlug={currentSlug}
          projectName={project?.name ?? currentSlug ?? "—"}
          needs={[
            ...(bootstrapNeeds.needsAboutMe ? (["about_me"] as const) : []),
            ...(bootstrapNeeds.needsContext ? (["context"] as const) : []),
          ]}
          existingAboutMe={aboutMeContent}
          existingContext={project?.contextMarkdown ?? ""}
          existingDecisions={project?.decisionsMarkdown ?? ""}
          latestSession={project?.sessions[0]?.rawMarkdown ?? ""}
          onClose={() => setBootstrapOpen(false)}
          onSaved={() => setRefreshKey((k) => k + 1)}
          onToast={showToast}
        />
      )}

      <HelpDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        workspace={workspace}
        projectName={project?.name}
        onTryCopy={() => {
          setDrawerOpen(false);
          setTimeout(() => setModal("copy"), 240);
        }}
      />

      {toastBlock}
    </div>
  );
}
