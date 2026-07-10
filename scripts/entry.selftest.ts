// 条目纯函数库自测（src/lib/entry.ts，纯函数）。
// 运行：npx esbuild scripts/entry.selftest.ts --bundle --platform=node --format=esm --outfile=tmp.entry.mjs && node tmp.entry.mjs
//
// 覆盖：发号、八类分组含多标签进多组、导出 md、导入解析、按编号对账、
//       导出再导回不变的闭环、六卡迁移。

import {
  ALL_KINDS,
  nextEntryId,
  groupByKind,
  exportToMarkdown,
  parseMarkdown,
  reconcileImport,
  syncEntriesWithCards,
  migrateAboutMeToEntries,
  suggestRelationsByOverlap,
  proposeRelationsByOverlap,
  acceptRelationProposal,
  mergeProposals,
  relPairKey,
  skillCandidates,
  mergeLibsForInjection,
  similarityScore,
  searchSimilar,
  searchEntries,
  migrateCardsToEntries,
  toJsonl,
  fromJsonl,
  buildInjectionFromEntries,
  entryCharCount,
  type MemoryEntry,
  type EntryKind,
} from "../src/lib/entry";
import { zoomViewBox, panViewBox, clientDeltaToWorld, clientPointToWorld } from "../src/lib/graph";
import { scoreEntryAt } from "../src/lib/weight";

let pass = 0;
let fail = 0;
function ok(cond: boolean, msg: string) {
  if (cond) { pass++; console.log("  ✓ " + msg); }
  else { fail++; console.error("  ✗ FAIL: " + msg); }
}
function eq(a: unknown, b: unknown, msg: string) {
  ok(JSON.stringify(a) === JSON.stringify(b), `${msg}  (got ${JSON.stringify(a)} want ${JSON.stringify(b)})`);
}

function mk(p: Partial<MemoryEntry> & { id: string; text: string }): MemoryEntry {
  return {
    kinds: p.kinds ?? ["misc"],
    scopes: p.scopes ?? ["proj"],
    source: p.source ?? "user",
    modality: p.modality ?? "text",
    relations: p.relations ?? [],
    createdAt: p.createdAt ?? "2026-06-28",
    updatedAt: p.updatedAt ?? "2026-06-28",
    ...p,
  };
}

console.log("\n[A] 发号");
eq(nextEntryId([]), "m-0001", "空集发 m-0001");
eq(nextEntryId([{ id: "m-0003" }, { id: "m-0001" }]), "m-0004", "最大号加一");
eq(nextEntryId([{ id: "x-9" }, { id: "m-0002" }]), "m-0003", "非 m 编号忽略");

console.log("\n[B] 八类分组，多标签进多组");
const e1 = mk({ id: "m-0001", text: "优先做升权捞回", kinds: ["decision", "state"] });
const e2 = mk({ id: "m-0002", text: "不联网", kinds: ["constraint"] });
const e3 = mk({ id: "m-0003", text: "没类型", kinds: [] });
const g = groupByKind([e1, e2, e3]);
eq(g.decision.map((x) => x.id), ["m-0001"], "决策组含 e1");
eq(g.state.map((x) => x.id), ["m-0001"], "状态组也含 e1，多标签进多组");
eq(g.constraint.map((x) => x.id), ["m-0002"], "约束组含 e2");
eq(g.misc.map((x) => x.id), ["m-0003"], "无类型归零散");
ok(ALL_KINDS.length === 8, "八类齐");

console.log("\n[C] 导出 md + 解析");
const md = exportToMarkdown([e1, e2]);
ok(md.includes("## 决策") && md.includes("## 约束"), "导出按主类型分区块");
ok((md.match(/m-0001/g) ?? []).length === 1, "多标签的 e1 在导出里只出现一次");
ok(md.includes("#决策 #状态"), "行尾带全部类型标签");
const parsed = parseMarkdown(md);
eq(parsed.length, 2, "解析回两条");
const p1 = parsed.find((x) => x.id === "m-0001")!;
eq(p1.text, "优先做升权捞回", "解析正文去掉标签");
eq([...p1.kinds].sort(), ["decision", "state"], "解析回两个类型");
eq(p1.source, "user", "解析回来源");

console.log("\n[D] 导出再导回不变的闭环");
const plan0 = reconcileImport([e1, e2], parseMarkdown(exportToMarkdown([e1, e2])));
eq(plan0.updates.length, 0, "原样导回无更新");
eq(plan0.adds.length, 0, "原样导回无新增");
eq(plan0.deletes.length, 0, "原样导回无删除");

