import { useEffect, useRef, useState } from "react";
import { X, FolderPlus } from "lucide-react";
import { useT } from "../lib/i18n";

type Props = {
  onClose: () => void;
  onCreate: (opts: { name: string; description: string; currentGoal: string }) => void;
};

export default function NewProjectModal({ onClose, onCreate }: Props) {
  const t = useT();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [currentGoal, setCurrentGoal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = () => {
    if (!name.trim()) return;
    onCreate({ name: name.trim(), description: description.trim(), currentGoal: currentGoal.trim() });
  };

  return (
    <div
      className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center px-8 py-10"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-xl w-[480px] flex flex-col shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-14 px-6 border-b border-hairline flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <FolderPlus size={18} strokeWidth={1.5} className="text-slate" />
            <span className="text-base font-semibold">{t("newProject.title")}</span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded flex items-center justify-center text-ink-soft hover:bg-surface-soft transition-colors"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        {/* Body */}
        <div className="px-7 py-6 space-y-5">
          <Field label={t("newProject.nameLabel")} required>
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              placeholder={t("newProject.namePlaceholder")}
              className="w-full h-10 px-3 border border-hairline rounded-md text-[14px] focus:outline-none focus:border-slate"
            />
          </Field>

          <Field label={t("newProject.descLabel")} optional optionalLabel={t("common.optional")}>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              placeholder={t("newProject.descPlaceholder")}
              className="w-full h-10 px-3 border border-hairline rounded-md text-[14px] focus:outline-none focus:border-slate"
            />
          </Field>

          <Field label={t("newProject.goalLabel")} optional optionalLabel={t("common.optional")}>
            <textarea
              value={currentGoal}
              onChange={(e) => setCurrentGoal(e.target.value)}
              placeholder={t("newProject.goalPlaceholder")}
              rows={3}
              className="w-full px-3 py-2 border border-hairline rounded-md text-[14px] leading-relaxed resize-y focus:outline-none focus:border-slate"
            />
          </Field>
        </div>

        {/* Footer */}
        <div className="h-14 px-6 border-t border-hairline flex items-center justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-md text-[13px] font-medium text-ink-soft hover:bg-surface-soft transition-colors"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={submit}
            disabled={!name.trim()}
            className="h-9 px-4 rounded-md bg-slate text-white text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {t("newProject.createBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label, optional, optionalLabel, required, children,
}: {
  label: string;
  optional?: boolean;
  optionalLabel?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-[12px] text-ink-soft font-medium block mb-1.5">
        {label}
        {required && <span className="text-warn ml-1">*</span>}
        {optional && optionalLabel && <span className="text-ink-faint ml-1">{optionalLabel}</span>}
      </label>
      {children}
    </div>
  );
}
