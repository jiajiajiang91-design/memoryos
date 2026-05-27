# Changelog

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