console.log("\n[E] 对账：改、删、加");
// 改正文
const mdEdited = exportToMarkdown([e1, e2]).replace("优先做升权捞回", "优先做升权捞回（改过）");
const planU = reconcileImport([e1, e2], parseMarkdown(mdEdited));
eq(planU.updates.length, 1, "正文改了产生一条更新");
eq(planU.updates[0].current.id, "m-0001", "更新指向 m-0001");
// 删整行：导回只剩 e1
const planD = reconcileImport([e1, e2], parseMarkdown(exportToMarkdown([e1])));
eq(planD.deletes.map((x) => x.id), ["m-0002"], "整行没了进删除候选");
// 新增没编号的行
const planA = reconcileImport([e1], parseMarkdown("- 新加的一条 #事实 @用户"));
eq(planA.adds.length, 1, "没编号的新行进新增");
eq(planA.adds[0].kinds, ["fact"], "新行解析出类型");

console.log("\n[F] 并发冲突");
const e1New = mk({ id: "m-0001", text: "优先做升权捞回", kinds: ["decision"], updatedAt: "2026-06-29" });
const planC = reconcileImport(
  [e1New],
  parseMarkdown(exportToMarkdown([e1New]).replace("优先做升权捞回", "导出后我又改了")),
  { exportedAt: "2026-06-28" }
);
ok(planC.updates.length === 1 && planC.updates[0].conflict === true, "导出后 app 又改过，标冲突");

console.log("\n[G] 六卡迁移");
const cards = `# 记忆卡片
## 项目卡
- 跨 AI 携带记忆的桌面工具
## 当前状态
- 已完成：地基库
- 进行中：接线
## 约束与决策
- 不联网
## 历史档案
- 决策历史 → decisions.md
`;
const migrated = migrateCardsToEntries(cards, "memoryos", "2026-06-28");
eq(migrated.length, 4, "迁出 4 条，历史档案跳过");
eq(migrated.find((e) => e.text.includes("桌面工具"))!.kinds, ["fact"], "项目卡进事实类");
eq(migrated.filter((e) => e.kinds[0] === "state").length, 2, "当前状态两行进状态类");
eq(migrated.find((e) => e.text === "不联网")!.kinds, ["decision"], "约束与决策进决策类");
eq(migrated[0].id, "m-0001", "迁移从 m-0001 发号");
ok(migrated.every((e) => e.scopes[0] === "memoryos" && e.source === "user"), "归属和来源正确");

console.log("\n[H] 模态和关联字段预留");
ok(migrated.every((e) => e.modality === "text"), "迁移条目模态为文字");
ok(migrated.every((e) => Array.isArray(e.relations) && e.relations.length === 0), "迁移条目关联为空集合");
const withRel = mk({ id: "m-0009", text: "带关联", relations: [{ to: "m-0001", rel: "related" }] });
eq(withRel.relations[0].to, "m-0001", "关联指向目标编号");
const gRel = groupByKind([withRel]);
eq(gRel.misc.map((x) => x.id), ["m-0009"], "带关联条目分组不受影响");
const mdRel = exportToMarkdown([withRel]);
ok(!mdRel.includes("m-0001]") || mdRel.includes("[m-0009]"), "导出 md 不外泄关联结构");
const planRel = reconcileImport([withRel], parseMarkdown(exportToMarkdown([withRel])));
eq(planRel.updates.length + planRel.adds.length + planRel.deletes.length, 0, "带关联条目导出导回不变");

console.log("\n[I] jsonl 存储序列化");
const store = [e1, e2, withRel];
const jl = toJsonl(store);
eq(jl.trimEnd().split("\n").length, 3, "三条三行");
const back = fromJsonl(jl);
eq(back.badLines, [], "全好行无坏行");
const norm = (es: MemoryEntry[]) =>
  es.map((e) => [e.id, e.text, [...e.kinds].sort(), [...e.scopes].sort(), e.source, e.modality, e.relations, e.createdAt, e.updatedAt]);
