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

            <div className="mb-10 flex gap-3 flex-wrap">
              <button
                onClick={props.onCopyStartPrompt}
                className="h-10 px-4 rounded-md bg-surface border border-hairline text-ink font-medium text-sm inline-flex items-center gap-2 hover:bg-surface-soft transition-colors"
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
            </div>

            <hr className="border-hairline mb-6" />

            <section id="sec-goal" className="mb-10">
              <h2 className="text-lg font-semibold tracking-[-0.01em] mb-4">{t("dashboard.currentGoal")}</h2>
              {project.currentGoal && (
                <p className="text-[15px] leading-[1.75] mb-4">{project.currentGoal}</p>
              )}
              {project.currentGoalBullets.length > 0 && (
                <ul className="text-[15px] leading-[1.75] list-disc pl-5 mb-6">
                  {project.currentGoalBullets.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
              )}
              <div className="flex items-center gap-8 text-[13px] flex-wrap">
                {project.progress > 0 && (
                  <div className="inline-flex items-center gap-3">
                    <span className="text-ink-soft">{t("dashboard.progress")}</span>
                    <span className="inline-block w-20 h-1 bg-hairline rounded overflow-hidden">
                      <span className="block h-full bg-slate" style={{ width: `${project.progress}%` }} />
                    </span>
                    <span className="font-medium">{project.progress}%</span>
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

            <hr className="border-hairline mb-6" />

            <section id="sec-sessions" className="mb-20">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold tracking-[-0.01em]">{t("dashboard.recentSessions")}</h2>
                <button
                  onClick={props.onImport}
                  className="h-8 px-3 rounded-md border border-hairline text-[13px] font-medium inline-flex items-center gap-1.5 bg-surface hover:bg-paper transition-colors"
                >
                  <Plus size={14} strokeWidth={1.5} /> {t("dashboard.importHandoff")}
                </button>
              </div>
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

        <div className="h-8 flex items-center pl-16 border-t border-hairline text-[12px] text-ink-faint shrink-0">
          {t("dashboard.autosaved")}
        </div>
      </div>

      <MetadataPanel project={project} scrollRef={scrollRef} />
    </>
  );
}
