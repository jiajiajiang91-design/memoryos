import { useEffect, useState } from "react";
import { X, Copy, Sparkles, Check } from "lucide-react";
import { copyToClipboard, writeAboutMe, writeProjectContext } from "../lib/fs";
import { aboutMeBootstrapPrompt, contextBootstrapPrompt } from "../lib/parser";
import { useT, useLang } from "../lib/i18n";

type Need = "about_me" | "context";

type Props = {
  workspace: string;
  projectSlug: string | null;
  projectName: string;
  needs: Need[];
  onClose: () => void;
  onSaved: () => void;
  onToast: (msg: string) => void;
};

export default function BootstrapModal({
  workspace, projectSlug, projectName, needs, onClose, onSaved, onToast,
}: Props) {
  const t = useT();
  const [lang] = useLang();
  const [pasteAboutMe, setPasteAboutMe] = useState("");
  const [pasteContext, setPasteContext] = useState("");
  const [savedAboutMe, setSavedAboutMe] = useState(false);
  const [savedContext, setSavedContext] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSaveAboutMe = async () => {
    const content = pasteAboutMe.trim();
    if (!content) return;
    const clean = content.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
    await writeAboutMe(workspace, clean);
    setSavedAboutMe(true);
    onToast(t("bootstrap.savedAboutMe"));
    onSaved();
  };

  const handleSaveContext = async () => {
    if (!projectSlug) return;
    const content = pasteContext.trim();
    if (!content) return;
    const clean = content.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
    await writeProjectContext(workspace, projectSlug, clean);
    setSavedContext(true);
    onToast(t("bootstrap.savedContext"));
    onSaved();
  };

  const showAboutMe = needs.includes("about_me");
  const showContext = needs.includes("context") && projectSlug;

  return (
    <div
      className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center px-8 py-10"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-xl w-[720px] max-h-full flex flex-col shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-14 px-6 border-b border-hairline flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <Sparkles size={18} strokeWidth={1.5} className="text-slate" />
            <span className="text-base font-semibold">{t("bootstrap.modalTitle")}</span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded flex items-center justify-center text-ink-soft hover:bg-surface-soft transition-colors"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        {/* Intro */}
        <div className="px-7 pt-6 pb-2 text-[13px] text-ink-soft leading-[1.7]">
          {t("bootstrap.intro")}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-7 pb-6 space-y-8">
          {showAboutMe && (
            <BootstrapSection
              num={1}
              title={t("bootstrap.aboutMeTitle")}
              desc={t("bootstrap.aboutMeDesc")}
              saved={savedAboutMe}
              copyLabel={t("bootstrap.copyPromptBtn")}
              pasteLabel={t("bootstrap.pasteLabel")}
              savedLabel={t("bootstrap.alreadySaved")}
              saveLabel={t("common.save")}
              onCopy={async () => {
                await copyToClipboard(aboutMeBootstrapPrompt(lang));
                onToast(t("bootstrap.aboutMePromptCopied"));
              }}
              pasteValue={pasteAboutMe}
              onPasteChange={setPasteAboutMe}
              onSave={handleSaveAboutMe}
            />
          )}
          {showContext && (
            <BootstrapSection
              num={showAboutMe ? 2 : 1}
              title={t("bootstrap.contextTitle")}
              desc={t("bootstrap.contextDesc", { name: projectName })}
              saved={savedContext}
              copyLabel={t("bootstrap.copyPromptBtn")}
              pasteLabel={t("bootstrap.pasteLabel")}
              savedLabel={t("bootstrap.alreadySaved")}
              saveLabel={t("common.save")}
              onCopy={async () => {
                await copyToClipboard(contextBootstrapPrompt(projectName, lang));
                onToast(t("bootstrap.contextPromptCopied"));
              }}
              pasteValue={pasteContext}
              onPasteChange={setPasteContext}
              onSave={handleSaveContext}
            />
          )}
        </div>

        {/* Footer */}
        <div className="h-14 px-6 border-t border-hairline flex items-center justify-end shrink-0">
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-md bg-ink text-white text-[13px] font-medium hover:opacity-90 transition-opacity"
          >
            {t("common.done")}
          </button>
        </div>
      </div>
    </div>
  );
}

function BootstrapSection({
  num, title, desc, saved, savedLabel, copyLabel, pasteLabel, saveLabel,
  onCopy, pasteValue, onPasteChange, onSave,
}: {
  num: number;
  title: string;
  desc: string;
  saved: boolean;
  savedLabel: string;
  copyLabel: string;
  pasteLabel: string;
  saveLabel: string;
  onCopy: () => void;
  pasteValue: string;
  onPasteChange: (v: string) => void;
  onSave: () => void;
}) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-6 h-6 rounded-full bg-slate text-white text-[12px] font-semibold flex items-center justify-center shrink-0">
          {num}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold leading-tight">{title}</div>
          <div className="text-[12px] text-ink-faint mt-0.5">{desc}</div>
        </div>
        {saved && (
          <span className="text-[12px] text-ok inline-flex items-center gap-1">
            <Check size={14} strokeWidth={2} /> {savedLabel}
          </span>
        )}
      </div>

      <div className="pl-9 space-y-3">
        <button
          onClick={onCopy}
          className="h-9 px-3 rounded-md bg-surface border border-hairline text-ink text-[13px] font-medium inline-flex items-center gap-1.5 hover:bg-surface-soft transition-colors"
        >
          <Copy size={14} strokeWidth={1.5} />
          {copyLabel}
        </button>

        <div>
          <label className="text-[12px] text-ink-soft block mb-1.5">{pasteLabel}</label>
          <textarea
            value={pasteValue}
            onChange={(e) => onPasteChange(e.target.value)}
            placeholder="# About Me&#10;..."
            className="w-full h-32 p-3 border border-hairline rounded-md text-[13px] font-mono leading-relaxed resize-y focus:outline-none focus:border-slate"
          />
        </div>

        <button
          onClick={onSave}
          disabled={!pasteValue.trim()}
          className="h-9 px-3 rounded-md bg-slate text-white text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {saveLabel}
        </button>
      </div>
    </section>
  );
}
