import { useEffect, useMemo, useState } from "react";
import { Copy, X, ChevronRight, Plus, Check } from "lucide-react";
import type { Project, SourceTool } from "../types";
import { buildEndSessionPrompt } from "../lib/parser";
import { copyToClipboard, readContextForPrompt, readEntriesLib } from "../lib/fs";
import { exportToMarkdown } from "../lib/entry";
import { PRESET_SOURCE_TOOLS } from "../lib/sourceTools";
import { useT, useLang } from "../lib/i18n";

type Props = {
  workspace: string;
  project: Project;
  /** 复制开始时默认选中的来源工具（来自上次选择）。 */
  defaultSourceTool?: SourceTool;
  onClose: () => void;
  /** 复制完成后回传选中的来源工具，App 记为 lastSourceClient 供导入 Inbox 时带入。 */
  onCopied: (sourceClient: SourceTool) => void;
};

export default function CopyPromptModal({ workspace, project, defaultSourceTool, onClose, onCopied }: Props) {
  const tt = useT();
  const [lang] = useLang();
  // 现行卡模式：cards.md 存在 → 结束指令带现行卡（生成四栏交接 + 六卡更新提案），不再带 context/decisions
  const cardsMode = !!project.cardsMarkdown.trim();
  // 条目模式（07-11 写入口条目原生化）：开了条目注入且库非空 → AI 直接产条目行，
  // 写入不再经六卡降级翻译。开关关掉即回卡片模式。
  const [entriesMd, setEntriesMd] = useState("");
  useEffect(() => {
    if (!project.entryInjection) { setEntriesMd(""); return; }
    let alive = true;
    readEntriesLib(workspace, { kind: "project", slug: project.slug }).then((r) => {
      const active = r.entries.filter((e) => !e.archived);
      if (alive) setEntriesMd(active.length ? exportToMarkdown(active, `记忆库 · ${project.name}`) : "");
    });
    return () => { alive = false; };
  }, [workspace, project.slug, project.entryInjection, project.name]);
  const [files, setFiles] = useState({ context: true, decisions: true, session: true, cards: true });
  const [tool, setTool] = useState<SourceTool>(defaultSourceTool || "Claude");
  const [customName, setCustomName] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const preview = useMemo(
    () =>
      buildEndSessionPrompt({
        projectName: project.name,
        context: !cardsMode && files.context ? project.contextMarkdown : "",
        decisions: !cardsMode && files.decisions ? project.decisionsMarkdown : "",
        cards: cardsMode && files.cards ? project.cardsMarkdown : "",
        entriesMd,
        latestSession: (files.session && project.sessions[0]?.rawMarkdown) || "",
        sourceTool: tool,
        lang,
      }),
    [files, project, tool, lang, cardsMode, entriesMd]
  );

  const tokenEstimate = Math.round(preview.length / 2.5);

  const handleCopy = async () => {
    const ctx = await readContextForPrompt(workspace, project.slug);
    const text = buildEndSessionPrompt({
      projectName: project.name,
      context: !cardsMode && files.context ? ctx.context : "",
      decisions: !cardsMode && files.decisions ? ctx.decisions : "",
      cards: cardsMode && files.cards ? ctx.cards : "",
      entriesMd,
      latestSession: files.session ? ctx.latestSession : "",
      sourceTool: tool,
      lang,
    });
    await copyToClipboard(text);
    onCopied(tool);
  };

  const isCustomActive =
    !!customName.trim() && !PRESET_SOURCE_TOOLS.includes(customName as any) && tool === customName;

  const confirmCustom = () => {
    const t = customName.trim();
    if (!t) return;
    setTool(t);
    setCustomOpen(false);
  };

  return (
    <ModalShell onClose={onClose}>
      <ModalHeader title={tt("copyPrompt.title")} onClose={onClose} />
      <div className="px-6 pt-5 pb-6">
        <div className="text-[13px] text-ink-soft mb-1">{tt("copyPrompt.project")}</div>
        <div className="text-sm font-medium mb-6">{project.name}</div>

        <div className="text-[13px] text-ink-soft mb-2">{tt("copyPrompt.includeLabel")}</div>
        {cardsMode ? (
          <FileToggle
            name={tt("copyPrompt.fileCards")}
            size={`${(project.cardsMarkdown.length / 1024).toFixed(1)} KB`}
            checked={files.cards}
            onChange={(v) => setFiles({ ...files, cards: v })}
          />
        ) : (
          <>
            <FileToggle
              name={tt("copyPrompt.fileContext")}
              size={`${(project.contextMarkdown.length / 1024).toFixed(1)} KB`}
              checked={files.context}
              onChange={(v) => setFiles({ ...files, context: v })}
            />
            <FileToggle
              name={tt("copyPrompt.fileDecisions")}
              size={`${(project.decisionsMarkdown.length / 1024).toFixed(1)} KB`}
              checked={files.decisions}
              onChange={(v) => setFiles({ ...files, decisions: v })}
            />
          </>
        )}
        <FileToggle
          name={tt("copyPrompt.fileLatestSession")}
          size={project.sessions[0]?.date || "—"}
          checked={files.session && project.sessions.length > 0}
          onChange={(v) => setFiles({ ...files, session: v })}
        />

        <div className="text-[13px] text-ink-soft mb-2.5 mt-6">{tt("copyPrompt.sourceToolLabel")}</div>
        <div className="flex flex-wrap gap-1.5">
          {PRESET_SOURCE_TOOLS.map((t) => (
            <ToolChip key={t} label={t} active={tool === t} onClick={() => setTool(t)} />
          ))}
          {isCustomActive && (
            <ToolChip label={customName} active onClick={() => setTool(customName)} />
          )}
          {!customOpen ? (
            <button
              onClick={() => setCustomOpen(true)}
              className="h-7 px-2.5 rounded-md border border-dashed border-ink-faint text-[13px] text-ink-soft inline-flex items-center gap-1 hover:border-slate hover:text-slate transition-colors"
            >
              <Plus size={12} strokeWidth={1.5} />
              {tt("copyPrompt.customBtn")}
            </button>
          ) : (
            <div className="inline-flex items-center gap-1">
              <input
                autoFocus
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmCustom();
                  if (e.key === "Escape") { setCustomOpen(false); setCustomName(""); }
                }}
                onBlur={confirmCustom}
                placeholder={tt("copyPrompt.customPlaceholder")}
                className="h-7 px-2 border border-slate rounded-md text-[13px] focus:outline-none w-32"
              />
              <button
                onClick={confirmCustom}
                disabled={!customName.trim()}
                className="w-7 h-7 rounded-md bg-slate text-white inline-flex items-center justify-center disabled:opacity-30"
              >
                <Check size={14} strokeWidth={1.5} />
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => setPreviewOpen(!previewOpen)}
          className="mt-6 inline-flex items-center gap-1 text-[13px] font-medium text-slate"
        >
          <ChevronRight size={14} strokeWidth={1.5} className={`transition-transform ${previewOpen ? "rotate-90" : ""}`} />
          {tt("copyPrompt.preview")}
        </button>
        {previewOpen && (
          <>
            <div className="text-[12px] text-ink-faint mt-2 mb-1">
              {tt("copyPrompt.tokenEstimate", { n: tokenEstimate.toLocaleString() })}
            </div>
            <pre className="bg-paper border border-hairline rounded p-4 text-xs font-mono leading-[1.7] max-h-52 overflow-y-auto whitespace-pre-wrap">
              {preview}
            </pre>
          </>
        )}
      </div>
      <ModalFooter>
        <button onClick={onClose} className="h-9 px-3 rounded-md border border-hairline text-[13px] font-medium hover:bg-paper bg-surface transition-colors">
          {tt("common.cancel")}
        </button>
        <button onClick={handleCopy} className="h-9 px-3 rounded-md bg-slate text-white text-[13px] font-medium inline-flex items-center gap-1.5 hover:opacity-90 transition-opacity">
          <Copy size={14} strokeWidth={1.5} />{tt("copyPrompt.copyBtn")}
        </button>
      </ModalFooter>
    </ModalShell>
  );
}

