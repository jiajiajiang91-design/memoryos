import { Home, Settings, HelpCircle, Plus, FileText, FolderOpen, RotateCw, MessageSquare } from "lucide-react";
import { open as shellOpen } from "@tauri-apps/api/shell";
import { createDir, exists } from "@tauri-apps/api/fs";
import { join } from "@tauri-apps/api/path";
import type { ProjectMeta } from "../types";
import ProjectKebabMenu from "./ProjectKebabMenu";
import LanguageToggle from "./LanguageToggle";
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
  onViewCoreFile: (file: "about_me.md" | "00_context.md" | "decisions.md") => void;
};

export default function Sidebar(props: Props) {
  const t = useT();
  const {
    workspace, projects, currentSlug, sessionsCount,
    onOpenHelp, onOpenFeedback, onSelectProject, onNewProject, onRefreshProjects, onToast,
    onSwitchWorkspace, onViewCoreFile, onRenameProject, onDeleteProject,
  } = props;

  const openInOS = async (path: string) => {
    try {
      await shellOpen(path);
    } catch (e: any) {
      onToast(t("toast.openFailed", { err: e?.message ?? String(e) }));
    }
  };

  const openWorkspace = async () => openInOS(workspace);
  const handleCoreFile = (file: "about_me.md" | "00_context.md" | "decisions.md") => {
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
    <aside className="w-60 box-border h-full bg-surface-soft flex flex-col shrink-0">
      <div className="h-14 px-4 flex items-center justify-between shrink-0">
        <button
          onClick={onSwitchWorkspace}
          className="flex items-center gap-2 text-[15px] font-semibold hover:opacity-70 transition-opacity"
          title={t("sidebar.backToHome")}
        >
          <span className="text-slate text-base font-normal -translate-y-px">◇</span>
          MemoryOS
        </button>
        <button className="w-6 h-6 text-ink-faint hover:text-ink-soft transition-colors">«</button>
      </div>

      <div className="flex-1 overflow-y-auto pt-2">
        <GroupHeader>{t("sidebar.workspace")}</GroupHeader>
        <Row icon={HelpCircle} label={t("sidebar.help")} onClick={onOpenHelp} accent />
        <Row icon={Home} label={t("sidebar.workspaceOverview")} onClick={openWorkspace} />
        <Row icon={Settings} label={t("sidebar.settings")} onClick={() => onToast(t("sidebar.settingsToast"))} />
        <Row icon={MessageSquare} label={t("sidebar.feedback")} onClick={onOpenFeedback} />

        <div className="h-6" />

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
            indent="pl-8"
            trailing={
              <ProjectKebabMenu
                onRename={() => onRenameProject(p.slug)}
                onDelete={() => onDeleteProject(p.slug)}
              />
            }
          />
        ))}

        <div className="h-6" />

        <GroupHeader>{t("sidebar.coreFiles")}</GroupHeader>
        <Row icon={FileText} label={t("sidebar.aboutMe")} onClick={() => handleCoreFile("about_me.md")} />
        <Row icon={FileText} label={t("sidebar.context")} disabled={!hasProject} onClick={() => handleCoreFile("00_context.md")} />
        <Row icon={FileText} label={t("sidebar.decisions")} disabled={!hasProject} onClick={() => handleCoreFile("decisions.md")} />
        <Row icon={FolderOpen} label={t("sidebar.sessionsCount", { n: sessionsCount })} disabled={!hasProject} onClick={openSessionsDir} />
      </div>

      <div className="h-10 px-4 flex items-center justify-between text-xs text-ink-soft border-t border-hairline shrink-0">
        <span className="inline-flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-ok inline-block" />
          {t("sidebar.localMode")}
        </span>
        <LanguageToggle />
      </div>
    </aside>
  );
}

function GroupHeader({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 h-7 mb-1 text-[12px] uppercase tracking-wider text-ink-soft font-medium">
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
        "group relative h-9 pr-4 flex items-center gap-2.5 text-sm font-medium",
        "transition-colors duration-150",
        indent ?? "pl-4",
        disabled
          ? "text-ink-faint cursor-not-allowed"
          : "cursor-pointer hover:bg-slate hover:text-white",
        accent && !disabled ? "text-slate font-semibold" :
        selected && !disabled ? "bg-surface-soft text-slate" : !disabled ? "text-ink" : "",
      ].join(" ")}
    >
      {selected && !disabled && (
        <span className="group-hover:hidden absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-slate" />
      )}
      {Icon && <Icon size={16} strokeWidth={1.5} />}
      <span className="flex-1 truncate">{label}</span>
      {trailing && (
        <span className="opacity-0 group-hover:opacity-100 transition-opacity">{trailing}</span>
      )}
    </div>
  );
}
