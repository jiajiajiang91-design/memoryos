// 轻量 i18n — 单文件字典 + Context。所有 UI 字符串集中在 DICT,
// 通过 useT() 取。语言持久化在 localStorage。
//
// 添加新 key 的流程:
// 1. 在下方 DICT 加一条 { zh, en }
// 2. 组件里 const t = useT(); 然后 t("your.key")
// 3. 带变量: t("toast.deleted", { name }) — 模板里写 {name}

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Lang } from "./lang";

// Lang 的定义已移到 React-free 的 ./lang，供 Node server 复用；这里 re-export 保持既有 import 路径。
export type { Lang };

const LANG_KEY = "memoryos.lang";

type Entry = { zh: string; en: string };

// 全部 UI 文案。key 用 dot.notation 分区。
const DICT: Record<string, Entry> = {
  // ── 通用 ──────────────────────────────────────
  "common.cancel": { zh: "取消", en: "Cancel" },
  "common.confirm": { zh: "确认", en: "Confirm" },
  "common.save": { zh: "保存", en: "Save" },
  "common.delete": { zh: "删除", en: "Delete" },
  "common.close": { zh: "关闭", en: "Close" },
  "common.refresh": { zh: "刷新", en: "Refresh" },
  "common.optional": { zh: "(可选)", en: "(optional)" },
  "common.required": { zh: "*", en: "*" },
  "common.done": { zh: "完成", en: "Done" },
  "common.undo": { zh: "撤销", en: "Undo" },
  "common.copy": { zh: "复制", en: "Copy" },
  "common.openInOS": { zh: "用系统默认程序打开", en: "Open in system app" },
  "common.justNow": { zh: "刚刚", en: "just now" },
  "common.minutesAgo": { zh: "{n} 分钟前", en: "{n}m ago" },
  "common.hoursAgo": { zh: "{n} 小时前", en: "{n}h ago" },
  "common.daysAgo": { zh: "{n} 天前", en: "{n}d ago" },
  "common.dash": { zh: "—", en: "—" },

  // ── 欢迎屏 ─────────────────────────────────────
  "welcome.tagline": {
    zh: "整合多个 AI 的记忆，无痛切换",
    en: "One memory across all your AIs — switch without losing a thing",
  },
  "welcome.subtagline": {
    zh: "让每一次对话与思考，都成为可延续的资产。",
    en: "Every conversation and every thought, carried forward.",
  },
  "welcome.feat1Title": { zh: "多个 AI，一份记忆", en: "Many AIs, one memory" },
  "welcome.feat1Desc": {
    zh: "ChatGPT、Claude、Kimi 换着用，项目进展和决定不丢。",
    en: "Use ChatGPT, Claude, Kimi interchangeably — progress and decisions carry over.",
  },
  "welcome.feat2Title": { zh: "30 秒接上", en: "Pick up in 30 seconds" },
  "welcome.feat2Desc": {
    zh: "每个项目一页记忆卡片，新对话开场就知道你做到哪了。",
    en: "One page of memory cards per project — every new chat starts informed.",
  },
  "welcome.feat3Title": { zh: "你说了算", en: "You stay in charge" },
  "welcome.feat3Desc": {
    zh: "AI 发回的更新先经你确认才保存，不会乱改你的记忆。",
    en: "AI updates wait for your confirmation — nothing changes behind your back.",
  },
  "welcome.feat4Title": { zh: "普通 Markdown 文件", en: "Plain Markdown files" },
  "welcome.feat4Desc": {
    zh: "存在你的电脑里，任何编辑器都能打开，随时带走。",
    en: "Stored on your computer, open in any editor, yours to take anywhere.",
  },
  "welcome.quickStart": { zh: "一键开始", en: "Quick Start" },
  "welcome.quickStartHint": { zh: "会先让你确认保存位置", en: "We'll confirm where to save first" },
  "welcome.newFirstProject": { zh: "新建第一个项目", en: "Create your first project" },
  "welcome.newFirstProjectHint": { zh: "在你的工作区里建一个", en: "Create one in your workspace" },
  "welcome.useExisting": { zh: "使用我已有的文件夹", en: "Use an existing folder" },
  "welcome.switchWorkspace": { zh: "切换到其他工作区", en: "Switch to another workspace" },
  "welcome.markdownNote": {
    zh: "所有内容是普通 Markdown 文件，\n可以用任何编辑器打开、备份，换电脑直接拷走。",
    en: "Everything is plain Markdown —\nopen it with any editor, back it up, or copy it to a new computer.",
  },

  // ── Setup 弹窗 ────────────────────────────────
  "setup.title": { zh: "保存到哪里?", en: "Where to save?" },
  "setup.defaultLocation": { zh: "默认位置", en: "Default location" },
  "setup.changeLocation": { zh: "换个位置", en: "Change location" },
  "setup.description": {
    zh: "我会在这里建一个 MemoryOS 文件夹，放你的资料和项目。如果文件夹已经存在，不会覆盖你已有的内容。",
    en: "We'll create a MemoryOS folder here for your data. If the folder already exists, existing content won't be overwritten.",
  },
  "setup.useHere": { zh: "就用这里", en: "Use this" },

  // ── 侧栏 ─────────────────────────────────────
  "sidebar.workspace": { zh: "工作区", en: "WORKSPACE" },
  "sidebar.workspaceOverview": { zh: "工作区总览", en: "Workspace overview" },
  "sidebar.settings": { zh: "设置", en: "Settings" },
  "sidebar.settingsToast": { zh: "设置功能还在做，稍后版本提供", en: "Settings are on the way" },
  "sidebar.help": { zh: "使用帮助", en: "Help" },
  "sidebar.projects": { zh: "项目", en: "PROJECTS" },
  "sidebar.coreFiles": { zh: "核心资料", en: "CORE FILES" },
  "sidebar.aboutMe": { zh: "关于我", en: "About Me" },
  "sidebar.context": { zh: "项目说明", en: "Project Context" },
  "sidebar.decisions": { zh: "决策记录", en: "Decisions" },
  "sidebar.cards": { zh: "记忆卡片", en: "Memory Cards" },
  "meta.trustMode": { zh: "信任模式", en: "Trust mode" },
  "meta.trustModeDesc": {
    zh: "AI 发回的更新自动保存，不用逐条确认；对不上的仍会先问你。",
    en: "AI updates save automatically; anything off still asks you first.",
  },
  "toast.trustModeOn": { zh: "信任模式已开启——AI 发回的更新会自动保存", en: "Trust mode on — AI updates now save automatically" },
  "toast.trustModeOff": { zh: "信任模式已关闭——更新恢复逐条确认", en: "Trust mode off — updates need your confirmation again" },
  "toast.autoApplied": { zh: "信任模式：已自动保存 {n} 条更新", en: "Trust mode: {n} update(s) saved automatically" },
  "sidebar.sessionsCount": { zh: "对话历史 ({n})", en: "Sessions ({n})" },
  "sidebar.localMode": { zh: "本地模式", en: "Local mode" },
  "sidebar.mcpActive": { zh: "MCP · {client} · {time}", en: "MCP · {client} · {time}" },
  "sidebar.mcpIdle": { zh: "MCP 未连接", en: "MCP not connected" },
  "sidebar.mcpTooltip": {
    zh: "最近一次 MCP 活动：{client} 调用 {tool}（{time}）",
    en: "Last MCP activity: {client} called {tool} ({time})",
  },
  "sidebar.feedback": { zh: "反馈 / 报 Bug", en: "Feedback / Report bug" },

  // ── FeedbackModal ────────────────────────────
  "feedback.title": { zh: "发送反馈", en: "Send feedback" },
  "feedback.intro": {
    zh: "你的反馈帮我把 MemoryOS 做得更好。点击「复制并打开 Issues」，内容会自动复制到剪贴板，浏览器会打开 GitHub Issues 页面，粘贴提交即可。",
    en: "Your feedback helps me improve MemoryOS. Clicking \"Copy & open Issues\" will copy the content to your clipboard and open GitHub Issues — just paste and submit.",
  },
  "feedback.textareaLabel": {
    zh: "想说什么？（bug / 想法 / 吐槽都行）",
    en: "What's on your mind? (bug / idea / rant — all welcome)",
  },
  "feedback.textareaPlaceholder": {
    zh: "比如：我导入 ChatGPT 的对话总结时…",
    en: "e.g. When I imported a handoff from ChatGPT…",
  },
  "feedback.includeStatsLabel": {
    zh: "附带匿名使用统计",
    en: "Include anonymous usage stats",
  },
  "feedback.statsPreview": {
    zh: "本地记录了 {n} 条事件，最早 {date}",
    en: "{n} local events, earliest {date}",
  },
  "feedback.statsEmpty": {
    zh: "本地暂无使用记录（你还没用过导入和确认流程）",
    en: "No local events yet (you haven't used the import/Review flow)",
  },
  "feedback.privacyNote": {
    zh: "只记录操作类型和次数这类统计信息，不含任何文件内容或个人信息。",
    en: "Only what you did and how often — never file content or personal info.",
  },
  "feedback.bodyHeading": { zh: "反馈内容", en: "Feedback" },
  "feedback.statsHeading": { zh: "使用统计", en: "Usage stats" },
  "feedback.statsSummary": { zh: "{n} 条事件（点击展开）", en: "{n} events (click to expand)" },
  "feedback.copiedToast": {
    zh: "已复制到剪贴板，请粘贴到打开的 Issues 页面",
    en: "Copied to clipboard — paste it into the Issues page that opened",
  },
  "feedback.submitBtn": { zh: "复制并打开 Issues", en: "Copy & open Issues" },
  "sidebar.backToHome": { zh: "返回首页", en: "Back to home" },
  "sidebar.refreshProjects": { zh: "刷新项目列表", en: "Refresh projects" },
  "sidebar.newProject": { zh: "新建项目", en: "New project" },
  "sidebar.refreshed": { zh: "已刷新项目列表", en: "Project list refreshed" },
  "sidebar.selectProjectFirst": { zh: "请先选一个项目", en: "Select a project first" },

  // ── Dashboard ────────────────────────────────
  "dashboard.helpBannerTitle": { zh: "快速了解 MemoryOS", en: "Get to know MemoryOS" },
  "dashboard.helpBannerHint": { zh: "3 分钟上手", en: "3-minute intro" },
  "dashboard.helpBannerDismiss": {
    zh: "关掉横幅（侧栏「使用帮助」入口仍在）",
    en: "Dismiss banner (still accessible from sidebar Help)",
  },
  "dashboard.copyStartPrompt": { zh: "复制开始对话指令", en: "Copy start prompt" },
  "dashboard.copyStartPromptHint": {
    zh: "开始新对话时，把这段复制给 AI，让它了解你和项目进展",
    en: "Paste this into a new AI chat so it knows you and your project",
  },
  "dashboard.copyEndPrompt": { zh: "复制结束对话指令", en: "Copy end prompt" },
  "dashboard.copyEndPromptHint": {
    zh: "工作结束时,把这段复制给 AI,让它生成对话总结",
    en: "Paste this when wrapping up to have AI generate a handoff",
  },
  "dashboard.currentGoal": { zh: "当前目标", en: "Current goal" },
  "dashboard.currentState": { zh: "当前状态", en: "Current state" },
  "dashboard.totalSessions": { zh: "对话总数", en: "Sessions" },
  "dashboard.lastSession": { zh: "最近对话", en: "Last session" },
  "dashboard.focus": { zh: "重点", en: "Focus" },
  "dashboard.recentSessions": { zh: "最近对话", en: "Recent sessions" },
  "dashboard.importHandoff": { zh: "导入对话总结", en: "Import handoff" },
  "dashboard.importHandoffHint": {
    zh: "粘贴 AI 输出的对话总结，确认后更新记忆卡片",
    en: "Paste the AI's handoff — confirm to update your memory cards",
  },
  "dashboard.pendingBadgeHint": {
    zh: "收件箱里有 {n} 条更新等你确认，点开逐条查看",
    en: "{n} update(s) waiting in the inbox — click to go through them",
  },
  "dashboard.reviewPending": { zh: "{n} 条待审", en: "{n} pending" },
  "dashboard.noSessions": { zh: "还没有对话记录", en: "No sessions yet" },
  "dashboard.noSessionsHint": {
    zh: "点上方按钮生成第一份对话总结。",
    en: "Tap the button above to generate your first handoff.",
  },
  "dashboard.viewAllSessions": { zh: "在文件夹中查看全部对话 →", en: "View all sessions in folder →" },
  "dashboard.autosaved": { zh: "已自动保存 · 刚刚", en: "Auto-saved · just now" },

  // ── Bootstrap (引导补全) ──────────────────────
  "bootstrap.bannerHint": {
    zh: "让 AI 帮你 30 秒整理一份初始内容",
    en: "Let AI help draft initial content in 30 seconds",
  },
  "bootstrap.rebuildBtn": {
    zh: "重新整理记忆",
    en: "Re-tidy memory",
  },
  "bootstrap.rebuildBtnTip": {
    zh: "用 AI 重新整理「记忆卡片」和「关于我」。旧的项目说明会被整理进卡片，原文件保留可查。",
    en: "Re-tidy 'Memory Cards' and 'About Me' with AI. Old project context gets folded into the cards; original files are kept.",
  },
  "bootstrap.bothEmpty": {
    zh: "你的「关于我」和这个项目的「记忆卡片」还是空的",
    en: "Your 'About Me' and this project's 'Memory Cards' are empty",
  },
  "bootstrap.aboutMeEmpty": {
    zh: "你的「关于我」还是空的",
    en: "Your 'About Me' is empty",
  },
  "bootstrap.contextEmpty": {
    zh: "这个项目还没有「记忆卡片」",
    en: "This project has no 'Memory Cards' yet",
  },
  "bootstrap.modalTitle": {
    zh: "让 AI 帮你完善初始内容",
    en: "Let AI fill in your initial content",
  },
  "bootstrap.intro": {
    zh: "MemoryOS 需要知道你是谁、项目是什么。最快的方式:复制下面的提示词,粘贴到 ChatGPT / Claude,AI 会问你几个问题,然后输出 Markdown,你复制回来粘到下面的框里保存。",
    en: "MemoryOS needs to know who you are and what your project is. The fastest path: copy a prompt below, paste it into ChatGPT / Claude, answer a few questions, then paste the AI's Markdown output back here to save.",
  },
  "bootstrap.aboutMeTitle": { zh: "关于我", en: "About Me" },
  "bootstrap.aboutMeDesc": {
    zh: "长期身份偏好,所有项目共享",
    en: "Long-term identity preferences, shared across projects",
  },
  "bootstrap.contextTitle": { zh: "项目说明", en: "Project Context" },
  "bootstrap.contextDesc": { zh: "「{name}」的初始状态", en: "Initial state for '{name}'" },
  "bootstrap.cardsTitle": { zh: "记忆卡片", en: "Memory Cards" },
  "bootstrap.cardsDesc": {
    zh: "和 AI 聊几句，生成「{name}」的第一页记忆卡片——以后每次对话开场就靠它",
    en: "A short Q&A with your AI generates the first page of memory cards for '{name}'",
  },
  "bootstrap.cardsPromptCopied": {
    zh: "记忆卡片的提示词已复制。粘贴到 AI，它会问你几个问题。",
    en: "Memory cards prompt copied. Paste it into your AI — it will ask you a few questions.",
  },
  "bootstrap.savedCards": { zh: "已保存「记忆卡片」", en: "'Memory Cards' saved" },
  "bootstrap.cardsRebuildDesc": {
    zh: "把「{name}」现有的项目说明和决策记录整理成一页记忆卡片；原文件保留为历史档案",
    en: "Distill '{name}''s existing context and decisions into one page of Memory Cards; old files stay as archive",
  },
  "entryLib.open": { zh: "记忆库", en: "Memory Library" },
  "entryLib.back": { zh: "返回", en: "Back" },
  "entryLib.userView": { zh: "给我看", en: "For me" },
  "entryLib.aiView": { zh: "给 AI 看", en: "For AI" },
  "entryLib.aiViewHint": {
    zh: "AI 开场拿到的就是这段文字，按重要程度挑选，控制在 1200 字内。当前为预览，正式开场仍用记忆卡片。",
    en: "This is what the AI receives at session start, selected by importance within 1200 characters. Preview only — the live prompt still uses Memory Cards.",
  },
  "entryLib.charCount": { zh: "{n} / 1200 字", en: "{n} / 1200 chars" },
  "entryLib.dropped": { zh: "{n} 条因超出字数暂未放入", en: "{n} entries left out over budget" },
  "entryLib.empty": { zh: "这个项目还没有记忆条目", en: "No memory entries yet" },
  "entryLib.migrateCta": { zh: "把现有记忆卡片整理成条目", en: "Convert existing Memory Cards into entries" },
  "entryLib.migrateDone": { zh: "已整理 {n} 条记忆进条目库", en: "Converted {n} entries" },
  "entryLib.badLines": { zh: "{n} 行数据损坏已跳过，其余条目完好", en: "{n} damaged lines skipped; other entries intact" },
  "entryLib.tierHigh": { zh: "高", en: "High" },
  "entryLib.tierMid": { zh: "中", en: "Mid" },
  "entryLib.tierLow": { zh: "低", en: "Low" },
  "entryLib.tierHint": { zh: "重要程度，点击调档", en: "Importance — click to change" },
  "entryLib.pinHint": { zh: "钉住：永不自动降档或归档", en: "Pin: never auto-demoted or archived" },
  "entryLib.searchPlaceholder": { zh: "搜记忆内容或编号", en: "Search text or id" },
  "entryLib.searchNoHit": { zh: "没有匹配的记忆", en: "No matching entries" },
  "entryLib.relations": { zh: "关联 {n}", en: "{n} linked" },
  "entryLib.libProject": { zh: "项目库", en: "Project" },
  "entryLib.libGlobal": { zh: "全局库", en: "Global" },
  "entryLib.libSkill": { zh: "技能库", en: "Skills" },
  "entryLib.truthVerified": { zh: "已校验", en: "Verified" },
  "entryLib.truthUnverified": { zh: "未校验", en: "Unverified" },
  "entryLib.exportMd": { zh: "导出 md", en: "Export md" },
  "entryLib.exported": { zh: "已复制到剪贴板，可以携带给别的 AI 或粘到文件里手改", en: "Copied — carry it to another AI or edit it by hand" },
  "entryLib.importMd": { zh: "导回 md", en: "Import md" },
  "entryLib.importPlaceholder": { zh: "把改好的 md 全文粘贴到这里，按编号对回", en: "Paste the edited md here; entries match by id" },
  "entryLib.importApply": { zh: "对回", en: "Apply" },
  "entryLib.importDone": { zh: "导回完成：更新 {u} 条，新增 {a} 条，删除 {d} 条", en: "Done: {u} updated, {a} added, {d} deleted" },
  "entryLib.importNothing": { zh: "没有识别到变化", en: "No changes detected" },
  "entryLib.confirmDeletesTitle": { zh: "确认删除", en: "Confirm deletion" },
  "entryLib.confirmDeletes": { zh: "导回的文本里少了 {n} 条记忆。确认把它们删除吗？取消则保留。", en: "{n} entries are missing from the imported text. Delete them? Cancel keeps them." },
  "entryLib.confirmConflictsTitle": { zh: "两边都改过", en: "Edited in both places" },
  "entryLib.confirmConflicts": { zh: "{n} 条记忆在导出后又在应用里改过。用导回的版本覆盖吗？取消则保留应用里的版本。", en: "{n} entries changed in the app after export. Overwrite with the imported version? Cancel keeps the app version." },
  "dashboard.migrateBannerTitle": { zh: "这个项目还没有记忆卡片", en: "This project has no Memory Cards yet" },
  "dashboard.migrateBannerHint": {
    zh: "整理后 AI 开场更短更准；旧资料原样保留为历史档案。也可以什么都不做——下次导入对话总结时会自动生成。",
    en: "Tidy up for shorter, sharper session starts; legacy files stay as archive. Or do nothing — your next handoff import generates the cards automatically.",
  },
  "bootstrap.copyPromptBtn": { zh: "点这里复制提示词，粘贴给你的 AI", en: "Copy this prompt, paste it into your AI" },
  "bootstrap.stepOneLabel": {
    zh: "第一步：复制提示词给 AI，让它问你几个问题",
    en: "Step 1: Copy this prompt to your AI — it will ask you a few questions",
  },
  "bootstrap.stepOneHint": {
    zh: "点击后自动复制到剪贴板，粘贴到 ChatGPT / Claude / 任何 AI 即可",
    en: "Copied to clipboard — paste into ChatGPT / Claude / any AI",
  },
  "bootstrap.stepTwoLabel": {
    zh: "第二步：把 AI 输出的内容粘贴回这里",
    en: "Step 2: Paste the AI's output back here",
  },
  "bootstrap.pasteLabel": {
    zh: "把 AI 输出的 Markdown 内容粘贴到这里:",
    en: "Paste the AI's Markdown output here:",
  },
  "bootstrap.aboutMePromptCopied": {
    zh: "关于我的提示词 已复制。粘贴到 AI 让它问你几个问题。",
    en: "Prompt for 'About Me' copied. Paste it into your AI.",
  },
  "bootstrap.contextPromptCopied": {
    zh: "项目说明的提示词 已复制。粘贴到 AI 让它问你几个问题。",
    en: "Prompt for 'Project Context' copied. Paste it into your AI.",
  },
  "bootstrap.savedAboutMe": { zh: "已保存「关于我」", en: "'About Me' saved" },
  "bootstrap.savedContext": { zh: "已保存「项目说明」", en: "'Project Context' saved" },
  "bootstrap.alreadySaved": { zh: "已保存", en: "Saved" },

  // ── 整理项目记忆（迁移成记忆卡片，PRD·记忆质量升级 F3）──
  "migrate.btn": { zh: "整理项目记忆", en: "Tidy up project memory" },
  "migrate.btnTip": {
    zh: "让 AI 把「项目说明 + 决策记录」整理成一页干净的记忆卡片：过期内容清掉，AI 开场读得更快更准。原文件不动，随时可查。",
    en: "Have an AI tidy Project Context + Decisions into one clean page of memory cards. Old files stay untouched.",
  },
  "migrate.title": { zh: "整理项目记忆", en: "Tidy up project memory" },
  "migrate.intro": {
    zh: "三步：① 复制整理指令 → ② 粘贴到任意 AI，它会把旧资料整理成一页「记忆卡片」 → ③ 把整理结果粘贴回来保存。保存后，「开始 / 结束对话指令」都会改用这一页（更短、只含当前有效的内容）；原有「项目说明」「决策记录」原样保留，随时可查。",
    en: "Three steps: ① copy the tidy-up prompt → ② run it in any AI to get one page of memory cards → ③ paste the result back and save. Start/end prompts will then use this page (shorter, current-only). Your old files stay untouched.",
  },
  "migrate.copyBtn": { zh: "复制整理指令", en: "Copy tidy-up prompt" },
  "migrate.copied": { zh: "已复制", en: "Copied" },
  "migrate.copyHint": { zh: "粘贴到 ChatGPT / Claude / Kimi 等任意 AI", en: "Paste into ChatGPT / Claude / any AI" },
  "migrate.pasteLabel": { zh: "把 AI 整理好的记忆卡片粘贴到这里", en: "Paste the AI's memory cards here" },
  "migrate.pastePlaceholder": { zh: "# 记忆卡片 · ……", en: "# Memory Cards · …" },
  "migrate.charCount": { zh: "{n} 字（建议 {max} 字内）", en: "{n} chars (suggested ≤ {max})" },
  "migrate.overBudget": { zh: "内容偏长，建议让 AI 再精简一轮", en: "a bit long — ask the AI to tighten it" },
  "migrate.saveBtn": { zh: "保存记忆卡片", en: "Save memory cards" },
  "migrate.savedToast": { zh: "记忆卡片已保存——以后「开始 / 结束对话指令」都会用这一页", en: "Memory cards saved — start/end prompts now use this page" },

  // ── Copy Prompt modal ────────────────────────
  "copyPrompt.title": { zh: "复制结束对话指令", en: "Copy end-session prompt" },
  "copyPrompt.project": { zh: "项目", en: "Project" },
  "copyPrompt.includeLabel": { zh: "附带哪些内容", en: "What to include" },
  "copyPrompt.fileContext": { zh: "项目说明", en: "Project Context" },
  "copyPrompt.fileDecisions": { zh: "决策记录", en: "Decisions" },
  "copyPrompt.fileCards": { zh: "记忆卡片（项目记忆一页版）", en: "Memory cards (one-page memory)" },
  "copyPrompt.fileLatestSession": { zh: "最近一次对话", en: "Latest session" },
  "copyPrompt.sourceToolLabel": { zh: "在哪个 AI 里用", en: "Which AI" },
  "copyPrompt.customPlaceholder": { zh: "例如:通义、Manus", en: "e.g. Manus, Qwen" },
  "copyPrompt.customBtn": { zh: "自定义", en: "Custom" },
  "copyPrompt.preview": { zh: "预览指令内容", en: "Preview prompt" },
  "copyPrompt.tokenEstimate": { zh: "约 {n} tokens", en: "~{n} tokens" },
  "copyPrompt.copyBtn": { zh: "复制指令", en: "Copy prompt" },

  // ── Import Handoff modal ─────────────────────
  "import.title": { zh: "导入对话总结", en: "Import handoff" },
  "import.pasteLabel": {
    zh: "把 AI 输出的对话总结粘贴到这里:",
    en: "Paste the AI's handoff output here:",
  },
  "import.detected": { zh: "已识别: {tool} · {date} · {n} 个章节", en: "Detected: {tool} · {date} · {n} sections" },
  "import.autoDetect": { zh: "粘贴有效内容后自动识别", en: "Auto-detected after pasting" },
  "import.partialDetect": {
    zh: "部分识别 — 有些章节可能缺失，导入后请检查",
    en: "Partially detected — some sections may be missing",
  },
  "import.rawDetect": {
    zh: "未识别到标准格式 — 内容将作为原始记录保存",
    en: "Unrecognized format — will be saved as raw session",
  },
  "import.parseBtn": { zh: "识别", en: "Parse" },

  // ── Review page ──────────────────────────────
  "review.breadcrumb": { zh: "审核对话总结", en: "Review handoff" },
  "review.title": { zh: "审核这份对话总结", en: "Review this handoff" },
  "review.readyToSave": { zh: "已识别,可保存。", en: "Parsed, ready to save." },
  "review.parsedSections": { zh: "已识别的内容", en: "Parsed sections" },
  "review.sec.metadata": { zh: "基本信息", en: "Metadata" },
  "review.sec.workedOn": { zh: "做了什么", en: "What we worked on" },
  "review.sec.decisions": { zh: "关键决策", en: "Key decisions" },
  "review.sec.currentState": { zh: "当前状态", en: "Current state" },
  "review.sec.openQuestions": { zh: "未解决问题", en: "Open questions" },
  "review.sec.nextActions": { zh: "下一步行动", en: "Next actions" },
  "review.sec.compactContext": { zh: "下次对话起点", en: "Compact context" },
  "review.suggestedUpdates": { zh: "建议更新", en: "Suggested updates" },
  "review.riskLow": { zh: "常规", en: "ROUTINE" },
  "review.riskMedium": { zh: "请过目", en: "WORTH A LOOK" },
  "review.riskHigh": { zh: "需要你确认", en: "YOUR CALL" },
  "review.saveSessionRow": { zh: "保存这份对话记录", en: "Save this session file" },
  "review.appendToRow": { zh: "追加到「{file}」", en: "Append to '{file}'" },
  "review.updateFileRow": { zh: "更新「{file}」", en: "Update '{file}'" },
  "review.replaceWarning": {
    zh: "这会替换整个文件内容。下滑查看绿色高亮的新增部分，点「编辑」可删掉过时的旧内容。",
    en: "This will replace the entire file. Scroll down to see green-highlighted additions, click 'Edit' to remove outdated content.",
  },
  "review.fullFilePreview": { zh: "▸ 完整文件预览（含新增内容）", en: "▸ Full file preview (with additions)" },
  "review.newContentLabel": { zh: "↓ 新增内容", en: "↓ New additions" },
  "review.supersededLabel": { zh: "⚠ 已过时 — 保存后会被新内容替换", en: "⚠ Outdated — replaced by new content on save" },
  "review.cardsVersionWarning": {
    zh: "这份更新是基于较早的记忆卡片生成的——之后卡片又改动过（可能是另一个对话先保存了）。请仔细看下面的对比再勾选；不放心就丢弃这条，让 AI 重新生成。",
    en: "This update was based on an earlier copy of the memory cards — the cards have changed since (another conversation may have saved first). Check the comparison below before ticking, or discard and let the AI redo it.",
  },
  "review.aiSuggestionRow": { zh: "AI 建议", en: "AI suggestion" },
  "review.pendingBadge": { zh: "待确认", en: "pending" },
  "review.adoptedHint": { zh: "已采纳 — 会作为你今天确认的决定写进记忆卡片", en: "Adopted — saved to the cards as a decision you confirmed today" },
  "review.rejectedHint": { zh: "已驳回 — AI 之后不会再提这条", en: "Rejected — the AI won't suggest this again" },
  "review.untouchedHint": { zh: "不勾也不驳回 = 只留在这份对话记录里，不写进卡片", en: "Untouched = stays in this session record only, not in the cards" },
  "review.rejectBtn": { zh: "驳回", en: "Reject" },
  "review.undoRejectBtn": { zh: "撤销驳回", en: "Undo reject" },
  "review.aboutMeWarning": {
    zh: "关于我是长期身份记忆,只勾选稳定且长期的偏好。",
    en: "'About Me' is long-term identity memory — only check stable, lasting preferences.",
  },
  "review.previewLabel": { zh: "▸ 预览", en: "▸ Preview" },
  "review.editBtn": { zh: "编辑", en: "Edit" },
  "review.currentContentLabel": { zh: "▸ 当前文件内容", en: "▸ Current file content" },
  "review.showCurrentFile": { zh: "▸ 对比当前内容", en: "▸ Compare with current" },
  "review.hideCurrentFile": { zh: "▾ 收起当前内容", en: "▾ Hide current content" },
  "review.selectedCount": { zh: "已勾选 {selected} / {total} 项", en: "{selected} of {total} selected" },
  "review.saveBtn": { zh: "保存所选", en: "Save selected" },
  "review.discardBtn": { zh: "丢弃", en: "Discard" },
  "review.keepPendingBtn": { zh: "稍后再说", en: "Later" },
  "review.countItems": { zh: "{n} 项", en: "{n} items" },
  "review.countBullets": { zh: "{n} 条", en: "{n} bullets" },
  "review.countChars": { zh: "{n} 字", en: "{n} chars" },

  // ── Help drawer ──────────────────────────────
  "help.title": { zh: "使用帮助", en: "Help" },
  "help.heading": { zh: "跨 AI 的工作记忆", en: "Working memory across AIs" },
  "help.subheading": {
    zh: "你在不同 AI 之间切换时（ChatGPT、Claude、Cursor…），\nMemoryOS 把工作记忆存成你电脑里的文件，换一个 AI 也能 30 秒接着干。",
    en: "When you switch between AIs (ChatGPT, Claude, Cursor…),\nMemoryOS keeps your working memory in files on your computer, so any AI picks up in 30 seconds.",
  },
  "help.stepsLabel": { zh: "四步走完一次", en: "FOUR STEPS, ONE LOOP" },
  "help.step0Title": {
    zh: "先准备好「记忆卡片」和「关于我」",
    en: "First, set up 'Memory Cards' and 'About Me'",
  },
  "help.step0Desc": {
    zh: "新建项目后，点击主页上方的黄色提示条，让 AI 问你几个问题、30 秒生成这个项目的「记忆卡片」——一页纸记住项目是什么、到哪了、定过什么。这是后续所有步骤的基础：每次对话开场 AI 读的就是这页卡片。",
    en: "After creating a project, tap the yellow banner: a short Q&A with your AI generates the project's Memory Cards — one page covering what it is, where it stands, and what's been decided. Every session starts from this page.",
  },
  "help.step1Title": { zh: "在 AI 那边聊完一轮工作", en: "Finish a round of work in any AI" },
  "help.step1Desc": {
    zh: "ChatGPT、Claude、Gemini、Cursor 等都行。聊到一个段落、有结果要记下来的时候。",
    en: "ChatGPT, Claude, Gemini, Cursor — anywhere. Whenever you reach a natural stopping point worth remembering.",
  },
  "help.step2TitlePrefix": { zh: "回这里,点 ", en: "Come back here and click " },
  "help.step2Pill": { zh: "复制结束对话指令", en: "Copy end prompt" },
  "help.step2Desc": {
    zh: "MemoryOS 会把这个项目的当前记忆 + 一段固定的结束指令，自动复制到剪贴板。",
    en: "MemoryOS bundles this project's current memory + a standard end prompt and copies it to your clipboard.",
  },
  "help.step3Title": { zh: "粘回那个 AI,让它整理一份总结", en: "Paste it back into the AI to summarize" },
  "help.step3Desc": {
    zh: "AI 会按固定格式输出对话总结：做了什么、你拍板的决定（带原话）、AI 的建议（待确认）、下次起点；项目有记忆卡片时，还会附上整理好的卡片新版。",
    en: "The AI outputs a structured handoff: what happened, decisions you ratified (with quotes), AI suggestions (pending), next starting point — plus an updated version of your Memory Cards.",
  },
  "help.step4TitlePrefix": { zh: "复制总结回来,点 ", en: "Copy the handoff back, click " },
  "help.step4Pill": { zh: "+ 导入对话总结", en: "+ Import handoff" },
  "help.step4Desc": {
    zh: "MemoryOS 解析后让你逐条确认：卡片更新用划线对比展示旧去新来，AI 的建议默认不勾选、可一键驳回。除非你给某个项目开了「信任模式」，否则没有任何内容会未经确认写入。",
    en: "MemoryOS parses everything for your review: card updates show a strike-through diff, AI suggestions are unchecked by default and can be rejected. Unless you enable Trust mode for a project, nothing is written without your check.",
  },
  "help.dataTitle": { zh: "你的数据", en: "Your data" },
  "help.dataBody": {
    zh: "全部在你电脑里的 Markdown 文件。\n不上传任何东西，不需要登录。换电脑就把整个文件夹拷过去。",
    en: "All in plain Markdown files on your machine.\nNothing uploaded, no login. To switch computers, just copy the folder.",
  },
  "help.faqLabel": { zh: "常见问题", en: "FAQ" },
  "help.faqQ1": { zh: "AI 总结的不准怎么办？", en: "What if the AI's summary is wrong?" },
  "help.faqA1": {
    zh: "导入时你能挑哪些保留、哪些丢掉。每条更新都要勾选才写入文件。",
    en: "On import you choose what to keep. Nothing writes to disk without your check.",
  },
  "help.faqQ2": { zh: "想换电脑或者备份？", en: "Want to back up or move computers?" },
  "help.faqA2": {
    zh: "把工作区文件夹整个拷贝到别的地方就行。MemoryOS 只读这个文件夹。",
    en: "Just copy the workspace folder. MemoryOS only reads from there.",
  },
  "help.faqQ3": {
    zh: "可以用 Obsidian / VS Code 直接编辑这些文件吗？",
    en: "Can I edit these files in Obsidian / VS Code directly?",
  },
  "help.faqA3": {
    zh: "可以。所有文件都是普通 Markdown,任何编辑器都能打开。",
    en: "Yes. They're plain Markdown — any editor works.",
  },
  "help.faqQ4": { zh: "「信任模式」是什么？要打开吗？", en: "What is Trust mode? Should I turn it on?" },
  "help.faqA4": {
    zh: "在项目页右侧可以打开。开了之后，连接的 AI 发回的更新会自动保存，不再逐条确认；内容对不上时还是会先问你。建议先用默认的逐条确认，用顺了、信得过了再开。",
    en: "You'll find it on the right side of a project page. When on, updates from connected AIs save automatically instead of waiting for your confirmation; anything that doesn't line up still asks you first. Start with manual confirmation — turn it on once you trust the flow.",
  },
  "help.tryStep2": { zh: "现在试试第 2 步", en: "Try step 2 now" },

  // ── Help drawer · 分栏切换 ───────────────────
  "help.tab.basics": { zh: "使用入门", en: "Getting started" },
  "help.tab.manual": { zh: "复制粘贴教程", en: "Copy & paste" },
  "help.tab.mcp": { zh: "AI 连接教程", en: "Connect AI" },
  "help.manualIntro": {
    zh: "适用于任何 AI——包括连不上本地的网页聊天（ChatGPT、Gemini 等）。聊完一轮工作，按下面四步把记忆带回来。",
    en: "Works with any AI — including web chats that can't connect locally (ChatGPT, Gemini, etc). After a round of work, follow these four steps to bring the memory back.",
  },

  // ── Help drawer · AI 连接教程（Phase 5）───────
  "mcp.heading": { zh: "把你的 AI 连上 MemoryOS", en: "Connect your AI to MemoryOS" },
  "mcp.subheading": {
    zh: "通过 MCP，支持的 AI 可以直接读取你的项目记忆，并把会话总结暂存进 MemoryOS。下面分三种情况：Claude Desktop 一键安装、其他 MCP 客户端手动配置、网页端 AI（暂未支持）。",
    en: "Through MCP, supported AIs can read your project memory directly and stage session handoffs into MemoryOS. Three cases below: one-click for Claude Desktop, manual config for other MCP clients, and web AIs (not yet supported).",
  },
  "mcp.redlineTitle": { zh: "先记住这一条", en: "Read this first" },
  "mcp.redline": {
    zh: "AI 不会直接改你的记忆文件——它发回的内容先进收件箱，你确认后才保存。给某个项目打开「信任模式」后，这一步确认由 MemoryOS 自动完成（内容对不上时仍会先问你）。",
    en: "AI never edits your memory files directly — what it sends back lands in the inbox first, and saves only after you confirm. With Trust mode on for a project, MemoryOS confirms for you (anything that doesn't line up still waits).",
  },

  // 块 1：Claude Desktop（推荐）
  "mcp.s1Title": { zh: "用 Claude Desktop 连接", en: "Connect with Claude Desktop" },
  "mcp.s1Badge": { zh: "推荐", en: "Recommended" },

  "mcp.step1Title": { zh: "安装 memoryos.mcpb，并填入工作区路径", en: "Install memoryos.mcpb and set your workspace path" },
  "mcp.step1Desc": {
    zh: "memoryos.mcpb 已随 MemoryOS 一起提供（在你拿到的安装文件夹里，或 MemoryOS 应用目录内）。打开 Claude Desktop → 设置 → Extensions，选择 memoryos.mcpb 安装。安装时它会让你填 MemoryOS 工作区路径——填你自己电脑上存放记忆的那个文件夹，也就是你现在在 MemoryOS 里用的这个：",
    en: "memoryos.mcpb ships with MemoryOS (in the install folder you received, or inside the MemoryOS app directory). Open Claude Desktop → Settings → Extensions and install memoryos.mcpb. During install it asks for your MemoryOS workspace path — point it at the memory folder on your own computer, i.e. the one you're using in MemoryOS now:",
  },
  "mcp.step1Note": {
    zh: "Claude 只会读取这个文件夹里的记忆，别的什么都碰不到。换电脑或换工作区时，记得把路径改成新的。",
    en: "Claude only reads memory from this folder — nothing else. On a new computer or workspace, update the path.",
  },

  "mcp.step2Title": { zh: "启用扩展，并重启 Claude Desktop", en: "Enable the extension and restart Claude Desktop" },
  "mcp.step2Desc": {
    zh: "装好后，确认这个扩展是「已启用 / Enabled」状态——如果显示已禁用 / Disabled，把开关打开。然后完全退出并重启 Claude Desktop（只关窗口不够，要从系统托盘彻底退出），重启后再新开一个对话。",
    en: "After installing, make sure the extension is Enabled — if it shows Disabled, toggle it on. Then fully quit and restart Claude Desktop (closing the window isn't enough — quit it from the system tray), and start a new conversation afterwards.",
  },
  "mcp.step2WsLabel": { zh: "你的工作区路径", en: "Your workspace path" },
  "mcp.step2WsEmpty": {
    zh: "（请先在 MemoryOS 里选择一个工作区，这里会显示你自己电脑上的真实路径）",
    en: "(select a workspace in MemoryOS first — your own computer's real path shows here)",
  },
  "mcp.step2Note": {
    zh: "这一步最容易漏：扩展没启用、没重启、或在重启前的旧对话里测试，都会让工具显示「不可用」。",
    en: "This is the easiest step to miss: a disabled extension, no restart, or testing in a pre-restart conversation all make the tools show up as \"unavailable\".",
  },

  "mcp.step3Title": { zh: "测试：让 Claude 读取你的记忆", en: "Test: have Claude read your memory" },
  "mcp.step3Desc": {
    zh: "连接好之后，在 Claude Desktop 的新对话里让它读取你的记忆。把下面这句发给 Claude：",
    en: "Once connected, in a new Claude Desktop conversation ask it to read your memory. Send it this:",
  },
  "mcp.step3PromptLabel": { zh: "示例 prompt", en: "Example prompt" },
  "mcp.step3Prompt": {
    zh: "先用 list_projects 看看我的 MemoryOS 里有哪些项目，挑一个，再用 get_project_memory 读取它，然后用一句话回述你的理解。",
    en: "First call list_projects to see what projects are in my MemoryOS, pick one, then use get_project_memory to load it, and echo your understanding in one sentence.",
  },
  "mcp.step3Note": {
    zh: "这一步只读，不会改动任何文件。Claude 回述理解后，就能接着帮你干活。",
    en: "This step is read-only — it changes nothing. Once Claude echoes its understanding, it can pick up where you left off.",
  },

  "mcp.step4Title": { zh: "结束时：让 Claude 把总结存回来", en: "Wrapping up: have Claude save the summary back" },
  "mcp.step4Desc": {
    zh: "工作告一段落时，让 Claude 把这轮总结暂存起来。把下面这句发给 Claude：",
    en: "When you reach a stopping point, ask Claude to stage a summary of this session. Send it this:",
  },
  "mcp.step4PromptLabel": { zh: "示例 prompt", en: "Example prompt" },
  "mcp.step4Prompt": {
    zh: "我们这轮工作结束了，请用 MemoryOS 的 save_session_handoff，按标准结构把这次会话的总结暂存起来。",
    en: "We're wrapping up this session — please use MemoryOS's save_session_handoff to stage a structured summary of what we did.",
  },
  "mcp.step4Note": {
    zh: "默认这只会进收件箱，回 MemoryOS 确认后才保存。如果这个项目开了「信任模式」，打开 MemoryOS 时会自动保存并提示你。项目还没有记忆卡片的话，这一步会顺便生成第一页。",
    en: "By default this only enters the inbox — confirm in MemoryOS to save. With Trust mode on, MemoryOS saves it automatically and lets you know. If the project has no Memory Cards yet, this step creates the first page.",
  },

  "mcp.step5Title": { zh: "回到 MemoryOS 确认保存", en: "Back in MemoryOS: confirm to save" },
  "mcp.step5Desc": {
    zh: "回到 MemoryOS，主页会出现「待审」提示。点开后逐条确认、编辑或丢弃——你确认了，内容才会写进记忆。",
    en: "Back in MemoryOS, a \"pending\" badge appears on the dashboard. Open it to confirm, edit, or discard each item — nothing is written to memory until you say so.",
  },

  // 块 2：其他支持 MCP stdio 的桌面端 / 代码 Agent（高级手动配置）
  "mcp.s2Title": { zh: "其他支持 MCP stdio 的客户端", en: "Other MCP-stdio clients" },
  "mcp.s2Badge": { zh: "高级配置", en: "Advanced" },
  "mcp.s2Desc": {
    zh: "这些客户端不是 .mcpb 一键安装，需要在它们各自的配置里手动加一个 MCP stdio server。支持 MCP stdio 的客户端通常可以这样配置：",
    en: "These aren't one-click .mcpb installs — you add an MCP stdio server manually in each client's own config. Clients that support MCP stdio can usually be configured like this:",
  },
  "mcp.s2Clients": {
    zh: "例如 Codex、Claude Code、Cursor、Continue、Cline 等。",
    en: "e.g. Codex, Claude Code, Cursor, Continue, Cline.",
  },
  "mcp.s2ConfigLabel": { zh: "通用配置思路", en: "Generic config" },
  "mcp.s2ServerPlaceholder": {
    zh: "<你的 MemoryOS 安装目录>/_up_/server/dist/index.mjs",
    en: "<your MemoryOS install>/_up_/server/dist/index.mjs",
  },
  "mcp.s2WsPlaceholder": { zh: "<你的 MemoryOS workspace 路径>", en: "<your MemoryOS workspace path>" },
  "mcp.s2Note": {
    zh: "这是通用思路，不保证每个客户端都已完整验证；具体字段名和文件格式（JSON / TOML 等）以各客户端的 MCP 配置文档为准。",
    en: "This is the general idea — not every client is fully verified. Exact field names and file format (JSON / TOML, etc.) follow each client's own MCP config docs.",
  },

  // 块 3：网页端 AI / 浏览器插件（Planned）
  "mcp.s3Title": { zh: "网页端 AI / 浏览器插件", en: "Web AI / browser extension" },
  "mcp.s3Badge": { zh: "Planned", en: "Planned" },
  "mcp.s3Desc": {
    zh: "ChatGPT、Gemini、DeepSeek、Kimi 等网页版现在连不上本地 MCP server。未来计划通过浏览器插件 / 同步方案支持——本轮暂未实现。",
    en: "Web versions of ChatGPT, Gemini, DeepSeek, Kimi, etc. can't reach a local MCP server today. Planned for the future via a browser extension / sync — not in this release.",
  },
  "mcp.s3Interim": {
    zh: "在那之前，这些 AI 请用「复制粘贴教程」那一栏把记忆带回来——最后都会进同一个收件箱等你确认。",
    en: "Until then, use the \"Copy & paste\" tab to bring memory back from those AIs — it all lands in the same inbox for your confirmation.",
  },

  "mcp.projectFallback": { zh: "你的项目名", en: "your project" },
  "mcp.copyPath": { zh: "复制路径", en: "Copy path" },
  "mcp.copyPrompt": { zh: "复制", en: "Copy" },
  "mcp.copyConfig": { zh: "复制配置", en: "Copy config" },
  "common.copied": { zh: "已复制", en: "Copied" },


  // ── New project modal ────────────────────────
  "newProject.title": { zh: "新建项目", en: "New project" },
  "newProject.nameLabel": { zh: "项目名", en: "Project name" },
  "newProject.namePlaceholder": { zh: "例如:转行作品集", en: "e.g. Career-switch portfolio" },
  "newProject.descLabel": { zh: "一句话简介", en: "One-line summary" },
  "newProject.descPlaceholder": { zh: "可以稍后再填", en: "You can fill this in later" },
  "newProject.goalLabel": { zh: "当前目标", en: "Current goal" },
  "newProject.goalPlaceholder": { zh: "可以稍后再填", en: "You can fill this in later" },
  "newProject.createBtn": { zh: "创建", en: "Create" },

  // ── 项目右键菜单 ─────────────────────────────
  "projectMenu.more": { zh: "更多", en: "More" },
  "projectMenu.rename": { zh: "重命名", en: "Rename" },
  "projectMenu.delete": { zh: "删除", en: "Delete" },

  // ── Rename modal ─────────────────────────────
  "renameProject.title": { zh: "重命名项目", en: "Rename project" },
  "renameProject.nameLabel": { zh: "新名字", en: "New name" },
  "renameProject.note": {
    zh: "只改显示名,不动文件夹路径。已有的对话和文件都保留。",
    en: "Only the display name changes — the folder and files stay put.",
  },
  "renameProject.saveBtn": { zh: "保存", en: "Save" },

  // ── File viewer ──────────────────────────────
  "fileViewer.empty": { zh: "这个文件还是空的。", en: "This file is empty." },
  "fileViewer.editing": { zh: "编辑中", en: "Editing" },

  // ── Metadata panel ───────────────────────────
  "meta.status": { zh: "状态", en: "Status" },
  "meta.time": { zh: "时间", en: "Time" },
  "meta.created": { zh: "创建", en: "Created" },
  "meta.updated": { zh: "更新", en: "Updated" },
  "meta.stats": { zh: "统计", en: "Stats" },
  "meta.statSessions": { zh: "对话数", en: "Sessions" },
  "meta.statDecisions": { zh: "决策数", en: "Decisions" },
  "meta.statGoals": { zh: "目标数", en: "Goals" },
  "meta.usedAi": { zh: "使用过的 AI", en: "AIs used" },
  "meta.pageNav": { zh: "页内导航", en: "On this page" },
  "meta.statusProgress": { zh: "进行中", en: "In progress" },
  "error.projectNameEmpty": { zh: "项目名不能为空", en: "Project name can't be empty" },
  "error.projectNotFound": { zh: "找不到项目", en: "Project not found" },

  // ── Toasts / 状态消息 ─────────────────────────
  "toast.startPromptCopied": {
    zh: "已复制开始对话指令。粘贴到 AI，它就知道你是谁、做到哪了。",
    en: "Start prompt copied. Paste it into your AI — it'll know who you are and where things stand.",
  },
  "toast.endPromptCopied": {
    zh: "已复制结束对话指令。粘贴到 AI 让它生成总结。",
    en: "End prompt copied. Paste it into your AI to generate a handoff.",
  },
  "toast.sessionSaved": {
    zh: "已保存对话总结。更新了 {n} 个文件。",
    en: "Handoff saved. {n} file(s) updated.",
  },
  "toast.fileSaved": {
    zh: "已保存「{name}」",
    en: "'{name}' saved",
  },
  "toast.created": { zh: "已创建「{name}」", en: "'{name}' created" },
  "toast.createFailed": { zh: "创建失败: {err}", en: "Creation failed: {err}" },
  "toast.renamed": { zh: "已重命名为「{name}」", en: "Renamed to '{name}'" },
  "toast.renameFailed": { zh: "重命名失败: {err}", en: "Rename failed: {err}" },
  "toast.movedToTrash": {
    zh: "已把「{name}」移到回收站",
    en: "'{name}' moved to trash",
  },
  "toast.restored": { zh: "已还原「{name}」", en: "'{name}' restored" },
  "toast.restoreFailed": { zh: "还原失败: {err}", en: "Restore failed: {err}" },
  "toast.trashFailed": { zh: "移到回收站失败: {err}", en: "Trash failed: {err}" },
  "toast.openFailed": { zh: "打不开: {err}", en: "Could not open: {err}" },

  // ── 删除确认对话框 ────────────────────────────
  "confirm.deleteTitle": { zh: "删除项目", en: "Delete project" },
  "confirm.deleteMsg": {
    zh: "确定要删除「{name}」吗?\n\n会把整个项目(包括所有对话历史)移到系统回收站。5 秒内可点撤销,过后也能从回收站还原。",
    en: "Delete '{name}'?\n\nThe whole project (including all session history) will go to the system trash. You'll have 5s to undo, or restore later from the trash.",
  },
  "confirm.deleteOk": { zh: "移到回收站", en: "Move to trash" },

  // ── Undo toast ───────────────────────────────
  "undo.toastPrefix": { zh: "已把「{name}」移到回收站", en: "'{name}' moved to trash" },
  "undo.button": { zh: "撤销", en: "Undo" },

  // ── Workspace picker ─────────────────────────
  "picker.selectWorkspace": { zh: "选择 MemoryOS 工作区", en: "Select MemoryOS workspace" },
  "picker.pickLocation": { zh: "选择保存位置", en: "Pick a save location" },

  // ── 语言切换 ──────────────────────────────────
  "lang.switchTitle": { zh: "Switch to English", en: "切换到中文" },
  "lang.shortZh": { zh: "中", en: "中" },
  "lang.shortEn": { zh: "EN", en: "EN" },

  // ── 示例项目 (sample project) — 仅当 slug=="我的第一个项目" 且未被用户改名时使用 ──
  "sample.name": { zh: "我的第一个项目", en: "My first project" },
  "sample.description": {
    zh: "示例项目 — 跑通一次完整流程后,可以删掉再建你自己的",
    en: "Sample project — feel free to delete this once you've tried the full loop",
  },
  "sample.currentGoal": {
    zh: "试一次完整流程:在 ChatGPT 或 Claude 聊几句,回到这里点「复制结束对话指令」,把生成的对话总结粘贴回来。",
    en: "Try the full loop: chat with ChatGPT or Claude for a bit, come back here, click 'Copy end prompt', paste the AI's handoff back.",
  },
  "sample.bullet1": { zh: "第 1 步:在外部 AI 完成一段工作", en: "Step 1: Do a round of work in any external AI" },
  "sample.bullet2": { zh: "第 2 步:回来点主按钮,复制结束指令", en: "Step 2: Come back, click the main button, copy the end prompt" },
  "sample.bullet3": { zh: "第 3 步:粘贴到 AI,让它生成总结", en: "Step 3: Paste into the AI, ask it to generate a handoff" },
  "sample.bullet4": { zh: "第 4 步:复制总结回来,点导入", en: "Step 4: Copy the handoff back, click Import" },
  "sample.focus": { zh: "走完一次完整流程", en: "Complete one full loop" },
  "sample.statusLabel": { zh: "进行中", en: "In progress" },

  // ── 初始 md 模板 (写入磁盘的脚手架文案) ──
  "template.aboutMe": {
    zh: "# About Me\n\n（在这里写你希望所有 AI 长期记住的偏好。这份内容很重要——AI 想改它时，MemoryOS 总会先问你。）\n",
    en: "# About Me\n\n(Write the preferences you want every AI to remember long-term. This file matters — MemoryOS always asks you before an AI changes it.)\n",
  },
  "template.sampleCards": {
    zh: "# 记忆卡片 · 我的第一个项目\n> 整理于 {date}\n\n## 项目卡\n这是一个示例项目，带你走一遍 MemoryOS 的完整流程。走完后可以删掉它，建你自己的项目。\n\n## 当前状态\n- 已完成：安装 MemoryOS\n- 进行中：第一次完整流程（复制开始指令 → 在 AI 里工作 → 复制结束指令 → 导入确认）\n- 当前卡点：无\n\n## 约束与决策\n- [{date}][用户拍板] 示例：每条决策都带日期和来源；AI 的建议要经你确认才会出现在这里\n\n## 上次对话总结\n还没有对话。点上方「复制开始对话指令」，粘贴到 ChatGPT / Claude / Kimi，就是你的第一次对话。\n\n## 历史档案\n- 决策历史 → decisions.md ／ 历次对话总结 → sessions/\n（AI 需要细节时再调取，不用全读）\n",
    en: "# Memory Cards · My First Project\n> Tidied {date}\n\n## Project\nA sample project that walks you through the full MemoryOS loop. Delete it afterwards and create your own.\n\n## Current State\n- Done: installed MemoryOS\n- In progress: first full loop (copy start prompt → work in an AI → copy end prompt → import & confirm)\n- Stuck on: nothing\n\n## Constraints & Decisions\n- [{date}][ratified] Example: every decision carries a date and a source; AI suggestions only land here after you confirm them\n\n## Last Session Summary\nNo sessions yet. Click 'Copy start prompt' above and paste it into ChatGPT / Claude — that's your first one.\n\n## Archives\n- Decision history → decisions.md / past session summaries → sessions/\n(Fetched on demand — no need to read everything.)\n",
  },
  "template.sampleContext": {
    zh: "# 项目说明\n\n这里写项目的当前状态。MemoryOS 会在你导入对话总结时,把 AI 的更新建议追加到这个文件。\n",
    en: "# Project Context\n\nWrite the project's current state here. When you import a handoff, MemoryOS appends AI's suggested updates to this file.\n",
  },
  "template.sampleDecisions": {
    zh: "# 决策记录\n\n这里记录项目的关键决策。每条决策包含原因和影响。\n",
    en: "# Decisions\n\nRecord key project decisions here. Each one includes reason and impact.\n",
  },
  "template.newContextHeading": { zh: "# {name} — 项目说明\n\n", en: "# {name} — Project Context\n\n" },
  "template.newDecisionsHeading": { zh: "# 决策记录\n\n", en: "# Decisions\n\n" },
};

