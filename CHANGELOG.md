# Changelog

## v0.3.0 — 2026-06-10

### 新增 — 记忆卡片（记忆质量升级）

- **记忆卡片（cards.md）**：每个项目一页结构化记忆——项目卡 / 当前状态 / 约束与决策（每条带日期与来源）/ 上次对话总结 / 历史档案索引。AI 开场只读这一页（更短、只含当前有效内容），项目主页直接展示卡片本体，可随时编辑
- **新项目卡片原生**：新建项目的引导直接生成第一页记忆卡片；示例项目自带示例卡片
- **旧项目一键整理**：右栏「整理项目记忆」把现有项目说明 + 决策记录交给 AI 整理成卡片；原文件原样保留为历史档案
- **结束对话指令升级**：AI 按"做了什么 / 你拍板的决定（附原话+日期）/ AI 建议（待确认）/ 下次起点"四栏输出，并附整理后的卡片新版；AI 的建议与用户的决定严格分栏，未经确认的建议不会进入记忆
- **Review 升级**：卡片更新以划线对比展示（旧去新来一目了然）；AI 建议默认不勾选，可一键采纳为决策或驳回（驳回后 AI 不再重复提）

### 新增 — 信任模式

- **每项目可选开关**：开启后，AI 通过 MCP 写回的更新自动入库，无需逐条确认；内容有冲突时仍留人工审核。默认关闭

### 新增 — 连接 AI（MCP）升级

- `get_project_memory` 返回记忆卡片，AI 以卡片为准开场，历史档案按需调取
- `save_session_handoff` 支持卡片更新提案与 AI 建议分栏；项目还没有卡片时自动生成第一页
- `.mcpb` 扩展包同步更新（升级用户需重新安装扩展并完全重启 Claude Desktop）

### 改

- 核心资料查看从 Markdown 原文改为排版后的阅读视图（编辑仍是原文）
- 粘贴内容自动清理行首缩进（修复从聊天窗口复制导致的格式问题）
- 使用帮助同步更新为记忆卡片与信任模式的当前流程

---

## v0.2.0 — 2026-06-03

### 新增 — 连接 AI（MCP）

- **MemoryOS MCP server**：支持 AI 客户端通过 MCP 直接连接本地记忆，提供三个工具——`list_projects`（列出项目）/ `get_project_memory`（读取项目记忆：about_me + 项目说明 + 决策 + 最新 Compact Context）/ `save_session_handoff`（暂存对话总结）。server 为自包含 bundle，运行不依赖联网
- **Claude Desktop 一键扩展**：打包 `memoryos.mcpb`，在 Claude Desktop → Extensions 里安装即用；安装时填入工作区路径，注入为 `MEMORYOS_WORKSPACE`，AI 只读这个文件夹
- **使用帮助新增「AI 连接教程」分栏**：Claude Desktop 推荐 `.mcpb` 教程 / 其他 MCP stdio 客户端高级手动配置 / 网页端标 Planned；含安装 → 启用 → 重启 → 测试读取 → 暂存 handoff → 回 App Review 的完整六步
- **侧栏连接状态**：显示最近连接的 AI 客户端与活动

### 新增 — 记忆收件箱（Inbox）

- **Inbox + Review 入库**：AI 通过 MCP 写回的总结、以及手动导入的 handoff，都先进「待审收件箱」，不直接写正式记忆；Dashboard 出现「待审」提示，逐条确认 / 编辑 / 丢弃后才入库——保留「用户是最后一道关」红线
- **Review 锚定目标项目**：保存只写入该待审条目自己的目标项目，杜绝点错项目时的 mis-filing

### 改

- 安装包版本号统一升至 0.2.0（app）；MCP server 独立版本线 0.3.0

---

## v0.1.2 — 2026-05-27

### 新增 — 记忆现时性

- **Superseded 智能合并**：导入 handoff 时如果 AI 在 Suggested Updates 段标注了 `**Superseded:** ...`，Review 页会自动把旧文件里被标的段落用红色删除线划掉，新内容用绿色高亮，加 `_Updated YYYY-MM-DD_` 时间戳合并到原文件。覆盖 `00_context.md` / `decisions.md` / `about_me.md` 三个文件
- **Review 页对比视图**：旧内容灰色 + 新增绿色 + 被淘汰内容红色删除线；用户可在行内直接编辑 suggestion 后再保存
- **Bootstrap 重建模式**：MetadataPanel 底部「重建 Bootstrap」入口会自动把现有 `00_context.md` / `decisions.md` / 最近一次 session handoff 嵌进 prompt，并附上"必须保留全部红线/技术栈/已拍板决策"的强约束 —— 避免重建时把旧决策吃掉

### 新增 — 解析容错

- **多 pattern parser**：`##` / 数字 / 粗体 / 中英段名 / 行首前导空格都识别（解决"AI 输出格式不一致"和"终端粘贴导致 `##` 丢失"两类真实 case）
- **导入永不灰**：ImportHandoffModal 三态——full / partial / raw，永远可以点导入，partial/raw 时提示但不阻塞
- **Prompt 格式契约升级**：endSessionPrompt 模板里加 "FORMAT IS CRITICAL" 强提示，并新增 `**Superseded:**` 字段约定

### 新增 — 文件可编辑

- **FileViewerModal 编辑模式**：核心资料（about_me / 00_context / decisions）支持直接在 modal 里编辑保存，不必通过 AI 对话改

### 新增 — 反馈通道

- **Sidebar「反馈 / 报 Bug」改为弹窗**：写文字描述 → 一键复制 markdown 到剪贴板 + 浏览器打开 GitHub Issues new 页，粘贴即可提交。全程在本地完成

### 改 — Dashboard 诚实化

- **删假进度条**：之前的进度条永远不动；现在改为「会话总数 + 最近一次 · 工具」事实数据
- **加当前状态段**：Dashboard 自动从 `00_context.md` 提取「当前状态」section 展示

### 已知小 bug（v0.1.3 修）

- ImportHandoffModal 的 detection 状态判定还没加前导空格容忍，所以即使 parser 实际解析成功，UI badge 仍可能显示 "partial"。不影响实际功能

---

## v0.1.1 — 2026-05-17

- UI 全量中文化 + 自建轻量 i18n（React Context + 单文件字典）
- Source Tool 8 chip 预置 + 自定义
- Estimated tokens 默认隐藏
- 删光项目跳首页（砍掉 Workspace 空页）
- 系统回收站删除 + 5 秒 in-app Undo
- 路径语义化（禁止 UI 暴露文件系统路径）
- 双语 README + 截图分 zh/en 子目录

## v0.1.0 — 2026-05-16

- 初始版本：6 个核心功能闭环（onboarding / Bootstrap 引导 / 开始+结束双 Session 指令 / Session 和核心资料查看 / 项目管理 / 步骤式帮助抽屉）
- 视觉规范：Notion 文档蓝灰 (#525A6B)
- Windows .exe / .msi 安装包
