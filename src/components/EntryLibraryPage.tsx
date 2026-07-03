// 记忆库页（记忆展示形态第 1 轮，双视图第一版）。
// 给我看：条目库按八类分组，每条显正文、类型、来源、权重档。
// 给 AI 看：注入预览，按权重挑条目、1200 字内。当前为预览，正式开场仍用记忆卡片，
// 切换真实注入链路等六卡迁移完成后再做（设计稿第 9 节 S5 之后）。

import { useMemo, useState } from "react";
import { ArrowLeft, Bot, User, Sparkles, LayoutGrid, Upload, Download } from "lucide-react";
import {
  ALL_KINDS,
  KIND_LABELS,
  SOURCE_LABELS,
  groupByKind,
  buildInjectionFromEntries,
  type MemoryEntry,
  type EntryKind,
} from "../lib/entry";
import { useT } from "../lib/i18n";

type Props = {
  projectName: string;
  entries: MemoryEntry[];
  /** 读库时跳过的坏行数，大于 0 时提示但不阻塞。 */
  badLineCount: number;
  onBack: () => void;
  /** 库为空且项目有记忆卡片时显示整理入口。 */
  canMigrate: boolean;
  onMigrate: () => void;
  /** 导出 md 到剪贴板，携带或手改用。 */
  onExportMd: () => void;
  /** 把改完的 md 按编号对回。 */
  onImportMd: (md: string) => Promise<void>;
  /** 当前库：项目、全局、技能，三库平级。 */
  libKind: "project" | "global" | "skill";
  onSwitchLib: (k: "project" | "global" | "skill") => void;
};

const KIND_TINT: Record<EntryKind, string> = {
  decision: "bg-[#E8EDFF] text-[#002FA7]",
  constraint: "bg-[#FFF0E8] text-[#B4491E]",
  state: "bg-[#E6F5EC] text-[#1E7A46]",
  handoff: "bg-[#F0E8FF] text-[#6B3FA0]",
  fact: "bg-[#EAF4FB] text-[#2A6C9E]",
  preference: "bg-[#FDF0F5] text-[#A83A66]",
  skill: "bg-[#FFF8E1] text-[#8A6D1A]",
  misc: "bg-[#F0F1F3] text-[#5A6070]",
};

