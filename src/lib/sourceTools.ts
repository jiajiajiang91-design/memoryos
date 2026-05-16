// 预置 8 个常用 AI 工具 + 自定义。用户在 CopyPromptModal 里选一个，
// 其名字会写进 handoff 的 "Source Tool:" 元数据。底层是开放字符串，
// 所以用户填的自定义名字（如 "Manus"）也能保存和回显。

export const PRESET_SOURCE_TOOLS = [
  "ChatGPT",
  "Claude",
  "Gemini",
  "Grok",
  "Cursor",
  "Codex",
  "DeepSeek",
  "Kimi",
] as const;

export type PresetSourceTool = (typeof PRESET_SOURCE_TOOLS)[number];

// 统一配色 — Dashboard / FileViewerModal / MetadataPanel 都从这里取
const TINTS: Record<string, string> = {
  ChatGPT:  "bg-[#E8F0E8] text-[#3D6B3D]",
  Claude:   "bg-[#F5E8E0] text-[#A05536]",
  Gemini:   "bg-[#F0E8F0] text-[#6B3D6B]",
  Grok:     "bg-[#E5E5E7] text-[#2F2F33]",
  Cursor:   "bg-[#E8E8F0] text-[#3D3D6B]",
  Codex:    "bg-[#EEEAE5] text-[#6B5F4D]",
  DeepSeek: "bg-[#E0EAEF] text-[#1F4A66]",
  Kimi:     "bg-[#F4EBD4] text-[#7D5F1E]",
};

const FALLBACK_TINT = "bg-surface-soft text-ink-soft";

export function tintFor(tool: string): string {
  return TINTS[tool] ?? FALLBACK_TINT;
}
