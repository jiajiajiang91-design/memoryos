// MemoryOS MCP server 可执行入口（stdio）。
// workspace 路径经环境变量 MEMORYOS_WORKSPACE 传入（.mcpb 由 user_config 注入，其他客户端用配置 env）。
// 红线：运行期不开监听端口、不联网传用户内容；本进程只 stdio + 读本地文件。

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer, SERVER_NAME, SERVER_VERSION } from "./server";

async function main(): Promise<void> {
  const workspace = process.env.MEMORYOS_WORKSPACE;
  if (!workspace) {
    // 日志一律走 stderr —— stdout 是 MCP 协议通道，不能污染。
    console.error(
      "[memoryos-mcp] 环境变量 MEMORYOS_WORKSPACE 未设置；请在客户端配置 env 里指向你的 MemoryOS workspace 路径。"
    );
    process.exit(1);
  }

  const server = createServer(workspace);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `[memoryos-mcp] ${SERVER_NAME} v${SERVER_VERSION} connected over stdio. workspace=${workspace}`
  );
}

main().catch((err) => {
  console.error("[memoryos-mcp] fatal:", err);
  process.exit(1);
});
