import { useMemo, useState } from "react";
import { Check, AlertTriangle, FileText } from "lucide-react";
import type { Project, ParsedHandoff, UpdateSuggestion } from "../types";

type Props = {
  project: Project;
  raw: string;
  parsed: ParsedHandoff;
  onCancel: () => void;
  onSave: (suggestions: UpdateSuggestion[]) => void;
};

const RISK_LABEL_COLOR: Record<UpdateSuggestion["riskLevel"], string> = {
  low: "text-ink-soft",
  medium: "text-[#A05536]",
  high: "text-warn",
};

export default function ReviewPage({ project, raw, parsed, onCancel, onSave }: Props) {
  const [suggestions, setSuggestions] = useState<UpdateSuggestion[]>(() => buildSuggestions(parsed));
  const toggle = (id: string) =>
    setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, selected: !s.selected } : s)));
  const selectedCount = suggestions.filter((s) => s.selected).length;

  const sections = useMemo(() => [
    { label: "Metadata", count: `${Object.keys(parsed.metadata).length} items` },
    { label: "What We Worked On", count: bulletCount(parsed.whatWeWorkedOn) },
    { label: "Key Decisions", count: decisionCount(parsed.keyDecisions) },
    { label: "Current State", count: parsed.currentState ? `${parsed.currentState.length} chars` : "—" },
    { label: "Open Questions", count: bulletCount(parsed.openQuestions) },
    { label: "Next Actions", count: bulletCount(parsed.nextActions) },
    { label: "Compact Context", count: `${parsed.compactContext.length} chars` },
  ], [parsed]);

  const filename = useMemo(previewFilename, []);

  // suppress unused-var warning for `raw` (it's saved by parent)
  void raw;

  return (
    <div className="flex-1 flex flex-col bg-paper min-w-0">
      <div className="flex-1 overflow-y-auto">
        <div className="pl-16 pr-12 pt-12 pb-12 max-w-[832px]">
          <div className="text-xs text-ink-soft mb-6">
            Projects <span className="text-ink-faint mx-1.5">/</span>{project.name}
            <span className="text-ink-faint mx-1.5">/</span>
            <span className="text-ink">Review Handoff</span>
          </div>
          <h1 className="text-[32px] font-semibold tracking-[-0.02em] leading-[1.25] mb-2">
            Review Session Handoff
          </h1>
          <div className="inline-flex items-center gap-2.5 text-[13px] text-ink-soft mb-12">
            <FileText size={14} strokeWidth={1.5} />
            <span className="font-mono text-ink">{filename}</span>
            <span className="text-ink-faint">·</span>
            <span className="text-ok">Ready to save.</span>
          </div>

          <h2 className="text-lg font-semibold mb-4">Parsed sections</h2>
          <div className="mb-20">
            {sections.map((s, i) => (
              <div
                key={i}
                className={`flex items-center gap-2.5 py-1.5 text-sm ${i < sections.length - 1 ? "border-b border-hairline" : ""}`}
              >
                <Check size={14} strokeWidth={1.5} className="text-ok" />
                <span className="flex-1">{s.label}</span>
                <span className="text-xs text-ink-faint">{s.count}</span>
              </div>
            ))}
          </div>

          <hr className="border-hairline mb-12" />

          <h2 className="text-lg font-semibold mb-6">Suggested Updates</h2>
          {(["low", "medium", "high"] as const).map((risk) => {
            const list = suggestions.filter((s) => s.riskLevel === risk);
            if (!list.length) return null;
            return (
              <div key={risk} className="mb-8">
                <div className="flex items-center gap-2.5 mb-1">
                  <RiskDot level={risk} />
                  <span className={`text-xs font-semibold tracking-wider ${RISK_LABEL_COLOR[risk]}`}>
                    {risk.toUpperCase()} RISK
                  </span>
                  <div className="flex-1 h-px bg-hairline" />
                </div>
                {list.map((s) => (
                  <SuggestionRow key={s.id} s={s} onToggle={() => toggle(s.id)} />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-hairline bg-paper flex items-center justify-between pl-16 pr-12 shrink-0 py-4">
        <span className="text-[13px] text-ink-soft">
          {selectedCount} of {suggestions.length} selected
        </span>
        <div className="flex gap-3">
          <button onClick={onCancel} className="h-9 px-3 rounded-md border border-hairline text-[13px] font-medium hover:bg-paper bg-surface transition-colors">
            Cancel
          </button>
          <button onClick={() => onSave(suggestions)} className="h-9 px-3 rounded-md bg-slate text-white text-[13px] font-medium hover:opacity-90 transition-opacity">
            Save Selected
          </button>
        </div>
      </div>
    </div>
  );
}

function buildSuggestions(p: ParsedHandoff): UpdateSuggestion[] {
  const out: UpdateSuggestion[] = [];
  out.push({ id: "save-session", targetFile: "session", riskLevel: "low", content: "", selected: true });
  if (p.suggestedContextUpdate && !/no update/i.test(p.suggestedContextUpdate))
    out.push({ id: "ctx", targetFile: "00_context.md", riskLevel: "medium", content: p.suggestedContextUpdate, selected: false });
  if (p.suggestedDecisionsUpdate && !/no update/i.test(p.suggestedDecisionsUpdate))
    out.push({ id: "dec", targetFile: "decisions.md", riskLevel: "medium", content: p.suggestedDecisionsUpdate, selected: false });
  if (p.suggestedAboutMeUpdate && !/no update/i.test(p.suggestedAboutMeUpdate))
    out.push({
      id: "aboutme",
      targetFile: "about_me.md",
      riskLevel: "high",
      content: p.suggestedAboutMeUpdate,
      selected: false,
      warning: "about_me 是长期身份记忆，只勾选稳定且长期的偏好。",
    });
  return out;
}

function SuggestionRow({ s, onToggle }: { s: UpdateSuggestion; onToggle: () => void }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <button
        onClick={onToggle}
        className={`mt-0.5 w-4 h-4 rounded-sm border-[1.5px] flex items-center justify-center shrink-0 transition-colors ${s.selected ? "bg-slate border-slate" : "bg-white border-ink-faint"}`}
      >
        {s.selected && (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 6.2 4.8 8.5 9.5 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <div className="flex-1">
        <div className="text-sm font-medium mb-1">
          {s.riskLevel === "low" ? "Save session file" : `Append to ${s.targetFile}`}
        </div>
        {s.warning && (
          <div className="flex items-start gap-1.5 text-xs text-warn mb-2 bg-warn/[.04] px-2.5 py-1.5 rounded">
            <AlertTriangle size={12} strokeWidth={1.75} className="mt-0.5 shrink-0" />
            <span className="leading-[1.5]">{s.warning}</span>
          </div>
        )}
        {s.content && (
          <div className="text-[13px] text-ink-soft leading-[1.6] px-3 py-2.5 bg-paper border-l-2 border-hairline whitespace-pre-wrap">
            <span className="text-ink-faint text-xs block mb-1">▸ Preview</span>
            {s.content}
          </div>
        )}
      </div>
    </div>
  );
}

function RiskDot({ level }: { level: "low" | "medium" | "high" }) {
  if (level === "high") return <span className="w-2.5 h-2.5 rounded-full bg-warn inline-block" />;
  if (level === "medium")
    return (
      <span
        className="w-2.5 h-2.5 rounded-full border-[1.5px] border-ochre inline-block"
        style={{ background: "linear-gradient(90deg, #D4A571 50%, transparent 50%)" }}
      />
    );
  return <span className="w-2.5 h-2.5 rounded-full border-[1.5px] border-ink-faint inline-block" />;
}

function bulletCount(s: string) {
  const n = (s.match(/^[-*]/gm) ?? []).length;
  return n ? `${n} bullets` : "—";
}
function decisionCount(s: string) {
  const n = (s.match(/Decision:/g) ?? []).length;
  return n ? `${n} items` : "—";
}
function previewFilename() {
  const now = new Date();
  const d = now.toISOString().slice(0, 10);
  const t = now.toTimeString().slice(0, 5).replace(":", "");
  return `session_${d}_${t}.md`;
}
