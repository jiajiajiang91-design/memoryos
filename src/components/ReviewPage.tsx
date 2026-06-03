import { useEffect, useMemo, useRef, useState } from "react";
import { Check, AlertTriangle, FileText } from "lucide-react";
import type { ParsedHandoff, UpdateSuggestion } from "../types";
import { useT } from "../lib/i18n";
import { extractSuperseded } from "../lib/parser";
import { logEvent, editPercent } from "../lib/telemetry";

type Props = {
  /** 目标项目名（这条 handoff 会写入的项目）。来自 Inbox item 的 slug 对应项目，已锚定，不随当前显示项目漂移。 */
  projectName: string;
  raw: string;
  parsed: ParsedHandoff;
  currentContext: string;
  currentDecisions: string;
  currentAboutMe: string;
  onCancel: () => void;
  onSave: (suggestions: UpdateSuggestion[]) => void;
  /** 来自 Inbox 的 review 才有：丢弃 = 移 archive(discarded)。取消（onCancel）则保留 pending。 */
  onDiscard?: () => void;
  /** 这条 handoff 的来源通道（manual/mcp/browser），带进 review 埋点。 */
  channel?: string;
};

const RISK_LABEL_COLOR: Record<UpdateSuggestion["riskLevel"], string> = {
  low: "text-ink-soft",
  medium: "text-[#A05536]",
  high: "text-warn",
};

