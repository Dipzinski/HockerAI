import { test } from "node:test";
import assert from "node:assert/strict";

import { meterLayout, factorLayout, pleatFaces, meterLabel, METER_SIZES }
  from "../../docs/assets/js/widgets/meter-layout.js";
import { settleState, projectLeads, pointBounds } from "../../docs/assets/js/widgets/dot-map.js";
import { makeLead } from "./fixtures.mjs";

const score = { industry: 3, dust: 3, recency: 3, size: 2, tri_air: 0, total: 11 };

test("one pleat per point, earned ones first within each factor group", () => {
  const layout = meterLayout(score, "sm");
  assert.equal(layout.units.length, 12);
  assert.equal(layout.units.filter((u) => u.on).length, 11);
  assert.deepEqual(layout.groups.map((g) => g.key), ["industry", "dust", "recency", "size", "tri_air"]);
  assert.deepEqual(layout.groups.map((g) => g.max), [3, 3, 3, 2, 1]);
  assert.equal(layout.groups[4].full, false);
  assert.equal(layout.groups[0].full, true);
});

test("pleats never overlap and groups are separated", () => {
  for (const size of ["sm", "lg"]) {
    const { units, groups, size: s } = meterLayout(score, size);
    for (let i = 1; i < units.length; i += 1) assert.ok(units[i].x >= units[i - 1].x + s.w, `${size} pleat ${i}`);
    for (let i = 1; i < groups.length; i += 1) assert.ok(groups[i].x0 - groups[i - 1].x1 >= s.group);
  }
});

test("the row-size meter stays compact and legible", () => {
  const sm = meterLayout(score, "sm");
  assert.ok(sm.height <= 20, "no taller than a row's meter slot");
  assert.ok(sm.width >= 108 && sm.width < 125, "about 110px: wide enough to count groups, narrow enough for a phone row");
  assert.ok(METER_SIZES.sm.w >= 5, "pleats are wide enough to count at 1x");
});

test("the row meter separates groups more than pleats, and md sits between sm and lg", () => {
  assert.ok(METER_SIZES.sm.group >= 6 && METER_SIZES.sm.group > METER_SIZES.sm.gap * 4);
  assert.ok(meterLayout(score, "sm").width < meterLayout(score, "md").width);
  assert.ok(meterLayout(score, "md").width < meterLayout(score, "lg").width);
  assert.equal(meterLayout(score, "sm").height, 17, "row height is unchanged");
});

test("the large meter has flanges and group labels", () => {
  const lg = meterLayout(score, "lg");
  assert.ok(lg.size.rail > 0 && lg.size.labels);
  assert.ok(lg.height > lg.bodyBottom + lg.size.rail);
  assert.ok(lg.units.length === 12 && lg.width > 200);
});

test("fill animation runs in order, group by group", () => {
  const delays = meterLayout(score, "lg").units.map((u) => u.delay);
  assert.deepEqual(delays, [...delays].sort((a, b) => a - b));
  assert.equal(new Set(delays).size, 12);
});

test("each pleat has a lit and a shaded face that meet at the ridge", () => {
  const [lit, shade] = pleatFaces(10, 0, METER_SIZES.lg);
  assert.deepEqual(lit[1], shade[0]);
  assert.deepEqual(lit[2], shade[3]);
  assert.ok(lit[1][1] < lit[0][1], "the ridge rises above the edge");
});

test("factorLayout draws just that factor's pleats", () => {
  const f = factorLayout(2, 3);
  assert.deepEqual(f.units.map((u) => u.on), [true, true, false]);
});

test("meterLabel names every factor", () => {
  assert.equal(meterLabel(score),
    "Score 11 of 12: industry fit 3 of 3, dust evidence 3 of 3, recency 3 of 3, site size 2 of 2, epa air releases 0 of 1");
});

test("map dots settle warm first, then Hot, and finish at full strength", () => {
  const start = settleState(0);
  const mid = settleState(0.5);
  const end = settleState(1);
  assert.equal(start.warmAlpha, 0);
  assert.ok(mid.warmAlpha > mid.hotAlpha);
  assert.deepEqual([end.warmAlpha, end.hotAlpha, end.hotBoost], [1, 1, 1]);
});

test("projectLeads skips leads without coordinates", () => {
  const pts = projectLeads([makeLead(), makeLead({ id: "x", lat: null, lon: null })]);
  assert.equal(pts.length, 1);
  assert.equal(pts[0].hot, true);
  assert.ok(pointBounds(pts).maxX >= pointBounds(pts).minX);
});
