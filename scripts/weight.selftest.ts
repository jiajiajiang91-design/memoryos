// 权重模块地基库自测（src/lib/weight.ts，纯函数）。
// 运行：npx esbuild scripts/weight.selftest.ts --bundle --platform=node --format=esm --outfile=tmp.weight.mjs && node tmp.weight.mjs
//
// 覆盖：合成/三档/有效分/初始分/新鲜度衰减/确定性/阈值校验/
//       红线1(改数值·层内排序·捞回守卫)/红线2(两种归档分开)/F接口/D1兜底。

import {
  slowestHalfLife,
  freshnessFromAgeMulti,
  certaintyFromEntrySource,
  scoreEntry,
  FACTOR_WEIGHTS,
  THRESHOLDS,
  NEUTRAL_SCORE,
  clampScore,
  toTier,
  composeScore,
  effectiveScore,
  freshnessFromAge,
  certaintyFromSource,
  initialScore,
  validateThresholds,
  applyWeightDelta,
  rerank,
  canReclaim,
  isSupersededArchive,
  shouldDemoteArchive,
  sortForArchive,
  topK,
  rankForInjection,
  sortDecisions,
  type WeightRecord,
  type Factors,
} from "../src/lib/weight";

let pass = 0;
let fail = 0;
function ok(cond: boolean, msg: string) {
  if (cond) { pass++; console.log("  ✓ " + msg); }
  else { fail++; console.error("  ✗ FAIL: " + msg); }
}
function eq(a: unknown, b: unknown, msg: string) {
  ok(JSON.stringify(a) === JSON.stringify(b), `${msg}  (got ${JSON.stringify(a)} want ${JSON.stringify(b)})`);
}
function near(a: number, b: number, tol: number, msg: string) {
  ok(Math.abs(a - b) <= tol, `${msg}  (got ${a} want ≈${b}±${tol})`);
}

function mkFactors(p: Partial<Factors> = {}): Factors {
  return { importance: 50, freshness: 50, activity: 50, certainty: 50, ...p };
}
function mkRec(p: Partial<WeightRecord> = {}): WeightRecord {
  return {
    factors: mkFactors(p.factors),
    kind: p.kind ?? "misc",
    scope: p.scope ?? "project",
    pinned: p.pinned ?? false,
    manualScore: p.manualScore,
    exempt: p.exempt ?? false,
  };
}

console.log("\n[A] 合成 / 三档 / 有效分 / 初始分");

// 合成系数合计为 1
near(Object.values(FACTOR_WEIGHTS).reduce((a, b) => a + b, 0), 1, 1e-9, "四因子系数合计=1");

// 全 50 → 合成 50
near(composeScore(mkFactors()), 50, 1e-9, "全中性因子合成=50");

// 全 100 → 100，全 0 → 0
near(composeScore(mkFactors({ importance: 100, freshness: 100, activity: 100, certainty: 100 })), 100, 1e-9, "全满=100");
near(composeScore(mkFactors({ importance: 0, freshness: 0, activity: 0, certainty: 0 })), 0, 1e-9, "全零=0");

// 重要性权重最大：只把重要性拉满应高于只把确定性拉满
ok(
  composeScore(mkFactors({ importance: 100, freshness: 0, activity: 0, certainty: 0 })) >
  composeScore(mkFactors({ importance: 0, freshness: 0, activity: 0, certainty: 100 })),
  "重要性权重 > 确定性权重"
);

// 三档边界
eq(toTier(THRESHOLDS.promote), "high", "67=高档");
eq(toTier(THRESHOLDS.promote - 1), "mid", "66=中档");
eq(toTier(THRESHOLDS.demote), "mid", "34=中档");
eq(toTier(THRESHOLDS.demote - 1), "low", "33=低档");

// clamp
eq(clampScore(150), 100, "clamp 上界");
eq(clampScore(-5), 0, "clamp 下界");
eq(clampScore(NaN), NEUTRAL_SCORE, "clamp NaN→中性");

// D1：缺因子按中性算，不崩
near(composeScore({ importance: undefined as unknown as number, freshness: 50, activity: 50, certainty: 50 }), 50, 1e-9, "D1 缺因子按中性 50");

// A5 有效分：手动覆盖压过自动
const autoRec = mkRec({ factors: mkFactors({ importance: 0, freshness: 0, activity: 0, certainty: 0 }) });
eq(effectiveScore(autoRec), 0, "无手动分→用自动合成(0)");
eq(effectiveScore({ ...autoRec, manualScore: 88 }), 88, "手动分压过自动");

// A9 初始分：用户拍板 > AI建议 > 三方
ok(initialScore("user_ratified") > initialScore("ai_suggestion"), "初始分 用户>AI建议");
ok(initialScore("ai_suggestion") > initialScore("third_party"), "初始分 AI建议>三方");

// 确定性映射
ok(certaintyFromSource("user_ratified") > certaintyFromSource("third_party"), "确定性 用户>三方");

console.log("\n[B] 新鲜度衰减（A7 按类型半衰期）");
eq(freshnessFromAge(0, "state"), 100, "今天=100 新鲜");
near(freshnessFromAge(14, "state"), 50, 0.001, "状态类 14 天半衰=50");
near(freshnessFromAge(180, "decision"), 50, 0.001, "决策类 180 天半衰=50");
ok(freshnessFromAge(60, "decision") > freshnessFromAge(60, "state"), "同样 60 天，决策比状态更保鲜");

