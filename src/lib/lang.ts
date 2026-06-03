// 语言类型的单一来源（React-free），便于纯逻辑模块（parser.ts 的 prompt builder 等）
// 被 Node 版 MCP server 复用而不必拉进 i18n.tsx（含 React）。i18n.tsx 从这里 re-export。
export type Lang = "zh" | "en";
