import { Home, Settings, HelpCircle, Plus, FileText, FolderOpen } from "lucide-react";
import { open as shellOpen } from "@tauri-apps/api/shell";
import { createDir, exists } from "@tauri-apps/api/fs";
import { join } from "@tauri-apps/api/path";
import type { ProjectMeta } from "../types";
import ProjectKebabMenu from "./ProjectKebabMenu";

type Props = {
  workspace: string;
  projects: ProjectMeta[];
  currentSlug: string | null;
  sessionsCount: number;
  onSelectProject: (slug: string) => void;
  onNewProject: () => void;
  onRenameProject: (slug: string) => void;
  onDeleteProject: (slug: string) => void;
  helpBannerDismissed: boolean;
  onOpenHelp: () => void;
  onToast: (msg: string) => void;
  onSwitchWorkspace: () => void;
  onViewCoreFile: (file: "about_me.md" | "00_context.md" | "decisions.md") => void;
};

async function openInOS(path: string, onError: (m: string) => void) {
  try {
    await shellOpen(path);
  } catch (e: any) {
    onError(`打不开: ${e?.message ?? String(e)}`);
  }
}

export default function Sidebar(props: Props) {
  const {
    workspace, projects, currentSlug, sessionsCount,
    helpBannerDismissed, onOpenHelp, onSelectProject, onNewProject, onToast,
    onSwitchWorkspace, onViewCoreFile, onRenameProject, onDeleteProject,
  } = props;

  const openWorkspace = async () => openInOS(workspace, onToast);
  const handleCoreFile = (file: "about_me.md" | "00_context.md" | "decisions.md") => {
    if (file !== "about_me.md" && !currentSlug) {
      onToast("请先选一个项目");
      return;
    }
    onViewCoreFile(file);
  };
  const openSessionsDir = async () => {
    if (!currentSlug) { onToast("请先选一个项目"); return; }
    const p = await join(workspace, "projects", currentSlug, "sessions");
    if (!(await exists(p))) {
      await createDir(p, { recursive: true });
    }
    openInOS(p, onToast);
  };

  return (
    <aside className="w-60 box-border h-full bg-paper border-r border-hairline flex flex-col shrink-0">
      <div className="h-14 px-4 flex items-center justify-between shrink-0">
        <button
          onClick={onSwitchWorkspace}
          className="flex items-center gap-2 text-[15px] font-semibold hover:opacity-70 transition-opacity"
          title="返回首页"
        >
          <span className="text-slate text-base font-normal -translate-y-px">◇</span>
          MemoryOS
        </button>
        <button className="w-6 h-6 text-ink-faint hover:text-ink-soft transition-colors">«</button>
      </div>

      <div className="flex-1 overflow-y-auto pt-2">
        <GroupHeader>WORKSPACE</GroupHeader>
        <Row icon={Home} label="工作区总览" onClick={openWorkspace} />
        <Row icon={Settings} label="设置" onClick={() => onToast("设置面板 V2.1 上线")} />
        {helpBannerDismissed && <Row icon={HelpCircle} label="帮助" onClick={onOpenHelp} />}

        <div className="h-6" />

        <GroupHeader action={<PlusBtn onClick={onNewProject} />}>PROJECTS</GroupHeader>
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

        <GroupHeader>CORE FILES</GroupHeader>
        <Row icon={FileText} label="about_me.md" onClick={() => handleCoreFile("about_me.md")} />
        <Row icon={FileText} label="00_context.md" onClick={() => handleCoreFile("00_context.md")} />
        <Row icon={FileText} label="decisions.md" onClick={() => handleCoreFile("decisions.md")} />
        <Row icon={FolderOpen} label={`sessions/ (${sessionsCount})`} onClick={openSessionsDir} />
      </div>

      <div className="h-10 px-4 flex items-center justify-between text-xs text-ink-soft border-t border-hairline shrink-0">
        <span className="inline-flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-ok inline-block" />
          本地模式
        </span>
        <button
          onClick={onSwitchWorkspace}
          className="text-ink-faint hover:text-slate transition-colors"
          title="返回首页"
        >
          返回首页
        </button>
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

function PlusBtn({ onClick }: { onClick?: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className="w-5 h-5 rounded text-ink-soft hover:bg-surface-soft flex items-center justify-center transition-colors"
      title="新建项目"
    >
      <Plus size={14} strokeWidth={1.5} />
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
};

function Row({ icon: Icon, label, selected, onClick, indent, trailing }: RowProps) {
  // Idle:    transparent + ink text
  // Selected (no hover): surface-soft + slate text/icon + 3px left bar
  // Hover (any state):   solid slate fill + white text/icon, bar hidden
  return (
    <div
      onClick={onClick}
      className={[
        "group relative h-9 pr-4 flex items-center gap-2.5 text-sm font-medium cursor-pointer",
        "transition-colors duration-150",
        indent ?? "pl-4",
        selected ? "bg-surface-soft text-slate" : "text-ink",
        "hover:bg-slate hover:text-white",
      ].join(" ")}
    >
      {selected && (
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