eq(norm(back.entries), norm(store), "jsonl 往返不变");
eq(fromJsonl("").entries.length, 0, "空文件空库");
// 坏行隔离：中间一行损坏，其余保留
const damaged = jl.split("\n");
damaged[1] = damaged[1].slice(0, 20); // 截断第 2 行制造坏 JSON
const iso = fromJsonl(damaged.join("\n"));
eq(iso.badLines, [2], "坏行报行号 2");
eq(iso.entries.map((e) => e.id), ["m-0001", "m-0009"], "坏行跳过好行保留");
// 缺字段的行也算坏行
const noId = fromJsonl('{"text":"没编号"}\n');
eq(noId.badLines, [1], "缺 id 算坏行");
// 旧数据缺新字段时补默认
const legacy = fromJsonl('{"id":"m-0001","text":"旧条目","kinds":["fact"],"scopes":["p"],"source":"user","createdAt":"2026-01-01","updatedAt":"2026-01-01"}\n');
eq(legacy.entries[0].modality, "text", "旧数据补默认模态");
eq(legacy.entries[0].relations, [], "旧数据补空关联");

console.log("\n[J] AI 视图注入拼装");
const hi = mk({ id: "m-0101", text: "重要决策", kinds: ["decision"], weight: 90 });
const lo = mk({ id: "m-0102", text: "次要决策", kinds: ["decision"], weight: 10 });
const st = mk({ id: "m-0103", text: "一个状态", kinds: ["state"] });
const inj = buildInjectionFromEntries([lo, st, hi]);
ok(inj.text.indexOf("重要决策") < inj.text.indexOf("次要决策"), "区块内按权重高在前");
ok(inj.text.indexOf("## 决策") < inj.text.indexOf("## 状态"), "按八类顺序分区块");
eq(inj.droppedIds, [], "预算内无舍弃");
eq(inj.charCount, entryCharCount(inj.text), "字数口径一致");
// 预算收紧时低权重被舍弃且记录
const tiny = buildInjectionFromEntries([lo, hi], 12);
ok(tiny.includedIds.includes("m-0101") && tiny.droppedIds.includes("m-0102"), "超预算舍低权重并记录");
ok(tiny.charCount <= 12, "拼装结果不超预算");
// 关联加权：被高权重条目关联的目标，紧预算下压过同权重的无关条目
const anchor = mk({ id: "m-0201", text: "锚点", kinds: ["decision"], weight: 90, relations: [{ to: "m-0202", rel: "related" }] });
const linked = mk({ id: "m-0202", text: "被关联者", kinds: ["state"], weight: 30 });
const plain = mk({ id: "m-0203", text: "无关条目", kinds: ["state"], weight: 30 });
const rel = buildInjectionFromEntries([anchor, plain, linked], 20);
ok(rel.includedIds.includes("m-0202") && !rel.includedIds.includes("m-0203"), "关联目标优先入选");
// 钉住和手动分随 jsonl 往返保留
const pinBack = fromJsonl(toJsonl([mk({ id: "m-0301", text: "钉住的", weight: 80, pinned: true })]));
ok(pinBack.entries[0].pinned === true && pinBack.entries[0].weight === 80, "钉住和手动分随存储往返保留");

console.log("\n[K] 归档与捞回");
const archived = mk({ id: "m-0401", text: "已归档的", kinds: ["state"], weight: 95, archived: { reason: "manual", at: "2026-07-04" } });
const activeE = mk({ id: "m-0402", text: "现行的", kinds: ["state"], weight: 10 });
const injArch = buildInjectionFromEntries([archived, activeE]);
ok(!injArch.includedIds.includes("m-0401"), "已归档的不进注入，哪怕权重高");
ok(injArch.includedIds.includes("m-0402"), "现行的正常进注入");
const archBack = fromJsonl(toJsonl([archived]));
eq(archBack.entries[0].archived?.reason, "manual", "归档原因随存储往返保留");
// 捞回 = 清掉归档字段后重新进注入
const reclaimed = { ...archived, archived: undefined };
ok(buildInjectionFromEntries([reclaimed]).includedIds.includes("m-0401"), "捞回后重新进注入");

console.log("\n[L] 写入闭环：卡片同步条目库");