// ── Context ───────────────────────────────────
type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<Ctx | null>(null);

function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  let out = s;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split("{" + k + "}").join(String(v));
  }
  return out;
}

/**
 * 非 React 模块用的同步 t() — 直接从 localStorage 读 lang。
 * 用在 fs.ts 等 .ts 文件里(那里没有 React Context)。
 */
export function tSync(key: string, vars?: Record<string, string | number>): string {
  const saved = localStorage.getItem(LANG_KEY);
  const lang: Lang = saved === "en" || saved === "zh" ? saved : "zh";
  const entry = DICT[key];
  if (!entry) return key;
  return interpolate(entry[lang] ?? entry.en ?? key, vars);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "en" || saved === "zh") return saved;
    return "zh";
  });

  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem(LANG_KEY, l);
  };

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);

  const value = useMemo<Ctx>(
    () => ({
      lang,
      setLang,
      t: (key, vars) => {
        const entry = DICT[key];
        if (!entry) {
          if (typeof console !== "undefined") console.warn("[i18n] missing key:", key);
          return key;
        }
        return interpolate(entry[lang] ?? entry.en ?? key, vars);
      },
    }),
    [lang]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

export function useT() {
  return useI18n().t;
}

export function useLang(): [Lang, (l: Lang) => void] {
  const { lang, setLang } = useI18n();
  return [lang, setLang];
}
