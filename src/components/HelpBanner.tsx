import { BookOpen, ChevronRight, X } from "lucide-react";
import { useT } from "../lib/i18n";

type Props = { onOpen: () => void; onDismiss: () => void };

export default function HelpBanner({ onOpen, onDismiss }: Props) {
  const t = useT();
  return (
    <div
      onClick={onOpen}
      className="h-14 mb-6 bg-slate/[0.08] hover:bg-slate/[0.14] border border-slate/15 rounded-lg flex items-center pl-4 pr-2 cursor-pointer select-none transition-colors"
    >
      <BookOpen size={20} strokeWidth={1.5} className="text-slate" />
      <div className="ml-3 flex-1 flex items-baseline gap-2">
        <span className="text-sm font-semibold text-slate">{t("dashboard.helpBannerTitle")}</span>
        <span className="text-slate/40">·</span>
        <span className="text-[13px] text-slate/80">{t("dashboard.helpBannerHint")}</span>
      </div>
      <ChevronRight size={16} strokeWidth={1.5} className="text-slate" />
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        className="ml-3 w-7 h-7 rounded text-slate/60 hover:text-slate hover:bg-slate/10 flex items-center justify-center transition-colors"
        title={t("dashboard.helpBannerDismiss")}
      >
        <X size={15} strokeWidth={1.5} />
      </button>
    </div>
  );
}
