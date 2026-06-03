// MemoryOS MCP server 工厂（PRD v0.3.1 §5.1/§5.2）。
// 工具：list_projects + get_project_memory（只读 pull）+ save_session_handoff（写待审 Inbox）。
// prompts：start_session（注入式开始）+ end_session（调工具版）。
// 抽成工厂便于 selftest 用 in-memory transport 直接连，不必起 stdio/真客户端。
// 埋点（telemetry.server.jsonl，带 channel="mcp"）+ 连接状态（mcp_state.json）均 best-effort、纯本地。

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listProjects, getProjectMemory, matchProject } from "./workspace";
import { buildInboxItem, writeInboxItem } from "./inbox";
import { buildStartSessionToolPrompt, buildEndSessionToolPrompt } from "./prompts";
import { logServerEvent } from "./telemetry";
import { writeMcpState } from "./state";

export const SERVER_NAME = "memoryos";
export const SERVER_VERSION = "0.3.0";

export function createServer(workspace: string): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  const clientName = (): string => server.server.getClientVersion()?.name ?? "MCP Client";

  // 每次工具调用后记一次「最近 MCP 活动」给 app 读（连接状态 UI）。best-effort。
  const recordActivity = (tool: string, project?: string) =>
    writeMcpState(workspace, {
      lastClient: clientName(),
      lastTool: tool,
      lastProject: project,
      lastActivityAt: new Date().toISOString(),
      serverVersion: SERVER_VERSION,
    });

  // ── list_projects（无输入，只读）──
  server.registerTool(
    "list_projects",
    {
      title: "列出 MemoryOS 项目",
      description:
        "列出当前 MemoryOS workspace 里的所有项目（只读）。返回每个项目的 slug / name / currentGoal / updatedAt。",
      inputSchema: {},
    },
    async () => {
      const projects = await listProjects(workspace);
      await logServerEvent("list_projects", { client: clientName(), count: projects.length });
      await recordActivity("list_projects");
      return {
        content: [{ type: "text", text: JSON.stringify(projects, null, 2) }],
        structuredContent: { projects },
      };
    }
  );

  // ── get_project_memory（pull，只读）──
  server.registerTool(
    "get_project_memory",
    {
      title: "读取项目工作记忆",
      description:
        "读取某个项目的工作记忆（只读 pull）：about_me + 00_context + decisions + 最新一轮 Compact Context。" +
        "读到后请用一句话回述你的理解（我是谁 / 项目目标与最大卡点 / 上次进行到哪里），确认后继续。",
      inputSchema: {
        project: z
          .string()
          .describe("项目 slug 或项目名（容错匹配，大小写不敏感）"),
      },
    },
    async ({ project }) => {
      const memory = await getProjectMemory(workspace, project);
      // pull 埋点带 sourceClient（cross_ai_reuse 以不同 sourceClient pull 同项目计）+ success。
      await logServerEvent("pull", {
        sourceClient: clientName(),
        project: memory?.projectName ?? project,
        success: !!memory,
      });
      await recordActivity("get_project_memory", memory?.projectName ?? project);
      if (!memory) {
        const projects = await listProjects(workspace);
        const names = projects.map((p) => p.name).join(" / ") || "（无项目）";
        return {
          content: [
            {
              type: "text",
              text: `未找到匹配「${project}」的项目。当前 workspace 里的项目：${names}`,
            },
          ],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(memory, null, 2) }],
        structuredContent: memory as unknown as Record<string, unknown>,
      };
    }
  );

  // ── save_session_handoff（push → 待审 Inbox）──
  // 结构化入参，字段名对齐 ParsedHandoff。**不直接入库**，只写 inbox(pending)，等用户回桌面 review。
  server.registerTool(
    "save_session_handoff",
    {
      title: "暂存本轮 handoff 到 MemoryOS（待审）",
      description:
        "把本轮对话整理出的结构化 handoff 暂存到 MemoryOS 的待审 Inbox（status=pending）。" +
        "**不会直接入库**——需要用户回桌面 app review 确认后才写入正式记忆文件。字段名对齐 ParsedHandoff。",
      inputSchema: {
        project: z
          .string()
          .describe("项目 slug 或项目名（容错匹配，必须是已存在的项目）"),
        metadata: z
          .record(z.string())
          .optional()
          .describe("可选元数据键值对，如 Date / Source Tool / Session Goal"),
        whatWeWorkedOn: z.string().describe("本轮做了什么（3-6 条）"),
        keyDecisions: z.string().describe("关键决策（含原因/影响）"),
        currentState: z.string().describe("当前项目状态"),
        openQuestions: z.string().describe("未解决问题"),
        nextActions: z.string().describe("下一步行动（按优先级）"),
        suggestedContextUpdate: z
          .string()
          .optional()
          .describe("对 00_context.md 的更新建议，无则留空"),
        suggestedDecisionsUpdate: z
          .string()
          .optional()
          .describe("对 decisions.md 的更新建议，无则留空"),
        suggestedAboutMeUpdate: z
          .string()
          .optional()
          .describe("对 about_me.md 的更新建议，仅当出现明确长期偏好"),
        compactContext: z.string().describe("给下一次对话的压缩上下文（150-250 字）"),
      },
    },
    async (input) => {
      const projects = await listProjects(workspace);
      const match = matchProject(projects, input.project);
      if (!match) {
        await logServerEvent("push_to_inbox", {
          sourceClient: clientName(),
          project: input.project,
          staged: false,
        });
        await recordActivity("save_session_handoff", input.project);
        const names = projects.map((p) => p.name).join(" / ") || "（无项目）";
        return {
          content: [
            {
              type: "text",
              text: `未找到匹配「${input.project}」的项目，**未暂存**。请用一个已存在的项目名重试。当前项目：${names}`,
            },
          ],
          isError: true,
        };
      }
      const item = buildInboxItem(input, match.slug, clientName());
      const { pendingCount } = await writeInboxItem(workspace, item);
      // push_to_inbox 埋点（北极星 push_to_inbox_rate 的分母）。
      await logServerEvent("push_to_inbox", {
        sourceClient: clientName(),
        project: match.name,
        staged: true,
      });
      await recordActivity("save_session_handoff", match.name);
      // 文案必须明确"尚未入库"（红线：MCP 写回也要 review 才入库）。
      const message = `已暂存到 MemoryOS（尚未入库），请回桌面 app 确认入库（${pendingCount} 条待审）。`;
      return {
        content: [{ type: "text", text: message }],
        structuredContent: { staged: true, message, pendingCount, slug: match.slug },
      };
    }
  );

  // ── start_session prompt（可选糖，注入式开始提示，无副作用）──
  server.registerPrompt(
    "start_session",
    {
      title: "开始对话：载入项目工作记忆",
      description:
        "把指定项目的工作记忆（about_me + context + decisions + 最新 Compact Context）注入成一段开始提示，读完回述理解后继续。无副作用。",
      argsSchema: { project: z.string() },
    },
    async ({ project }) => {
      const memory = await getProjectMemory(workspace, project);
      if (!memory) {
        const projects = await listProjects(workspace);
        const names = projects.map((p) => p.name).join(" / ") || "（无项目）";
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `未找到匹配「${project}」的项目。当前 workspace 里的项目：${names}。请确认项目名后重试。`,
              },
            },
          ],
        };
      }
      await logServerEvent("pull", { sourceClient: clientName(), project: memory.projectName, success: true, via: "start_session" });
      await recordActivity("start_session", memory.projectName);
      return {
        messages: [
          { role: "user", content: { type: "text", text: buildStartSessionToolPrompt(memory) } },
        ],
      };
    }
  );

  // ── end_session prompt（可选糖，调工具版）──
  server.registerPrompt(
    "end_session",
    {
      title: "结束对话：整理并暂存 handoff",
      description:
        "指示模型把本轮对话整理成结构化 handoff 并调用 save_session_handoff（产物是工具调用，不是粘贴 Markdown）。",
      argsSchema: { project: z.string().optional() },
    },
    ({ project }) => ({
      messages: [
        {
          role: "user",
          content: { type: "text", text: buildEndSessionToolPrompt(project) },
        },
      ],
    })
  );

  return server;
}
