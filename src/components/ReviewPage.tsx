import { useMemo, useState } from "react";
import { Check, AlertTriangle, FileText } from "lucide-react";
import type { Project, ParsedHandoff, UpdateSuggestion } from "../types";
import { useT } from "../lib/i18n";

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
  const t = useT();
  const [suggestions, setSuggestions] = useState<UpdateSuggestion[]>(() => buildSuggestions(parsed));
  const toggle = (id: string) =>
    setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, selected: !s.selected } : s)));
  const selectedCount = suggestions.filter((s) => s.selected).length;

  const friendlyFile = (name: string): string =>
    name === "about_me.md" ? t("sidebar.aboutMe") :
    name === "00_context.md" ? t("sidebar.context") :
    name === "decisions.md" ? t("sidebar.decisions") : name;

  const RISK_LABEL: Record<UpdateSuggestion["riskLevel"], string> = {
    low: t("review.riskLow"),
    medium: t("review.riskMedium"),
    high: t("review.riskHigh"),
  };

  const sections = useMemo(() => [
    { label: t("review.sec.metadata"), count: t("review.countItems", { n: Object.keys(parsed.metadata).length }) },
    { label: t("review.sec.workedOn"), count: bulletCount(parsed.whatWeWorkedOn, t) },
    { label: t("review.sec.decisions"), count: decisionCount(parsed.keyDecisions, t) },
    { label: t("review.sec.currentState"), count: parsed.currentState ? t("review.countChars", { n: parsed.currentState.length }) : "—" },
    { label: t("review.sec.openQuestions"), count: bulletCount(parsed.openQuestions, t) },
    { label: t("review.sec.nextActions"), count: bulletCount(parsed.nextActions, t) },
    { label: t("review.sec.compactContext"), count: t("review.countChars", { n: parsed.compactContext.length }) },
  ], [parsed, t]);

  const filename = useMemo(previewFilename, []);

  void raw;

  return (
    <div className="flex-1 flex flex-col bg-paper min-w-0">
      <div className="flex-1 overflow-y-auto">
        <div className="pl-16 pr-12 pt-12 pb-12 max-w-[832px]">
          <div className="text-xs text-ink-soft mb-6">
            {t("sidebar.projects")} <span className="text-ink-faint mx-1.5">/</span>{project.name}
            <span className="text-ink-faint mx-1.5">/</span>
            <span className="text-ink">{t("review.breadcrumb")}</span>
          </div>
          <h1 className="text-[32px] font-semibold tracking-[-0.02em] leading-[1.25] mb-2">
            {t("review.title")}
          </h1>
          <div className="inline-flex items-center gap-2.5 text-[13px] text-ink-soft mb-12">
            <FileText size={14} strokeWidth={1.5} />
            <span className="font-mono text-ink">{filename}</span>
            <span className="text-ink-faint">·</span>
            <span className="text-ok">{t("review.readyToSave")}</span>
          </div>

          <h2 className="text-lg font-semibold mb-4">{t("review.parsedSections")}</h2>
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

          <h2 className="text-lg font-semibold mb-6">{t("review.suggestedUpdates")}</h2>
          {(["low", "medium", "high"] as const).map((risk) => {
            const list = suggestions.filter((s) => s.riskLevel === risk);
            if (!list.length) return null;
            return (
              <div key={risk} className="mb-8">
                <div className="flex items-center gap-2.5 mb-1">
                  <RiskDot level={risk} />
                  <span className={`text-xs font-semibold tracking-wider ${RISK_LABEL_COLOR[risk]}`}>
                    {RISK_LABEL[risk]}
                  </span>
                  <div className="flex-1 h-px bg-hairline" />
                </div>
                {list.map((s) => (
                  <SuggestionRow key={s.id} s={s} onToggle={() => toggle(s.id)} t={t} friendlyFile={friendlyFile} />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-hairline bg-paper flex items-center justify-between pl-16 pr-12 shrink-0 py-4">
        <span className="text-[13px] text-ink-soft">
          {t("review.selectedCount", { selected: selectedCount, total: suggestions.length })}
        </span>
        <div className="flex gap-3">
          <button onClick={onCancel} className="h-9 px-3 rounded-md border border-hairline text-[13px] font-medium hover:bg-paper bg-surface transition-colors">
            {t("common.cancel")}
          </button>
          <button onClick={() => onSave(suggestions)} className="h-9 px-3 rounded-md bg-slate text-white text-[13px] font-medium hover:opacity-90 transition-opacity">
            {t("review.saveBtn")}
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
      // warning 文案在渲染时取
      warning: "__aboutMeWarning__",
    });
  return out;
}

function SuggestionRow({
  s, onToggle, t, friendlyFile,
}: {
  s: UpdateSuggestion;
  onToggle: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  friendlyFile: (name: string) => string;
}) {
  const warningText = s.warning === "__aboutMeWarning__" ? t("review.aboutMeWarning") : s.warning;
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
          {s.riskLevel === "low" ? t("review.saveSessionRow") : t("review.appendToRow", { file: friendlyFile(s.targetFile) })}
        </div>
        {warningText && (
          <div className="flex items-start gap-1.5 text-xs text-warn mb-2 bg-warn/[.04] px-2.5 py-1.5 rounded">
            <AlertTriangle size={12} strokeWidth={1.75} className="mt-0.5 shrink-0" />
            <span className="leading-[1.5]">{warningText}</span>
          </div>
        )}
        {s.content && (
          <div className="text-[13px] text-ink-soft leading-[1.6] px-3 py-2.5 bg-paper border-l-2 border-hairline whitespace-pre-wrap">
            <span className="text-ink-faint text-xs block mb-1">{t("review.previewLabel")}</span>
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

function bulletCount(s: string, t: (key: string, vars?: Record<string, string | number>) => string) {
  const n = (s.match(/^[-*]/gm) ?? []).length;
  return n ? t("review.countBullets", { n }) : "—";
}
function decisionCount(s: string, t: (key: string, vars?: Record<string, string | number>) => string) {
  const n = (s.match(/Decision:/g) ?? []).length;
  return n ? t("review.countItems", { n }) : "—";
}
function previewFilename() {
  const now = new Date();
  const d = now.toISOString().slice(0, 10);
  const t = now.toTimeString().slice(0, 5).replace(":", "");
  return `session_${d}_${t}.md`;
}
