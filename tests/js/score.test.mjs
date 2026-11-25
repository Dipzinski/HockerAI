import { test } from "node:test";
import assert from "node:assert/strict";

import { breakdown, FACTORS, MAX_SCORE, formatDate, tierLine, whyLabel, cleanChemical }
  from "../../docs/assets/js/score.js";
import { AS_OF, makeLead, programLead, warmSeriousLead } from "./fixtures.mjs";

test("factor maximums add up to the 12-point scale", () => {
  assert.equal(FACTORS.reduce((sum, f) => sum + f.max, 0), MAX_SCORE);
  assert.deepEqual(FACTORS.map((f) => f.key), ["industry", "dust", "recency", "size", "tri_air"]);
});

test("breakdown points sum to the lead's total score", () => {
  for (const lead of [makeLead(), programLead(), warmSeriousLead()]) {
    const rows = breakdown(lead, AS_OF);
    assert.equal(rows.length, 5);
    assert.equal(rows.reduce((sum, r) => sum + r.points, 0), lead.score.total);
    for (const r of rows) {
      assert.ok(r.points <= r.max, `${r.key} over max`);
      assert.ok(r.reason.length > 0, `${r.key} has no reason`);
      assert.ok(r.rule.length > 0, `${r.key} has no rule`);
    }
  }
});

test("dust-specific citation names the citation and its date", () => {
  const dust = breakdown(makeLead(), AS_OF).find((r) => r.key === "dust");
  assert.match(dust.reason, /MIOSHA Part 520 Ventilation Control/);
  assert.match(dust.reason, /Mich\. R 325\.52007/);
  assert.match(dust.reason, /Oct 15, 2026/);
});

test("a citation from a dust-program inspection says which program", () => {
  const lead = makeLead({ inspections: [{ inspection_id: "5", opened: "2026-05-28",
    dust_program: "Combustible Dust NEP", url: "", other_citations: 0,
    citations: [{ standard: "29 CFR 1910.1200(e)(1)(i)", title: "Hazard communication", category: "dust",
      type: "Other-than-serious", issued: "2026-10-15", penalty_usd: 4256, under_contest: false }] }] });
  const dust = breakdown(lead, AS_OF).find((r) => r.key === "dust");
  assert.match(dust.reason, /Hazard communication/);
  assert.match(dust.reason, /during a Combustible Dust NEP inspection/);
});

test("dust-program inspection is used when it is the dated evidence", () => {
  const dust = breakdown(programLead(), AS_OF).find((r) => r.key === "dust");
  assert.match(dust.reason, /Combustible Dust NEP inspection/);
  assert.match(dust.reason, /Mar 2, 2025/);
});

test("serious non-dust citation gets a plain explanation and no recency", () => {
  const rows = breakdown(warmSeriousLead(), AS_OF);
  assert.match(rows.find((r) => r.key === "dust").reason, /not dust-related/);
  assert.match(rows.find((r) => r.key === "recency").reason, /no dust-related evidence/i);
});

test("recency reason states the evidence date and the window", () => {
  const hot = breakdown(makeLead(), AS_OF).find((r) => r.key === "recency");
  assert.match(hot.reason, /Oct 15, 2026/);
  assert.match(hot.reason, /12 months/);
  const older = breakdown(programLead(), AS_OF).find((r) => r.key === "recency");
  assert.match(older.reason, /24 months/);
});

test("size reason covers core, edge and unknown headcounts", () => {
  const size = (lead) => breakdown(lead, AS_OF).find((r) => r.key === "size").reason;
  assert.match(size(makeLead()), /50 employees/);
  assert.match(size(makeLead()), /20–500/);
  assert.match(size(programLead()), /12 employees/);
  assert.match(size(warmSeriousLead()), /isn't on record/);
});

test("TRI reason gives pounds and cleaned chemical names", () => {
  const tri = breakdown(programLead(), AS_OF).find((r) => r.key === "tri_air");
  assert.match(tri.reason, /20 lb/);
  assert.match(tri.reason, /Chromium and Chromium Compounds/);
  assert.doesNotMatch(tri.reason, /Transvaal/);
  const none = breakdown(makeLead(), AS_OF).find((r) => r.key === "tri_air");
  assert.match(none.reason, /No 2024/);
});

test("industry reason names the industry and NAICS code", () => {
  const ind = breakdown(makeLead(), AS_OF).find((r) => r.key === "industry");
  assert.match(ind.reason, /Metal fabrication & machinery/);
  assert.match(ind.reason, /333618/);
});

test("formatDate reads ISO dates without time-zone drift", () => {
  assert.equal(formatDate("2026-01-01"), "Jan 1, 2026");
  assert.equal(formatDate("2026-12-31"), "Dec 31, 2026");
  assert.equal(formatDate(null), "no date");
});

test("tier wording matches the tier", () => {
  assert.equal(whyLabel(makeLead()), "Why it's Hot");
  assert.equal(whyLabel(warmSeriousLead()), "Why it's Warm");
  assert.match(tierLine(makeLead()), /11 of 12/);
  assert.match(tierLine(makeLead()), /Hot leads score 8–12/);
});

test("cleanChemical drops parentheticals and doubled spaces", () => {
  assert.equal(cleanChemical("Lead  compounds (as Pb)"), "Lead compounds");
});
