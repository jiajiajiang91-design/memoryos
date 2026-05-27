import { useEffect, useState } from "react";
import { open as shellOpen } from "@tauri-apps/api/shell";
import { readTextFile, exists } from "@tauri-apps/api/fs";
import { ModalShell, ModalHeader, ModalFooter } from "./CopyPromptModal";
import { copyToClipboard } from "../lib/fs";
import { getTelemetryPath, logEvent } from "../lib/telemetry";
import { useT } from "../lib/i18n";

const ISSUES_URL = "https://github.com/jiajiajiang91-design/memoryos/issues/new";

type Props = {
  onClose: () => void;
  onToast: (msg: string) => void;
};

export default function FeedbackModal({ onClose, onToast }: Props) {
  const t = useT();
  const [text, setText] = useState("");
  const [includeStats, setIncludeStats] = useState(true);
  const [statsInfo, setStatsInfo] = useState<{ count: number; firstDate: string } | null>(null);
  const [telemetryContent, setTelemetryContent] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const path = await getTelemetryPath();
        if (!(await exists(path))) {
          setStatsInfo({ count: 0, firstDate: "" });
          return;
        }
        const raw = await readTextFile(path);
        setTelemetryContent(raw);
        const lines = raw.split("\n").filter((l) => l.trim());
        const firstTs = lines[0] ? (JSON.parse(lines[0]).ts ?? "") : "";
        setStatsInfo({ count: lines.length, firstDate: firstTs.slice(0, 10) });
      } catch {
        setStatsInfo({ count: 0, firstDate: "" });
      }
    })();
  }, []);

  const canSubmit = text.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const parts = [`## ${t("feedback.bodyHeading")}`, "", text.trim(), ""];
    if (includeStats && statsInfo && statsInfo.count > 0) {
      parts.push(
        `## ${t("feedback.statsHeading")}`,
        "",
        `<details>`,
        `<summary>${t("feedback.statsSummary", { n: statsInfo.count })}</summary>`,
        "",
        "```jsonl",
        telemetryContent.trim(),
        "```",
        `</details>`,
        ""
      );
    }
    const body = parts.join("\n");
    await copyToClipboard(body);
    await logEvent("feedback.submitted", {
      textLength: text.trim().length,
      includedStats: includeStats && (statsInfo?.count ?? 0) > 0,
      statsCount: statsInfo?.count ?? 0,
    });
    await shellOpen(ISSUES_URL);
    onToast(t("feedback.copiedToast"));
    onClose();
  };

  return (
    <ModalShell onClose={onClose} width="max-w-xl">
      <ModalHeader title={t("feedback.title")} onClose={onClose} />
      <div className="px-6 py-5">
        <p className="text-[13px] text-ink-soft leading-[1.7] mb-4">
          {t("feedback.intro")}
        </p>
        <label className="text-[13px] font-medium block mb-1.5">
          {t("feedback.textareaLabel")}
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("feedback.textareaPlaceholder")}
          className="w-full h-40 border border-hairline rounded p-3 text-[13px] leading-[1.6] bg-paper resize-none focus:outline-none focus:border-slate transition-colors box-border"
        />
        <label className="mt-4 flex items-start gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeStats}
            onChange={(e) => setIncludeStats(e.target.checked)}
            disabled={!statsInfo || statsInfo.count === 0}
            className="mt-0.5 accent-slate"
          />
          <span className="text-[13px] text-ink-soft leading-[1.6]">
            <span className="font-medium text-ink">
              {t("feedback.includeStatsLabel")}
            </span>
            <br />
            {statsInfo && statsInfo.count > 0 ? (
              <span className="text-[12px] text-ink-faint">
                {t("feedback.statsPreview", {
                  n: statsInfo.count,
                  date: statsInfo.firstDate || "—",
                })}
              </span>
            ) : (
              <span className="text-[12px] text-ink-faint">
                {t("feedback.statsEmpty")}
              </span>
            )}
            <br />
            <span className="text-[12px] text-ink-faint">
              {t("feedback.privacyNote")}
            </span>
          </span>
        </label>
      </div>
      <ModalFooter>
        <button
          onClick={onClose}
          className="h-9 px-3 rounded-md border border-hairline text-[13px] font-medium hover:bg-paper bg-surface transition-colors"
        >
          {t("common.cancel")}
        </button>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="h-9 px-3 rounded-md bg-slate text-white text-[13px] font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {t("feedback.submitBtn")}
        </button>
      </ModalFooter>
    </ModalShell>
  );
}
