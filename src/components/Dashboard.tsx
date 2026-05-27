import { useRef } from "react";
import { Copy, Plus, Play, Sparkles, ChevronRight } from "lucide-react";
import type { Project } from "../types";
import MetadataPanel from "./MetadataPanel";
import HelpBanner from "./HelpBanner";
import { tintFor } from "../lib/sourceTools";
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
      <div className="flex-1 flex flex-col min-w-0 bg-paper">
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
                className="w-full mb-6 px-4 py-3 bg-[#FFF5E1] border border-[#EAD9A8] rounded-lg flex items-center gap-3 hover:bg-[#FFEFD0] transition-colors text-left"
              >
                <Sparkles size={18} strokeWidth={1.5} className="text-[#A37A1C] shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium text-ink">{bootstrapMessage()}</div>
                  <div className="text-[12px] text-ink-soft mt-0.5">{t("bootstrap.bannerHint")}</div>
                </div>
                <ChevronRight size={16} strokeWidth={1.5} className="text-ink-soft shrink-0" />
              </button>
            )}

            <div className="mb-10 flex gap-3 flex-wrap items-center">
              <button
                onClick={props.onCopyStartPrompt}
                className="h-10 px-4 rounded-md bg-surface border border-slate text-slate font-medium text-sm inline-flex items-center gap-2 hover:bg-surface-soft transition-colors"
                title={t("dashboard.copyStartPromptHint")}
              >
                <Play size={16} strokeWidth={1.5} />
                {t("dashboard.copyStartPrompt")}
              </button>
              <button
                onClick={props.onCopyPrompt}
                className="h-10 px-4 rounded-md bg-slate text-white font-medium text-sm inline-flex items-center gap-2 hover:opacity-90 transition-opacity"
                title={t("dashboard.copyEndPromptHint")}
              >
                <Copy size={16} strokeWidth={1.5} />
                {t("dashboard.copyEndPrompt")}
              </button>
              <button
                onClick={props.onImport}
                className="ml-auto h-10 px-4 rounded-md bg-slate text-white font-medium text-sm inline-flex items-center gap-2 hover:opacity-90 transition-opacity"
                title={t("dashboard.importHandoffHint")}
              >
                <Plus size={16} strokeWidth={1.5} />
                {t("dashboard.importHandoff")}
              </button>
            </div>

            <hr className="border-hairline mb-6" />

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

      <MetadataPanel project={project} scrollRef={scrollRef} onOpenBootstrap={props.onOpenBootstrap} />
    </>
  );
}

function extractCurrentState(md: string): string | null {
  if (!md) return null;
  const re = /(?:^|\n)\s*#{1,3}\s*(?:当前状态|Current state|Current State|当前进展|当前情况)[^\n]*\n([\s\S]*?)(?=\n\s*#{1,3}\s|\n---|\n\s*\n_Updated|$)/i;
  const m = md.match(re);
  if (!m?.[1]) return null;
  const dedented = m[1].split("\n").map((l) => l.replace(/^ {1,4}/, "")).join("\n").trim();
  return dedented || null;
}

function MarkdownLite({ source }: { source: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = source.split("\n");
  let listItems: { indent: number; html: string }[] = [];

  const flushList = () => {
    if (!listItems.length) return;
    blocks.push(
      <ul key={blocks.length}>
        {listItems.map((it, i) => (
          <li key={i} style={{ marginLeft: it.indent * 16 }} dangerouslySetInnerHTML={{ __html: it.html }} />
        ))}
      </ul>
    );
    listItems = [];
  };

  const renderInline = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-surface-soft text-[12px]">$1</code>');

  for (const raw of lines) {
    const line = raw.trimEnd();
    const listMatch = line.match(/^(\s*)[-*]\s+(.+)/);
    const headMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (listMatch) {
      const indent = Math.floor(listMatch[1].length / 2);
      listItems.push({ indent, html: renderInline(listMatch[2]) });
    } else if (headMatch) {
      flushList();
      const level = headMatch[1].length;
      const size = level <= 2 ? "text-[15px]" : "text-[14px]";
      blocks.push(
        <div key={blocks.length} className={`${size} font-semibold mt-3 mb-1`} dangerouslySetInnerHTML={{ __html: renderInline(headMatch[2]) }} />
      );
    } else if (line.trim()) {
      flushList();
      blocks.push(<p key={blocks.length} className="my-2" dangerouslySetInnerHTML={{ __html: renderInline(line) }} />);
    } else {
      flushList();
    }
  }
  flushList();
  return <>{blocks}</>;
}
