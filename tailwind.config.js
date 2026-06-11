/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // 2026-06-11 换肤：重点色改克莱因蓝 IKB（来自 guizang-ppt-skill 色板），
        // 背景由暖灰转冷灰，配浮动卡片布局。token 名不变，旧类名全部继续生效。
        paper:          "#EEF1F6",
        surface:        "#FFFFFF",
        "surface-soft": "#F3F5FA",
        "surface-warm": "#E7EBF4",
        ink:            "#16181D",
        "ink-soft":     "#525866",
        "ink-faint":    "#9AA1AE",
        hairline:       "#E4E8F0",
        slate:          "#002FA7",
        "slate-bright": "#5B7BFF",
        ochre:          "#D4A571",
        warn:           "#C44545",
        ok:             "#16A34A",
      },
      boxShadow: {
        panel: "0 1px 2px rgba(16,24,64,0.04), 0 8px 24px rgba(16,24,64,0.07)",
        "panel-lg": "0 2px 4px rgba(16,24,64,0.05), 0 16px 40px rgba(16,24,64,0.10)",
        btn: "0 1px 2px rgba(16,24,64,0.06)",
        "btn-hover": "0 3px 8px rgba(16,24,64,0.10)",
        ikb: "0 6px 18px rgba(0,47,167,0.26)",
      },
      // 全本机字体（不联网）：中文雅黑系，数字/展示走 .font-display（Bahnschrift）
      fontFamily: {
        sans: ['"Noto Sans SC"', '"Microsoft YaHei UI"', '"Microsoft YaHei"', '"Segoe UI"', "system-ui", "sans-serif"],
        mono: ['"Cascadia Mono"', '"JetBrains Mono"', "Consolas", "ui-monospace", "monospace"],
      },
      maxWidth: { doc: "720px" },
    },
  },
  plugins: [],
};
