import { useEffect, useState } from "react";
import { X, Copy, Check, ChevronRight, ShieldCheck } from "lucide-react";
import { copyToClipboard } from "../lib/fs";
import { useT } from "../lib/i18n";

type Tab = "basics" | "manual" | "mcp";

type Props = {
  open: boolean;
  onClose: () => void;
  onTryCopy: () => void;
  // Phase 5：把真实工作区路径 + 当前项目名注入连接教程，避免给出假路径/假项目名。
  workspace?: string | null;
  projectName?: string;
};

export default function HelpDrawer({ open, onClose, onTryCopy, workspace, projectName }: Props) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("basics");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "basics", label: t("help.tab.basics") },
    { id: "manual", label: t("help.tab.manual") },
    { id: "mcp", label: t("help.tab.mcp") },
  ];

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/[.16] z-40 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      />
      <aside
        className={`fixed top-0 right-0 bottom-0 w-[520px] bg-surface z-50 shadow-[-4px_0_16px_rgba(0,0,0,0.04)] flex flex-col transition-transform duration-200 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="h-14 px-6 border-b border-hairline flex items-center justify-between shrink-0">
          <span className="text-base font-semibold">{t("help.title")}</span>
          <button onClick={onClose} className="w-7 h-7 rounded flex items-center justify-center text-ink-soft hover:bg-surface-soft transition-colors">
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        {/* 分栏切换：使用入门 / 复制粘贴教程 / AI 连接教程 */}
        <div className="px-6 pt-3.5 pb-3 shrink-0 border-b border-hairline">
          <div className="flex bg-surface-soft rounded-lg p-1 gap-1">
            {tabs.map((tb) => (
              <button
                key={tb.id}
                onClick={() => setTab(tb.id)}
                className={`flex-1 h-8 rounded-md text-[13px] font-medium transition-colors ${
                  tab === tb.id
                    ? "bg-surface text-slate shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                    : "text-ink-soft hover:text-ink"
                }`}
              >
                {tb.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-7 py-7">
          {tab === "basics" && <BasicsPanel />}
          {tab === "manual" && <ManualPanel />}
          {tab === "mcp" && (
            <McpPanel workspace={workspace} projectName={projectName} />
          )}
        </div>

        {/* 底部行动按钮只在「复制粘贴教程」分栏显示，对应教程里的第 2 步。 */}
        {tab === "manual" && (
          <div className="h-20 border-t border-hairline flex items-center justify-center shrink-0">
            <button
              onClick={onTryCopy}
              className="h-10 px-5 rounded-md bg-slate text-white font-medium text-sm inline-flex items-center gap-2 hover:opacity-90 transition-opacity"
            >
              <Copy size={16} strokeWidth={1.5} />
              {t("help.tryStep2")}
            </button>
          </div>
        )}
      </aside>
    </>
  );
}

// ── 分栏一：使用入门 ────────────────────────────────
function BasicsPanel() {
  const t = useT();
  return (
    <>
      <div className="mb-10">
        <h2 className="text-[20px] font-semibold tracking-[-0.01em] mb-2">{t("help.heading")}</h2>
        <p className="text-[14px] text-ink-soft leading-[1.75] whitespace-pre-line">
          {t("help.subheading")}
        </p>
      </div>

      <div className="mb-9 p-4 bg-[#FFF5E1] border border-[#EAD9A8] rounded-lg">
        <div className="flex items-start gap-3">
          <div className="w-6 h-6 rounded-full bg-[#A37A1C] text-white text-[12px] font-semibold flex items-center justify-center shrink-0">!</div>
          <div>
            <div className="text-[14px] font-semibold text-ink mb-1">{t("help.step0Title")}</div>
            <div className="text-[13px] text-ink-soft leading-[1.7]">{t("help.step0Desc")}</div>
          </div>
        </div>
      </div>

      <div className="mb-9 p-5 bg-surface-soft rounded-lg">
        <h3 className="text-[14px] font-semibold mb-2">{t("help.dataTitle")}</h3>
        <p className="text-[13px] text-ink-soft leading-[1.7] whitespace-pre-line">
          {t("help.dataBody")}
        </p>
      </div>

      <h3 className="text-[12px] font-semibold uppercase tracking-wider text-ink-faint mb-3">{t("help.faqLabel")}</h3>
      <Faq q={t("help.faqQ1")} a={t("help.faqA1")} />
      <Faq q={t("help.faqQ2")} a={t("help.faqA2")} />
      <Faq q={t("help.faqQ3")} a={t("help.faqA3")} />
    </>
  );
}

// ── 分栏二：手动复制粘贴教程（原有内容，未改动）──────────
function ManualPanel() {
  const t = useT();
  return (
    <>
      <p className="text-[13px] text-ink-soft leading-[1.7] mb-7">{t("help.manualIntro")}</p>

      <h3 className="text-[12px] font-semibold uppercase tracking-wider text-ink-faint mb-5">{t("help.stepsLabel")}</h3>

      <Step n={1} title={t("help.step1Title")} desc={t("help.step1Desc")} />
      <Step
        n={2}
        title={<>{t("help.step2TitlePrefix")}<Pill>{t("help.step2Pill")}</Pill></>}
        desc={t("help.step2Desc")}
      />
      <Step n={3} title={t("help.step3Title")} desc={t("help.step3Desc")} />
      <Step
        n={4}
        title={<>{t("help.step4TitlePrefix")}<Pill>{t("help.step4Pill")}</Pill></>}
        desc={t("help.step4Desc")}
        last
      />
    </>
  );
}

// ── 分栏三：AI 连接教程（Phase 5）────────────────────
// 三块：1) Claude Desktop（推荐，.mcpb 一键安装）2) 其他 MCP stdio 客户端（高级手动配置）
//       3) 网页端 AI / 浏览器插件（Planned）。红线置顶。
function McpPanel({ workspace, projectName }: { workspace?: string | null; projectName?: string }) {
  const t = useT();
  const proj = projectName?.trim() || t("mcp.projectFallback");
  // 块 2 通用配置：注入真实 workspace（拿得到时），server 路径运行期未知→明确占位（PRD §5.5）。
  const serverPath = t("mcp.s2ServerPlaceholder");
  const wsValue = workspace || t("mcp.s2WsPlaceholder");
  const advConfig = [
    "command: node",
    `args: ["${serverPath}"]`,
    "env:",
    `  MEMORYOS_WORKSPACE: "${wsValue}"`,
  ].join("\n");

  return (
    <>
      <div className="mb-7">
        <h2 className="text-[20px] font-semibold tracking-[-0.01em] mb-2">{t("mcp.heading")}</h2>
        <p className="text-[14px] text-ink-soft leading-[1.75]">{t("mcp.subheading")}</p>
      </div>

      {/* 红线：必须出现的核心承诺 */}
      <div className="mb-9 p-4 bg-[#FFF5E1] border border-[#EAD9A8] rounded-lg">
        <div className="flex items-start gap-3">
          <ShieldCheck size={20} strokeWidth={1.6} className="text-[#A37A1C] shrink-0 mt-0.5" />
          <div>
            <div className="text-[13px] font-semibold text-ink mb-1">{t("mcp.redlineTitle")}</div>
            <div className="text-[13px] text-ink-soft leading-[1.7]">{t("mcp.redline")}</div>
          </div>
        </div>
      </div>

      {/* 块 1：Claude Desktop（推荐，.mcpb 一键安装）*/}
      <SectionHeader title={t("mcp.s1Title")} badge={t("mcp.s1Badge")} tone="rec" />

      <McpStep n={1} title={t("mcp.step1Title")}>
        <p className="text-[13px] text-ink-soft leading-[1.7]">{t("mcp.step1Desc")}</p>
        {workspace ? (
          <CopyField label={t("mcp.step2WsLabel")} value={workspace} copyLabel={t("mcp.copyPath")} />
        ) : (
          <div className="mt-2.5 rounded-lg border border-dashed border-hairline bg-surface-soft px-3.5 py-2.5 text-[12.5px] text-ink-faint">
            {t("mcp.step2WsEmpty")}
          </div>
        )}
        <NoteBox>{t("mcp.step1Note")}</NoteBox>
      </McpStep>

      <McpStep n={2} title={t("mcp.step2Title")}>
        <p className="text-[13px] text-ink-soft leading-[1.7]">{t("mcp.step2Desc")}</p>
        <NoteBox emphasis>{t("mcp.step2Note")}</NoteBox>
      </McpStep>

      <McpStep n={3} title={t("mcp.step3Title")}>
        <p className="text-[13px] text-ink-soft leading-[1.7]">{t("mcp.step3Desc")}</p>
        <CopyField label={t("mcp.step3PromptLabel")} value={t("mcp.step3Prompt", { project: proj })} copyLabel={t("mcp.copyPrompt")} />
        <NoteBox>{t("mcp.step3Note")}</NoteBox>
      </McpStep>

      <McpStep n={4} title={t("mcp.step4Title")}>
        <p className="text-[13px] text-ink-soft leading-[1.7]">{t("mcp.step4Desc")}</p>
        <CopyField label={t("mcp.step4PromptLabel")} value={t("mcp.step4Prompt")} copyLabel={t("mcp.copyPrompt")} />
        <NoteBox emphasis>{t("mcp.step4Note")}</NoteBox>
      </McpStep>

      <McpStep n={5} title={t("mcp.step5Title")} last>
        <p className="text-[13px] text-ink-soft leading-[1.7]">{t("mcp.step5Desc")}</p>
      </McpStep>

      <div className="my-8 border-t border-hairline" />

      {/* 块 2：其他支持 MCP stdio 的桌面端 / 代码 Agent（高级手动配置）*/}
      <SectionHeader title={t("mcp.s2Title")} badge={t("mcp.s2Badge")} tone="adv" />
      <p className="text-[13px] text-ink-soft leading-[1.7]">{t("mcp.s2Desc")}</p>
      <p className="text-[13px] text-ink-soft leading-[1.7] mt-2">{t("mcp.s2Clients")}</p>
      <CopyField label={t("mcp.s2ConfigLabel")} value={advConfig} copyLabel={t("mcp.copyConfig")} />
      <NoteBox>{t("mcp.s2Note")}</NoteBox>

      <div className="my-8 border-t border-hairline" />

      {/* 块 3：网页端 AI / 浏览器插件（Planned）*/}
      <SectionHeader title={t("mcp.s3Title")} badge={t("mcp.s3Badge")} tone="planned" />
      <p className="text-[13px] text-ink-soft leading-[1.7]">{t("mcp.s3Desc")}</p>
      <NoteBox>{t("mcp.s3Interim")}</NoteBox>
    </>
  );
}

// 块标题 + 状态 badge（推荐 / 高级配置 / Planned）。
function SectionHeader({ title, badge, tone }: { title: string; badge: string; tone: "rec" | "adv" | "planned" }) {
  const badgeCls =
    tone === "rec"
      ? "bg-slate text-white"
      : tone === "adv"
      ? "bg-[#ECEAF3] text-slate"
      : "bg-surface-soft text-ink-faint border border-hairline";
  return (
    <div className="flex items-center gap-2.5 mb-5">
      <h3 className="text-[15px] font-semibold">{title}</h3>
      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${badgeCls}`}>{badge}</span>
    </div>
  );
}

