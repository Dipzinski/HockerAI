import { test } from "node:test";
import assert from "node:assert/strict";

import { territoryStats, coverageGaps, newestEvidence, briefing, spotlightReason, GAP_NOTES, sentenceText, pipelineIsEmpty,
  shortReason, keepTogether } from "../../docs/assets/js/briefing.js";
import { breakdown } from "../../docs/assets/js/score.js";
import { AS_OF, makeLead, programLead, warmSeriousLead } from "./fixtures.mjs";

const leads = [
  makeLead({ id: "m1", state: "MI" }),
  makeLead({ id: "m2", state: "MI", tier: "Warm", evidence_date: "2026-11-01" }),
  makeLead({ id: "c1", state: "CA", tier: "Warm", evidence_date: "2025-01-01" }),
  makeLead({ id: "c2", state: "CA", tier: "Warm", evidence_date: null }),
  makeLead({ id: "t1", state: "TX", evidence_date: "2026-10-30" }),
];
const data = { asOf: AS_OF, territory: ["CA", "TX", "MI"], counts: { new_hot_since_last_run: 3, previous_run: true }, leads };

test("territoryStats counts Hot and Warm per state from the leads", () => {
  assert.deepEqual(territoryStats(leads, ["CA", "MI", "FL"]), [
    { state: "CA", hot: 0, warm: 2, total: 2 },
    { state: "MI", hot: 1, warm: 1, total: 2 },
    { state: "FL", hot: 0, warm: 0, total: 0 },
  ]);
});

test("coverageGaps only explains states with a known reason and no Hot leads", () => {
  const gaps = coverageGaps(territoryStats(leads, ["CA", "MI", "FL"]));
  assert.deepEqual(gaps.map((g) => g.state), ["CA"], "FL has no Hot leads but no known reason, so it is not explained");
  assert.match(gaps[0].why, /Title 8/);
  assert.equal(gaps[0].warm, 2);
  assert.ok(GAP_NOTES.CA.name === "California");
  assert.deepEqual(coverageGaps(territoryStats([makeLead({ state: "CA" })], ["CA"])), [], "a Hot lead closes the gap");
});

test("newestEvidence picks the latest date and ignores missing ones", () => {
  assert.equal(newestEvidence(leads), "2026-11-01");
  assert.equal(newestEvidence([warmSeriousLead()]), null);
});

test("briefing leads with new Hot leads when a previous run exists", () => {
  const b = briefing(data, [leads[0]]);
  assert.deepEqual(b.headline, { value: 3, label: "new Hot leads since the last run" });
  assert.equal(b.hotCount, 2);
  assert.equal(sentenceText(b.sentence), "3 new Hot leads since the last run. 1 is ready to contact.");
  assert.match(b.lines[0], /Nov 1, 2026/);
  assert.match(b.lines[1], /California has no Hot leads yet/);
});

test("briefing falls back to the Hot count and never invents a delta", () => {
  const first = { ...data, counts: { new_hot_since_last_run: 9, previous_run: false } };
  assert.deepEqual(briefing(first, []).headline, { value: 2, label: "Hot leads in the territory" });
  const one = { ...data, counts: { new_hot_since_last_run: 1, previous_run: true } };
  assert.equal(briefing(one, []).headline.label, "new Hot lead since the last run");
});

test("spotlightReason prefers dust evidence, then the first fully earned factor", () => {
  const top = spotlightReason(breakdown(makeLead(), AS_OF));
  assert.equal(top.key, "dust");
  const noDust = spotlightReason(breakdown(makeLead({
    score: { industry: 3, dust: 1, recency: 0, size: 1, tri_air: 0, total: 5 } }), AS_OF));
  assert.equal(noDust.key, "industry");
  const best = spotlightReason(breakdown(makeLead({
    score: { industry: 1, dust: 1, recency: 0, size: 1, tri_air: 0, total: 3 } }), AS_OF));
  assert.equal(best.points, 1);
});

test("the briefing sentence keeps each figure separate so it can be emphasised", () => {
  const b = briefing(data, [leads[0], leads[4]]);
  assert.deepEqual(b.sentence.map((p) => p.num), ["3", "2"]);
  assert.equal(sentenceText(briefing(data, []).sentence), "3 new Hot leads since the last run. ");
});

test("pipelineIsEmpty is true only when every tracked stage has no leads", () => {
  assert.equal(pipelineIsEmpty({ reached: 0, contact: 0, audit: 0 }, ["reached", "contact", "audit"]), true);
  assert.equal(pipelineIsEmpty({ reached: 0, contact: 2, audit: 0 }, ["reached", "contact", "audit"]), false);
  assert.equal(pipelineIsEmpty({}, ["reached"]), true);
});

const NBSP = " ";
const plain = (s) => s.replaceAll(NBSP, " ");

test("shortReason keeps the first clause, drops citation dates and the data-cut tail", () => {
  const rows = breakdown(makeLead(), AS_OF);
  const by = (key) => plain(shortReason(rows.find((r) => r.key === key).reason));
  assert.equal(by("dust"), "MIOSHA Part 520 Ventilation Control (Mich. R 325.52007)");
  assert.equal(by("recency"), "Dust evidence dated Oct 15, 2026, within 12 months");
  assert.equal(by("size"), "50 employees at the site");
  assert.equal(by("industry"), "Metal fabrication & machinery (NAICS 333618)");
});

test("shortReason keeps what explains partial points", () => {
  const rows = breakdown(programLead(), AS_OF);
  const size = plain(shortReason(rows.find((r) => r.key === "size").reason));
  assert.match(size, /just outside the 20–500 core range$/);
  const older = plain(shortReason("Dust evidence dated Jan 2, 2023, older than 36 months."));
  assert.equal(older, "Dust evidence dated Jan 2, 2023, older than 36 months");
  const program = plain(shortReason("Housekeeping (1910.22(a)(1)), issued Mar 2, 2025 during a Combustible Dust NEP inspection."));
  assert.equal(program, "Housekeeping (1910.22(a)(1)) during a Combustible Dust NEP inspection");
  assert.equal(plain(shortReason("Combustible Dust NEP inspection, opened Jan 10, 2024.")), "Combustible Dust NEP inspection");
});

test("shortReason only removes words, never adds or changes them", () => {
  for (const lead of [makeLead(), programLead(), warmSeriousLead()]) {
    for (const r of breakdown(lead, AS_OF)) {
      const words = plain(shortReason(r.reason)).split(" ");
      const original = r.reason.split(/\s+/).map((w) => w.replace(/[.,]$/, ""));
      for (const w of words) assert.ok(original.includes(w.replace(/[.,]$/, "")), `"${w}" comes from: ${r.reason}`);
    }
  }
});

test("keepTogether binds the words inside parentheses", () => {
  assert.equal(keepTogether("Ventilation (Mich. R 325.52007) at site"), `Ventilation (Mich.${NBSP}R${NBSP}325.52007) at site`);
  assert.equal(keepTogether("no codes here"), "no codes here");
});
