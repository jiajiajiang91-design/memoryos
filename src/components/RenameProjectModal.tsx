import { useEffect, useRef, useState } from "react";
import { X, Pencil } from "lucide-react";
import { useT } from "../lib/i18n";

type Props = {
  initialName: string;
  onClose: () => void;
  onRename: (newName: string) => void;
};

export default function RenameProjectModal({ initialName, onClose, onRename }: Props) {
  const t = useT();
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 50);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === initialName) { onClose(); return; }
    onRename(trimmed);
  };

  return (
    <div
      className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center px-8 py-10"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-xl w-[420px] flex flex-col shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-14 px-6 border-b border-hairline flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <Pencil size={16} strokeWidth={1.5} className="text-slate" />
            <span className="text-base font-semibold">{t("renameProject.title")}</span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded flex items-center justify-center text-ink-soft hover:bg-surface-soft transition-colors"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <div className="px-7 py-6">
          <label className="text-[12px] text-ink-soft font-medium block mb-1.5">{t("renameProject.nameLabel")}</label>
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            className="w-full h-10 px-3 border border-hairline rounded-md text-[14px] focus:outline-none focus:border-slate"
          />
          <p className="text-[12px] text-ink-faint mt-2 leading-relaxed">
            {t("renameProject.note")}
          </p>
        </div>

        <div className="h-14 px-6 border-t border-hairline flex items-center justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-md text-[13px] font-medium text-ink-soft hover:bg-surface-soft transition-colors"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={submit}
            disabled={!name.trim() || name.trim() === initialName}
            className="h-9 px-4 rounded-md bg-slate text-white text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {t("renameProject.saveBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}
