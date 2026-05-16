import { useEffect } from "react";
import { X, FileText, ExternalLink } from "lucide-react";
import { open as shellOpen } from "@tauri-apps/api/shell";
import type { SourceTool } from "../types";

const TOOL_TINTS: Record<SourceTool, string> = {
  ChatGPT: "bg-[#E8F0E8] text-[#3D6B3D]",
  Claude: "bg-[#F0E6DC] text-[#7A4527]",
  Cursor: "bg-[#E8E8F0] text-[#3D3D6B]",
  Gemini: "bg-[#F0E8F0] text-[#6B3D6B]",
};

type SessionMeta = {
  date: string;
  time: string;
  sourceTool: SourceTool;
  sessionGoal: string;
};

type Props = {
  filename: string;       // 显示在头部的文件名
  fullPath: string;       // 用于"用系统默认程序打开"
  content: string;        // markdown 原文
  sessionMeta?: SessionMeta; // session 文件特有的元数据;普通 markdown 文件不传
  onClose: () => void;
};

export default function FileViewerModal({
  filename, fullPath, content, sessionMeta, onClose,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const openInOS = async () => {
    try { await shellOpen(fullPath); } catch (e) { console.error(e); }
  };

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
            <span className="text-[14px] font-mono text-ink-soft truncate">{filename}</span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded flex items-center justify-center text-ink-soft hover:bg-surface-soft transition-colors shrink-0"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        {/* Metadata strip — only for session files */}
        {sessionMeta && (
          <div className="px-6 py-4 border-b border-hairline flex items-center gap-4 text-[13px] shrink-0 flex-wrap">
            <span className="tabular-nums text-ink-soft">
              {sessionMeta.date || "—"} {sessionMeta.time && `· ${sessionMeta.time}`}
            </span>
            <span className={`h-[22px] px-2.5 rounded text-xs font-medium inline-flex items-center ${TOOL_TINTS[sessionMeta.sourceTool] ?? "bg-surface-soft text-ink-soft"}`}>
              {sessionMeta.sourceTool}
            </span>
            <span className="text-ink flex-1 truncate">{sessionMeta.sessionGoal}</span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-7 py-6">
          {content ? (
            <pre className="text-[14px] leading-[1.75] whitespace-pre-wrap font-sans text-ink">
              {content}
            </pre>
          ) : (
            <div className="text-ink-faint text-[14px] py-12 text-center">
              这个文件还是空的。
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
            用系统默认程序打开
          </button>
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-md bg-ink text-white text-[13px] font-medium hover:opacity-90 transition-opacity"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