export default function ReviewPage({ projectName, raw, parsed, currentContext, currentDecisions, currentAboutMe, onCancel, onSave, onDiscard, channel = "manual" }: Props) {
  const t = useT();
  const [suggestions, setSuggestions] = useState<UpdateSuggestion[]>(() =>
    buildSuggestions(parsed, currentContext, currentDecisions, currentAboutMe)
  );
  const initialContents = useRef<Record<string, string>>(
    Object.fromEntries(suggestions.map((s) => [s.id, s.content]))
  );

  useEffect(() => {
    logEvent("review.shown", {
      channel,
      rawLength: raw.length,
      suggestions: suggestions.map((s) => ({
        id: s.id,
        risk: s.riskLevel,
        mode: s.mode ?? "append",
        hasSuperseded: (s.superseded?.length ?? 0) > 0,
      })),
    });
  }, []);

  const toggle = (id: string) =>
    setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, selected: !s.selected } : s)));
  const updateContent = (id: string, content: string) =>
    setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, content } : s)));
  const selectedCount = suggestions.filter((s) => s.selected).length;

  const handleConfirm = () => {
    logEvent("review.confirmed", {
      channel,
      selectedIds: suggestions.filter((s) => s.selected).map((s) => s.id),
      edits: suggestions
        .filter((s) => s.id !== "save-session")
        .map((s) => ({
          id: s.id,
          risk: s.riskLevel,
          selected: s.selected,
          origLen: initialContents.current[s.id]?.length ?? 0,
          finalLen: s.content.length,
          deltaPct: editPercent(initialContents.current[s.id] ?? "", s.content),
        })),
    });
    onSave(suggestions);
  };

  const handleCancel = () => {
    logEvent("review.cancelled", {
      channel,
      suggestionCount: suggestions.length,
    });
    onCancel();
  };

  const handleDiscard = () => {
    logEvent("review.discarded", {
      channel,
      suggestionCount: suggestions.length,
    });
    onDiscard?.();
  };

  const currentFileContent: Record<string, string> = {
    "00_context.md": currentContext,
    "decisions.md": currentDecisions,
    "about_me.md": currentAboutMe,
  };

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
            {t("sidebar.projects")} <span className="text-ink-faint mx-1.5">/</span>{projectName}
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
                  <SuggestionRow
                    key={s.id}
                    s={s}
                    onToggle={() => toggle(s.id)}
                    onUpdateContent={(c) => updateContent(s.id, c)}
                    currentContent={currentFileContent[s.targetFile] ?? ""}
                    t={t}
                    friendlyFile={friendlyFile}
                  />
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
          {onDiscard && (
            <button onClick={handleDiscard} className="h-9 px-3 rounded-md border border-hairline text-[13px] font-medium text-warn hover:bg-warn/[.06] bg-surface transition-colors">
              {t("review.discardBtn")}
            </button>
          )}
          <button onClick={handleCancel} className="h-9 px-3 rounded-md border border-hairline text-[13px] font-medium hover:bg-paper bg-surface transition-colors">
            {onDiscard ? t("review.keepPendingBtn") : t("common.cancel")}
          </button>
          <button onClick={handleConfirm} className="h-9 px-3 rounded-md bg-slate text-white text-[13px] font-medium hover:opacity-90 transition-opacity">
            {t("review.saveBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}

function buildSuggestions(
  p: ParsedHandoff,
  currentContext: string,
  currentDecisions: string,
  currentAboutMe: string,
): UpdateSuggestion[] {
  const out: UpdateSuggestion[] = [];
  out.push({ id: "save-session", targetFile: "session", riskLevel: "low", content: "", selected: true });
  if (p.suggestedContextUpdate && !/no update/i.test(p.suggestedContextUpdate)) {
    const superseded = extractSuperseded(p.suggestedContextUpdate);
    const cleanedOld = superseded.length ? stripSuperseded(currentContext, superseded) : currentContext;
    const cleanedNew = stripSupersededLines(p.suggestedContextUpdate);
    const stamp = "\n\n---\n_Updated " + new Date().toISOString().slice(0, 10) + "_\n\n";
    const merged = cleanedOld.trim()
      ? cleanedOld.trimEnd() + stamp + cleanedNew + "\n"
      : cleanedNew;
    out.push({
      id: "ctx", targetFile: "00_context.md", riskLevel: "medium",
      content: merged, selected: false, mode: "replace",
      originalContent: currentContext, newAddition: cleanedNew,
      superseded,
    });
  }
  if (p.suggestedDecisionsUpdate && !/no update/i.test(p.suggestedDecisionsUpdate)) {
    const superseded = extractSuperseded(p.suggestedDecisionsUpdate);
    const cleanedOld = superseded.length ? stripSuperseded(currentDecisions, superseded) : currentDecisions;
    const cleanedNew = stripSupersededLines(p.suggestedDecisionsUpdate);
    const stamp = "\n\n---\n_Updated " + new Date().toISOString().slice(0, 10) + "_\n\n";
    const merged = cleanedOld.trim()
      ? cleanedOld.trimEnd() + stamp + cleanedNew + "\n"
      : cleanedNew;
    out.push({
      id: "dec", targetFile: "decisions.md", riskLevel: "medium",
      content: merged, selected: false, mode: "replace",
      originalContent: currentDecisions, newAddition: cleanedNew,
      superseded,
    });
  }
  if (p.suggestedAboutMeUpdate && !/no update/i.test(p.suggestedAboutMeUpdate)) {
    const superseded = extractSuperseded(p.suggestedAboutMeUpdate);
    const cleanedOld = superseded.length ? stripSuperseded(currentAboutMe, superseded) : currentAboutMe;
    const cleanedNew = stripSupersededLines(p.suggestedAboutMeUpdate);
    const stamp = "\n\n---\n_Updated " + new Date().toISOString().slice(0, 10) + "_\n\n";
    const merged = cleanedOld.trim()
      ? cleanedOld.trimEnd() + stamp + cleanedNew + "\n"
      : cleanedNew;
    out.push({
      id: "aboutme", targetFile: "about_me.md", riskLevel: "high",
      content: merged, selected: false, mode: "replace",
      originalContent: currentAboutMe, newAddition: cleanedNew,
      superseded,
      warning: "__aboutMeWarning__",
    });
  }
  return out;
}

function SuggestionRow({
  s, onToggle, onUpdateContent, currentContent, t, friendlyFile,
}: {
  s: UpdateSuggestion;
  onToggle: () => void;
  onUpdateContent: (content: string) => void;
  currentContent: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
  friendlyFile: (name: string) => string;
}) {
  const [editing, setEditing] = useState(false);
  const warningText = s.warning === "__aboutMeWarning__" ? t("review.aboutMeWarning") : s.warning;
  const isReplace = s.mode === "replace";

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
          {s.riskLevel === "low"
            ? t("review.saveSessionRow")
            : isReplace
              ? t("review.updateFileRow", { file: friendlyFile(s.targetFile) })
              : t("review.appendToRow", { file: friendlyFile(s.targetFile) })}
        </div>
        {isReplace && (
          <div className="flex items-start gap-1.5 text-xs text-[#A05536] mb-2 bg-[#A05536]/[.04] px-2.5 py-1.5 rounded">
            <AlertTriangle size={12} strokeWidth={1.75} className="mt-0.5 shrink-0" />
            <span className="leading-[1.5]">{t("review.replaceWarning")}</span>
          </div>
        )}
        {warningText && (
          <div className="flex items-start gap-1.5 text-xs text-warn mb-2 bg-warn/[.04] px-2.5 py-1.5 rounded">
            <AlertTriangle size={12} strokeWidth={1.75} className="mt-0.5 shrink-0" />
            <span className="leading-[1.5]">{warningText}</span>
          </div>
        )}
        {s.content && (
          <div className="text-[13px] text-ink-soft leading-[1.6] px-3 py-2.5 bg-paper border-l-2 border-hairline rounded-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="text-ink-faint text-xs">
                {isReplace ? t("review.fullFilePreview") : t("review.previewLabel")}
              </span>
              {s.riskLevel !== "low" && (
                <button
                  onClick={() => setEditing(!editing)}
                  className="text-xs text-ink-faint hover:text-slate transition-colors"
                >
                  {editing ? t("common.done") : t("review.editBtn")}
                </button>
              )}
            </div>
            {editing ? (
              <textarea
                value={s.content}
                onChange={(e) => onUpdateContent(e.target.value)}
                className="w-full min-h-[200px] bg-white border border-hairline rounded p-2 font-mono text-xs leading-[1.6] resize-y focus:outline-none focus:border-slate transition-colors"
              />
            ) : isReplace && s.originalContent && s.newAddition ? (
              <div className="max-h-72 overflow-y-auto">
                <HighlightedOldContent
                  content={s.originalContent.trimEnd()}
                  superseded={s.superseded ?? []}
                  t={t}
                />
                <div className="my-2 border-t border-dashed border-ok/40" />
                <div className="bg-ok/[.08] border-l-2 border-ok rounded-sm px-2 py-1.5 -mx-1">
                  <span className="text-xs text-ok font-medium block mb-1">{t("review.newContentLabel")}</span>
                  <pre className="whitespace-pre-wrap text-[13px] text-ink">{s.newAddition}</pre>
                </div>
              </div>
            ) : (
              <pre className="whitespace-pre-wrap max-h-60 overflow-y-auto text-[13px]">{s.content}</pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function isSupersededMatch(para: string, kw: string): boolean {
  const pLow = para.toLowerCase();
  const kLow = kw.toLowerCase();
  if (pLow.includes(kLow)) return true;
  if (kLow.length <= 25) return false;
  const words = kLow.split(/[\s"'""「」（）()，,;；]+/).filter((w) => w.length > 2);
  if (!words.length) return false;
  const matched = words.filter((w) => pLow.includes(w)).length;
  return matched >= Math.ceil(words.length * 0.4);
}

function stripSupersededLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^(?:\*\*)?Superseded:?(?:\*\*)?/i.test(line.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripSuperseded(content: string, superseded: string[]): string {
  const paragraphs = content.split(/\n(?=#{1,3}\s|---|\*\*[^*\n])/);
  const kept = paragraphs.filter((para) =>
    !superseded.some((kw) => isSupersededMatch(para, kw))
  );
  return kept.join("\n").replace(/\n{3,}/g, "\n\n");
}

function HighlightedOldContent({
  content, superseded, t,
}: {
  content: string;
  superseded: string[];
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  if (!superseded.length) {
    return <pre className="whitespace-pre-wrap text-[13px] text-ink-faint">{content}</pre>;
  }

  const paragraphs = content.split(/\n(?=#{1,3}\s|---|\*\*[^*\n])/);
  return (
    <div>
      {paragraphs.map((para, i) => {
        const isSuperseded = superseded.some((kw) => isSupersededMatch(para, kw));
        return isSuperseded ? (
          <div key={i} className="bg-warn/[.08] border-l-2 border-warn rounded-sm px-2 py-1 -mx-1 my-0.5">
            <span className="text-xs text-warn font-medium">{t("review.supersededLabel")}</span>
            <pre className="whitespace-pre-wrap text-[13px] text-warn/80 line-through decoration-warn/40">{para}</pre>
          </div>
        ) : (
          <pre key={i} className="whitespace-pre-wrap text-[13px] text-ink-faint">{para}</pre>
        );
      })}
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