export default function EntryLibraryPage(props: Props) {
  const t = useT();
  const [view, setView] = useState<"user" | "ai">("user");
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const grouped = useMemo(() => groupByKind(props.entries), [props.entries]);
  const injection = useMemo(() => buildInjectionFromEntries(props.entries), [props.entries]);

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-surface rounded-2xl shadow-panel overflow-hidden">
      <div className="px-8 pt-6 pb-4 border-b border-hairline flex items-center gap-4">
        <button
          onClick={props.onBack}
          className="h-9 px-3 rounded-lg border border-hairline text-sm text-ink-soft inline-flex items-center gap-1.5 hover:text-ink hover:border-slate/40 transition-colors"
        >
          <ArrowLeft size={15} strokeWidth={1.5} /> {t("entryLib.back")}
        </button>
        <div className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          <LayoutGrid size={16} strokeWidth={1.5} className="text-slate" />
          {t("entryLib.open")} · {props.libKind === "project" ? props.projectName : props.libKind === "global" ? t("entryLib.libGlobal") : t("entryLib.libSkill")}
        </div>
        <div className="flex rounded-lg border border-hairline overflow-hidden text-[12px]">
          {(["project", "global", "skill"] as const).map((k) => (
            <button
              key={k}
              onClick={() => props.onSwitchLib(k)}
              className={`h-8 px-3 transition-colors ${
                props.libKind === k ? "bg-surface-soft text-ink font-medium" : "text-ink-faint hover:text-ink"
              }`}
            >
              {k === "project" ? t("entryLib.libProject") : k === "global" ? t("entryLib.libGlobal") : t("entryLib.libSkill")}
            </button>
          ))}
        </div>
        <div className="ml-auto flex rounded-lg border border-hairline overflow-hidden text-sm">
          <button
            onClick={() => setView("user")}
            className={`h-9 px-4 inline-flex items-center gap-1.5 transition-colors ${
              view === "user" ? "bg-slate text-white" : "text-ink-soft hover:text-ink"
            }`}
          >
            <User size={14} strokeWidth={1.5} /> {t("entryLib.userView")}
          </button>
          <button
            onClick={() => setView("ai")}
            className={`h-9 px-4 inline-flex items-center gap-1.5 transition-colors ${
              view === "ai" ? "bg-slate text-white" : "text-ink-soft hover:text-ink"
            }`}
          >
            <Bot size={14} strokeWidth={1.5} /> {t("entryLib.aiView")}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        {props.badLineCount > 0 && (
          <div className="mb-4 px-4 py-2.5 bg-[#FFF5E1] border border-[#EAD9A8] rounded-lg text-[13px] text-[#A37A1C]">
            {t("entryLib.badLines", { n: props.badLineCount })}
          </div>
        )}

        {props.entries.length === 0 ? (
          <div className="max-w-[560px] mx-auto mt-16 text-center">
            <p className="text-[15px] text-ink-faint mb-6">{t("entryLib.empty")}</p>
            {props.canMigrate && (
              <button
                onClick={props.onMigrate}
                className="h-10 px-5 rounded-lg bg-slate text-white font-medium text-sm inline-flex items-center gap-2 shadow-btn hover:-translate-y-px hover:shadow-btn-hover transition-all"
              >
                <Sparkles size={15} strokeWidth={1.5} /> {t("entryLib.migrateCta")}
              </button>
            )}
          </div>
        ) : view === "user" ? (
          <div className="max-w-[808px] space-y-8">
            <div className="flex gap-2">
              <button
                onClick={props.onExportMd}
                className="h-9 px-3.5 rounded-lg border border-hairline text-[13px] text-ink-soft inline-flex items-center gap-1.5 hover:text-ink hover:border-slate/40 transition-colors"
              >
                <Download size={14} strokeWidth={1.5} /> {t("entryLib.exportMd")}
              </button>
              <button
                onClick={() => setImportOpen((v) => !v)}
                className="h-9 px-3.5 rounded-lg border border-hairline text-[13px] text-ink-soft inline-flex items-center gap-1.5 hover:text-ink hover:border-slate/40 transition-colors"
              >
                <Upload size={14} strokeWidth={1.5} /> {t("entryLib.importMd")}
              </button>
            </div>
            {importOpen && (
              <div className="px-4 py-4 rounded-xl border border-hairline bg-surface-soft space-y-3">
                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder={t("entryLib.importPlaceholder")}
                  className="w-full h-40 px-3 py-2 rounded-lg border border-hairline bg-surface text-[13px] leading-relaxed resize-y focus:outline-none focus:border-slate/50"
                />
                <button
                  disabled={importBusy || !importText.trim()}
                  onClick={async () => {
                    setImportBusy(true);
                    try {
                      await props.onImportMd(importText);
                      setImportOpen(false);
                      setImportText("");
                    } finally {
                      setImportBusy(false);
                    }
                  }}
                  className="h-9 px-4 rounded-lg bg-slate text-white text-[13px] font-medium disabled:opacity-40 hover:-translate-y-px transition-all"
                >
                  {t("entryLib.importApply")}
                </button>
              </div>
            )}
            {ALL_KINDS.map((k) =>
              grouped[k].length === 0 ? null : (
                <section key={k}>
                  <h2 className="text-[13px] font-semibold text-ink-soft mb-3 tracking-wide">
                    {KIND_LABELS[k]}
                    <span className="ml-2 text-ink-faint font-normal">{grouped[k].length}</span>
                  </h2>
                  <div className="space-y-2">
                    {grouped[k].map((e) => (
                      <div
                        key={`${k}-${e.id}`}
                        className="px-4 py-3 rounded-xl border border-hairline bg-surface-soft flex items-start gap-3"
                      >
                        <span className="text-[11px] text-ink-faint font-display mt-0.5 shrink-0">{e.id}</span>
                        <p className="text-[14px] text-ink leading-relaxed flex-1 min-w-0">{e.text}</p>
                        <span className="flex gap-1.5 shrink-0 items-center">
                          {e.kinds.map((kk) => (
                            <span key={kk} className={`px-2 py-0.5 rounded-full text-[11px] ${KIND_TINT[kk]}`}>
                              {KIND_LABELS[kk]}
                            </span>
                          ))}
                          <span className="px-2 py-0.5 rounded-full text-[11px] bg-[#F0F1F3] text-[#5A6070]">
                            {SOURCE_LABELS[e.source]}
                          </span>
                          {e.source === "third_party" && (
                            <span className={`px-2 py-0.5 rounded-full text-[11px] ${
                              e.truthiness === "verified" ? "bg-[#E6F5EC] text-[#1E7A46]" : "bg-[#FFF5E1] text-[#A37A1C]"
                            }`}>
                              {e.truthiness === "verified" ? t("entryLib.truthVerified") : t("entryLib.truthUnverified")}
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )
            )}
          </div>
        ) : (
          <div className="max-w-[808px]">
            <div className="mb-3 flex items-center gap-3 text-[13px] text-ink-soft">
              <span className="font-display">{t("entryLib.charCount", { n: injection.charCount })}</span>
              {injection.droppedIds.length > 0 && (
                <span className="text-[#A37A1C]">{t("entryLib.dropped", { n: injection.droppedIds.length })}</span>
              )}
            </div>
            <p className="text-[13px] text-ink-faint mb-4 leading-relaxed">{t("entryLib.aiViewHint")}</p>
            <pre className="px-5 py-4 rounded-xl border border-hairline bg-surface-soft text-[13px] leading-relaxed whitespace-pre-wrap text-ink">
              {injection.text || "—"}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
