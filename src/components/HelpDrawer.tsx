import { useEffect, useState } from "react";
import { X, Copy, ChevronRight } from "lucide-react";
import { useT } from "../lib/i18n";

type Props = { open: boolean; onClose: () => void; onTryCopy: () => void };

export default function HelpDrawer({ open, onClose, onTryCopy }: Props) {
  const t = useT();
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
          <span className="text-base font-semibold">{t("help.title")}</span>
          <button onClick={onClose} className="w-7 h-7 rounded flex items-center justify-center text-ink-soft hover:bg-surface-soft transition-colors">
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-7 py-8">
          {/* Intro */}
          <div className="mb-10">
            <h2 className="text-[20px] font-semibold tracking-[-0.01em] mb-2">{t("help.heading")}</h2>
            <p className="text-[14px] text-ink-soft leading-[1.75] whitespace-pre-line">
              {t("help.subheading")}
            </p>
          </div>

          {/* Steps */}
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-ink-faint mb-5">{t("help.stepsLabel")}</h3>

          <Step
            n={1}
            title={t("help.step1Title")}
            desc={t("help.step1Desc")}
          />
          <Step
            n={2}
            title={<>{t("help.step2TitlePrefix")}<Pill>{t("help.step2Pill")}</Pill></>}
            desc={t("help.step2Desc")}
          />
          <Step
            n={3}
            title={t("help.step3Title")}
            desc={t("help.step3Desc")}
          />
          <Step
            n={4}
            title={<>{t("help.step4TitlePrefix")}<Pill>{t("help.step4Pill")}</Pill></>}
            desc={t("help.step4Desc")}
            last
          />

          {/* Data */}
          <div className="mt-10 mb-8 p-5 bg-surface-soft rounded-lg">
            <h3 className="text-[14px] font-semibold mb-2">{t("help.dataTitle")}</h3>
            <p className="text-[13px] text-ink-soft leading-[1.7] whitespace-pre-line">
              {t("help.dataBody")}
            </p>
          </div>

          {/* FAQ */}
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-ink-faint mb-3">{t("help.faqLabel")}</h3>
          <Faq q={t("help.faqQ1")} a={t("help.faqA1")} />
          <Faq q={t("help.faqQ2")} a={t("help.faqA2")} />
          <Faq q={t("help.faqQ3")} a={t("help.faqA3")} />
        </div>

        <div className="h-20 border-t border-hairline flex items-center justify-center shrink-0">
          <button
            onClick={onTryCopy}
            className="h-10 px-5 rounded-md bg-slate text-white font-medium text-sm inline-flex items-center gap-2 hover:opacity-90 transition-opacity"
          >
            <Copy size={16} strokeWidth={1.5} />
            {t("help.tryStep2")}
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
