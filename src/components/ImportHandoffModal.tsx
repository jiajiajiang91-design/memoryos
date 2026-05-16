import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { ModalShell, ModalHeader, ModalFooter } from "./CopyPromptModal";
import { parseHandoff } from "../lib/parser";
import type { ParsedHandoff } from "../types";
import { useT } from "../lib/i18n";

type Props = {
  onClose: () => void;
  onParsed: (raw: string, parsed: ParsedHandoff) => void;
};

export default function ImportHandoffModal({ onClose, onParsed }: Props) {
  const t = useT();
  const [text, setText] = useState("");

  const detected = useMemo(() => {
    if (!text.trim()) return null;
    if (!/MemoryOS Session Handoff/i.test(text)) return null;
    const date = text.match(/Date:\s*([\d-]+)/)?.[1] ?? "—";
    const tool = text.match(/Source Tool:\s*(\w+)/)?.[1] ?? "?";
    const sections = (text.match(/^##\s+\d+\./gm) ?? []).length;
    return { tool, date, sections };
  }, [text]);

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
          {detected ? (
            <span className="text-[13px] text-ok inline-flex items-center gap-1.5">
              <Check size={14} strokeWidth={1.5} />
              {t("import.detected", { tool: detected.tool, date: detected.date, n: detected.sections })}
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
          onClick={() => detected && onParsed(text, parseHandoff(text))}
          disabled={!detected}
          className="h-9 px-3 rounded-md bg-slate text-white text-[13px] font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {t("import.parseBtn")}
        </button>
      </ModalFooter>
    </ModalShell>
  );
}
