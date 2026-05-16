import type { RefObject } from "react";
import type { Project } from "../types";

type Props = {
  project: Project;
  scrollRef: RefObject<HTMLDivElement>;
};

const TOOL_TINTS: Record<string, string> = {
  ChatGPT: "bg-[#E8F0E8] text-[#3D6B3D]",
  Claude:  "bg-[#F5E8E0] text-[#A05536]",
  Cursor:  "bg-[#E8E8F0] text-[#3D3D6B]",
  Gemini:  "bg-[#F0E8F0] text-[#6B3D6B]",
};

export default function MetadataPanel({ project, scrollRef }: Props) {
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
    <aside className="w-60 shrink-0 box-border border-l border-hairline bg-paper pt-14 pb-8 px-6 flex flex-col gap-8 overflow-y-auto">
      <Block label="状态">
        <div className="flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-ok inline-block" />
          {project.statusLabel}
        </div>
      </Block>

      <Block label="时间">
        <div className="text-[13px] leading-[1.7]">
          <div className="flex justify-between">
            <span className="text-ink-soft">创建</span>
            <span className="tabular-nums">{project.createdAt.slice(0, 10)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-soft">更新</span>
            <span>{relativeTime(project.updatedAt)}</span>
          </div>
        </div>
      </Block>

      <Block label="统计">
        <div className="flex gap-4">
          <Stat label="Sessions" value={project.sessions.length} />
          <Stat label="Decisions" value={countDecisions(project.decisionsMarkdown)} />
          <Stat label="Goals" value={project.currentGoalBullets.length || 1} />
        </div>
      </Block>

      <Block label="使用 AI">
        {tools.length === 0 ? (
          <div className="text-[13px] text-ink-faint">—</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {tools.map((t) => (
              <span
                key={t}
                className={`h-[22px] px-2 rounded text-xs font-medium inline-flex items-center ${TOOL_TINTS[t] ?? "bg-surface-soft text-ink-soft"}`}
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </Block>

      <div className="h-px bg-hairline" />

      <Block label="页内导航">
        <button
          onClick={() => scrollTo("sec-goal")}
          className="block w-full text-left py-1.5 text-[13px] text-ink-soft hover:text-slate transition-colors"
        >
          当前目标
        </button>
        <button
          onClick={() => scrollTo("sec-sessions")}
          className="block w-full text-left py-1.5 text-[13px] text-ink-soft hover:text-slate transition-colors"
        >
          最近 Session
        </button>
      </Block>
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
  // count "## YYYY-MM-DD" headers
  return (md.match(/^##\s+\d{4}-\d{2}-\d{2}/gm) ?? []).length;
}

function relativeTime(iso: string) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 60) return "刚刚";
  if (sec < 3600) return `${Math.floor(sec / 60)} 分钟前`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} 小时前`;
  return `${Math.floor(sec / 86400)} 天前`;
}
