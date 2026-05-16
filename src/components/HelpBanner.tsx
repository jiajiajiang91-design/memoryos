import { BookOpen, ChevronRight, X } from "lucide-react";

type Props = { onOpen: () => void; onDismiss: () => void };

export default function HelpBanner({ onOpen, onDismiss }: Props) {
  return (
    <div
      onClick={onOpen}
      className="h-14 mb-6 bg-surface-soft hover:bg-surface-warm rounded-lg flex items-center pl-4 pr-3 cursor-pointer select-none transition-colors"
    >
      <BookOpen size={20} strokeWidth={1.5} className="text-slate" />
      <div className="ml-3 flex-1 flex items-baseline gap-2">
        <span className="text-sm font-medium">快速了解 MemoryOS</span>
        <span className="text-ink-faint">·</span>
        <span className="text-[13px] text-ink-soft">3 分钟上手</span>
      </div>
      <ChevronRight size={16} strokeWidth={1.5} className="text-ink-soft" />
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        className="ml-4 w-6 h-6 rounded text-ink-soft flex items-center justify-center hover:bg-surface-warm transition-colors"
        title="关闭"
      >
        <X size={16} strokeWidth={1.5} />
      </button>
    </div>
  );
}
