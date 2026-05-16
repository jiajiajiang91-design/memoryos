/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper:          "#FAFAF7",
        surface:        "#FFFFFF",
        "surface-soft": "#F4F4F5",
        "surface-warm": "#EBEBEE",
        ink:            "#18181B",
        "ink-soft":     "#52525B",
        "ink-faint":    "#A1A1AA",
        hairline:       "#E4E4E7",
        slate:          "#525A6B",
        ochre:          "#D4A571",
        warn:           "#C44545",
        ok:             "#16A34A",
      },
      fontFamily: {
        sans: ['"Noto Sans SC"', '"Source Han Sans CN"', '"Inter"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "Menlo", "monospace"],
      },
      maxWidth: { doc: "720px" },
    },
  },
  plugins: [],
};