console.log("\n[C] 阈值校验（D2 防呆）");
ok(validateThresholds({ promote: 67, demote: 34, archive: 20 }).ok, "默认阈值合法");
ok(!validateThresholds({ promote: 30, demote: 34, archive: 20 }).ok, "降档≥升档→非法");
ok(!validateThresholds({ promote: 67, demote: 20, archive: 34 }).ok, "归档≥降档→非法");
ok(!validateThresholds({ promote: 200, demote: 34, archive: 20 }).ok, "越界→非法");

console.log("\n[D] 红线1：三个动作分开");
// B1 改数值，纯函数不改入参
const r1 = mkRec({ manualScore: 50 });
const r1b = applyWeightDelta(r1, 20);
eq(r1.manualScore, 50, "applyWeightDelta 不改入参(纯函数)");
eq(r1b.manualScore, 70, "B1 升权 +20");
eq(applyWeightDelta(mkRec({ manualScore: 90 }), 50).manualScore, 100, "B1 升权封顶 100");
eq(applyWeightDelta(mkRec({ manualScore: 10 }), -50).manualScore, 0, "B1 降权封底 0");

// B2 层内排序：高分在前
const items = [
  { id: "a", weight: mkRec({ manualScore: 10 }) },
  { id: "b", weight: mkRec({ manualScore: 90 }) },
  { id: "c", weight: mkRec({ manualScore: 50 }) },
];
eq(rerank(items).map((x) => x.id), ["b", "c", "a"], "B2 rerank 高→低");
eq(items.map((x) => x.id), ["a", "b", "c"], "B2 rerank 不改入参");

// B3 捞回守卫
const rejected = new Set(["x", "y"]);
ok(canReclaim("z", rejected), "未驳回可捞回");
ok(!canReclaim("x", rejected), "已驳回不可捞回");

console.log("\n[E] 红线2：两种归档分开 + pin/exempt 保护");
ok(isSupersededArchive(true), "B4 内容触发=内容被替代");
ok(!isSupersededArchive(false), "B4 未被替代不归档");
// B5 权重触发
ok(shouldDemoteArchive(mkRec({ manualScore: 10 }), 40), "B5 低分+久未引用→归档");
ok(!shouldDemoteArchive(mkRec({ manualScore: 10 }), 5), "B5 低分但最近引用→不归档");
ok(!shouldDemoteArchive(mkRec({ manualScore: 90 }), 40), "B5 高分→不归档");
ok(!shouldDemoteArchive(mkRec({ manualScore: 10, pinned: true }), 40), "B5 钉住→永不自动归档");
ok(!shouldDemoteArchive(mkRec({ manualScore: 10, exempt: true }), 40), "B5 结构卡豁免→永不自动归档");

console.log("\n[F] 对外接口（只排序）");
const pool = [
  { id: "lo", weight: mkRec({ manualScore: 10 }) },
  { id: "hi", weight: mkRec({ manualScore: 95 }) },
  { id: "md", weight: mkRec({ manualScore: 55 }) },
];
eq(sortForArchive(pool).map((x) => x.id), ["lo", "md", "hi"], "F1 归档排序 低分在前");
eq(topK(pool, 2).map((x) => x.id), ["hi", "md"], "F2 TOP-2 取高分");
eq(topK(pool, 0), [], "F2 k=0 返回空");
// F3 预算注入：每条算 size=10，预算 25 → 放得下 2 条（高分优先）
eq(
  rankForInjection(pool, 25, () => 10).map((x) => x.id),
  ["hi", "md"],
  "F3 预算内高分优先放 2 条"
);
// F4 时间+权重：同分按日期新→旧
const decs = [
  { id: "old", weight: mkRec({ manualScore: 50 }), dateTs: 100 },
  { id: "new", weight: mkRec({ manualScore: 50 }), dateTs: 200 },
  { id: "top", weight: mkRec({ manualScore: 80 }), dateTs: 1 },
];
eq(sortDecisions(decs).map((x) => x.id), ["top", "new", "old"], "F4 先权重后日期");

console.log("\n[G] 多标签接入（衰减取最慢、来源四类确定性、条目级合成）");
eq(slowestHalfLife(["decision", "state"]), 180, "决策加状态取最慢 180 天");
eq(slowestHalfLife(["state"]), 14, "只状态 14 天");
eq(slowestHalfLife([]), 30, "空类型按零散 30 天");
near(freshnessFromAgeMulti(180, ["decision", "state"]), 50, 0.001, "多类型 180 天按决策半衰");
ok(certaintyFromEntrySource("user") > certaintyFromEntrySource("ai_suggestion"), "确定性 用户>AI建议");
ok(certaintyFromEntrySource("ai_suggestion") > certaintyFromEntrySource("ai_inference"), "确定性 AI建议>AI推论");
ok(certaintyFromEntrySource("ai_inference") > certaintyFromEntrySource("third_party"), "确定性 AI推论>三方未校验");
ok(certaintyFromEntrySource("third_party", "verified") > certaintyFromEntrySource("third_party"), "三方已校验上调");
eq(scoreEntry({ kinds: ["state"], source: "user", weight: 88 }, 100), 88, "条目手动分优先");
ok(
  scoreEntry({ kinds: ["decision"], source: "user" }, 0) > scoreEntry({ kinds: ["state"], source: "third_party" }, 60),
  "新鲜用户决策分高于过期三方状态"
);

console.log(`\n结果：${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
