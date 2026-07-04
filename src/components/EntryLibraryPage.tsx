// 记忆库页（记忆展示形态第 1 轮，双视图第一版）。
// 给我看：条目库按八类分组，每条显正文、类型、来源、权重档。
// 给 AI 看：注入预览，按权重挑条目、1200 字内。当前为预览，正式开场仍用记忆卡片，
// 切换真实注入链路等六卡迁移完成后再做（设计稿第 9 节 S5 之后）。

import { useMemo, useState } from "react";
import { ArrowLeft, Bot, User, Sparkles, LayoutGrid, Upload, Download, Search, Link2, Pin, Archive, Undo2, Pencil } from "lucide-react";
import { toTier, scoreEntry, type Tier } from "../lib/weight";
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
  /** 复制 AI 整理提示词：导出 md 包上调标签提关联的指令。 */
  onCopyRefinePrompt: () => void;
  /** 当前库：项目、全局、技能，三库平级。 */
  libKind: "project" | "global" | "skill";
  onSwitchLib: (k: "project" | "global" | "skill") => void;
  /** 单条更新（调档、钉住等），写回当前库。 */
  onUpdateEntry: (id: string, patch: Partial<MemoryEntry>) => void;
  /** 跨库移动：换归属，编号在目标库重发。 */
  onMoveEntry: (id: string, target: "project" | "global" | "skill") => void;
  /** 开场注入来源开关：开了用条目库，关了用记忆卡片（07-04 确认）。 */
  entryInjectionOn: boolean;
  onToggleInjection: () => void;
};

// 三档轮换：高→中→低→高，落成代表分写进 weight（手动分优先于自动算）。
const TIER_CYCLE: Record<Tier, { next: number; label: "entryLib.tierHigh" | "entryLib.tierMid" | "entryLib.tierLow"; cls: string }> = {
  high: { next: 50, label: "entryLib.tierHigh", cls: "bg-[#E8EDFF] text-[#002FA7]" },
  mid: { next: 20, label: "entryLib.tierMid", cls: "bg-[#F0F1F3] text-[#5A6070]" },
  low: { next: 80, label: "entryLib.tierLow", cls: "bg-[#FDF0F5] text-[#A83A66]" },
};

