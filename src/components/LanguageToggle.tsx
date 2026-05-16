// 中 / EN 紧凑切换。active 一边加粗 + 染色,inactive 一边低饱和。
// 放在侧栏底部 + 欢迎屏右上角。

import { useLang } from "../lib/i18n";

type Props = {
  size?: "sm" | "md";
};

export default function LanguageToggle({ size = "sm" }: Props) {
  const [lang, setLang] = useLang();
  const tiny = size === "sm";
  const padding = tiny ? "px-1.5 py-0.5" : "px-2 py-1";
  const text = tiny ? "text-[12px]" : "text-[13px]";

  return (
    <div className={`inline-flex items-center ${text}`} role="group" aria-label="Language">
      <button
        type="button"
        onClick={() => setLang("zh")}
        aria-pressed={lang === "zh"}
        className={`${padding} rounded transition-colors ${
          lang === "zh"
            ? "text-slate font-semibold"
            : "text-ink-faint hover:text-ink-soft"
        }`}
      >
        中
      </button>
      <span className="text-ink-faint">/</span>
      <button
        type="button"
        onClick={() => setLang("en")}
        aria-pressed={lang === "en"}
        className={`${padding} rounded transition-colors ${
          lang === "en"
            ? "text-slate font-semibold"
            : "text-ink-faint hover:text-ink-soft"
        }`}
      >
        EN
      </button>
    </div>
  );
}