const baseEntries = [
  mk({ id: "m-0001", text: "已完成：地基库", kinds: ["state"] }),
  mk({ id: "m-0002", text: "旧决策要被替代", kinds: ["decision"] }),
  mk({ id: "m-0003", text: "钉住的旧决策", kinds: ["decision"], pinned: true }),
];
const newCards = `# 记忆卡片
## 当前状态
- 已完成：地基库
- 进行中：新工作
## 约束与决策
- 新的决策
`;
const sync = syncEntriesWithCards(baseEntries, newCards, "proj", "2026-07-04", ["旧决策要被替代", "钉住的旧决策"]);
eq(sync.added, 2, "只补两条新行，已有的不重复");
ok(sync.entries.some((e) => e.text === "进行中：新工作"), "新行进条目库");
const sup2 = sync.entries.find((e) => e.id === "m-0002")!;
eq(sup2.archived?.reason, "superseded", "被替代的盖作废归档章");
ok(!sync.entries.find((e) => e.id === "m-0003")!.archived, "钉住的豁免自动归档");
eq(sync.archivedCount, 1, "归档计数只算真归档的");
// 幂等：同一份卡片再同步一次不再新增
const sync2 = syncEntriesWithCards(sync.entries, newCards, "proj", "2026-07-04");
eq(sync2.added, 0, "重复同步不再新增");
// 隐式边：同一次同步的新条目链式互联
const newOnes = sync.entries.filter((e) => e.createdAt === "2026-07-04");
eq(newOnes.length, 2, "本次同步两条新条目");
const second = newOnes[1];
eq(second.relations[0]?.rel, "from_same_session", "第二条链到第一条，同会话隐式边");
eq(second.relations[0]?.to, newOnes[0].id, "边指向同批前一条");
eq(newOnes[0].relations.length, 0, "第一条不自指");
// 单条新增不建边
const syncOne = syncEntriesWithCards(sync.entries, newCards + "- 又一条新的\n", "proj", "2026-07-05");
const lone = syncOne.entries.filter((e) => e.createdAt === "2026-07-05");
eq(lone.length, 1, "只新增一条");
eq(lone[0].relations.length, 0, "单条新增不建边");

console.log("\n[M] 关联走 md 通道");
const rA = mk({ id: "m-0501", text: "决策甲", kinds: ["decision"], relations: [{ to: "m-0502", rel: "from_same_session" }] });
const rB = mk({ id: "m-0502", text: "状态乙", kinds: ["state"] });
const mdR = exportToMarkdown([rA, rB]);
ok(mdR.includes("->m-0502"), "导出带关联箭头");
// 原样导回：关联目标集合没变，不算更新，关系类型保留
const planR0 = reconcileImport([rA, rB], parseMarkdown(mdR));
eq(planR0.updates.length, 0, "关联原样导回不算变");
// AI 加了一条关联箭头
const mdR2 = mdR.replace("状态乙 #状态 @用户", "状态乙 #状态 @用户 ->m-0501");
const planR2 = reconcileImport([rA, rB], parseMarkdown(mdR2));
eq(planR2.updates.length, 1, "加箭头算一条更新");
eq(planR2.updates[0].relations, [{ to: "m-0501", rel: "related" }], "新箭头记 related");
// AI 删掉原有箭头
const mdR3 = mdR.replace(" ->m-0502", "");
const planR3 = reconcileImport([rA, rB], parseMarkdown(mdR3));
eq(planR3.updates[0]?.relations, [], "删箭头清关联");
// 目标集合不变时保留原关系类型
const planR4 = reconcileImport([rA, rB], parseMarkdown(mdR.replace("决策甲", "决策甲改了")));
eq(planR4.updates[0].relations[0].rel, "from_same_session", "只改正文时原关系类型保留");
// 新行带箭头
const planR5 = reconcileImport([rA], parseMarkdown("- 新条带关联 #事实 @用户 ->m-0501"));
eq(planR5.adds[0].relTargets, ["m-0501"], "新行解析出关联目标");

console.log("\n[N] 关于我迁移全局库");
const aboutMd = `# About Me
## 基本信息
- 姓名 Jiajia
- 位置 伦敦

说明性段落不该被收。
## 偏好
- 简洁优先
`;
const ame = migrateAboutMeToEntries(aboutMd, "2026-07-05");
eq(ame.length, 3, "三条列表行进全局库");
ok(ame.every((e) => e.kinds[0] === "preference" && e.scopes[0] === "global"), "偏好类全局归属");
eq(ame[0].id, "m-0001", "从头发号");

