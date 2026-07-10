// 记忆库页（记忆展示形态第 1 轮，双视图第一版）。
// 给我看：条目库按八类分组，每条显正文、类型、来源、权重档。
// 给 AI 看：注入预览，按权重挑条目、1200 字内。当前为预览，正式开场仍用记忆卡片，
// 切换真实注入链路等六卡迁移完成后再做（设计稿第 9 节 S5 之后）。

import { useMemo, useState } from "react";
import { ArrowLeft, Bot, User, Sparkles, LayoutGrid, Upload, Download, Search, Link2, Pin, Archive, Undo2, Pencil, Share2, Plus, FolderInput } from "lucide-react";
import { toTier, scoreEntry, THRESHOLDS, type Tier } from "../lib/weight";
import {
  ALL_KINDS,
  KIND_LABELS,
  SOURCE_LABELS,
  groupByKind,
  buildInjectionFromEntries,
  type MemoryEntry,
  type EntryKind,
  type RelationProposal,
} from "../lib/entry";
import { useT } from "../lib/i18n";

type Props = {
  projectName: string;
  entries: MemoryEntry[];
  /** 读库时跳过的坏行数，大于 0 时提示但不阻塞。 */
  badLineCount: number;
  onBack: () => void;
  /** 库为空时显示整理入口：项目库整理六卡，全局库整理关于我。 */
  canMigrate: boolean;
  onMigrate: () => void;
  /** 一键找关联：内容相近自动建边（机械初版）。 */
  onAutoRelate: () => void;
  /** 导出 md 到剪贴板，携带或手改用。 */
  onExportMd: () => void;
  /** 把改完的 md 按编号对回。 */
  onImportMd: (md: string) => Promise<void>;
  /** 复制 AI 整理提示词：导出 md 包上调标签提关联的指令。 */
  onCopyRefinePrompt: () => void;
  /** 当前库：项目、全局、技能三库平级；全部 = 跨库只读回顾。 */
  libKind: "project" | "global" | "skill" | "all";
  onSwitchLib: (k: "project" | "global" | "skill" | "all") => void;
  /** 单条更新（调档、钉住等），写回当前库。 */
  onUpdateEntry: (id: string, patch: Partial<MemoryEntry>) => void;
  /** 跨库移动：换归属，编号在目标库重发。 */
  onMoveEntry: (id: string, target: "project" | "global" | "skill") => void;
  /** 手写一条进当前库（技能库内容引导，所有可编辑库共用）。 */
  onAddEntry: (text: string) => Promise<void>;
  /** 一键汇集：把各库标了技能类型的条目移进技能库，仅技能库页用。 */
  onCollectSkills: () => void;
  /** 关联提案待确认队列（07-10 提案走审核）：接受建边，驳回防复提。 */
  pendingRelations: RelationProposal[];
  onAcceptRelation: (p: RelationProposal) => void;
  onRejectRelation: (p: RelationProposal) => void;
  onAcceptAllRelations: () => void;
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

function daysIdle(e: MemoryEntry): number {
  return Math.max(0, Math.floor((Date.now() - new Date(e.updatedAt || e.createdAt).getTime()) / 86400000));
}

/** 条目当前档位：手动分优先，否则按真实标签和新旧算。 */
function tierOf(e: MemoryEntry): Tier {
  return toTier(scoreEntry(e, daysIdle(e)));
}

/** 归档候选（机械规则只提示不自动动）：分低于归档阈值且 30 天没动，钉住豁免。 */
function isArchiveCandidate(e: MemoryEntry): boolean {
  if (e.pinned || e.archived) return false;
  const idle = daysIdle(e);
  return idle >= 30 && scoreEntry(e, idle) < THRESHOLDS.archive;
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
  const [view, setView] = useState<"user" | "ai" | "graph">("user");
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addText, setAddText] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const submitAdd = async () => {
    if (addBusy || !addText.trim()) return;
    setAddBusy(true);
    try {
      await props.onAddEntry(addText);
      setAddText("");
      setAddOpen(false);
    } finally {
      setAddBusy(false);
    }
  };
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
  // 全部 = 跨库只读回顾：三库编号各自独立会撞号，合并视图不提供编辑
  const readOnly = props.libKind === "all";
  const effectiveView = readOnly ? "user" : view;

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
          {t("entryLib.open")} · {props.libKind === "project" ? props.projectName : props.libKind === "global" ? t("entryLib.libGlobal") : props.libKind === "skill" ? t("entryLib.libSkill") : t("entryLib.libAll")}
        </div>
        <div className="flex rounded-lg border border-hairline overflow-hidden text-[12px]">
          {(["project", "global", "skill", "all"] as const).map((k) => (
            <button
              key={k}
              onClick={() => props.onSwitchLib(k)}
              className={`h-8 px-3 transition-colors ${
                props.libKind === k ? "bg-surface-soft text-ink font-medium" : "text-ink-faint hover:text-ink"
              }`}
            >
              {k === "project" ? t("entryLib.libProject") : k === "global" ? t("entryLib.libGlobal") : k === "skill" ? t("entryLib.libSkill") : t("entryLib.libAll")}
            </button>
          ))}
        </div>
        {props.libKind !== "all" && (
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
          <button
            onClick={() => setView("graph")}
            className={`h-9 px-4 inline-flex items-center gap-1.5 transition-colors ${
              view === "graph" ? "bg-slate text-white" : "text-ink-soft hover:text-ink"
            }`}
          >
            <Share2 size={14} strokeWidth={1.5} /> {t("entryLib.graphView")}
          </button>
        </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        {props.badLineCount > 0 && (
          <div className="mb-4 px-4 py-2.5 bg-[#FFF5E1] border border-[#EAD9A8] rounded-lg text-[13px] text-[#A37A1C]">
            {t("entryLib.badLines", { n: props.badLineCount })}
          </div>
        )}

        {props.entries.length === 0 ? (
          props.libKind === "skill" ? (
            // 技能库空状态引导：说清放什么、给例子、手写第一条、一键汇集两条路
            <div className="max-w-[560px] mx-auto mt-16 text-center">
              <p className="text-[15px] text-ink mb-2">{t("entryLib.skillEmptyHint")}</p>
              <p className="text-[13px] text-ink-faint mb-6">{t("entryLib.skillExamples")}</p>
              <div className="flex gap-2 mb-4">
                <input
                  value={addText}
                  onChange={(e) => setAddText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitAdd()}
                  placeholder={t("entryLib.addPlaceholder")}
                  className="flex-1 h-10 px-3 rounded-lg border border-hairline bg-surface text-[13px] focus:outline-none focus:border-slate/50"
                />
                <button
                  disabled={addBusy || !addText.trim()}
                  onClick={submitAdd}
                  className="h-10 px-4 rounded-lg bg-slate text-white text-[13px] font-medium disabled:opacity-40 hover:-translate-y-px transition-all"
                >
                  {t("entryLib.addApply")}
                </button>
              </div>
              <button
                onClick={props.onCollectSkills}
                title={t("entryLib.collectSkillsHint")}
                className="h-10 px-5 rounded-lg border border-hairline text-sm text-ink-soft inline-flex items-center gap-2 hover:text-ink hover:border-slate/40 transition-colors"
              >
                <FolderInput size={15} strokeWidth={1.5} />
                {t("entryLib.collectSkills")}
              </button>
            </div>
          ) : (
          <div className="max-w-[560px] mx-auto mt-16 text-center">
            <p className="text-[15px] text-ink-faint mb-6">{t("entryLib.empty")}</p>
            {props.canMigrate && (
              <button
                onClick={props.onMigrate}
                className="h-10 px-5 rounded-lg bg-slate text-white font-medium text-sm inline-flex items-center gap-2 shadow-btn hover:-translate-y-px hover:shadow-btn-hover transition-all"
              >
                <Sparkles size={15} strokeWidth={1.5} />
                {props.libKind === "global" ? t("entryLib.migrateGlobalCta") : t("entryLib.migrateCta")}
              </button>
            )}
          </div>
          )
        ) : effectiveView === "user" ? (
          <div className="max-w-[808px] space-y-8">
            {readOnly && (
              <div className="px-4 py-2.5 bg-surface-soft border border-hairline rounded-lg text-[13px] text-ink-soft">
                {t("entryLib.allReadOnly")}
              </div>
            )}
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
              {!readOnly && (
                <>
                  <button
                    onClick={() => setAddOpen((v) => !v)}
                    className="h-9 px-3.5 rounded-lg border border-hairline text-[13px] text-ink-soft inline-flex items-center gap-1.5 hover:text-ink hover:border-slate/40 transition-colors"
                  >
                    <Plus size={14} strokeWidth={1.5} /> {t("entryLib.addEntry")}
                  </button>
                  {props.libKind === "skill" && (
                    <button
                      onClick={props.onCollectSkills}
                      title={t("entryLib.collectSkillsHint")}
                      className="h-9 px-3.5 rounded-lg border border-hairline text-[13px] text-ink-soft inline-flex items-center gap-1.5 hover:text-ink hover:border-slate/40 transition-colors"
                    >
                      <FolderInput size={14} strokeWidth={1.5} /> {t("entryLib.collectSkills")}
                    </button>
                  )}
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
                </>
              )}
            </div>
            {addOpen && (
              <div className="px-4 py-3 rounded-xl border border-hairline bg-surface-soft flex gap-2">
                <input
                  value={addText}
                  onChange={(e) => setAddText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitAdd()}
                  placeholder={t("entryLib.addPlaceholder")}
                  autoFocus
                  className="flex-1 h-9 px-3 rounded-lg border border-hairline bg-surface text-[13px] focus:outline-none focus:border-slate/50"
                />
                <button
                  disabled={addBusy || !addText.trim()}
                  onClick={submitAdd}
                  className="h-9 px-4 rounded-lg bg-slate text-white text-[13px] font-medium disabled:opacity-40 hover:-translate-y-px transition-all"
                >
                  {t("entryLib.addApply")}
                </button>
              </div>
            )}
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
                      <div key={`${k}-${e.scopes[0] ?? ""}-${e.id}`} className="rounded-xl border border-hairline bg-surface-soft">
                      <div className="px-4 py-3 flex items-start gap-3">
                        <span className="text-[11px] text-ink-faint font-display mt-0.5 shrink-0">{e.id}</span>
                        <p className="text-[14px] text-ink leading-relaxed flex-1 min-w-0">{e.text}</p>
                        <span className="flex gap-1.5 shrink-0 items-center">
                          {readOnly && (
                            <span className="px-2 py-0.5 rounded-full text-[11px] bg-[#F0F1F3] text-[#5A6070]">
                              {e.scopes[0] === "global" ? t("entryLib.libGlobal") : e.scopes[0] === "skill" ? t("entryLib.libSkill") : e.scopes[0]}
                            </span>
                          )}
                          {!readOnly && isArchiveCandidate(e) && (
                            <button
                              onClick={() =>
                                props.onUpdateEntry(e.id, {
                                  archived: { reason: "lowWeight", at: new Date().toISOString().slice(0, 10) },
                                })
                              }
                              title={t("entryLib.suggestArchiveHint")}
                              className="px-2 py-0.5 rounded-full text-[11px] bg-[#FFF5E1] text-[#A37A1C] hover:bg-[#FFEFD0] transition-colors"
                            >
                              {t("entryLib.suggestArchive")}
                            </button>
                          )}
                          {(() => {
                            const tier = tierOf(e);
                            const c = TIER_CYCLE[tier];
                            if (readOnly) {
                              return (
                                <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${c.cls}`}>{t(c.label)}</span>
                              );
                            }
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
                          {!readOnly && (
                          <button
                            onClick={() => props.onUpdateEntry(e.id, { pinned: !e.pinned })}
                            title={t("entryLib.pinHint")}
                            className={`p-1 rounded-full transition-colors ${
                              e.pinned ? "bg-[#002FA7] text-white" : "text-ink-faint hover:text-ink"
                            }`}
                          >
                            <Pin size={11} strokeWidth={1.5} />
                          </button>
                          )}
                          {!readOnly && !e.pinned && (
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
                              onClick={() => !readOnly && setEditingId(editingId === e.id ? null : e.id)}
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
                                !readOnly &&
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
                          {!readOnly && (
                          <button
                            onClick={() => setEditingId(editingId === e.id ? null : e.id)}
                            title={t("entryLib.editTags")}
                            className={`p-1 rounded-full transition-colors ${
                              editingId === e.id ? "bg-slate text-white" : "text-ink-faint hover:text-ink"
                            }`}
                          >
                            <Pencil size={11} strokeWidth={1.5} />
                          </button>
                          )}
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
                      key={`arch-${e.scopes[0] ?? ""}-${e.id}`}
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
                        {!readOnly && (
                        <button
                          onClick={() => props.onUpdateEntry(e.id, { archived: undefined })}
                          className="px-2.5 py-1 rounded-lg border border-hairline text-[12px] text-ink-soft inline-flex items-center gap-1 hover:text-ink hover:border-slate/40 transition-colors"
                        >
                          <Undo2 size={11} strokeWidth={1.5} /> {t("entryLib.reclaim")}
                        </button>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : effectiveView === "graph" ? (
          <GraphView
            entries={active}
            readOnly={readOnly}
            onAutoRelate={props.onAutoRelate}
            pendingRelations={props.pendingRelations}
            onAcceptRelation={props.onAcceptRelation}
            onRejectRelation={props.onRejectRelation}
            onAcceptAllRelations={props.onAcceptAllRelations}
          />
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

// ── 星图（力导向布局，参照常见知识图谱的交互习惯）─────────────────
// 相连的记忆自然聚成一团，孤立的散在外围；点越大关联越多，颜色是权重档；
// 悬停高亮它和它的邻居，其他淡下去；实线是相关，虚线是同一次对话，橙线是取代。

// 关联提案审核面板：一键找关联的产出在这里等确认，接受建边、不要防复提。
function ProposalPanel(props: {
  entries: MemoryEntry[];
  pending: RelationProposal[];
  onAccept: (p: RelationProposal) => void;
  onReject: (p: RelationProposal) => void;
  onAcceptAll: () => void;
}) {
  const t = useT();
  if (!props.pending.length) return null;
  const textOf = (id: string) => {
    const e = props.entries.find((x) => x.id === id);
    const s = e?.text ?? id;
    return s.length > 22 ? s.slice(0, 22) + "…" : s;
  };
  return (
    <div className="mb-4 rounded-xl border border-[#EAD9A8] bg-[#FFFBEF]">
      <div className="px-4 py-2.5 flex items-center gap-3 border-b border-[#EAD9A8]/60">
        <span className="text-[13px] font-medium text-[#A37A1C]">
          {t("entryLib.relPending", { n: props.pending.length })}
        </span>
        <span className="text-[12px] text-ink-faint flex-1">{t("entryLib.relPendingHint")}</span>
        <button
          onClick={props.onAcceptAll}
          className="h-7 px-2.5 rounded-lg bg-slate text-white text-[12px] font-medium hover:-translate-y-px transition-all"
        >
          {t("entryLib.relAcceptAll")}
        </button>
      </div>
      <div className="px-4 py-2 max-h-48 overflow-y-auto divide-y divide-[#EAD9A8]/40">
        {props.pending.map((p) => (
          <div key={`${p.from}->${p.to}`} className="py-2 flex items-center gap-2 text-[13px]">
            <span className="text-ink flex-1 min-w-0 truncate" title={props.entries.find((x) => x.id === p.from)?.text}>
              {textOf(p.from)}
            </span>
            <Link2 size={12} strokeWidth={1.5} className="text-[#A37A1C] shrink-0" />
            <span className="text-ink flex-1 min-w-0 truncate" title={props.entries.find((x) => x.id === p.to)?.text}>
              {textOf(p.to)}
            </span>
            <button
              onClick={() => props.onAccept(p)}
              className="h-7 px-2.5 rounded-lg border border-hairline text-[12px] text-[#1E7A46] hover:border-[#1E7A46]/50 transition-colors shrink-0"
            >
              {t("entryLib.relAccept")}
            </button>
            <button
              onClick={() => props.onReject(p)}
              className="h-7 px-2.5 rounded-lg border border-hairline text-[12px] text-ink-faint hover:text-ink transition-colors shrink-0"
            >
              {t("entryLib.relReject")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function GraphView(props: {
  entries: MemoryEntry[];
  readOnly: boolean;
  onAutoRelate: () => void;
  pendingRelations: RelationProposal[];
  onAcceptRelation: (p: RelationProposal) => void;
  onRejectRelation: (p: RelationProposal) => void;
  onAcceptAllRelations: () => void;
}) {
  const t = useT();
  const [hoverId, setHoverId] = useState<string | null>(null);

  const { nodes, edges, degree } = useMemo(() => {
    const ids = new Set(props.entries.map((e) => e.id));
    const edges = props.entries.flatMap((e) =>
      e.relations
        .filter((r) => ids.has(r.to))
        .map((r) => ({ from: e.id, to: r.to, rel: r.rel }))
    );
    const degree = new Map<string, number>();
    for (const ed of edges) {
      degree.set(ed.from, (degree.get(ed.from) ?? 0) + 1);
      degree.set(ed.to, (degree.get(ed.to) ?? 0) + 1);
    }
    return { nodes: props.entries, edges, degree };
  }, [props.entries]);

  const W = 760, H = 560;

  // 力导向：确定性初始位置（编号散列，布局稳定可复现），迭代后相连聚团
  const pos = useMemo(() => {
    const n = nodes.length;
    const p = new Map<string, { x: number; y: number }>();
    if (!n) return p;
    const hash = (s: string) => {
      let h = 7;
      for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      return h;
    };
    const xs = nodes.map((e) => {
      const h = hash(e.id + e.text.slice(0, 4));
      return { id: e.id, x: 60 + (h % (W - 120)), y: 60 + ((h >>> 10) % (H - 120)) };
    });
    const idx = new Map(xs.map((v, i) => [v.id, i]));
    const springs = edges.map((ed) => [idx.get(ed.from)!, idx.get(ed.to)!] as const);
    for (let it = 0; it < 220; it++) {
      const cool = 1 - it / 220;
      const fx = new Array(n).fill(0);
      const fy = new Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const dx = xs[i].x - xs[j].x;
          const dy = xs[i].y - xs[j].y;
          const d2 = Math.max(dx * dx + dy * dy, 64);
          const f = 2600 / d2;
          const d = Math.sqrt(d2);
          fx[i] += (dx / d) * f; fy[i] += (dy / d) * f;
          fx[j] -= (dx / d) * f; fy[j] -= (dy / d) * f;
        }
      }
      for (const [a, b] of springs) {
        const dx = xs[b].x - xs[a].x;
        const dy = xs[b].y - xs[a].y;
        const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const f = (d - 95) * 0.03;
        fx[a] += (dx / d) * f; fy[a] += (dy / d) * f;
        fx[b] -= (dx / d) * f; fy[b] -= (dy / d) * f;
      }
      for (let i = 0; i < n; i++) {
        fx[i] += (W / 2 - xs[i].x) * 0.012;
        fy[i] += (H / 2 - xs[i].y) * 0.012;
        xs[i].x = Math.min(W - 40, Math.max(40, xs[i].x + fx[i] * cool));
        xs[i].y = Math.min(H - 40, Math.max(40, xs[i].y + fy[i] * cool));
      }
    }
    for (const v of xs) p.set(v.id, { x: v.x, y: v.y });
    return p;
  }, [nodes, edges]);

  if (edges.length === 0) {
    return (
      <div className="max-w-[640px] mx-auto mt-10">
        {!props.readOnly && (
          <ProposalPanel
            entries={props.entries}
            pending={props.pendingRelations}
            onAccept={props.onAcceptRelation}
            onReject={props.onRejectRelation}
            onAcceptAll={props.onAcceptAllRelations}
          />
        )}
        <div className="text-center mt-6">
          <p className="text-[14px] text-ink-faint mb-6">{t("entryLib.graphEmpty")}</p>
          {!props.readOnly && (
            <button
              onClick={props.onAutoRelate}
              title={t("entryLib.autoRelateHint")}
              className="h-10 px-5 rounded-lg bg-slate text-white font-medium text-sm inline-flex items-center gap-2 shadow-btn hover:-translate-y-px hover:shadow-btn-hover transition-all"
            >
              <Link2 size={15} strokeWidth={1.5} /> {t("entryLib.autoRelate")}
            </button>
          )}
        </div>
      </div>
    );
  }

  const neighbors = new Set<string>();
  if (hoverId) {
    neighbors.add(hoverId);
    for (const ed of edges) {
      if (ed.from === hoverId) neighbors.add(ed.to);
      if (ed.to === hoverId) neighbors.add(ed.from);
    }
  }
  const dim = (id: string) => (hoverId ? (neighbors.has(id) ? 1 : 0.12) : 1);
  const edgeStroke = (rel: string) =>
    rel === "supersedes" ? "#B4491E" : "#002FA7";

  return (
    <div className="max-w-[808px]">
      {!props.readOnly && (
        <ProposalPanel
          entries={props.entries}
          pending={props.pendingRelations}
          onAccept={props.onAcceptRelation}
          onReject={props.onRejectRelation}
          onAcceptAll={props.onAcceptAllRelations}
        />
      )}
      <div className="flex items-center gap-3 mb-3">
        <p className="text-[13px] text-ink-faint flex-1">{t("entryLib.graphHint")}</p>
        {!props.readOnly && (
          <button
            onClick={props.onAutoRelate}
            title={t("entryLib.autoRelateHint")}
            className="h-8 px-3 rounded-lg border border-hairline text-[12px] text-ink-soft inline-flex items-center gap-1.5 hover:text-ink hover:border-slate/40 transition-colors"
          >
            <Link2 size={12} strokeWidth={1.5} /> {t("entryLib.autoRelate")}
          </button>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl border border-hairline bg-surface-soft">
        {edges.map((ed) => {
          const a = pos.get(ed.from)!;
          const b = pos.get(ed.to)!;
          const lit = hoverId ? ed.from === hoverId || ed.to === hoverId : true;
          return (
            <line
              key={`${ed.from}->${ed.to}`}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={edgeStroke(ed.rel)}
              strokeOpacity={lit ? 0.45 : 0.06}
              strokeWidth={lit && hoverId ? 2 : 1.4}
              strokeDasharray={ed.rel === "from_same_session" ? "4 3" : undefined}
            />
          );
        })}
        {nodes.map((e) => {
          const p = pos.get(e.id)!;
          const tier = tierOf(e);
          const fill = tier === "high" ? "#002FA7" : tier === "mid" ? "#8A93A8" : "#C6CBD6";
          const deg = degree.get(e.id) ?? 0;
          const r = 4 + Math.min(8, deg * 1.6) + (e.pinned ? 1.5 : 0);
          const showLabel = hoverId ? neighbors.has(e.id) : deg > 0;
          return (
            <g
              key={`n-${e.scopes[0] ?? ""}-${e.id}`}
              opacity={dim(e.id)}
              onMouseEnter={() => setHoverId(e.id)}
              onMouseLeave={() => setHoverId(null)}
              style={{ cursor: "default" }}
            >
              <title>{e.text}</title>
              <circle cx={p.x} cy={p.y} r={r} fill={fill} stroke={e.pinned ? "#002FA7" : "none"} strokeWidth={e.pinned ? 2 : 0} />
              {showLabel && (
                <text x={p.x} y={p.y + r + 12} textAnchor="middle" className="fill-current text-ink-soft" fontSize="9.5">
                  {e.text.length > 14 ? e.text.slice(0, 14) + "…" : e.text}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-faint">
        <span><span className="inline-block w-5 border-t-2 border-[#002FA7] align-middle mr-1" />{t("entryLib.legendRelated")}</span>
        <span><span className="inline-block w-5 border-t-2 border-dashed border-[#002FA7] align-middle mr-1" />{t("entryLib.legendSession")}</span>
        <span><span className="inline-block w-5 border-t-2 border-[#B4491E] align-middle mr-1" />{t("entryLib.legendSupersedes")}</span>
        <span>{t("entryLib.legendSize")}</span>
        <span>{t("entryLib.legendColor")}</span>
      </div>
    </div>
  );
}
