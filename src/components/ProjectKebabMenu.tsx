import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";

type Props = {
  onRename: () => void;
  onDelete: () => void;
};

export default function ProjectKebabMenu({ onRename, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
          open ? "bg-surface-soft text-ink" : "text-ink-soft hover:bg-surface-soft hover:text-ink"
        }`}
        title="更多"
      >
        <MoreHorizontal size={14} strokeWidth={1.5} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-6 z-30 w-32 bg-surface border border-hairline rounded-md shadow-[0_4px_12px_rgba(0,0,0,0.08)] py-1"
        >
          <MenuItem
            icon={Pencil}
            label="重命名"
            onClick={() => { setOpen(false); onRename(); }}
          />
          <MenuItem
            icon={Trash2}
            label="删除"
            danger
            onClick={() => { setOpen(false); onDelete(); }}
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon, label, onClick, danger,
}: {
  icon: React.ComponentType<any>;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full h-8 px-3 flex items-center gap-2 text-[13px] transition-colors ${
        danger ? "text-warn hover:bg-[#FEE]" : "text-ink hover:bg-surface-soft"
      }`}
    >
      <Icon size={13} strokeWidth={1.5} />
      {label}
    </button>
  );
}