// ── 子组件 ──────────────────────────────────────────
function Step({
  n,
  title,
  desc,
  last,
}: {
  n: number;
  title: React.ReactNode;
  desc: string;
  last?: boolean;
}) {
  return (
    <div className="flex gap-4 relative">
      <div className="shrink-0 relative">
        <div className="w-7 h-7 rounded-full bg-slate text-white text-[13px] font-semibold flex items-center justify-center">
          {n}
        </div>
        {!last && (
          <div className="absolute left-1/2 -translate-x-1/2 top-7 w-px bg-hairline" style={{ height: "calc(100% + 8px)" }} />
        )}
      </div>
      <div className={`flex-1 ${last ? "pb-1" : "pb-7"}`}>
        <div className="text-[15px] font-semibold leading-[1.5] mb-1.5">{title}</div>
        <p className="text-[13px] text-ink-soft leading-[1.7]">{desc}</p>
      </div>
    </div>
  );
}

// 连接教程专用步骤：body 是任意 children（可放复制框 / 提示块）。
function McpStep({
  n,
  title,
  last,
  children,
}: {
  n: number;
  title: React.ReactNode;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4 relative">
      <div className="shrink-0 relative">
        <div className="w-7 h-7 rounded-full bg-slate text-white text-[13px] font-semibold flex items-center justify-center">
          {n}
        </div>
        {!last && (
          <div className="absolute left-1/2 -translate-x-1/2 top-7 w-px bg-hairline" style={{ height: "calc(100% + 8px)" }} />
        )}
      </div>
      <div className={`flex-1 ${last ? "pb-1" : "pb-7"}`}>
        <div className="text-[15px] font-semibold leading-[1.5] mb-2">{title}</div>
        {children}
      </div>
    </div>
  );
}

