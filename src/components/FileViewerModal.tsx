import { useEffect, useState } from "react";
import { X, FileText, ExternalLink, Pencil } from "lucide-react";
import { open as shellOpen } from "@tauri-apps/api/shell";
import type { SourceTool } from "../types";
import { tintFor } from "../lib/sourceTools";
import MarkdownLite from "./MarkdownLite";
import { useT } from "../lib/i18n";

type SessionMeta = {
  date: string;
  time: string;
  sourceTool: SourceTool;
  sessionGoal: string;
};

type Props = {
  filename: string;
  fullPath: string;
  content: string;
  sessionMeta?: SessionMeta;
  editable?: boolean;
  onClose: () => void;
  onSaveEdit?: (newContent: string) => void;
};

export default function FileViewerModal({
  filename, fullPath, content, sessionMeta, editable, onClose, onSaveEdit,
}: Props) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);

  useEffect(() => { setDraft(content); }, [content]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const openInOS = async () => {
    try { await shellOpen(fullPath); } catch (e) { console.error(e); }
  };

  const handleSave = () => {
    if (onSaveEdit) onSaveEdit(draft);
    setEditing(false);
  };

  const isDirty = draft !== content;

  return (
    <div
      className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center px-8 py-10"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-xl w-[760px] max-h-full flex flex-col shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-14 px-6 border-b border-hairline flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileText size={16} strokeWidth={1.5} className="text-ink-soft shrink-0" />
            <span
              className={`text-[14px] truncate ${
                /\.md$/.test(filename) ? "font-mono text-ink-soft" : "font-medium text-ink"
              }`}
            >
              {filename}
            </span>
            {editing && (
              <span className="text-xs text-[#A05536] font-medium">{t("fileViewer.editing")}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {editable && !editing && (
              <button
                onClick={() => setEditing(true)}
                className="h-7 px-2.5 rounded text-[13px] text-ink-soft hover:bg-surface-soft transition-colors inline-flex items-center gap-1.5"
              >
                <Pencil size={13} strokeWidth={1.5} />
                {t("review.editBtn")}
              </button>
            )}
            <button
              onClick={onClose}
              className="w-7 h-7 rounded flex items-center justify-center text-ink-soft hover:bg-surface-soft transition-colors shrink-0"
            >
              <X size={18} strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Metadata strip — only for session files */}
        {sessionMeta && (
          <div className="px-6 py-4 border-b border-hairline flex items-center gap-4 text-[13px] shrink-0 flex-wrap">
            <span className="tabular-nums text-ink-soft">
              {sessionMeta.date || "—"} {sessionMeta.time && `· ${sessionMeta.time}`}
            </span>
            <span className={`h-[22px] px-2.5 rounded text-xs font-medium inline-flex items-center ${tintFor(sessionMeta.sourceTool)}`}>
              {sessionMeta.sourceTool}
            </span>
            <span className="text-ink flex-1 truncate">{sessionMeta.sessionGoal}</span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-7 py-6">
          {editing ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-full h-full min-h-[300px] bg-paper border border-hairline rounded-md p-4 font-mono text-[13px] leading-[1.75] text-ink resize-y focus:outline-none focus:border-slate transition-colors"
            />
          ) : content ? (
            // 查看 = 渲染给人看；编辑才是 Markdown 原文
            <div className="text-[14px] leading-[1.75] text-ink">
              <MarkdownLite source={content} />
            </div>
          ) : (
            <div className="text-ink-faint text-[14px] py-12 text-center">
              {t("fileViewer.empty")}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-14 px-6 border-t border-hairline flex items-center justify-between shrink-0">
          <button
            onClick={openInOS}
            className="h-9 px-3 rounded-md text-[13px] font-medium text-ink-soft hover:bg-surface-soft transition-colors inline-flex items-center gap-1.5"
          >
            <ExternalLink size={14} strokeWidth={1.5} />
            {t("common.openInOS")}
          </button>
          <div className="flex gap-2.5">
            {editing ? (
              <>
                <button
                  onClick={() => { setEditing(false); setDraft(content); }}
                  className="h-9 px-3 rounded-md border border-hairline text-[13px] font-medium hover:bg-paper bg-surface transition-colors"
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={handleSave}
                  disabled={!isDirty}
                  className="h-9 px-4 rounded-md bg-slate text-white text-[13px] font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
                >
                  {t("common.save")}
                </button>
              </>
            ) : (
              <button
                onClick={onClose}
                className="h-9 px-4 rounded-md bg-ink text-white text-[13px] font-medium hover:opacity-90 transition-opacity"
              >
                {t("common.close")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
