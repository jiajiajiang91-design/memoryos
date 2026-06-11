import type { RefObject } from "react";
import { Sparkles, MessageCircle, CheckCircle2, ChevronRight } from "lucide-react";
import type { Project } from "../types";
import { tintFor } from "../lib/sourceTools";
import { useT } from "../lib/i18n";

type Props = {
  project: Project;
  scrollRef: RefObject<HTMLDivElement>;
  onOpenBootstrap?: () => void;
  /** 无 cards.md 时显示「升级为现行卡」（PRD·记忆质量升级 F3 迁移入口）。 */
  onMigrateCards?: () => void;
  /** 信任模式开关（06-10 用户拍板）：MCP 写回自动入库。 */
  onToggleTrustMode?: () => void;
};

export default function MetadataPanel({ project, scrollRef, onOpenBootstrap, onMigrateCards, onToggleTrustMode }: Props) {
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
    <aside className="w-60 shrink-0 box-border bg-surface rounded-2xl shadow-panel pt-4 pb-4 px-5 flex flex-col gap-3 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <Block label={t("meta.status")}>
        <span className="inline-flex items-center gap-2 text-sm border border-hairline rounded-full px-3.5 py-1.5 bg-surface shadow-sm">
          <span className="w-2 h-2 rounded-full bg-ok inline-block" />
          {project.statusLabel || t("meta.statusProgress")}
        </span>
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
        <div className="flex gap-2.5">
          <Stat icon={MessageCircle} label={t("meta.statSessions")} value={project.sessions.length} />
          <Stat icon={CheckCircle2} label={t("meta.statDecisions")} value={countDecisions(project.decisionsMarkdown)} />
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

      {onToggleTrustMode && (
        <Block label={t("meta.trustMode")}>
          <label className="flex items-start gap-2 cursor-pointer select-none">
            <button
              onClick={onToggleTrustMode}
              role="switch"
              aria-checked={!!project.mcpAutoApply}
              className={`mt-0.5 w-8 h-[18px] rounded-full relative transition-colors shrink-0 ${
                project.mcpAutoApply ? "bg-slate" : "bg-ink-faint/40"
              }`}
            >
              <span
                className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all ${
                  project.mcpAutoApply ? "left-[18px]" : "left-[2px]"
                }`}
              />
            </button>
            <span className="text-[11.5px] leading-[1.55] text-ink-soft">
              {t("meta.trustModeDesc")}
            </span>
          </label>
        </Block>
      )}

      {onMigrateCards && !project.cardsMarkdown.trim() && (
        <button
          onClick={onMigrateCards}
          title={t("migrate.btnTip")}
          className="w-full px-3 py-2.5 rounded-xl border border-slate/40 bg-surface text-[12px] text-slate hover:bg-slate/[.05] transition-colors inline-flex items-center justify-center gap-1.5 shadow-sm"
        >
          <Sparkles size={13} strokeWidth={1.5} />
          {t("migrate.btn")}
        </button>
      )}

      {onOpenBootstrap && (
        <button
          onClick={onOpenBootstrap}
          title={t("bootstrap.rebuildBtnTip")}
          className="w-full px-3 py-2.5 rounded-xl border border-hairline bg-surface text-[12px] text-ink-soft hover:text-slate hover:border-slate/40 transition-colors inline-flex items-center justify-center gap-1.5 shadow-sm"
        >
          <Sparkles size={13} strokeWidth={1.5} />
          {t("bootstrap.rebuildBtn")}
        </button>
      )}

      <div className="h-px bg-hairline" />

      <Block label={t("meta.pageNav")}>
        {/* 首项：透明重点色底 + 左侧蓝条（参考图样式）；其余项带右箭头 */}
        <button
          onClick={() => scrollTo("sec-goal")}
          className="relative w-full text-left mb-1 pl-4 pr-3 py-2 rounded-lg bg-slate/[.07] text-slate text-[13px] font-medium hover:bg-slate/[.1] transition-colors"
        >
          <span className="absolute left-1 top-2 bottom-2 w-[3px] rounded-full bg-slate" />
          {project.cardsMarkdown.trim() ? t("sidebar.cards") : t("dashboard.currentGoal")}
        </button>
        {!project.cardsMarkdown.trim() && project.contextMarkdown && (
          <button
            onClick={() => scrollTo("sec-state")}
            className="w-full text-left mb-1 pl-4 pr-2 py-2 rounded-lg text-[13px] text-ink-soft hover:bg-surface-soft transition-colors flex items-center justify-between"
          >
            {t("dashboard.currentState")}
            <ChevronRight size={14} strokeWidth={1.5} className="text-ink-faint" />
          </button>
        )}
        <button
          onClick={() => scrollTo("sec-sessions")}
          className="w-full text-left pl-4 pr-2 py-2 rounded-lg text-[13px] text-ink-soft hover:bg-surface-soft transition-colors flex items-center justify-between"
        >
          {t("dashboard.recentSessions")}
          <ChevronRight size={14} strokeWidth={1.5} className="text-ink-faint" />
        </button>
      </Block>
    </aside>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-ink-faint font-medium mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon?: React.ComponentType<any>; label: string; value: number }) {
  return (
    <div className="flex-1 border border-hairline rounded-xl py-2 px-2 text-center bg-surface">
      {Icon && <Icon size={15} strokeWidth={1.7} className="text-slate mx-auto mb-1" />}
      <div className="font-display text-lg font-semibold leading-tight tabular-nums">{value}</div>
      <div className="text-[11px] text-ink-soft mt-0.5">{label}</div>
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
