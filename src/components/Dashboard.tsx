import { useRef } from "react";
import {
  Copy, Plus, Play, Sparkles, ChevronRight, Inbox, Pencil,
  LayoutGrid, Briefcase, Activity, ShieldCheck, MessagesSquare, Archive, FileText,
} from "lucide-react";
import type { Project } from "../types";
import MetadataPanel from "./MetadataPanel";
import HelpBanner from "./HelpBanner";
import { tintFor } from "../lib/sourceTools";
import MarkdownLite from "./MarkdownLite";
import { useT } from "../lib/i18n";

type Props = {
  project: Project;
  bannerDismissed: boolean;
  onDismissBanner: () => void;
  onOpenHelp: () => void;
  onCopyStartPrompt: () => void;
  onCopyPrompt: () => void;
  onImport: () => void;
  onOpenSession: (filename: string) => void;
  onOpenSessionsDir: () => void;
  bootstrapNeeds: { needsAboutMe: boolean; needsContext: boolean };
  onOpenBootstrap: () => void;
  /** 旧项目「升级为现行卡」入口（无 cards.md 时显示，PRD·记忆质量升级 F3 迁移）。 */
  onMigrateCards: () => void;
  /** 正文记忆卡片区的「编辑」→ 打开 cards.md 查看/编辑。 */
  onEditCards: () => void;
  /** 记忆库（条目双视图，记忆展示形态第 1 轮）。 */
  onOpenEntryLib: () => void;
  /** AI 开场读什么：false=记忆卡片，true=记忆库（07-04 确认的注入来源开关）。 */
  entryInjectionOn: boolean;
  onToggleInjection: () => void;
  /** 信任模式开关（06-10 用户确认）。 */
  onToggleTrustMode: () => void;
  /** Inbox 里 status=pending 的条数；>0 时显示「待审」入口。 */
  pendingInboxCount: number;
  /** 点「待审」打开最早一条 pending 的 review。 */
  onReviewPending: () => void;
};

