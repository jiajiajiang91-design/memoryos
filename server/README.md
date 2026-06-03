# MemoryOS MCP server（通道 A · 本地 stdio）

工具（PRD v0.3.1 §5.1）：

| 工具 | 输入 | 输出 | 说明 |
|---|---|---|---|
| `list_projects` | 无 | `[{slug,name,currentGoal,updatedAt}]` | 列项目，只读 |
| `get_project_memory` | `{project}`（容错匹配 slug/名字） | `{aboutMe,context,decisions,latestCompactContext,projectName}` | pull，只读 |
| `save_session_handoff` | 结构化字段（对齐 `ParsedHandoff`）+ `project` | `{staged:true,message,pendingCount,slug}` | push → 待审 Inbox（**不直接入库**，需回桌面 review） |

Prompts（§5.2）：

| prompt | 参数 | 说明 |
|---|---|---|
| `start_session` | `project` | 把项目记忆注入成一段开始提示（注入式、无副作用），读完回述理解后继续 |
| `end_session` | `project?` | 指示模型整理本轮并**调用 `save_session_handoff`**（结构化字段，不粘贴 Markdown） |

埋点 & 状态（Phase 6，纯本地、best-effort）：
- **埋点**：server 写 `<appData>/memoryos/telemetry.server.jsonl`（app 写 `telemetry.jsonl`），每条事件带 `channel:"mcp"`；
  事件 `list_projects` / `pull`（带 `sourceClient`、`success`）/ `push_to_inbox`（带 `staged`）。可用 `MEMORYOS_TELEMETRY_DIR` 覆盖目录。
- **连接状态**：server 每次工具调用后写 `<workspace>/.memoryos/mcp_state.json`（lastClient/lastTool/lastActivityAt），
  app focus 时读它显示「最近 MCP 活动」（server↔app 无 RPC，只通过该文件通信）。

> 红线：运行期只 stdio + 读/写本地文件（写仅限 `.memoryos/inbox/` 与 `.memoryos/mcp_state.json` 协调区），
> 不开监听端口、不联网传用户内容；任何写回一律先进待审 Inbox，必须用户回桌面 app review 后才入正式记忆文件。

## 构建

```bash
cd server
npm install
npm run build        # 产出 dist/index.mjs（单文件 ESM bundle）
```

workspace 路径经环境变量 **`MEMORYOS_WORKSPACE`** 传入（指向你的 MemoryOS 工作区，
即 app 里那个含 `about_me.md` + `projects/` 的文件夹）。

## 自测

```bash
npm run selftest     # 纯函数 + in-memory MCP 协议 roundtrip + 只读红线
npm run smoke        # 真子进程 + stdio：initialize → tools/list → tools/call 跑通 pull
```

## Dev 客户端配置（Phase 2 用本地绝对路径直连；正式 .mcpb 在 Phase 4）

把 `<绝对路径>` 换成你机器上的真实路径。

### Claude Desktop — `claude_desktop_config.json`

- Windows：`%APPDATA%\Claude\claude_desktop_config.json`
- macOS：`~/Library/Application Support/Claude/claude_desktop_config.json`

```jsonc
{
  "mcpServers": {
    "memoryos": {
      "command": "node",
      "args": ["D:\\Claude_jiajia\\memoryos-v2\\server\\dist\\index.mjs"],
      "env": { "MEMORYOS_WORKSPACE": "C:\\Users\\jiang\\Documents\\MemoryOS" }
    }
  }
}
```

### Codex — `~/.codex/config.toml`

```toml
[mcp_servers.memoryos]
command = "node"
args = ["D:\\Claude_jiajia\\memoryos-v2\\server\\dist\\index.mjs"]
env = { MEMORYOS_WORKSPACE = "C:\\Users\\jiang\\Documents\\MemoryOS" }
```

### Cursor / Windsurf / VS Code / Cline

各自的 MCP JSON 里加同样的 `command` / `args` / `env`（指向同一 `dist/index.mjs`）。

## 连好后怎么测

重启客户端，对它说：

> 加载我的 MemoryOS 项目 `<你的项目名>`

模型应调用 `get_project_memory`，把 about_me + 项目 context/decisions + 最新 Compact Context
读回来，并用一句话回述理解。能看到回述，pull 即跑通。
