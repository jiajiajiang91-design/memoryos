// MemoryOS MCP server 工厂（PRD v0.3.1 §5.1/§5.2）。
// 工具：list_projects + get_project_memory（只读 pull）+ save_session_handoff（写待审 Inbox）。
// prompts：start_session（注入式开始）+ end_session（调工具版）。
// 抽成工厂便于 selftest 用 in-memory transport 直接连，不必起 stdio/真客户端。
// 埋点（telemetry.server.jsonl，带 channel="mcp"）+ 连接状态（mcp_state.json）均 best-effort、纯本地。

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { looksGarbled } from "../../src/lib/inbox";
import { normalizeSourceTool } from "../../src/lib/sourceTools";
import { listProjects, getProjectMemory, matchProject } from "./workspace";
import { buildInboxItem, writeInboxItem } from "./inbox";
import { buildStartSessionToolPrompt, buildEndSessionToolPrompt } from "./prompts";
import { logServerEvent } from "./telemetry";
import { writeMcpState } from "./state";

export const SERVER_NAME = "memoryos";
export const SERVER_VERSION = "0.4.0";

export function createServer(workspace: string): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  // 握手名归一成用户认识的工具名（"codex"→Codex、"cowork"→Claude）——
  // 同时保证 cross_ai_reuse 统计不把同一家 AI 的不同客户端名算成两家。
  const clientName = (): string =>
    normalizeSourceTool(server.server.getClientVersion()?.name ?? "MCP Client");

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
        "读取某个项目的工作记忆（只读 pull）。若返回里 cards 非空 = 记忆卡片模式：以 cards（+ aboutMe）为准开始工作，" +
        "context/decisions 是历史档案，仅需要历史细节时再查。cards 为空则按旧约定读 about_me + 00_context + decisions + 最新 Compact Context。" +
        "读到后请用一句话回述你的理解（我是谁、怎么协作 / 项目目标、现状与卡点 / 上次停在哪、本次从哪开始），确认后继续。",
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
        aiSuggestions: z
          .string()
          .optional()
          .describe(
            "记忆卡片模式：AI 认为该做但用户**没有拍板**的建议，每条一行。禁止把建议写进 keyDecisions——keyDecisions 只收用户明确拍板的（附原话+日期）。"
          ),
        proposedCards: z
          .string()
          .optional()
          .describe(
            "【必传，缺失会被退回】整理后的 cards.md 完整新版（当前状态卡替换式更新、约束与决策卡追加新拍板、上次对话总结卡整卡替换；原样保留「> 整理于」行不改日期；全文≤1200字）。项目还没有记忆卡片时，基于 context/decisions/本轮对话生成第一页（无法确认拍板的决策标[来源待核]）。不知道当前卡片内容就先调 get_project_memory。"
          ),
        proposedCardsSuperseded: z
          .array(z.string())
          .optional()
          .describe("记忆卡片模式：新版里被替换/移除的旧条目，每条一句话描述（入库时盖作废章进决策历史）"),
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
      // 工具契约强制（真实 bug：用户只说"保存对话"、不走 end_session 指令时，AI 按最省事的
      // 必填字段调用 → 旧格式交接，没有卡片更新）。指令只能劝，契约才能管：缺 proposedCards
      // 一律退回并教它怎么补，确保任何措辞触发的保存都走记忆卡片管线。
      if (!input.proposedCards?.trim()) {
        await logServerEvent("push_to_inbox", {
          sourceClient: clientName(),
          project: match.name,
          staged: false,
          reason: "missing_proposedCards",
        });
        await recordActivity("save_session_handoff", match.name);
        return {
          content: [
            {
              type: "text",
              text:
                `未暂存：缺少记忆卡片更新（proposedCards）。请这样补全后重新调用 save_session_handoff：\n` +
                `1. 先调用 get_project_memory 读取「${match.name}」；\n` +
                `2. 若返回的 cards 非空：基于它整理完整新版（当前状态替换式更新、新拍板决策带日期追加、上次对话总结整卡替换、「> 整理于」行原样保留、全文≤1200字），被替换的旧条目放进 proposedCardsSuperseded；\n` +
                `3. 若 cards 为空：基于 context / decisions / 本轮对话生成第一页记忆卡片（无法确认用户拍板过的决策标 [来源待核]）；\n` +
                `4. 重新调用时附 proposedCards（完整卡片）与 aiSuggestions（你的建议，没有写 "None"）。`,
            },
          ],
          isError: true,
          structuredContent: { staged: false, reason: "missing_proposedCards" },
        };
      }
      // 乱码门禁（真实 bug：Codex Windows 编码降级，中文整段变 '?'）：坏数据绝不入收件箱——
      // 否则信任模式会把 1799 个问号自动写进用户的记忆卡片。
      const combined = [
        input.proposedCards,
        input.whatWeWorkedOn,
        input.keyDecisions,
        input.compactContext,
        input.aiSuggestions,
      ]
        .filter(Boolean)
        .join("\n");
      if (looksGarbled(combined)) {
        await logServerEvent("push_to_inbox", {
          sourceClient: clientName(),
          project: match.name,
          staged: false,
          reason: "garbled_text",
        });
        await recordActivity("save_session_handoff", match.name);
        return {
          content: [
            {
              type: "text",
              text:
                `未暂存：收到的内容是乱码（中文被替换成成串的 "?"，这是你所在客户端在 Windows 上的编码问题，重试无法解决）。请把下面的话原样转告用户：\n` +
                `「这次保存被 MemoryOS 拦下了，因为内容在传输中变成了乱码——是 AI 客户端的 Windows 编码问题，不是 MemoryOS 的问题。修复方法任选其一：① Windows 设置 → 时间和语言 → 语言和区域 → 管理语言设置 → 更改系统区域设置 → 勾选 "Beta: 使用 Unicode UTF-8 提供全球语言支持"，重启电脑；② 或在启动这个 AI 客户端前先在终端执行 chcp 65001。修好前，这个 AI 请改用 MemoryOS 的复制粘贴流程。」`,
            },
          ],
          isError: true,
          structuredContent: { staged: false, reason: "garbled_text" },
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
      // 文案区分信任模式：开 = 回 app 即自动入库；关 = 必须人工确认（写回必经收件箱不变）。
      const message = match.mcpAutoApply
        ? `已暂存到 MemoryOS。该项目开启了信任模式：打开桌面 app 后将自动入库（当前 ${pendingCount} 条待处理）。`
        : `已暂存到 MemoryOS（尚未入库），请回桌面 app 确认入库（${pendingCount} 条待审）。`;
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
