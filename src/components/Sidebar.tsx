import { Home, Settings, HelpCircle, Plus, FileText, FolderOpen, RotateCw, MessageSquare } from "lucide-react";
import { open as shellOpen } from "@tauri-apps/api/shell";
import { createDir, exists } from "@tauri-apps/api/fs";
import { join } from "@tauri-apps/api/path";
import type { ProjectMeta, McpState } from "../types";
import ProjectKebabMenu from "./ProjectKebabMenu";
import LanguageToggle from "./LanguageToggle";
import BrandMark from "./BrandMark";
import { normalizeSourceTool } from "../lib/sourceTools";
import { useT } from "../lib/i18n";

type Props = {
  workspace: string;
  projects: ProjectMeta[];
  currentSlug: string | null;
  sessionsCount: number;
  onSelectProject: (slug: string) => void;
  onNewProject: () => void;
  onRefreshProjects: () => void;
  onRenameProject: (slug: string) => void;
  onDeleteProject: (slug: string) => void;
  onOpenHelp: () => void;
  onOpenFeedback: () => void;
  onToast: (msg: string) => void;
  onSwitchWorkspace: () => void;
  onViewCoreFile: (file: "about_me.md" | "00_context.md" | "decisions.md" | "cards.md") => void;
  /** 当前项目是否已启用现行卡（cards.md 存在）→ 核心资料里显示「现行卡」。 */
  hasCards?: boolean;
  /** 最近一次 MCP 工具活动（来自 .memoryos/mcp_state.json）；null = 还没检测到。 */
  mcpState?: McpState | null;
};

