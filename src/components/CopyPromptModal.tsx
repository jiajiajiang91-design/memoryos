import { useMemo, useState } from "react";
import { Copy, X, ChevronRight } from "lucide-react";
import type { Project, SourceTool } from "../types";
import { buildEndSessionPrompt } from "../lib/parser";
import { copyToClipboard, readContextForPrompt } from "../lib/fs";

type Props = {
  workspace: string;
  project: Project;
  onClose: () => void;
  onCopied: () => void;
};

export default function CopyPromptModal({ workspace, project, onClose, onCopied }: Props) {
  const [files, setFiles] = useState({ context: true, decisions: true, session: true, aboutMe: false });
  const [tool, setTool] = useState<SourceTool>("Claude");
  const [previewOpen, setPreviewOpen] = useState(false);

  const preview = useMemo(
    () =>
      buildEndSessionPrompt({
        projectName: project.name,
        context: files.context ? project.contextMarkdown : "",
        decisions: files.decisions ? project.decisionsMarkdown : "",
        latestSession: (files.session && project.sessions[0]?.rawMarkdown) || "",
      }),
    [files, project]
  );

  const tokenEstimate = Math.round(preview.length / 2.5);

  const handleCopy = async () => {
    const ctx = await readContextForPrompt(workspace, project.slug);
    const text = buildEndSessionPrompt({
      projectName: project.name,
      context: files.context ? ctx.context : "",
      decisions: files.decisions ? ctx.decisions : "",
      latestSession: files.session ? ctx.latestSession : "",
    });
    await copyToClipboard(text);
    onCopied();
  };

  return (
    <ModalShell onClose={onClose}>
      <ModalHeader title="Copy End Session Prompt" onClose={onClose} />
      <div className="px-6 pt-5 pb-6">
        <div className="text-[13px] text-ink-soft mb-1">Project</div>
        <div className="text-sm font-medium mb-6">{project.name}</div>

        <div className="text-[13px] text-ink-soft mb-2">Include in prompt</div>
        <FileToggle name="00_context.md" size={`${(project.contextMarkdown.length / 1024).toFixed(1)} KB`}
          checked={files.context} onChange={(v) => setFiles({ ...files, context: v })} />
        <FileToggle name="decisions.md" size={`${(project.decisionsMarkdown.length / 1024).toFixed(1)} KB`}
          checked={files.decisions} onChange={(v) => setFiles({ ...files, decisions: v })} />
        <FileToggle name="Latest session" size={project.sessions[0]?.date || "—"}
          checked={files.session && project.sessions.length > 0}
          onChange={(v) => setFiles({ ...files, session: v })} />
        <FileToggle name="about_me.md" size="(global)"
          checked={files.aboutMe} onChange={(v) => setFiles({ ...files, aboutMe: v })} />

        <div className="text-[13px] text-ink-soft mb-2.5 mt-6">Source Tool</div>
        <div className="flex gap-6 mb-6">
          {(["ChatGPT", "Claude", "Cursor", "Gemini"] as SourceTool[]).map((t) => (
            <RadioPick key={t} label={t} active={tool === t} onClick={() => setTool(t)} />
          ))}
        </div>

        <div className="text-[13px] text-ink-soft mb-3">
          Estimated tokens: <span className="text-ink font-medium">~{tokenEstimate.toLocaleString()}</span>
        </div>

        <button
          onClick={() => setPreviewOpen(!previewOpen)}
          className="inline-flex items-center gap-1 text-[13px] font-medium text-slate"
        >
          <ChevronRight size={14} strokeWidth={1.5} className={`transition-transform ${previewOpen ? "rotate-90" : ""}`} />
          Preview prompt
        </button>
        {previewOpen && (
          <pre className="mt-2 bg-paper border border-hairline rounded p-4 text-xs font-mono leading-[1.7] max-h-52 overflow-y-auto whitespace-pre-wrap">
            {preview}
          </pre>
        )}
      </div>
      <ModalFooter>
        <button onClick={onClose} className="h-9 px-3 rounded-md border border-hairline text-[13px] font-medium hover:bg-paper bg-surface transition-colors">
          Cancel
        </button>
        <button onClick={handleCopy} className="h-9 px-3 rounded-md bg-slate text-white text-[13px] font-medium inline-flex items-center gap-1.5 hover:opacity-90 transition-opacity">
          <Copy size={14} strokeWidth={1.5} />Copy Prompt
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

function RadioPick({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1.5 text-[13px]">
      <span className={`w-3.5 h-3.5 rounded-full border-[1.5px] flex items-center justify-center ${active ? "border-slate" : "border-ink-faint"}`}>
        {active && <span className="w-1.5 h-1.5 rounded-full bg-slate" />}
      </span>
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
        className={`bg-surface rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.08),_0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden flex flex-col w-full ${width} max-h-[calc(100vh-80px)] animate-rise`}
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
