// 轻量 i18n — 单文件字典 + Context。所有 UI 字符串集中在 DICT,
// 通过 useT() 取。语言持久化在 localStorage。
//
// 添加新 key 的流程:
// 1. 在下方 DICT 加一条 { zh, en }
// 2. 组件里 const t = useT(); 然后 t("your.key")
// 3. 带变量: t("toast.deleted", { name }) — 模板里写 {name}

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type Lang = "zh" | "en";

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
  "welcome.tagline": { zh: "跨 AI 的工作记忆。", en: "Working memory across AIs." },
  "welcome.subtagline": {
    zh: "不需要登录，不上传任何东西，数据在你自己的电脑里。",
    en: "No login. Nothing uploaded. Your data stays on your computer.",
  },
  "welcome.quickStart": { zh: "一键开始", en: "Quick Start" },
  "welcome.quickStartHint": { zh: "会先让你确认保存位置", en: "We'll confirm where to save first" },
  "welcome.newFirstProject": { zh: "新建第一个项目", en: "Create your first project" },
  "welcome.newFirstProjectHint": { zh: "在你的工作区里建一个", en: "Create one in your workspace" },
  "welcome.useExisting": { zh: "使用我已有的文件夹", en: "Use an existing folder" },
  "welcome.switchWorkspace": { zh: "切换到其他工作区", en: "Switch to another workspace" },
  "welcome.markdownNote": {
    zh: "所有内容是普通 Markdown 文件，\n可以用任何编辑器打开、备份、迁移。",
    en: "Everything is plain Markdown —\nopen, back up, or migrate with any editor.",
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
  "sidebar.settingsToast": { zh: "设置面板 V2.1 上线", en: "Settings panel coming in V2.1" },
  "sidebar.help": { zh: "使用帮助", en: "Help" },
  "sidebar.projects": { zh: "项目", en: "PROJECTS" },
  "sidebar.coreFiles": { zh: "核心资料", en: "CORE FILES" },
  "sidebar.aboutMe": { zh: "关于我", en: "About Me" },
  "sidebar.context": { zh: "项目说明", en: "Project Context" },
  "sidebar.decisions": { zh: "决策记录", en: "Decisions" },
  "sidebar.sessionsCount": { zh: "对话历史 ({n})", en: "Sessions ({n})" },
  "sidebar.localMode": { zh: "本地模式", en: "Local mode" },
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
    zh: "开始新对话时,把这段复制给 AI,让它读取你的上下文",
    en: "Paste this into a new AI chat so it reads your context",
  },
  "dashboard.copyEndPrompt": { zh: "复制结束对话指令", en: "Copy end prompt" },
  "dashboard.copyEndPromptHint": {
    zh: "工作结束时,把这段复制给 AI,让它生成对话总结",
    en: "Paste this when wrapping up to have AI generate a handoff",
  },
  "dashboard.currentGoal": { zh: "当前目标", en: "Current goal" },
  "dashboard.progress": { zh: "进度", en: "Progress" },
  "dashboard.focus": { zh: "聚焦", en: "Focus" },
  "dashboard.recentSessions": { zh: "最近对话", en: "Recent sessions" },
  "dashboard.importHandoff": { zh: "导入对话总结", en: "Import handoff" },
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
  "bootstrap.bothEmpty": {
    zh: "你的「关于我」和「项目说明」还是空的",
    en: "Your 'About Me' and 'Project Context' are empty",
  },
  "bootstrap.aboutMeEmpty": {
    zh: "你的「关于我」还是空的",
    en: "Your 'About Me' is empty",
  },
  "bootstrap.contextEmpty": {
    zh: "这个项目的「项目说明」还是空的",
    en: "This project's 'Project Context' is empty",
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
  "bootstrap.copyPromptBtn": { zh: "复制问 AI 的提示词", en: "Copy AI prompt" },
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

  // ── Copy Prompt modal ────────────────────────
  "copyPrompt.title": { zh: "复制结束对话指令", en: "Copy end-session prompt" },
  "copyPrompt.project": { zh: "项目", en: "Project" },
  "copyPrompt.includeLabel": { zh: "附带哪些上下文", en: "What to include" },
  "copyPrompt.fileContext": { zh: "项目说明", en: "Project Context" },
  "copyPrompt.fileDecisions": { zh: "决策记录", en: "Decisions" },
  "copyPrompt.fileLatestSession": { zh: "最近一次对话", en: "Latest session" },
  "copyPrompt.fileAboutMe": { zh: "关于我", en: "About Me" },
  "copyPrompt.globalTag": { zh: "(全局)", en: "(global)" },
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
  "import.parseBtn": { zh: "解析", en: "Parse" },

  // ── Review page ──────────────────────────────
  "review.breadcrumb": { zh: "审核对话总结", en: "Review handoff" },
  "review.title": { zh: "审核这份对话总结", en: "Review this handoff" },
  "review.readyToSave": { zh: "已识别,可保存。", en: "Parsed, ready to save." },
  "review.parsedSections": { zh: "已识别的内容", en: "Parsed sections" },
  "review.sec.metadata": { zh: "元数据", en: "Metadata" },
  "review.sec.workedOn": { zh: "做了什么", en: "What we worked on" },
  "review.sec.decisions": { zh: "关键决策", en: "Key decisions" },
  "review.sec.currentState": { zh: "当前状态", en: "Current state" },
  "review.sec.openQuestions": { zh: "未解决问题", en: "Open questions" },
  "review.sec.nextActions": { zh: "下一步行动", en: "Next actions" },
  "review.sec.compactContext": { zh: "下次对话起点", en: "Compact context" },
  "review.suggestedUpdates": { zh: "建议更新", en: "Suggested updates" },
  "review.riskLow": { zh: "安全", en: "SAFE" },
  "review.riskMedium": { zh: "中等风险", en: "MEDIUM RISK" },
  "review.riskHigh": { zh: "高风险", en: "HIGH RISK" },
  "review.saveSessionRow": { zh: "保存这份对话记录", en: "Save this session file" },
  "review.appendToRow": { zh: "追加到「{file}」", en: "Append to '{file}'" },
  "review.aboutMeWarning": {
    zh: "关于我是长期身份记忆,只勾选稳定且长期的偏好。",
    en: "'About Me' is long-term identity memory — only check stable, lasting preferences.",
  },
  "review.previewLabel": { zh: "▸ 预览", en: "▸ Preview" },
  "review.selectedCount": { zh: "已勾选 {selected} / {total} 项", en: "{selected} of {total} selected" },
  "review.saveBtn": { zh: "保存所选", en: "Save selected" },
  "review.countItems": { zh: "{n} 项", en: "{n} items" },
  "review.countBullets": { zh: "{n} 条", en: "{n} bullets" },
  "review.countChars": { zh: "{n} 字", en: "{n} chars" },

  // ── Help drawer ──────────────────────────────
  "help.title": { zh: "使用帮助", en: "Help" },
  "help.heading": { zh: "跨 AI 的工作记忆", en: "Working memory across AIs" },
  "help.subheading": {
    zh: "你在不同 AI 之间切换时（ChatGPT、Claude、Cursor…），\nMemoryOS 帮你把上下文沉淀成本地文件，换 AI 也能 30 秒续上。",
    en: "When you switch between AIs (ChatGPT, Claude, Cursor…),\nMemoryOS lets context live in local files so any AI can resume in 30 seconds.",
  },
  "help.stepsLabel": { zh: "四步走完一次", en: "FOUR STEPS, ONE LOOP" },
  "help.step1Title": { zh: "在 AI 那边聊完一轮工作", en: "Finish a round of work in any AI" },
  "help.step1Desc": {
    zh: "ChatGPT、Claude、Gemini、Cursor 等都行。聊到一个段落、有结果要记下来的时候。",
    en: "ChatGPT, Claude, Gemini, Cursor — anywhere. Whenever you reach a natural stopping point worth remembering.",
  },
  "help.step2TitlePrefix": { zh: "回这里,点 ", en: "Come back here and click " },
  "help.step2Pill": { zh: "复制结束对话指令", en: "Copy end prompt" },
  "help.step2Desc": {
    zh: "MemoryOS 会拿你这个项目的当前上下文 + 一段标准结束指令,自动写进剪贴板。",
    en: "MemoryOS bundles your project context + a standard end prompt and copies it to your clipboard.",
  },
  "help.step3Title": { zh: "粘回那个 AI,让它整理一份总结", en: "Paste it back into the AI to summarize" },
  "help.step3Desc": {
    zh: "AI 会用固定的 Markdown 格式输出对话总结,包括关键决策、未解决问题、下一步行动。",
    en: "The AI outputs a structured Markdown handoff: key decisions, open questions, next actions.",
  },
  "help.step4TitlePrefix": { zh: "复制总结回来,点 ", en: "Copy the handoff back, click " },
  "help.step4Pill": { zh: "+ 导入对话总结", en: "+ Import handoff" },
  "help.step4Desc": {
    zh: "MemoryOS 会解析、分级风险、让你勾选哪些写入文件。AI 不会绕过你自动修改任何东西。",
    en: "MemoryOS parses, risk-rates, and lets you pick what to save. Nothing is written without your check.",
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
  "help.tryStep2": { zh: "现在试试第 2 步", en: "Try step 2 now" },

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
    zh: "已复制开始对话指令。粘贴到 AI 让它读取你的上下文。",
    en: "Start prompt copied. Paste it into your AI to load your context.",
  },
  "toast.endPromptCopied": {
    zh: "已复制结束对话指令。粘贴到 AI 让它生成总结。",
    en: "End prompt copied. Paste it into your AI to generate a handoff.",
  },
  "toast.sessionSaved": {
    zh: "已保存对话总结。更新了 {n} 个文件。",
    en: "Handoff saved. {n} file(s) updated.",
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
    zh: "# About Me\n\n（在这里写你希望所有 AI 长期记住的偏好。这是高风险文件——MemoryOS 默认不会勾选写入它。）\n",
    en: "# About Me\n\n(Write the preferences you want every AI to remember long-term. This is a high-risk file — MemoryOS won't tick it by default.)\n",
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