function FileToggle({ name, size, checked, onChange }: { name: string; size: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="h-8 flex items-center gap-2.5 cursor-pointer text-sm">
      <CheckBox checked={checked} onChange={onChange} />
      <span className="flex-1">{name}</span>
      <span className="text-xs text-ink-faint">{size}</span>
    </label>
  );
}

function CheckBox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`w-4 h-4 rounded-sm border-[1.5px] flex items-center justify-center transition-colors ${checked ? "bg-slate border-slate" : "bg-white border-ink-faint"}`}
    >
      {checked && (
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6.2 4.8 8.5 9.5 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

function ToolChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`h-7 px-2.5 rounded-md text-[13px] font-medium border transition-colors ${
        active
          ? "bg-slate text-white border-slate"
          : "bg-surface text-ink-soft border-hairline hover:border-slate hover:text-slate"
      }`}
    >
      {label}
    </button>
  );
}

// ── Reusable modal chrome (exported for ImportHandoffModal) ──
export function ModalShell({ children, onClose, width = "max-w-lg" }: { children: React.ReactNode; onClose: () => void; width?: string }) {
  return (
    <div onClick={onClose} className="fixed inset-0 z-50 bg-ink/[.32] flex items-center justify-center animate-fade">
      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-surface rounded-2xl shadow-[0_8px_24px_rgba(16,24,64,0.10),_0_1px_2px_rgba(16,24,64,0.04)] overflow-hidden flex flex-col w-full ${width} max-h-[calc(100vh-80px)] animate-rise`}
      >
        {children}
      </div>
    </div>
  );
}

export function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="h-14 pl-6 pr-4 border-b border-hairline flex items-center justify-between shrink-0">
      <span className="text-base font-semibold">{title}</span>
      <button onClick={onClose} className="w-7 h-7 rounded flex items-center justify-center text-ink-soft hover:bg-surface-soft transition-colors">
        <X size={18} strokeWidth={1.5} />
      </button>
    </div>
  );
}

export function ModalFooter({ children }: { children: React.ReactNode }) {
  return <div className="px-6 py-4 border-t border-hairline flex justify-end gap-3 shrink-0">{children}</div>;
}