/** 条目当前档位：手动分优先，否则按真实标签和新旧算。 */
function tierOf(e: MemoryEntry): Tier {
  const daysOld = Math.max(0, Math.floor((Date.now() - new Date(e.updatedAt || e.createdAt).getTime()) / 86400000));
  return toTier(scoreEntry(e, daysOld));
}

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
  const [query, setQuery] = useState("");
  // 筛选器：类型 来源 权重档，空为不过滤
  const [fKind, setFKind] = useState<EntryKind | "">("");
  const [fSource, setFSource] = useState<string>("");
  const [fTier, setFTier] = useState<Tier | "">("");
  // 标签编辑器：展开中的条目编号，null 为收起（记忆可换框）
  const [editingId, setEditingId] = useState<string | null>(null);
  // 关键词检索：搜正文和编号，直面混乱性痛点的第一版
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pass = (e: MemoryEntry) => {
      if (q && !e.text.toLowerCase().includes(q) && !e.id.toLowerCase().includes(q)) return false;
      if (fKind && !e.kinds.includes(fKind)) return false;
      if (fSource && e.source !== fSource) return false;
      if (fTier && tierOf(e) !== fTier) return false;
      return true;
    };
    const hits = props.entries.filter(pass);
    // 关联跳转（找出关系并输出落在检索侧）：关键词命中的条目，其关联的条目
    // 双向一起带出，即使不含关键词。只在有关键词时生效，筛选器照常约束。
    if (!q) return hits;
    const hitIds = new Set(hits.map((e) => e.id));
    const pulled = new Set(hitIds);
    for (const e of props.entries) {
      if (hitIds.has(e.id)) {
        for (const r of e.relations) pulled.add(r.to); // 命中者指向的
      } else if (e.relations.some((r) => hitIds.has(r.to))) {
        pulled.add(e.id); // 指向命中者的
      }
    }
    return props.entries.filter((e) => pulled.has(e.id));
  }, [props.entries, query, fKind, fSource, fTier]);
  // 现行层进八类分组；已归档单独一区，捞回即回现行层
  const active = useMemo(() => filtered.filter((e) => !e.archived), [filtered]);
  const archivedList = useMemo(() => filtered.filter((e) => e.archived), [filtered]);
  const grouped = useMemo(() => groupByKind(active), [active]);
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
            <div className="flex gap-2 items-center">
              <div className="relative flex-1 max-w-[320px]">
                <Search size={14} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("entryLib.searchPlaceholder")}
                  className="w-full h-9 pl-8 pr-3 rounded-lg border border-hairline bg-surface text-[13px] focus:outline-none focus:border-slate/50"
                />
              </div>
              <select
                value={fKind}
                onChange={(ev) => setFKind(ev.target.value as EntryKind | "")}
                className="h-9 px-2 rounded-lg border border-hairline bg-surface text-[12px] text-ink-soft focus:outline-none"
              >
                <option value="">{t("entryLib.filterKind")}·{t("entryLib.filterAll")}</option>
                {ALL_KINDS.map((k) => (
                  <option key={k} value={k}>{KIND_LABELS[k]}</option>
                ))}
              </select>
              <select
                value={fSource}
                onChange={(ev) => setFSource(ev.target.value)}
                className="h-9 px-2 rounded-lg border border-hairline bg-surface text-[12px] text-ink-soft focus:outline-none"
              >
                <option value="">{t("entryLib.filterSource")}·{t("entryLib.filterAll")}</option>
                {(Object.keys(SOURCE_LABELS) as (keyof typeof SOURCE_LABELS)[]).map((s) => (
                  <option key={s} value={s}>{SOURCE_LABELS[s]}</option>
                ))}
              </select>
              <select
                value={fTier}
                onChange={(ev) => setFTier(ev.target.value as Tier | "")}
                className="h-9 px-2 rounded-lg border border-hairline bg-surface text-[12px] text-ink-soft focus:outline-none"
              >
                <option value="">{t("entryLib.filterTier")}·{t("entryLib.filterAll")}</option>
                <option value="high">{t("entryLib.tierHigh")}</option>
                <option value="mid">{t("entryLib.tierMid")}</option>
                <option value="low">{t("entryLib.tierLow")}</option>
              </select>
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
              <button
                onClick={props.onCopyRefinePrompt}
                className="h-9 px-3.5 rounded-lg border border-hairline text-[13px] text-ink-soft inline-flex items-center gap-1.5 hover:text-ink hover:border-slate/40 transition-colors"
              >
                <Sparkles size={14} strokeWidth={1.5} /> {t("entryLib.refinePrompt")}
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
            {filtered.length === 0 && query.trim() && (
              <p className="text-[14px] text-ink-faint text-center py-10">{t("entryLib.searchNoHit")}</p>
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
                      <div key={`${k}-${e.id}`} className="rounded-xl border border-hairline bg-surface-soft">
                      <div className="px-4 py-3 flex items-start gap-3">
                        <span className="text-[11px] text-ink-faint font-display mt-0.5 shrink-0">{e.id}</span>
                        <p className="text-[14px] text-ink leading-relaxed flex-1 min-w-0">{e.text}</p>
                        <span className="flex gap-1.5 shrink-0 items-center">
                          {(() => {
                            const tier = tierOf(e);
                            const c = TIER_CYCLE[tier];
                            return (
                              <button
                                onClick={() => props.onUpdateEntry(e.id, { weight: c.next })}
                                title={t("entryLib.tierHint")}
                                className={`px-2 py-0.5 rounded-full text-[11px] font-medium hover:opacity-75 transition-opacity ${c.cls}`}
                              >
                                {t(c.label)}
                              </button>
                            );
                          })()}
                          <button
                            onClick={() => props.onUpdateEntry(e.id, { pinned: !e.pinned })}
                            title={t("entryLib.pinHint")}
                            className={`p-1 rounded-full transition-colors ${
                              e.pinned ? "bg-[#002FA7] text-white" : "text-ink-faint hover:text-ink"
                            }`}
                          >
                            <Pin size={11} strokeWidth={1.5} />
                          </button>
                          {!e.pinned && (
                            <button
                              onClick={() =>
                                props.onUpdateEntry(e.id, {
                                  archived: { reason: "manual", at: new Date().toISOString().slice(0, 10) },
                                })
                              }
                              title={t("entryLib.archiveHint")}
                              className="p-1 rounded-full text-ink-faint hover:text-ink transition-colors"
                            >
                              <Archive size={11} strokeWidth={1.5} />
                            </button>
                          )}
                          {e.kinds.map((kk) => (
                            <span key={kk} className={`px-2 py-0.5 rounded-full text-[11px] ${KIND_TINT[kk]}`}>
                              {KIND_LABELS[kk]}
                            </span>
                          ))}
                          <span className="px-2 py-0.5 rounded-full text-[11px] bg-[#F0F1F3] text-[#5A6070]">
                            {SOURCE_LABELS[e.source]}
                          </span>
                          {e.relations.length > 0 && (
                            <button
                              onClick={() => setEditingId(editingId === e.id ? null : e.id)}
                              title={e.relations
                                .map((r) => props.entries.find((x) => x.id === r.to)?.text ?? r.to)
                                .join(" · ")}
                              className="px-2 py-0.5 rounded-full text-[11px] bg-[#E8EDFF] text-[#002FA7] inline-flex items-center gap-1 hover:opacity-75 transition-opacity"
                            >
                              <Link2 size={10} strokeWidth={1.5} />
                              {t("entryLib.relations", { n: e.relations.length })}
                            </button>
                          )}
                          {e.source === "third_party" && (
                            <button
                              onClick={() =>
                                props.onUpdateEntry(e.id, {
                                  truthiness: e.truthiness === "verified" ? "unverified" : "verified",
                                })
                              }
                              className={`px-2 py-0.5 rounded-full text-[11px] hover:opacity-75 transition-opacity ${
                                e.truthiness === "verified" ? "bg-[#E6F5EC] text-[#1E7A46]" : "bg-[#FFF5E1] text-[#A37A1C]"
                              }`}
                            >
                              {e.truthiness === "verified" ? t("entryLib.truthVerified") : t("entryLib.truthUnverified")}
                            </button>
                          )}
                          <button
                            onClick={() => setEditingId(editingId === e.id ? null : e.id)}
                            title={t("entryLib.editTags")}
                            className={`p-1 rounded-full transition-colors ${
                              editingId === e.id ? "bg-slate text-white" : "text-ink-faint hover:text-ink"
                            }`}
                          >
                            <Pencil size={11} strokeWidth={1.5} />
                          </button>
                        </span>
                      </div>
                      {editingId === e.id && (
                        <div className="px-4 pb-3 pt-1 border-t border-hairline flex flex-wrap items-center gap-1.5">
                          {ALL_KINDS.map((kk) => {
                            const on = e.kinds.includes(kk);
                            return (
                              <button
                                key={kk}
                                onClick={() => {
                                  if (on && e.kinds.length === 1) return; // 至少留一个类型
                                  props.onUpdateEntry(e.id, {
                                    kinds: on ? e.kinds.filter((x) => x !== kk) : [...e.kinds, kk],
                                  });
                                }}
                                className={`px-2.5 py-1 rounded-full text-[11px] border transition-colors ${
                                  on ? `${KIND_TINT[kk]} border-transparent font-medium` : "border-hairline text-ink-faint hover:text-ink"
                                }`}
                              >
                                {KIND_LABELS[kk]}
                              </button>
                            );
                          })}
                          <span className="mx-1 h-4 w-px bg-hairline" />
                          {e.relations.map((r) => {
                            const target = props.entries.find((x) => x.id === r.to);
                            return (
                              <button
                                key={`${e.id}-rel-${r.to}`}
                                onClick={() =>
                                  props.onUpdateEntry(e.id, {
                                    relations: e.relations.filter((x) => x.to !== r.to),
                                  })
                                }
                                title={target?.text ?? r.to}
                                className="px-2 py-1 rounded-full text-[11px] bg-[#E8EDFF] text-[#002FA7] inline-flex items-center gap-1 hover:opacity-70 transition-opacity"
                              >
                                <Link2 size={10} strokeWidth={1.5} />
                                {r.to} ×
                              </button>
                            );
                          })}
                          <select
                            value=""
                            title={t("entryLib.relHint")}
                            onChange={(ev) => {
                              const to = ev.target.value;
                              if (!to) return;
                              props.onUpdateEntry(e.id, {
                                relations: [...e.relations, { to, rel: "related" }],
                              });
                            }}
                            className="h-7 px-1.5 rounded-lg border border-hairline bg-surface text-[11px] text-ink-soft focus:outline-none max-w-[180px]"
                          >
                            <option value="">{t("entryLib.relAdd")}</option>
                            {active
                              .filter((x) => x.id !== e.id && !e.relations.some((r) => r.to === x.id))
                              .map((x) => (
                                <option key={x.id} value={x.id}>
                                  {x.id} {x.text.slice(0, 16)}
                                </option>
                              ))}
                          </select>
                          <span className="mx-1 h-4 w-px bg-hairline" />
                          {(["project", "global", "skill"] as const)
                            .filter((lb) => lb !== props.libKind)
                            .map((lb) => (
                              <button
                                key={lb}
                                onClick={() => { setEditingId(null); props.onMoveEntry(e.id, lb); }}
                                className="px-2.5 py-1 rounded-lg text-[11px] border border-hairline text-ink-soft hover:text-ink hover:border-slate/40 transition-colors"
                              >
                                {lb === "project" ? t("entryLib.moveToProject") : lb === "global" ? t("entryLib.moveToGlobal") : t("entryLib.moveToSkill")}
                              </button>
                            ))}
                        </div>
                      )}
                      </div>
                    ))}
                  </div>
                </section>
              )
            )}
            {archivedList.length > 0 && (
              <section className="pt-4 border-t border-hairline">
                <h2 className="text-[13px] font-semibold text-ink-faint mb-3 tracking-wide inline-flex items-center gap-1.5">
                  <Archive size={13} strokeWidth={1.5} />
                  {t("entryLib.archivedSection")}
                  <span className="font-normal">{archivedList.length}</span>
                </h2>
                <div className="space-y-2">
                  {archivedList.map((e) => (
                    <div
                      key={`arch-${e.id}`}
                      className="px-4 py-3 rounded-xl border border-dashed border-hairline flex items-start gap-3 opacity-70"
                    >
                      <span className="text-[11px] text-ink-faint font-display mt-0.5 shrink-0">{e.id}</span>
                      <p className="text-[14px] text-ink-soft leading-relaxed flex-1 min-w-0">{e.text}</p>
                      <span className="flex gap-1.5 shrink-0 items-center">
                        <span className="px-2 py-0.5 rounded-full text-[11px] bg-[#F0F1F3] text-[#5A6070]">
                          {e.archived?.reason === "superseded"
                            ? t("entryLib.reasonSuperseded")
                            : e.archived?.reason === "lowWeight"
                              ? t("entryLib.reasonLowWeight")
                              : t("entryLib.reasonManual")}
                          {e.archived?.at ? ` · ${e.archived.at}` : ""}
                        </span>
                        <button
                          onClick={() => props.onUpdateEntry(e.id, { archived: undefined })}
                          className="px-2.5 py-1 rounded-lg border border-hairline text-[12px] text-ink-soft inline-flex items-center gap-1 hover:text-ink hover:border-slate/40 transition-colors"
                        >
                          <Undo2 size={11} strokeWidth={1.5} /> {t("entryLib.reclaim")}
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              </section>
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
            <button
              onClick={props.onToggleInjection}
              className={`mb-3 h-9 px-4 rounded-lg text-[13px] font-medium inline-flex items-center gap-2 border transition-colors ${
                props.entryInjectionOn
                  ? "bg-slate text-white border-transparent"
                  : "border-hairline text-ink-soft hover:text-ink hover:border-slate/40"
              }`}
            >
              <span className={`w-8 h-4 rounded-full relative transition-colors ${props.entryInjectionOn ? "bg-white/30" : "bg-hairline"}`}>
                <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${props.entryInjectionOn ? "left-4" : "left-0.5"}`} />
              </span>
              {t("entryLib.injectionToggle")}
            </button>
            <p className="text-[13px] text-ink-faint mb-4 leading-relaxed">
              {props.entryInjectionOn ? t("entryLib.aiViewHintLive") : t("entryLib.aiViewHint")}
            </p>
            <pre className="px-5 py-4 rounded-xl border border-hairline bg-surface-soft text-[13px] leading-relaxed whitespace-pre-wrap text-ink">
              {injection.text || "—"}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
