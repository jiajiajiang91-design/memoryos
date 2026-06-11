// 旧项目迁移：把现有 项目说明/决策记录 蒸馏成第一版现行卡（PRD·记忆质量升级 F3 边界）。
// 流程与 Bootstrap 同款：复制指令 → 在任意 AI 里跑 → 粘贴回输出 → 保存为 cards.md。
// 保存后旧 00_context.md / decisions.md 自然冻结为档案层（不删除、不改写）。

import { useState } from "react";
import { Copy, Check, Sparkles } from "lucide-react";
import type { Project } from "../types";
import { ModalShell, ModalHeader, ModalFooter } from "./CopyPromptModal";
import { cardsRebuildPrompt } from "../lib/parser";
import { copyToClipboard, writeProjectCards } from "../lib/fs";
import { stripCodeFence, parseCardsStamp, stampCards, cardsCharCount, CARDS_BUDGET_CHARS } from "../lib/cards";
import { useT, useLang } from "../lib/i18n";

type Props = {
  workspace: string;
  project: Project;
  onClose: () => void;
  onSaved: () => void;
};

export default function MigrateCardsModal({ workspace, project, onClose, onSaved }: Props) {
  const t = useT();
  const [lang] = useLang();
  const [copied, setCopied] = useState(false);
  const [paste, setPaste] = useState("");

  const handleCopy = async () => {
    const prompt = cardsRebuildPrompt({
      projectName: project.name,
      existingContext: project.contextMarkdown,
      existingDecisions: project.decisionsMarkdown,
      latestSession: project.sessions[0]?.rawMarkdown ?? "",
      lang,
    });
    await copyToClipboard(prompt);
    setCopied(true);
  };

  const cleaned = stripCodeFence(paste);
  const count = cardsCharCount(cleaned);
  const overBudget = count > CARDS_BUDGET_CHARS;

  const handleSave = async () => {
    if (!cleaned) return;
    let content = cleaned;
    // AI 忘写整理日期行 → 兜底今天（解析容错，不卡用户）
    if (!parseCardsStamp(content)) {
      content = stampCards(content, new Date().toISOString().slice(0, 10), lang);
    }
    await writeProjectCards(workspace, project.slug, content);
    onSaved();
  };

  return (
    <ModalShell onClose={onClose} width="max-w-xl">
      <ModalHeader title={t("migrate.title")} onClose={onClose} />
      <div className="px-6 pt-5 pb-6 overflow-y-auto">
        <p className="text-[13px] text-ink-soft leading-relaxed mb-4">{t("migrate.intro")}</p>

        <div className="flex items-center gap-2 mb-5">
          <button
            onClick={handleCopy}
            className="h-9 px-3 rounded-md bg-slate text-white text-[13px] font-medium inline-flex items-center gap-1.5 hover:opacity-90 transition-opacity"
          >
            {copied ? <Check size={14} strokeWidth={1.5} /> : <Copy size={14} strokeWidth={1.5} />}
            {copied ? t("migrate.copied") : t("migrate.copyBtn")}
          </button>
          <span className="text-[12px] text-ink-faint">{t("migrate.copyHint")}</span>
        </div>

        <div className="text-[13px] text-ink-soft mb-2">{t("migrate.pasteLabel")}</div>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder={t("migrate.pastePlaceholder")}
          className="w-full min-h-[220px] bg-paper border border-hairline rounded-md p-3 font-mono text-xs leading-[1.7] resize-y focus:outline-none focus:border-slate transition-colors"
        />
        {cleaned && (
          <div className={`mt-1.5 text-[12px] ${overBudget ? "text-warn" : "text-ink-faint"}`}>
            {t("migrate.charCount", { n: count, max: CARDS_BUDGET_CHARS })}
            {overBudget && ` — ${t("migrate.overBudget")}`}
          </div>
        )}
      </div>
      <ModalFooter>
        <button onClick={onClose} className="h-9 px-3 rounded-md border border-hairline text-[13px] font-medium hover:bg-paper bg-surface transition-colors">
          {t("common.cancel")}
        </button>
        <button
          onClick={handleSave}
          disabled={!cleaned}
          className="h-9 px-3 rounded-md bg-slate text-white text-[13px] font-medium inline-flex items-center gap-1.5 hover:opacity-90 transition-opacity disabled:opacity-30"
        >
          <Sparkles size={14} strokeWidth={1.5} />
          {t("migrate.saveBtn")}
        </button>
      </ModalFooter>
    </ModalShell>
  );
}