// 可复制的路径 / 示例 prompt 小区域。
function CopyField({ label, value, copyLabel }: { label?: string; value: string; copyLabel: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await copyToClipboard(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (e) {
      console.warn("copy failed", e);
    }
  };
  return (
    <div className="mt-2.5 rounded-lg border border-hairline bg-surface-soft overflow-hidden">
      {label && (
        <div className="px-3.5 pt-2.5 text-[11px] uppercase tracking-wider text-ink-faint font-medium">{label}</div>
      )}
      <div className="flex items-start gap-2 px-3.5 pb-2.5 pt-1.5">
        <code className="flex-1 font-mono text-[12.5px] text-ink leading-[1.65] whitespace-pre-wrap break-words pt-1">{value}</code>
        <button
          onClick={onCopy}
          className="shrink-0 h-7 px-2.5 rounded-md bg-surface border border-hairline text-[12px] font-medium text-ink-soft hover:text-slate hover:border-slate/40 transition-colors inline-flex items-center gap-1.5"
        >
          {copied ? <Check size={13} strokeWidth={2} /> : <Copy size={13} strokeWidth={1.5} />}
          {copied ? t("common.copied") : copyLabel}
        </button>
      </div>
    </div>
  );
}

// 步骤提示块。emphasis = 高亮（用于「只进 Inbox、不直接入库」这类必须强调的提示）。
function NoteBox({ children, emphasis }: { children: React.ReactNode; emphasis?: boolean }) {
  return (
    <div
      className={`mt-2.5 rounded-lg px-3.5 py-2.5 text-[12.5px] leading-[1.65] ${
        emphasis ? "bg-[#FFF5E1] border border-[#EAD9A8] text-[#7A5B12]" : "bg-surface-soft text-ink-soft"
      }`}
    >
      {children}
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block bg-surface-soft text-slate font-medium px-2 py-0.5 rounded text-[13px] mx-0.5">
      {children}
    </span>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-hairline last:border-b-0">
      <button onClick={() => setOpen(!open)} className="w-full h-11 flex items-center gap-2.5 text-[14px] font-medium text-left">
        <ChevronRight
          size={14}
          strokeWidth={1.5}
          className={`text-ink-soft transition-transform ${open ? "rotate-90" : ""}`}
        />
        {q}
      </button>
      <div className={`overflow-hidden transition-all duration-200 ${open ? "max-h-40" : "max-h-0"}`}>
        <div className="pl-6 pb-4 text-[13px] text-ink-soft leading-[1.75]">{a}</div>
      </div>
    </div>
  );
}
