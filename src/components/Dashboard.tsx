import { useRef } from "react";
import { Copy, Plus, Play, Sparkles, ChevronRight } from "lucide-react";
import type { Project } from "../types";
import MetadataPanel from "./MetadataPanel";
import HelpBanner from "./HelpBanner";

type Props = {
  project: Project;
  helpBannerDismissed: boolean;
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

const TOOL_TINTS: Record<string, string> = {
  ChatGPT: "bg-[#E8F0E8] text-[#3D6B3D]",
  Claude:  "bg-[#F5E8E0] text-[#A05536]",
  Cursor:  "bg-[#E8E8F0] text-[#3D3D6B]",
  Gemini:  "bg-[#F0E8F0] text-[#6B3D6B]",
};

export default function Dashboard(props: Props) {
  const { project } = props;
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <div className="flex-1 flex flex-col min-w-0 bg-paper">
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="pl-16 pr-6 pt-12 max-w-[808px]">
            <div className="text-xs text-ink-soft mb-12">
              Projects <span className="text-ink-faint mx-1.5">/</span>
              <span className="text-ink">{project.name}</span>
            </div>

            <h1 className="text-[32px] leading-[1.25] tracking-[-0.02em] font-semibold mb-2">
              {project.name}
            </h1>
            <p className="text-[15px] text-ink-faint mb-10 leading-relaxed">
              {project.description || "—"} {project.description && "— 跨 AI 的工作记忆系统，沉淀项目知识与决策。"}
            </p>

            {!props.helpBannerDismissed && (
              <HelpBanner onOpen={props.onOpenHelp} onDismiss={props.onDismissBanner} />
            )}

            {(props.bootstrapNeeds.needsAboutMe || props.bootstrapNeeds.needsContext) && (
              <button
                onClick={props.onOpenBootstrap}
                className="w-full mb-6 px-4 py-3 bg-[#FFF5E1] border border-[#EAD9A8] rounded-lg flex items-center gap-3 hover:bg-[#FFEFD0] transition-colors text-left"
              >
                <Sparkles size={18} strokeWidth={1.5} className="text-[#A37A1C] shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium text-ink">
                    {props.bootstrapNeeds.needsAboutMe && props.bootstrapNeeds.needsContext
                      ? "你的「关于我」和「项目背景」还是空的"
                      : props.bootstrapNeeds.needsAboutMe
                      ? "你的「关于我」还是空的"
                      : "这个项目的「项目背景」还是空的"}
                  </div>
                  <div className="text-[12px] text-ink-soft mt-0.5">
                    让 AI 帮你 30 秒整理一份初始内容
                  </div>
                </div>
                <ChevronRight size={16} strokeWidth={1.5} className="text-ink-soft shrink-0" />
              </button>
            )}

            <div className="mb-10 flex gap-3 flex-wrap">
              <button
                onClick={props.onCopyStartPrompt}
                className="h-10 px-4 rounded-md bg-surface border border-hairline text-ink font-medium text-sm inline-flex items-center gap-2 hover:bg-surface-soft transition-colors"
                title="开始新对话时,把这段复制给 AI,让它读取你的上下文"
              >
                <Play size={16} strokeWidth={1.5} />
                复制开始 Session 指令
              </button>
              <button
                onClick={props.onCopyPrompt}
                className="h-10 px-4 rounded-md bg-slate text-white font-medium text-sm inline-flex items-center gap-2 hover:opacity-90 transition-opacity"
                title="工作结束时,把这段复制给 AI,让它生成 handoff"
              >
                <Copy size={16} strokeWidth={1.5} />
                复制结束 Session 指令
              </button>
            </div>

            <hr className="border-hairline mb-6" />

            <section id="sec-goal" className="mb-10">
              <h2 className="text-lg font-semibold tracking-[-0.01em] mb-4">当前目标</h2>
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
                    <span className="text-ink-soft">进度</span>
                    <span className="inline-block w-20 h-1 bg-hairline rounded overflow-hidden">
                      <span className="block h-full bg-slate" style={{ width: `${project.progress}%` }} />
                    </span>
                    <span className="font-medium">{project.progress}%</span>
                  </div>
                )}
                {project.focus && (
                  <div className="inline-flex items-center gap-3">
                    <span className="text-ink-soft">聚焦</span>
                    <span>{project.focus}</span>
                  </div>
                )}
              </div>
            </section>

            <hr className="border-hairline mb-6" />

            <section id="sec-sessions" className="mb-20">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold tracking-[-0.01em]">最近 Session</h2>
                <button
                  onClick={props.onImport}
                  className="h-8 px-3 rounded-md border border-hairline text-[13px] font-medium inline-flex items-center gap-1.5 bg-surface hover:bg-paper transition-colors"
                >
                  <Plus size={14} strokeWidth={1.5} /> 导入 Handoff
                </button>
              </div>
              {project.sessions.length === 0 ? (
                <div className="border border-dashed border-hairline rounded-lg py-12 px-6 text-center">
                  <div className="text-ink-soft font-medium mb-1">No sessions yet.</div>
                  <div className="text-ink-faint text-sm">点上方按钮生成第一份 handoff。</div>
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
                        <span className={`h-[22px] w-[60px] rounded text-xs font-medium inline-flex items-center justify-center ${TOOL_TINTS[s.sourceTool] ?? "bg-surface-soft text-ink-soft"}`}>
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
                      在文件夹中查看全部 Session →
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
          已自动保存 · 刚刚
        </div>
      </div>

      <MetadataPanel project={project} scrollRef={scrollRef} />
    </>
  );
}
