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

/**
 * 把 MCP 握手名 / AI 自报名归一成用户认识的工具名（2026-06-10 用户反馈：
 * "小写的 codex 就是 Codex，cowork 也是 claude，不需要单独显示成另一种模型"）。
 * 机器口径（clientInfo.name 如 "codex"、"cowork"、"claude-desktop"）→ 预置工具名；
 * 认不出的自定义名原样保留（如 "Manus"）。纯函数，app 与 MCP server 共用。
 */
export function normalizeSourceTool(name: string): string {
  const raw = (name ?? "").trim();
  if (!raw) return raw;
  const preset = PRESET_SOURCE_TOOLS.find((p) => p.toLowerCase() === raw.toLowerCase());
  if (preset) return preset;
  const n = raw.toLowerCase();
  if (n.includes("codex")) return "Codex"; // 先于 openai：codex 客户端可能自报 openai-codex
  if (n.includes("claude") || n.includes("cowork") || n.includes("anthropic")) return "Claude";
  if (n.includes("chatgpt") || n.includes("openai")) return "ChatGPT";
  if (n.includes("gemini")) return "Gemini";
  if (n.includes("cursor")) return "Cursor";
  if (n.includes("deepseek")) return "DeepSeek";
  if (n.includes("kimi") || n.includes("moonshot")) return "Kimi";
  if (n.includes("grok")) return "Grok";
  return raw;
}
