import { useEffect, useMemo, useRef, useState } from "react";
import { Zap, FolderOpen, ChevronRight, X, Undo2 } from "lucide-react";
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
} from "./lib/fs";
import { ask } from "@tauri-apps/api/dialog";
import { buildStartSessionPrompt } from "./lib/parser";
import type { Project, ProjectMeta, ParsedHandoff, UpdateSuggestion } from "./types";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import HelpDrawer from "./components/HelpDrawer";
import CopyPromptModal from "./components/CopyPromptModal";
import ImportHandoffModal from "./components/ImportHandoffModal";
import ReviewPage from "./components/ReviewPage";
import FileViewerModal from "./components/FileViewerModal";
import BootstrapModal from "./components/BootstrapModal";
import NewProjectModal from "./components/NewProjectModal";
import RenameProjectModal from "./components/RenameProjectModal";
import LanguageToggle from "./components/LanguageToggle";
import { useT, useLang } from "./lib/i18n";

type ReviewState = { raw: string; parsed: ParsedHandoff } | null;

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
  const [modal, setModal] = useState<null | "copy" | "import">(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(
    () => localStorage.getItem("memoryos.bannerDismissed") === "1"
  );
  const [toast, setToast] = useState<string | null>(null);

  const dismissBanner = () => {
    setBannerDismissed(true);
    localStorage.setItem("memoryos.bannerDismissed", "1");
  };
  const [review, setReview] = useState<ReviewState>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Restore last workspace on launch
  useEffect(() => {
    const w = loadWorkspace();
    if (w) setWorkspace(w);
  }, []);

  const [setupOpen, setSetupOpen] = useState(false);
  const [setupPath, setSetupPath] = useState<string>("");
  const [viewingSession, setViewingSession] = useState<string | null>(null);
  const [viewingCoreFile, setViewingCoreFile] = useState<
    null | { filename: string; fullPath: string; content: string }
  >(null);
  const [bootstrapNeeds, setBootstrapNeeds] = useState<{ needsAboutMe: boolean; needsContext: boolean }>({
    needsAboutMe: false,
    needsContext: false,
  });
  const [bootstrapOpen, setBootstrapOpen] = useState(false);
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
      : file;

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
    })();
  }, [workspace, currentSlug, refreshKey]);

  useEffect(() => {
    if (setupOpen && !setupPath) {
      getDefaultWorkspacePath().then(setSetupPath);
    }
  }, [setupOpen, setupPath]);

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

  const onParsed = (raw: string, parsed: ParsedHandoff) => {
    setModal(null);
    setReview({ raw, parsed });
  };

  const onReviewSave = async (suggestions: UpdateSuggestion[]) => {
    if (!workspace || !project || !review) return;
    let saved = 0;
    for (const s of suggestions.filter((x) => x.selected)) {
      if (s.id === "save-session") {
        await saveSession(workspace, project.slug, review.raw);
        saved++;
      } else if (s.targetFile && s.content) {
        await appendToFile(workspace, project.slug, s.targetFile, s.content);
        saved++;
      }
    }
    setReview(null);
    setRefreshKey((k) => k + 1);
    showToast(t("toast.sessionSaved", { n: saved }));
  };

  // ── Welcome / 空工作区 ─────────────────────────────
  if (!workspace || !projects.length) {
    const hasWorkspace = !!workspace;
    const primary = hasWorkspace
      ? { label: t("welcome.newFirstProject"), hint: t("welcome.newFirstProjectHint"), onClick: () => setNewProjectOpen(true) }
      : { label: t("welcome.quickStart"), hint: t("welcome.quickStartHint"), onClick: () => setSetupOpen(true) };
    const secondaryLabel = hasWorkspace ? t("welcome.switchWorkspace") : t("welcome.useExisting");

    return (
      <div className="min-h-screen flex items-center justify-center bg-paper px-12 relative">
        {/* 右上角语言切换 */}
        <div className="absolute top-5 right-6">
          <LanguageToggle />
        </div>

        <div className="w-[420px] text-center">
          <div className="text-[40px] leading-none font-semibold mb-4 tracking-[-0.02em]">
            <span className="text-slate font-normal mr-3">◇</span>MemoryOS
          </div>
          <p className="text-[15px] text-ink-soft leading-relaxed mb-2">
            {t("welcome.tagline")}
          </p>
          <p className="text-[13px] text-ink-faint leading-relaxed mb-10">
            {t("welcome.subtagline")}
          </p>

          <button
            onClick={primary.onClick}
            className="w-full h-14 px-5 bg-slate text-white rounded-lg flex items-center justify-center gap-2.5 text-[15px] font-medium hover:opacity-90 transition-opacity shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
          >
            <Zap size={18} strokeWidth={1.5} />
            {primary.label}
          </button>
          <p className="text-[12px] text-ink-faint mt-2">{primary.hint}</p>

          <div className="mt-8 text-[13px]">
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
              className="text-ink-soft hover:text-slate transition-colors inline-flex items-center gap-1.5"
            >
              <FolderOpen size={14} strokeWidth={1.5} />
              {secondaryLabel}
            </button>
          </div>

          <p className="text-[11px] text-ink-faint mt-12 leading-relaxed whitespace-pre-line">
            {t("welcome.markdownNote")}
          </p>
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
    <div className="h-screen flex bg-paper min-w-[1280px]">
      <Sidebar
        workspace={workspace}
        projects={projects}
        currentSlug={currentSlug}
        sessionsCount={project?.sessions.length ?? 0}
        onSelectProject={(slug) => { setCurrentSlug(slug); setReview(null); }}
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
        onToast={showToast}
        onSwitchWorkspace={() => {
          localStorage.removeItem("memoryos.workspace");
          setWorkspace(null);
          setProjects([]);
          setCurrentSlug(null);
          setProject(null);
        }}
        onViewCoreFile={async (file) => {
          if (!workspace) return;
          const { readTextFile, exists } = await import("@tauri-apps/api/fs");
          const { join } = await import("@tauri-apps/api/path");
          const fullPath =
            file === "about_me.md"
              ? await join(workspace, "about_me.md")
              : await join(workspace, "projects", currentSlug ?? "", file);
          const content = (await exists(fullPath)) ? await readTextFile(fullPath) : "";
          setViewingCoreFile({ filename: coreFileLabel(file), fullPath, content });
        }}
      />

      {review && project ? (
        <ReviewPage
          project={project}
          raw={review.raw}
          parsed={review.parsed}
          onCancel={() => setReview(null)}
          onSave={onReviewSave}
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
            const prompt = buildStartSessionPrompt({
              projectName: project.name,
              ...ctx,
              lang,
            });
            await copyToClipboard(prompt);
            showToast(t("toast.startPromptCopied"));
          }}
          onCopyPrompt={() => setModal("copy")}
          onImport={() => setModal("import")}
          onOpenSession={setViewingSession}
          bootstrapNeeds={bootstrapNeeds}
          onOpenBootstrap={() => setBootstrapOpen(true)}
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
          onClose={() => setModal(null)}
          onCopied={() => {
            setModal(null);
            showToast(t("toast.endPromptCopied"));
          }}
        />
      )}
      {modal === "import" && (
        <ImportHandoffModal onClose={() => setModal(null)} onParsed={onParsed} />
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
          onClose={() => setViewingCoreFile(null)}
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
          onClose={() => setBootstrapOpen(false)}
          onSaved={() => setRefreshKey((k) => k + 1)}
          onToast={showToast}
        />
      )}

      <HelpDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onTryCopy={() => {
          setDrawerOpen(false);
          setTimeout(() => setModal("copy"), 240);
        }}
      />

      {toastBlock}
    </div>
  );
}