// 相对时间，复用 common.* i18n key。
function relTime(iso: string, t: (k: string, v?: Record<string, string | number>) => string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!isFinite(ms) || ms < 0) return t("common.justNow");
  const min = Math.floor(ms / 60000);
  if (min < 1) return t("common.justNow");
  if (min < 60) return t("common.minutesAgo", { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t("common.hoursAgo", { n: hr });
  return t("common.daysAgo", { n: Math.floor(hr / 24) });
}

export default function Sidebar(props: Props) {
  const t = useT();
  const {
    workspace, projects, currentSlug, sessionsCount,
    onOpenHelp, onOpenFeedback, onSelectProject, onNewProject, onRefreshProjects, onToast,
    onSwitchWorkspace, onViewCoreFile, onRenameProject, onDeleteProject, mcpState, hasCards,
  } = props;

  const openInOS = async (path: string) => {
    try {
      await shellOpen(path);
    } catch (e: any) {
      onToast(t("toast.openFailed", { err: e?.message ?? String(e) }));
    }
  };

  const openWorkspace = async () => openInOS(workspace);
  const handleCoreFile = (file: "about_me.md" | "00_context.md" | "decisions.md" | "cards.md") => {
    if (file !== "about_me.md" && !currentSlug) {
      onToast(t("sidebar.selectProjectFirst"));
      return;
    }
    onViewCoreFile(file);
  };
  const openSessionsDir = async () => {
    if (!currentSlug) { onToast(t("sidebar.selectProjectFirst")); return; }
    const p = await join(workspace, "projects", currentSlug, "sessions");
    if (!(await exists(p))) {
      await createDir(p, { recursive: true });
    }
    openInOS(p);
  };

  const hasProject = !!currentSlug;

  return (
    <aside className="w-60 box-border h-full bg-surface rounded-2xl shadow-panel flex flex-col shrink-0 overflow-hidden">
      <div className="h-12 px-4 flex items-center justify-between shrink-0">
        <button
          onClick={onSwitchWorkspace}
          className="flex items-center gap-2 text-[15px] font-semibold hover:opacity-70 transition-opacity"
          title={t("sidebar.backToHome")}
        >
          <BrandMark size={22} />
          <span className="font-display tracking-[-0.01em]">MemoryOS</span>
        </button>
        <button className="w-6 h-6 text-ink-faint hover:text-ink-soft transition-colors">«</button>
      </div>

      {/* 一屏放完，不出滚动条（她确认 06-11）：行高/组距收紧 + 滚动条隐藏，overflow 仅作极端兜底 */}
      <div className="flex-1 overflow-y-auto pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <GroupHeader>{t("sidebar.workspace")}</GroupHeader>
        <Row icon={HelpCircle} label={t("sidebar.help")} onClick={onOpenHelp} accent />
        <Row icon={Home} label={t("sidebar.workspaceOverview")} onClick={openWorkspace} />
        <Row icon={Settings} label={t("sidebar.settings")} onClick={() => onToast(t("sidebar.settingsToast"))} />
        <Row icon={MessageSquare} label={t("sidebar.feedback")} onClick={onOpenFeedback} />

        <div className="h-3" />

        <GroupHeader
          action={
            <div className="flex items-center gap-0.5">
              <IconBtn icon={RotateCw} title={t("sidebar.refreshProjects")} onClick={onRefreshProjects} />
              <IconBtn icon={Plus} title={t("sidebar.newProject")} onClick={onNewProject} />
            </div>
          }
        >
          {t("sidebar.projects")}
        </GroupHeader>
        {projects.map((p) => (
          <Row
            key={p.slug}
            label={p.name}
            selected={p.slug === currentSlug}
            onClick={() => onSelectProject(p.slug)}
            indent="pl-7"
            trailing={
              <ProjectKebabMenu
                onRename={() => onRenameProject(p.slug)}
                onDelete={() => onDeleteProject(p.slug)}
              />
            }
          />
        ))}

        <div className="h-3" />

        <GroupHeader>{t("sidebar.coreFiles")}</GroupHeader>
        <Row icon={FileText} label={t("sidebar.aboutMe")} onClick={() => handleCoreFile("about_me.md")} />
        {hasCards && (
          <Row icon={FileText} label={t("sidebar.cards")} disabled={!hasProject} onClick={() => handleCoreFile("cards.md")} />
        )}
        <Row icon={FileText} label={t("sidebar.context")} disabled={!hasProject} onClick={() => handleCoreFile("00_context.md")} />
        <Row icon={FileText} label={t("sidebar.decisions")} disabled={!hasProject} onClick={() => handleCoreFile("decisions.md")} />
        <Row icon={FolderOpen} label={t("sidebar.sessionsCount", { n: sessionsCount })} disabled={!hasProject} onClick={openSessionsDir} />
      </div>

      <div className="border-t border-hairline shrink-0">
        {/* MCP 连接状态：最近一次工具活动（server↔app 通过 mcp_state.json 通信，非实时 socket）。 */}
        <div className="px-4 pt-1.5 pb-1 text-[11px]">
          {mcpState ? (
            <span
              className="inline-flex items-center gap-2 text-ink-soft"
              title={t("sidebar.mcpTooltip", { client: normalizeSourceTool(mcpState.lastClient), tool: mcpState.lastTool, time: relTime(mcpState.lastActivityAt, t) })}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-ok inline-block" />
              {t("sidebar.mcpActive", { client: normalizeSourceTool(mcpState.lastClient), time: relTime(mcpState.lastActivityAt, t) })}
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 text-ink-faint">
              <span className="w-1.5 h-1.5 rounded-full bg-ink-faint/40 inline-block" />
              {t("sidebar.mcpIdle")}
            </span>
          )}
        </div>
        <div className="h-8 px-4 flex items-center justify-between text-xs text-ink-soft">
          <span className="inline-flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-ok inline-block" />
            {t("sidebar.localMode")}
          </span>
          <LanguageToggle />
        </div>
      </div>
    </aside>
  );
}

function GroupHeader({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 h-6 text-[11px] uppercase tracking-wider text-ink-faint font-medium">
      <span>{children}</span>
      {action}
    </div>
  );
}

function IconBtn({
  icon: Icon, title, onClick,
}: {
  icon: React.ComponentType<any>;
  title: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className="w-5 h-5 rounded text-ink-soft hover:bg-surface-soft flex items-center justify-center transition-colors"
      title={title}
    >
      <Icon size={14} strokeWidth={1.5} />
    </button>
  );
}

type RowProps = {
  icon?: React.ComponentType<any>;
  label: string;
  selected?: boolean;
  onClick?: () => void;
  indent?: string;
  trailing?: React.ReactNode;
  disabled?: boolean;
  accent?: boolean;
};

function Row({ icon: Icon, label, selected, onClick, indent, trailing, disabled, accent }: RowProps) {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      className={[
        "group relative h-8 mx-2 pr-2 rounded-lg flex items-center gap-2.5 text-[13px] font-medium",
        "transition-colors duration-150",
        indent ?? "pl-2.5",
        disabled
          ? "text-ink-faint cursor-not-allowed"
          : "cursor-pointer hover:bg-slate/[.06] hover:text-slate",
        accent && !disabled ? "text-slate font-semibold" :
        selected && !disabled ? "bg-slate/[.08] text-slate" : !disabled ? "text-ink" : "",
      ].join(" ")}
    >
      {selected && !disabled && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-slate" />
      )}
      {Icon && <Icon size={16} strokeWidth={1.5} />}
      <span className="flex-1 truncate">{label}</span>
      {trailing && (
        <span className="opacity-0 group-hover:opacity-100 transition-opacity">{trailing}</span>
      )}
    </div>
  );
}