console.log("\n[O] 一键找关联，提案走审核");
const s1 = mk({ id: "m-0601", text: "优先做升权捞回补齐闭环", kinds: ["decision"] });
const s2 = mk({ id: "m-0602", text: "升权捞回是本轮重点", kinds: ["state"] });
const s3 = mk({ id: "m-0603", text: "完全无关的另一件事", kinds: ["fact"] });
const props1 = proposeRelationsByOverlap([s1, s2, s3]);
eq(props1, [{ from: "m-0601", to: "m-0602" }], "相近的一对出一条提案，from 是编号小的");
ok([s1, s2, s3].every((e) => e.relations.length === 0), "只产提案不改条目");
// 接受建边
const acc = acceptRelationProposal([s1, s2, s3], props1[0]);
eq(acc.find((e) => e.id === "m-0601")!.relations[0]?.to, "m-0602", "接受后边在编号小的一侧");
eq(proposeRelationsByOverlap(acc), [], "已有边不再复提");
// 驳回防复提
eq(proposeRelationsByOverlap([s1, s2, s3], [relPairKey(props1[0])]), [], "已驳回不再复提");
// 归档的不参与
eq(proposeRelationsByOverlap([s1, { ...s2, archived: { reason: "manual", at: "2026-07-05" } }]), [], "已归档不出提案");
// 队列合并去重
const merged1 = mergeProposals([{ from: "m-0601", to: "m-0602" }], [{ from: "m-0601", to: "m-0602" }, { from: "m-0601", to: "m-0603" }]);
eq(merged1.length, 2, "并队列按键去重");
eq(merged1[0], { from: "m-0601", to: "m-0602" }, "先来的保持在前");
// 旧入口 = 提案全接受，行为不变
const sug = suggestRelationsByOverlap([s1, s2, s3]);
eq(sug.added, 1, "旧入口相近的一对建一条边");
eq(suggestRelationsByOverlap(sug.entries).added, 0, "旧入口幂等");

console.log("\n[P] 技能汇集候选");
const c1 = mk({ id: "m-0701", text: "写周报的固定套路", kinds: ["skill"], scopes: ["proj"] });
const c2 = mk({ id: "m-0702", text: "已在技能库的", kinds: ["skill"], scopes: ["skill"] });
const c3 = mk({ id: "m-0703", text: "归档的技能", kinds: ["skill"], scopes: ["proj"], archived: { reason: "manual", at: "2026-07-10" } });
const c4 = mk({ id: "m-0704", text: "普通决策", kinds: ["decision"], scopes: ["proj"] });
const c5 = mk({ id: "m-0705", text: "多标签含技能", kinds: ["decision", "skill"], scopes: ["proj"] });
eq(skillCandidates([c1, c2, c3, c4, c5]).map((e) => e.id), ["m-0701", "m-0705"], "只挑标技能、未归档、不在技能库的");

console.log("\n[Q] 注入合并项目库加技能库");
const pj1 = mk({ id: "m-0001", text: "项目里的决策", kinds: ["decision"], weight: 80, relations: [{ to: "m-0002", rel: "related" }] });
const pj2 = mk({ id: "m-0002", text: "项目里的状态", kinds: ["state"] });
const sk1 = mk({ id: "m-0001", text: "技能库第一条", kinds: ["skill"], scopes: ["skill"], weight: 80, relations: [{ to: "m-0002", rel: "related" }] });
const sk2 = mk({ id: "m-0002", text: "技能库第二条", kinds: ["skill"], scopes: ["skill"] });
const merged = mergeLibsForInjection([pj1, pj2], [sk1, sk2]);
eq(merged.length, 4, "撞号的四条都保留");
eq(merged.map((e) => e.id), ["m-0001", "m-0002", "s:m-0001", "s:m-0002"], "技能条目编号加前缀不撞");
eq(merged[2].relations[0]?.to, "s:m-0002", "技能条目关联目标同步换前缀");
eq(merged[0].relations[0]?.to, "m-0002", "项目条目关联不动");
const mInj = buildInjectionFromEntries(merged);
eq(mInj.includedIds.length, 4, "合并后全部入选");
ok(mInj.text.includes("## 技能") && mInj.text.includes("技能库第一条"), "注入文本出技能区块");
// 高权重关联加分不串库：项目 m-0001 关联 m-0002，只该加分项目侧那条
const tight = buildInjectionFromEntries(merged, 26);
ok(tight.includedIds.includes("m-0001"), "预算紧时高权重项目条目入选");

