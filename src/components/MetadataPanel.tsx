import type { RefObject } from "react";
import { Sparkles } from "lucide-react";
import type { Project } from "../types";
import { tintFor } from "../lib/sourceTools";
import { useT } from "../lib/i18n";

type Props = {
  project: Project;
  scrollRef: RefObject<HTMLDivElement>;
  onOpenBootstrap?: () => void;
};

export default function MetadataPanel({ project, scrollRef, onOpenBootstrap }: Props) {
  const t = useT();
  const tools = Array.from(new Set(project.sessions.map((s) => s.sourceTool)));

  const scrollTo = (id: string) => {
    const root = scrollRef.current;
    if (!root) return;
    const el = root.querySelector("#" + id) as HTMLElement | null;
    if (!el) return;
    const top = el.offsetTop - root.offsetTop - 48;
    root.scrollTo({ top, behavior: "smooth" });
  };

  return (
    <aside className="w-60 shrink-0 box-border bg-surface-soft pt-14 pb-8 px-6 flex flex-col gap-8 overflow-y-auto">
      <Block label={t("meta.status")}>
        <div className="flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-ok inline-block" />
          {project.statusLabel || t("meta.statusProgress")}
        </div>
      </Block>

      <Block label={t("meta.time")}>
        <div className="text-[13px] leading-[1.7]">
          <div className="flex justify-between">
            <span className="text-ink-soft">{t("meta.created")}</span>
            <span className="tabular-nums">{project.createdAt.slice(0, 10)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-soft">{t("meta.updated")}</span>
            <span>{relativeTime(project.updatedAt, t)}</span>
          </div>
        </div>
      </Block>

      <Block label={t("meta.stats")}>
        <div className="flex gap-4">
          <Stat label={t("meta.statSessions")} value={project.sessions.length} />
          <Stat label={t("meta.statDecisions")} value={countDecisions(project.decisionsMarkdown)} />
        </div>
      </Block>

      <Block label={t("meta.usedAi")}>
        {tools.length === 0 ? (
          <div className="text-[13px] text-ink-faint">—</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {tools.map((tool) => (
              <span
                key={tool}
                className={`h-[22px] px-2 rounded text-xs font-medium inline-flex items-center ${tintFor(tool)}`}
              >
                {tool}
              </span>
            ))}
          </div>
        )}
      </Block>

      <div className="h-px bg-hairline" />

      <Block label={t("meta.pageNav")}>
        <button
          onClick={() => scrollTo("sec-goal")}
          className="block w-full text-left py-1.5 text-[13px] text-ink-soft hover:text-slate transition-colors"
        >
          {t("dashboard.currentGoal")}
        </button>
        {project.contextMarkdown && (
          <button
            onClick={() => scrollTo("sec-state")}
            className="block w-full text-left py-1.5 text-[13px] text-ink-soft hover:text-slate transition-colors"
          >
            {t("dashboard.currentState")}
          </button>
        )}
        <button
          onClick={() => scrollTo("sec-sessions")}
          className="block w-full text-left py-1.5 text-[13px] text-ink-soft hover:text-slate transition-colors"
        >
          {t("dashboard.recentSessions")}
        </button>
      </Block>

      {onOpenBootstrap && (
        <button
          onClick={onOpenBootstrap}
          title={t("bootstrap.rebuildBtnTip")}
          className="w-full px-3 py-2 rounded-md border border-hairline bg-surface text-[12px] text-ink-soft hover:bg-surface-soft hover:text-slate transition-colors inline-flex items-center justify-center gap-1.5"
        >
          <Sparkles size={13} strokeWidth={1.5} />
          {t("bootstrap.rebuildBtn")}
        </button>
      )}
    </aside>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-ink-faint font-medium mb-3">{label}</div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex-1">
      <div className="text-xl font-semibold leading-tight tabular-nums tracking-[-0.01em]">{value}</div>
      <div className="text-xs text-ink-soft mt-1">{label}</div>
    </div>
  );
}

function countDecisions(md: string) {
  const headingEntries = (md.match(/^###\s+.+/gm) ?? []).length;
  const boldEntries = (md.match(/^(?:-\s*)?\*\*[^*\n]+\*\*/gm) ?? []).length;
  const datedEntries = (md.match(/^\s*\d{4}[-.\/]\d{1,2}[-.\/]\d{1,2}\s*[｜|｜·:：—-]+\s*\S+/gm) ?? []).length;
  return headingEntries + boldEntries + datedEntries;
}

function relativeTime(iso: string, t: (key: string, vars?: Record<string, string | number>) => string) {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return t("common.justNow");
  if (sec < 3600) return t("common.minutesAgo", { n: Math.floor(sec / 60) });
  if (sec < 86400) return t("common.hoursAgo", { n: Math.floor(sec / 3600) });
  return t("common.daysAgo", { n: Math.floor(sec / 86400) });
}
