import { useEffect, useState } from "react";
import { X, Copy, ChevronRight } from "lucide-react";

type Props = { open: boolean; onClose: () => void; onTryCopy: () => void };

export default function HelpDrawer({ open, onClose, onTryCopy }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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
          <span className="text-base font-semibold">使用帮助</span>
          <button onClick={onClose} className="w-7 h-7 rounded flex items-center justify-center text-ink-soft hover:bg-surface-soft transition-colors">
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-7 py-8">
          {/* Intro */}
          <div className="mb-10">
            <h2 className="text-[20px] font-semibold tracking-[-0.01em] mb-2">跨 AI 的工作记忆</h2>
            <p className="text-[14px] text-ink-soft leading-[1.75]">
              你在不同 AI 之间切换时（ChatGPT、Claude、Cursor…），
              <br />MemoryOS 帮你把上下文沉淀成本地文件，换 AI 也能 30 秒续上。
            </p>
          </div>

          {/* Steps */}
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-ink-faint mb-5">四步走完一次</h3>

          <Step
            n={1}
            title="在 AI 那边聊完一轮工作"
            desc="ChatGPT、Claude、Cursor、Gemini 都行。聊到一个段落、有结果要记下来的时候。"
          />
          <Step
            n={2}
            title={<>回这里,点 <Pill>复制结束 Session 指令</Pill></>}
            desc="MemoryOS 会拿你这个项目的当前上下文 + 一段标准结束指令,自动写进剪贴板。"
          />
          <Step
            n={3}
            title="粘回那个 AI,让它整理一份总结"
            desc="AI 会用一个固定的 Markdown 格式输出 handoff,包括关键决策、未解决问题、下一步行动。"
          />
          <Step
            n={4}
            title={<>复制总结回来,点 <Pill>+ 导入 Handoff</Pill></>}
            desc="MemoryOS 会解析、分级风险、让你勾选哪些写入文件。AI 不会绕过你自动修改任何东西。"
            last
          />

          {/* Data */}
          <div className="mt-10 mb-8 p-5 bg-surface-soft rounded-lg">
            <h3 className="text-[14px] font-semibold mb-2">你的数据</h3>
            <p className="text-[13px] text-ink-soft leading-[1.7]">
              全部在你电脑里的 Markdown 文件。<br />
              不上传任何东西，不需要登录。换电脑就把整个文件夹拷过去。
            </p>
          </div>

          {/* FAQ */}
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-ink-faint mb-3">常见问题</h3>
          <Faq q="AI 总结的不准怎么办？" a="导入时你能挑哪些保留、哪些丢掉。每条更新都要勾选才写入文件。" />
          <Faq q="想换电脑或者备份？" a="把 workspace 文件夹整个拷贝到别的地方就行。MemoryOS 只读这个文件夹。" />
          <Faq q="可以用 Obsidian / VS Code 直接编辑这些文件吗？" a="可以。所有文件都是普通 Markdown,任何编辑器都能打开。" />
        </div>

        <div className="h-20 border-t border-hairline flex items-center justify-center shrink-0">
          <button
            onClick={onTryCopy}
            className="h-10 px-5 rounded-md bg-slate text-white font-medium text-sm inline-flex items-center gap-2 hover:opacity-90 transition-opacity"
          >
            <Copy size={16} strokeWidth={1.5} />
            现在试试第 2 步
          </button>
        </div>
      </aside>
    </>
  );
}

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
      {/* number circle */}
      <div className="shrink-0 relative">
        <div className="w-7 h-7 rounded-full bg-slate text-white text-[13px] font-semibold flex items-center justify-center">
          {n}
        </div>
        {!last && (
          <div className="absolute left-1/2 -translate-x-1/2 top-7 w-px bg-hairline" style={{ height: "calc(100% + 8px)" }} />
        )}
      </div>
      {/* body */}
      <div className={`flex-1 ${last ? "pb-1" : "pb-7"}`}>
        <div className="text-[15px] font-semibold leading-[1.5] mb-1.5">{title}</div>
        <p className="text-[13px] text-ink-soft leading-[1.7]">{desc}</p>
      </div>
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
