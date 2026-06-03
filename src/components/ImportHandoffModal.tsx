import { useMemo, useState } from "react";
import { Check, AlertTriangle } from "lucide-react";
import { ModalShell, ModalHeader, ModalFooter } from "./CopyPromptModal";
import { parseHandoff } from "../lib/parser";
import { logEvent } from "../lib/telemetry";
import type { ParsedHandoff } from "../types";
import { useT } from "../lib/i18n";

type Props = {
  onClose: () => void;
  onParsed: (raw: string, parsed: ParsedHandoff) => void;
};

type DetectStatus = "full" | "partial" | "raw";

export default function ImportHandoffModal({ onClose, onParsed }: Props) {
  const t = useT();
  const [text, setText] = useState("");

  const detection = useMemo(() => {
    if (!text.trim()) return null;
    const hasHeader = /MemoryOS Session Handoff/i.test(text);
    const date = text.match(/Date:\s*([\d-]+)/)?.[1] ?? "—";
    const tool = text.match(/Source Tool:\s*(\w+)/)?.[1] ?? "?";
    const strictSections = (text.match(/^##\s+\d+\./gm) ?? []).length;
    const looseSections = (text.match(/^#{1,3}\s/gm) ?? []).length;
    const sections = strictSections || looseSections;

    let status: DetectStatus;
    if (hasHeader && strictSections >= 3) status = "full";
    else if (hasHeader || sections >= 2) status = "partial";
    else status = "raw";

    return { status, tool, date, sections };
  }, [text]);

  const canImport = !!text.trim();

  return (
    <ModalShell onClose={onClose} width="max-w-xl">
      <ModalHeader title={t("import.title")} onClose={onClose} />
      <div className="px-6 pt-5 pb-4">
        <div className="text-[13px] text-ink-soft mb-2.5">{t("import.pasteLabel")}</div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="# MemoryOS Session Handoff..."
          className="w-full h-72 border border-hairline rounded p-3 font-mono text-xs leading-[1.6] bg-paper resize-none focus:outline-none focus:border-slate transition-colors box-border"
        />
        <div className="flex items-center justify-between mt-3 min-h-[22px]">
          {detection?.status === "full" ? (
            <span className="text-[13px] text-ok inline-flex items-center gap-1.5">
              <Check size={14} strokeWidth={1.5} />
              {t("import.detected", { tool: detection.tool, date: detection.date, n: detection.sections })}
            </span>
          ) : detection?.status === "partial" ? (
            <span className="text-[13px] text-[#A05536] inline-flex items-center gap-1.5">
              <AlertTriangle size={14} strokeWidth={1.5} />
              {t("import.partialDetect")}
            </span>
          ) : detection?.status === "raw" ? (
            <span className="text-[13px] text-[#A05536] inline-flex items-center gap-1.5">
              <AlertTriangle size={14} strokeWidth={1.5} />
              {t("import.rawDetect")}
            </span>
          ) : (
            <span className="text-xs text-ink-faint">{t("import.autoDetect")}</span>
          )}
        </div>
      </div>
      <ModalFooter>
        <button onClick={onClose} className="h-9 px-3 rounded-md border border-hairline text-[13px] font-medium hover:bg-paper bg-surface transition-colors">
          {t("common.cancel")}
        </button>
        <button
          onClick={() => {
            if (!canImport) return;
            logEvent("import.parsed", {
              channel: "manual",
              rawLength: text.length,
              detection: detection?.status ?? "empty",
              sections: detection?.sections ?? 0,
              tool: detection?.tool ?? "?",
            });
            onParsed(text, parseHandoff(text));
          }}
          disabled={!canImport}
          className="h-9 px-3 rounded-md bg-slate text-white text-[13px] font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {t("import.parseBtn")}
        </button>
      </ModalFooter>
    </ModalShell>
  );
}