console.log("\n[R] 星图视口数学（拖拽缩放）");
{
  const v0 = { x: 0, y: 0, w: 760, h: 560 };
  // 以中心为不动点放大 2 倍：视口减半，中心不动
  const z1 = zoomViewBox(v0, 2, 380, 280, 190, 2280);
  eq(z1.w, 380, "放大 2 倍视口宽减半");
  eq(z1.h, 280, "高按比例跟随");
  ok(Math.abs(z1.x + z1.w / 2 - 380) < 1e-9 && Math.abs(z1.y + z1.h / 2 - 280) < 1e-9, "缩放中心不动");
  // 不动点在角上：角坐标经缩放后仍指向同一世界点
  const z2 = zoomViewBox(v0, 2, 0, 0, 190, 2280);
  eq([z2.x, z2.y], [0, 0], "以原点为不动点缩放原点不动");
  // 夹在上下限
  eq(zoomViewBox(v0, 100, 380, 280, 190, 2280).w, 190, "放大夹在最小宽");
  eq(zoomViewBox(v0, 0.01, 380, 280, 190, 2280).w, 2280, "缩小夹在最大宽");
  // 平移
  eq(panViewBox(v0, 10, -5), { x: 10, y: -5, w: 760, h: 560 }, "平移直接加增量");
  // 像素位移换世界位移：视口 760 渲染成 380px，比例 2
  eq(clientDeltaToWorld(v0, 380, 10, 6), { dx: 20, dy: 12 }, "像素位移按比例放大");
  eq(clientDeltaToWorld(v0, 0, 10, 6), { dx: 0, dy: 0 }, "元素宽为零不除零");
  // 屏幕点换世界点
  const rect = { left: 100, top: 50, width: 380, height: 280 };
  eq(clientPointToWorld(v0, rect, 100, 50), { x: 0, y: 0 }, "左上角是视口原点");
  eq(clientPointToWorld(v0, rect, 480, 330), { x: 760, y: 560 }, "右下角是视口对角");
  // 缩放后往返一致：先缩放再算同一屏幕点，世界点即缩放不动点
  const c = clientPointToWorld(v0, rect, 290, 190);
  const z3 = zoomViewBox(v0, 1.5, c.x, c.y, 190, 2280);
  const c2 = clientPointToWorld(z3, rect, 290, 190);
  ok(Math.abs(c2.x - c.x) < 1e-9 && Math.abs(c2.y - c.y) < 1e-9, "缩放后同一屏幕点仍指向不动点");
}

console.log("\n[S] 相近检索（本地相似度）");
{
  const t1 = mk({ id: "m-0801", text: "界面配色用克莱因蓝做主色", kinds: ["decision"] });
  const t2 = mk({ id: "m-0802", text: "主色确定为克莱因蓝，辅助色留白", kinds: ["fact"] });
  const t3 = mk({ id: "m-0803", text: "导出导入按编号对账", kinds: ["fact"] });
  eq(similarityScore("克莱因蓝", "主色确定为克莱因蓝"), 1, "查询完整出现在正文里满分");
  eq(similarityScore("克莱因蓝", "毫不相干的内容"), 0, "毫不相干零分");
  ok(similarityScore("配色主色", t2.text) > 0.25, "换了说法仍过阈值");
  eq(similarityScore("", "任意正文"), 0, "空查询零分");
  eq(similarityScore("蓝", "克莱因蓝"), 0, "单字查询切不出字对不参与");
  // 排除已直接命中的，剩下按分排序
  const sim1 = searchSimilar([t1, t2, t3], "克莱因蓝主色", new Set(["m-0801"]));
  eq(sim1.map((h) => h.id), ["m-0802"], "排除命中者，相近的入选，无关的不入");
  ok(sim1[0].score > 0.5, "相近分数过半");
  // limit 生效
  const many = [t1, t2, t3, mk({ id: "m-0804", text: "克莱因蓝按钮悬停变深" })];
  eq(searchSimilar(many, "克莱因蓝", new Set(), { limit: 2 }).length, 2, "最多出 limit 条");
  // 高分在前
  const ranked = searchSimilar([t3, t2], "主色克莱因蓝", new Set());
  eq(ranked[0]?.id, "m-0802", "高分在前");
}