export default function Dashboard(props: Props) {
  const t = useT();
  const { project } = props;
  const scrollRef = useRef<HTMLDivElement>(null);

  const bootstrapMessage = () => {
    if (props.bootstrapNeeds.needsAboutMe && props.bootstrapNeeds.needsContext) return t("bootstrap.bothEmpty");
    if (props.bootstrapNeeds.needsAboutMe) return t("bootstrap.aboutMeEmpty");
    return t("bootstrap.contextEmpty");
  };

  return (
    <>
      <div className="flex-1 flex flex-col min-w-0 bg-surface rounded-2xl shadow-panel overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="pl-16 pr-6 pt-12 max-w-[808px]">
            <div className="text-xs text-ink-soft mb-12">
              {t("sidebar.projects")} <span className="text-ink-faint mx-1.5">/</span>
              <span className="text-ink">{project.name}</span>
            </div>

            <h1 className="text-[32px] leading-[1.25] tracking-[-0.02em] font-semibold mb-2">
              {project.name}
            </h1>
            <p className="text-[15px] text-ink-faint mb-10 leading-relaxed">
              {project.description || "—"}
            </p>

            {!props.bannerDismissed && (
              <HelpBanner onOpen={props.onOpenHelp} onDismiss={props.onDismissBanner} />
            )}

            {(props.bootstrapNeeds.needsAboutMe || props.bootstrapNeeds.needsContext) && (
              <button
                onClick={props.onOpenBootstrap}
                className="w-full mb-6 px-4 py-3 bg-[#FFF5E1] border border-[#EAD9A8] rounded-xl flex items-center gap-3 hover:bg-[#FFEFD0] transition-colors text-left"
              >
                <Sparkles size={18} strokeWidth={1.5} className="text-[#A37A1C] shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium text-ink">{bootstrapMessage()}</div>
                  <div className="text-[12px] text-ink-soft mt-0.5">{t("bootstrap.bannerHint")}</div>
                </div>
                <ChevronRight size={16} strokeWidth={1.5} className="text-ink-soft shrink-0" />
              </button>
            )}

            {/* 旧项目转化引导（2026-06-11 确认：每步操作引导旧格式转向记忆卡片）：
                有旧资料但没卡片 → 黄色横幅进「整理项目记忆」。needsContext 时上面的引导横幅已覆盖。 */}
            {!project.cardsMarkdown.trim() && !props.bootstrapNeeds.needsContext && (
              <button
                onClick={props.onMigrateCards}
                className="w-full mb-6 px-4 py-3 bg-[#FFF5E1] border border-[#EAD9A8] rounded-xl flex items-center gap-3 hover:bg-[#FFEFD0] transition-colors text-left"
              >
                <Sparkles size={18} strokeWidth={1.5} className="text-[#A37A1C] shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium text-ink">{t("dashboard.migrateBannerTitle")}</div>
                  <div className="text-[12px] text-ink-soft mt-0.5">{t("dashboard.migrateBannerHint")}</div>
                </div>
                <ChevronRight size={16} strokeWidth={1.5} className="text-ink-soft shrink-0" />
              </button>
            )}

            <div className="mb-10 flex gap-3 flex-wrap items-center">
              <button
                onClick={props.onCopyStartPrompt}
                className="h-10 px-4 rounded-lg bg-surface border border-hairline shadow-btn text-ink font-medium text-sm inline-flex items-center gap-2 hover:border-slate/40 hover:text-slate hover:-translate-y-px hover:shadow-btn-hover transition-all"
                title={t("dashboard.copyStartPromptHint")}
              >
                <Play size={16} strokeWidth={1.5} />
                {t("dashboard.copyStartPrompt")}
              </button>
              <button
                onClick={props.onCopyPrompt}
                className="h-10 px-4 rounded-lg bg-surface border border-hairline shadow-btn text-ink font-medium text-sm inline-flex items-center gap-2 hover:border-slate/40 hover:text-slate hover:-translate-y-px hover:shadow-btn-hover transition-all"
                title={t("dashboard.copyEndPromptHint")}
              >
                <Copy size={16} strokeWidth={1.5} />
                {t("dashboard.copyEndPrompt")}
              </button>
              <button
                onClick={props.onOpenEntryLib}
                className="h-10 px-4 rounded-lg bg-slate text-white shadow-btn font-medium text-sm inline-flex items-center gap-2 hover:-translate-y-px hover:shadow-btn-hover transition-all"
              >
                <LayoutGrid size={16} strokeWidth={1.5} />
                {t("entryLib.open")}
              </button>
              {props.pendingInboxCount > 0 && (
                <button
                  onClick={props.onReviewPending}
                  className="ml-auto h-10 px-4 rounded-lg bg-[#FFF5E1] border border-[#EAD9A8] text-[#A37A1C] font-medium text-sm inline-flex items-center gap-2 hover:bg-[#FFEFD0] transition-colors"
                  title={t("dashboard.pendingBadgeHint", { n: props.pendingInboxCount })}
                >
                  <Inbox size={16} strokeWidth={1.5} />
                  {t("dashboard.reviewPending", { n: props.pendingInboxCount })}
                </button>
              )}
              <button
                onClick={props.onImport}
                className={`${props.pendingInboxCount > 0 ? "" : "ml-auto "}h-10 px-5 rounded-lg bg-slate text-white font-medium text-sm inline-flex items-center gap-2 shadow-ikb hover:opacity-90 hover:-translate-y-px transition-all`}
                title={t("dashboard.importHandoffHint")}
              >
                <Plus size={16} strokeWidth={1.5} />
                {t("dashboard.importHandoff")}
              </button>
            </div>

            <div className="mb-8 px-4 py-3 rounded-xl border border-hairline bg-surface-soft flex items-center gap-3 flex-wrap">
              <span className="text-[13px] font-medium text-ink shrink-0">{t("dashboard.injectionTitle")}</span>
              <div className="flex rounded-lg border border-hairline overflow-hidden text-[13px] bg-surface">
                <button
                  onClick={() => props.entryInjectionOn && props.onToggleInjection()}
                  className={`h-8 px-3.5 transition-colors ${
                    !props.entryInjectionOn ? "bg-slate text-white font-medium" : "text-ink-soft hover:text-ink"
                  }`}
                >
                  {t("dashboard.injectionCards")}
                </button>
                <button
                  onClick={() => !props.entryInjectionOn && props.onToggleInjection()}
                  className={`h-8 px-3.5 transition-colors ${
                    props.entryInjectionOn ? "bg-slate text-white font-medium" : "text-ink-soft hover:text-ink"
                  }`}
                >
                  {t("dashboard.injectionEntries")}
                </button>
              </div>
              <span className="text-[12px] text-ink-faint leading-relaxed flex-1 min-w-[200px]">
                {t("dashboard.injectionHint")}
              </span>
            </div>

            <hr className="border-hairline mb-6" />

            {project.cardsMarkdown.trim() ? (
              // ── 记忆卡片模式：正文直接展示卡片本体（所见即所注，PRD·记忆质量升级 F3）──
              <section id="sec-goal" className="mb-10">
                <div className="flex items-center gap-2.5 mb-1">
                  <LayoutGrid size={17} strokeWidth={1.6} className="text-slate" />
                  <h2 className="text-lg font-semibold tracking-[-0.01em]">{t("sidebar.cards")}</h2>
                  <button
                    onClick={props.onEditCards}
                    className="ml-auto text-[13px] text-slate hover:opacity-75 transition-opacity inline-flex items-center gap-1"
                  >
                    <Pencil size={13} strokeWidth={1.5} />
                    {t("review.editBtn")}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  {splitCardsSections(project.cardsMarkdown).map((c, i) => {
                    const CardIcon = iconForCard(c.title);
                    return (
                      <div
                        key={i}
                        className={`border border-hairline/70 rounded-2xl p-4 bg-surface-soft/70 hover:border-slate/25 transition-colors ${i === 0 ? "col-span-2" : ""}`}
                      >
                        <div className="flex items-center gap-2 text-[13px] font-semibold mb-2">
                          <CardIcon size={15} strokeWidth={1.7} className="text-slate shrink-0" />
                          {c.title}
                        </div>
                        <div className="text-[13px] leading-[1.7] text-ink-soft [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1.5 [&_li]:my-0.5">
                          <MarkdownLite source={c.body} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-8 text-[13px] flex-wrap mt-5">
                  <div className="inline-flex items-center gap-3">
                    <span className="text-ink-soft">{t("dashboard.totalSessions")}</span>
                    <span className="font-medium">{project.sessions.length}</span>
                  </div>
                  {project.sessions.length > 0 && (
                    <div className="inline-flex items-center gap-3">
                      <span className="text-ink-soft">{t("dashboard.lastSession")}</span>
                      <span className="font-medium">{project.sessions[0].date} · {project.sessions[0].sourceTool}</span>
                    </div>
                  )}
                </div>
              </section>
            ) : (
              <>
                <section id="sec-goal" className="mb-10">
                  <h2 className="text-lg font-semibold tracking-[-0.01em] mb-4">{t("dashboard.currentGoal")}</h2>
                  {project.currentGoal ? (
                    <p className="text-[15px] leading-[1.75] mb-4">{project.currentGoal}</p>
                  ) : project.sessions.length > 0 ? (
                    <p className="text-[15px] leading-[1.75] mb-4 text-ink-soft">
                      {project.sessions[0].sessionGoal}
                    </p>
                  ) : null}
                  {project.currentGoalBullets.length > 0 && (
                    <ul className="text-[15px] leading-[1.75] list-disc pl-5 mb-6">
                      {project.currentGoalBullets.map((b, i) => <li key={i}>{b}</li>)}
                    </ul>
                  )}
                  <div className="flex items-center gap-8 text-[13px] flex-wrap">
                    <div className="inline-flex items-center gap-3">
                      <span className="text-ink-soft">{t("dashboard.totalSessions")}</span>
                      <span className="font-medium">{project.sessions.length}</span>
                    </div>
                    {project.sessions.length > 0 && (
                      <div className="inline-flex items-center gap-3">
                        <span className="text-ink-soft">{t("dashboard.lastSession")}</span>
                        <span className="font-medium">{project.sessions[0].date} · {project.sessions[0].sourceTool}</span>
                      </div>
                    )}
                    {project.focus && (
                      <div className="inline-flex items-center gap-3">
                        <span className="text-ink-soft">{t("dashboard.focus")}</span>
                        <span>{project.focus}</span>
                      </div>
                    )}
                  </div>
                </section>

                {extractCurrentState(project.contextMarkdown) && (
                  <section id="sec-state" className="mb-10">
                    <h2 className="text-lg font-semibold tracking-[-0.01em] mb-4">{t("dashboard.currentState")}</h2>
                    <div className="text-[14px] leading-[1.75] [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1.5 [&_li]:my-0.5">
                      <MarkdownLite source={extractCurrentState(project.contextMarkdown)!} />
                    </div>
                  </section>
                )}
              </>
            )}

            <hr className="border-hairline mb-6" />

            <section id="sec-sessions" className="mb-20">
              <h2 className="text-lg font-semibold tracking-[-0.01em] mb-4">{t("dashboard.recentSessions")}</h2>
              {project.sessions.length === 0 ? (
                <div className="border border-dashed border-hairline rounded-lg py-12 px-6 text-center">
                  <div className="text-ink-soft font-medium mb-1">{t("dashboard.noSessions")}</div>
                  <div className="text-ink-faint text-sm">{t("dashboard.noSessionsHint")}</div>
                </div>
              ) : (
                <>
                  <div className="-mx-3">
                    {project.sessions.map((s) => (
                      <div
                        key={s.filename}
                        onClick={() => props.onOpenSession(s.filename)}
                        className="h-12 px-3 flex items-center gap-4 rounded-md hover:bg-surface-soft cursor-pointer transition-colors"
                      >
                        <span className="w-24 text-[13px] text-ink-soft tabular-nums shrink-0">
                          {s.date} · {s.time}
                        </span>
                        <span className={`h-[22px] min-w-[60px] px-2 rounded text-xs font-medium inline-flex items-center justify-center ${tintFor(s.sourceTool)}`}>
                          {s.sourceTool}
                        </span>
                        <span className="text-[15px] flex-1 truncate">{s.sessionGoal}</span>
                      </div>
                    ))}
                  </div>
                  <div className="text-center mt-4">
                    <button
                      onClick={props.onOpenSessionsDir}
                      className="text-[13px] font-medium text-slate hover:opacity-80 transition-opacity"
                    >
                      {t("dashboard.viewAllSessions")}
                    </button>
                  </div>
                </>
              )}
            </section>

            <hr className="border-hairline" />
            <div className="h-16" />
          </div>
        </div>

      </div>

      <MetadataPanel project={project} scrollRef={scrollRef} onOpenBootstrap={props.onOpenBootstrap} onMigrateCards={props.onMigrateCards} onToggleTrustMode={props.onToggleTrustMode} />
    </>
  );
}

/** 卡片标题 → 图标（中英标题都认；认不出用文档图标）。 */
function iconForCard(title: string): React.ComponentType<any> {
  const tl = title.toLowerCase();
  if (title.includes("项目") || tl.includes("project")) return Briefcase;
  if (title.includes("状态") || tl.includes("state")) return Activity;
  if (title.includes("决策") || tl.includes("decision")) return ShieldCheck;
  if (title.includes("总结") || tl.includes("summary") || tl.includes("session")) return MessagesSquare;
  if (title.includes("档案") || tl.includes("archive")) return Archive;
  return FileText;
}

/** 把 cards.md 按 `## ` 切成卡片（跳过 `# 标题` 和 `> 整理于` 行）。 */
function splitCardsSections(md: string): { title: string; body: string }[] {
  const out: { title: string; body: string }[] = [];
  const parts = md.split(/\n(?=##\s)/);
  for (const part of parts) {
    const m = part.match(/^##\s+(.+?)\s*\n([\s\S]*)$/);
    if (!m) continue; // 第一块是 # 标题 + 版本戳，跳过
    out.push({ title: m[1].trim(), body: m[2].trim() });
  }
  return out;
}

function extractCurrentState(md: string): string | null {
  if (!md) return null;
  const re = /(?:^|\n)\s*#{1,3}\s*(?:当前状态|Current state|Current State|当前进展|当前情况)[^\n]*\n([\s\S]*?)(?=\n\s*#{1,3}\s|\n---|\n\s*\n_Updated|$)/i;
  const m = md.match(re);
  if (!m?.[1]) return null;
  const dedented = m[1].split("\n").map((l) => l.replace(/^ {1,4}/, "")).join("\n").trim();
  return dedented || null;
}

