import { useEffect, useState } from "react";
import { Zap, FolderOpen, ChevronRight, X } from "lucide-react";
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

type ReviewState = { raw: string; parsed: ParsedHandoff } | null;

export default function App() {
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

  // Load project list when workspace changes
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
  }, [workspace, refreshKey]);

  // Load full project when slug changes
  useEffect(() => {
    if (!workspace || !currentSlug) { setProject(null); return; }
    (async () => {
      try { setProject(await readProject(workspace, currentSlug)); }
      catch (e) { console.error(e); setProject(null); }
    })();
  }, [workspace, currentSlug, refreshKey]);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 3000);
  };

  const dismissBanner = () => {
    setBannerDismissed(true);
    localStorage.setItem("memoryos.bannerDismissed", "1");
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
    showToast(`Session saved. ${saved} file${saved === 1 ? "" : "s"} updated.`);
  };

  // ── Welcome / setup screen ─────────────────────────
  if (!workspace) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper px-12">
        <div className="w-[420px] text-center">
          <div className="text-[40px] leading-none font-semibold mb-4 tracking-[-0.02em]">
            <span className="text-slate font-normal mr-3">◇</span>MemoryOS
          </div>
          <p className="text-[15px] text-ink-soft leading-relaxed mb-2">
            跨 AI 的工作记忆。
          </p>
          <p className="text-[13px] text-ink-faint leading-relaxed mb-10">
            不需要登录，不上传任何东西，数据在你自己的电脑里。
          </p>

          <button
            onClick={() => setSetupOpen(true)}
            className="w-full h-14 px-5 bg-slate text-white rounded-lg flex items-center justify-center gap-2.5 text-[15px] font-medium hover:opacity-90 transition-opacity shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
          >
            <Zap size={18} strokeWidth={1.5} />
            一键开始
          </button>
          <p className="text-[12px] text-ink-faint mt-2">
            会先让你确认保存位置
          </p>

          <div className="mt-8 text-[13px]">
            <button
              onClick={async () => { const w = await selectWorkspace(); if (w) setWorkspace(w); }}
              className="text-ink-soft hover:text-slate transition-colors inline-flex items-center gap-1.5"
            >
              <FolderOpen size={14} strokeWidth={1.5} />
              使用我已有的文件夹
            </button>
          </div>

          <p className="text-[11px] text-ink-faint mt-12 leading-relaxed">
            所有内容是普通 Markdown 文件，<br />
            可以用任何编辑器打开、备份、迁移。
          </p>
        </div>

        {setupOpen && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setSetupOpen(false)}>
            <div
              className="bg-surface rounded-xl w-[480px] p-7 shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold">保存到哪里?</h2>
                <button
                  onClick={() => setSetupOpen(false)}
                  className="w-7 h-7 rounded-md text-ink-faint hover:bg-surface-soft hover:text-ink transition-colors inline-flex items-center justify-center"
                >
                  <X size={18} strokeWidth={1.5} />
                </button>
              </div>

              <div className="bg-surface-soft rounded-lg px-4 py-3 mb-3 text-[13px] font-mono break-all text-ink">
                {setupPath || "..."}
              </div>

              <button
                onClick={async () => {
                  const picked = await pickCustomWorkspaceLocation();
                  if (picked) setSetupPath(picked);
                }}
                className="text-[13px] text-ink-soft hover:text-slate transition-colors inline-flex items-center gap-1.5 mb-6"
              >
                <FolderOpen size={14} strokeWidth={1.5} />
                换个位置
              </button>

              <p className="text-[12px] text-ink-faint mb-6 leading-relaxed">
                我会在这个位置下建一个 MemoryOS 文件夹,放进 about_me.md、projects/ 和一个示例项目。如果这个文件夹已经存在,不会覆盖你已有的内容。
              </p>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setSetupOpen(false)}
                  className="h-10 px-4 rounded-md text-[14px] font-medium text-ink-soft hover:bg-surface-soft transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={async () => {
                    const w = await quickSetupWorkspace(setupPath);
                    setSetupOpen(false);
                    setWorkspace(w);
                  }}
                  className="h-10 px-5 rounded-md bg-slate text-white text-[14px] font-medium hover:opacity-90 transition-opacity inline-flex items-center gap-1.5"
                >
                  就用这里
                  <ChevronRight size={16} strokeWidth={1.5} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Empty workspace ────────────────────────────────
  if (!projects.length) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-paper px-12">
        <div className="max-w-md text-center">
          <h1 className="text-[32px] font-semibold tracking-[-0.02em] mb-3">Workspace 是空的</h1>
          <p className="text-ink-soft mb-6 leading-relaxed">
            在 <code className="font-mono text-ink">{workspace}/projects/</code> 下新建一个文件夹（例如{" "}
            <code className="font-mono text-ink">my-project</code>），里面放一个{" "}
            <code className="font-mono text-ink">project.json</code> 即可被识别。
          </p>
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="h-10 px-4 rounded-md bg-slate text-white font-medium text-sm hover:opacity-90 transition-opacity"
          >
            刷新
          </button>
          <p className="text-xs text-ink-faint mt-6">README 里有 project.json 的字段说明。</p>
        </div>
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
        onRenameProject={(slug) => setRenamingSlug(slug)}
        onDeleteProject={async (slug) => {
          const target = projects.find((p) => p.slug === slug);
          const confirmed = await ask(
            `确定要删除项目「${target?.name ?? slug}」吗?\n\n` +
              `这会永久删除整个项目文件夹,包括所有 session 历史。无法撤销。`,
            { title: "删除项目", type: "warning", okLabel: "删除", cancelLabel: "取消" }
          );
          if (!confirmed || !workspace) return;
          try {
            await deleteProject(workspace, slug);
            if (currentSlug === slug) {
              setCurrentSlug(null);
              setProject(null);
            }
            setRefreshKey((k) => k + 1);
            showToast(`已删除「${target?.name ?? slug}」`);
          } catch (e: any) {
            showToast(`删除失败: ${e?.message ?? e}`);
          }
        }}
        helpBannerDismissed={bannerDismissed}
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
          setViewingCoreFile({ filename: file, fullPath, content });
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
          helpBannerDismissed={bannerDismissed}
          onDismissBanner={dismissBanner}
          onOpenHelp={() => setDrawerOpen(true)}
          onCopyStartPrompt={async () => {
            if (!workspace || !project) return;
            const ctx = await readContextForStartPrompt(workspace, project.slug);
            const prompt = buildStartSessionPrompt({
              projectName: project.name,
              ...ctx,
            });
            await copyToClipboard(prompt);
            showToast("Start Session 指令已复制。粘贴到 AI 让它读取你的上下文。");
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
            try { await shellOpen(p); } catch (e: any) { showToast(`打不开: ${e?.message ?? e}`); }
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
            showToast("End Session Prompt copied. Paste it into your AI tool.");
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
              showToast(`已创建「${opts.name}」`);
            } catch (e: any) {
              showToast(`创建失败: ${e?.message ?? e}`);
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
                showToast(`已重命名为「${newName}」`);
              } catch (e: any) {
                showToast(`重命名失败: ${e?.message ?? e}`);
              }
            }}
          />
        );
      })()}

      {bootstrapOpen && workspace && (
        <BootstrapModal
          workspace={workspace}
          projectSlug={currentSlug}
          projectName={project?.name ?? currentSlug ?? "当前项目"}
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

      {toast && (
        <div className="fixed bottom-6 right-6 bg-ink text-paper text-[13px] font-medium px-4 py-3 rounded-md inline-flex items-center gap-2 z-[60] shadow-[0_8px_24px_rgba(0,0,0,0.16)] animate-rise">
          <span className="text-ok">✓</span>
          {toast}
        </div>
      )}
    </div>
  );
}

function SetupBtn({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<any>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group h-[52px] px-5 bg-white border border-hairline rounded-lg flex items-center gap-3 text-left hover:border-slate transition-colors"
    >
      <Icon size={20} strokeWidth={1.5} className="text-ink-soft group-hover:text-slate transition-colors" />
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}