console.log("\n[T] 统一检索入口 searchEntries（人和 AI 同一条路）");
{
  const k1 = mk({ id: "m-0901", text: "决定用克莱因蓝做主色", kinds: ["decision"], weight: 30, relations: [{ to: "m-0903", rel: "related" }] });
  const k2 = mk({ id: "m-0902", text: "克莱因蓝按钮悬停变深", kinds: ["fact"], weight: 80 });
  const k3 = mk({ id: "m-0903", text: "配色定稿后不再反复", kinds: ["constraint"] });
  const k4 = mk({ id: "m-0904", text: "主色确定后周边色跟随", kinds: ["fact"] });
  const k5 = mk({ id: "m-0905", text: "毫不相干的另一件事", kinds: ["misc"] });
  const res = searchEntries([k1, k2, k3, k4, k5], "克莱因蓝");
  eq(res.filter((h) => h.match === "keyword").map((h) => h.entry.id), ["m-0902", "m-0901"], "关键词命中按权重高在前");
  eq(res.filter((h) => h.match === "related").map((h) => h.entry.id), ["m-0903"], "命中条目的关联带出");
  ok(!res.some((h) => h.entry.id === "m-0905"), "无关条目不出现");
  // 反向关联也带出：k1 指向 k3，搜到 k3 时 k1 应被带出
  const rev = searchEntries([k1, k2, k3, k4, k5], "不再反复");
  eq(rev.filter((h) => h.match === "related").map((h) => h.entry.id), ["m-0901"], "指向命中者的条目反向带出");
  // 相近兜底：整词搜不到（"配色方案"不在任何正文里），字对相近的浮出
  const sim = searchEntries([k1, k2, k3, k4, k5], "配色方案");
  eq(sim.filter((h) => h.match === "keyword").length, 0, "整词无直接命中");
  ok(sim.some((h) => h.match === "similar" && h.entry.id === "m-0903"), "相近兜底捞到换说法的条目");
  // filter 只约束关键词命中，关联带出不受限
  const flt = searchEntries([k1, k2, k3, k4, k5], "克莱因蓝", { filter: (e) => e.kinds.includes("decision") });
  eq(flt.filter((h) => h.match === "keyword").map((h) => h.entry.id), ["m-0901"], "筛选器约束关键词命中");
  eq(flt.filter((h) => h.match === "related").map((h) => h.entry.id), ["m-0903"], "带出的关联不受筛选器约束");
  // 编号也能搜，归档照常可搜（检索是捞回通道）
  eq(searchEntries([k1, k2], "m-0902")[0]?.entry.id, "m-0902", "按编号命中");
  const arch = searchEntries([{ ...k2, archived: { reason: "manual", at: "2026-07-10" } }], "克莱因蓝");
  eq(arch[0]?.entry.id, "m-0902", "已归档条目照常搜到");
  eq(searchEntries([k1, k2], ""), [], "空查询返回空");
}

console.log("\n[U] 注入挑选用合成分（所见档位 = 注入排序）");
{
  const NOW = new Date("2026-07-10").getTime();
  // 都没手动调过档：新鲜的用户决策 vs 过期的三方未核实状态
  const freshUser = mk({ id: "m-1001", text: "新鲜的用户决策条目", kinds: ["decision"], source: "user", updatedAt: "2026-07-08" });
  const staleThird = mk({ id: "m-1002", text: "过期的三方未核实状态", kinds: ["state"], source: "third_party", truthiness: "unverified", updatedAt: "2026-01-01" });
  const sFresh = scoreEntryAt(freshUser, NOW);
  const sStale = scoreEntryAt(staleThird, NOW);
  ok(sFresh > sStale, `合成分区分新鲜用户决策(${Math.round(sFresh)})和过期三方状态(${Math.round(sStale)})`);
  // 原始 weight 字段两条都没有 → 旧尺子下同分 50，新尺子下新鲜的赢。
  // 预算 15 只装得下一条（决策行 4+10=14，状态行 4+12=16）
  const tight = buildInjectionFromEntries([staleThird, freshUser], 15, (e) => scoreEntryAt(e, NOW));
  eq(tight.includedIds, ["m-1001"], "预算紧时合成分高的入选");
  eq(tight.droppedIds, ["m-1002"], "合成分低的舍弃");
  // 手动分仍然压过合成：同类型同区块里手动 95 的排前
  const manual = buildInjectionFromEntries(
    [{ ...staleThird, kinds: ["decision" as const], weight: 95 }, freshUser],
    16,
    (e) => scoreEntryAt(e, NOW)
  );
  eq(manual.includedIds, ["m-1002"], "手动调过档的仍然优先");
}

console.log(`\n结果：${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
