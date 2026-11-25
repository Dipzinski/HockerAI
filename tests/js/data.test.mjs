import { test } from "node:test";
import assert from "node:assert/strict";

import {
  prepare, priorityLeads, matchesSignal, matchesQuery, applyFilters, sortLeads,
  signalCounts, folderLeads, folderCounts, leadStatus, PRIORITY_SIZE,
} from "../../docs/assets/js/data.js";
import { makeLead, programLead, warmSeriousLead } from "./fixtures.mjs";

const raw = () => ({
  as_of: "2026-11-18",
  territory: ["MI", "OH"],
  counts: { new_hot_since_last_run: 3 },
  leads: [
    makeLead(),
    programLead(),
    warmSeriousLead(),
    makeLead({ id: "h1", name: "Held Woodshop", industry: "Woodworking, cabinets & furniture",
      hold: "contested citation", outreach_eligible: false, state: "OH", evidence_date: "2026-11-01" }),
  ],
});

test("prepare adds a 1-based rank and lists industries and states", () => {
  const data = prepare(raw());
  assert.deepEqual(data.leads.map((l) => l.rank), [1, 2, 3, 4]);
  assert.equal(data.asOf, "2026-11-18");
  assert.deepEqual(data.territory, ["MI", "OH"]);
  assert.ok(data.industries.includes("Woodworking, cabinets & furniture"));
  assert.equal(data.counts.new_hot_since_last_run, 3);
});

test("priority keeps Hot, outreach-ready leads in rank order, capped", () => {
  const { leads } = prepare(raw());
  assert.deepEqual(priorityLeads(leads).map((l) => l.id), ["a1", "p1"]);
  const many = Array.from({ length: PRIORITY_SIZE + 20 }, (_, i) => makeLead({ id: `x${i}` }));
  assert.equal(priorityLeads(many).length, PRIORITY_SIZE);
});

test("signal matchers find NEP, silica, TRI, wood and metal", () => {
  const { leads } = prepare(raw());
  const ids = (sig) => leads.filter((l) => matchesSignal(l, sig)).map((l) => l.id);
  assert.deepEqual(ids("nep"), ["p1"]);
  assert.deepEqual(ids("tri"), ["p1"]);
  assert.deepEqual(ids("wood"), ["h1"]);
  assert.deepEqual(ids("metal"), ["a1", "p1"]);
  const silica = makeLead({ inspections: [{ inspection_id: "9", opened: "2026-01-01",
    dust_program: null, url: "", other_citations: 0,
    citations: [{ standard: "1910.1053(d)", title: "Respirable crystalline silica", category: "dust",
      type: "Serious", issued: "2026-02-01", penalty_usd: 0, under_contest: false }] }] });
  assert.ok(matchesSignal(silica, "silica"));
  assert.ok(matchesSignal(makeLead(), null));
});

test("search matches name, city, ZIP and citation text", () => {
  const lead = makeLead();
  assert.ok(matchesQuery(lead, "nichols"));
  assert.ok(matchesQuery(lead, "WYANDOTTE"));
  assert.ok(matchesQuery(lead, "48192"));
  assert.ok(matchesQuery(lead, "325.52007"));
  assert.ok(matchesQuery(lead, "ventilation"));
  assert.ok(matchesQuery(lead, ""));
  assert.ok(!matchesQuery(lead, "texas"));
});

test("applyFilters combines state, industry, signal, readiness and search", () => {
  const { leads } = prepare(raw());
  assert.deepEqual(applyFilters(leads, { state: "OH" }).map((l) => l.id), ["h1"]);
  assert.deepEqual(applyFilters(leads, { readyOnly: true }).map((l) => l.id), ["a1", "p1", "w1"]);
  assert.deepEqual(applyFilters(leads, { signal: "nep", query: "cor-met" }).map((l) => l.id), ["p1"]);
  assert.deepEqual(applyFilters(leads, { industry: "Plastics, resins & composites" }).map((l) => l.id), ["w1"]);
  assert.equal(applyFilters(leads, {}).length, 4);
});

test("sortLeads orders by rank, newest evidence or name without mutating", () => {
  const { leads } = prepare(raw());
  const before = leads.map((l) => l.id);
  assert.deepEqual(sortLeads(leads, "evidence").map((l) => l.id), ["h1", "a1", "p1", "w1"]);
  assert.deepEqual(sortLeads(leads, "name").map((l) => l.id), ["p1", "h1", "a1", "w1"]);
  assert.deepEqual(sortLeads([...leads].reverse(), "score").map((l) => l.id), before);
  assert.deepEqual(leads.map((l) => l.id), before);
});

test("signalCounts counts each signal", () => {
  const { leads } = prepare(raw());
  const counts = signalCounts(leads);
  assert.equal(counts.nep, 1);
  assert.equal(counts.metal, 3 - 1);
  assert.equal(counts.wood, 1);
});

test("folders split leads by tier, hold and pipeline stage", () => {
  const { leads } = prepare(raw());
  const stageOf = (l) => (l.id === "p1" ? "reached" : l.hold ? "hold" : "top");
  const ids = (folder) => folderLeads(leads, folder, stageOf).map((l) => l.id);
  assert.deepEqual(ids("priority"), ["a1", "p1"]);
  assert.deepEqual(ids("all"), ["a1", "p1", "w1", "h1"]);
  assert.deepEqual(ids("hot"), ["a1", "p1", "h1"]);
  assert.deepEqual(ids("warm"), ["w1"]);
  assert.deepEqual(ids("hold"), ["h1"]);
  assert.deepEqual(ids("reached"), ["p1"]);
  assert.deepEqual(ids("nope"), []);
  const counts = folderCounts(leads, stageOf);
  assert.equal(counts.all, 4);
  assert.equal(counts.reached, 1);
  assert.equal(counts.audit, 0);
});

test("leadStatus explains holds and readiness", () => {
  assert.match(leadStatus(makeLead()), /Ready for outreach/);
  const held = makeLead({ hold: "contested citation", outreach_eligible: false });
  assert.match(leadStatus(held), /On hold: contested citation/);
  assert.match(leadStatus(held), /not a sales talking point/);
  const incident = makeLead({ hold: "recent serious incident", outreach_eligible: false });
  assert.match(leadStatus(incident), /person should review/);
  const unsure = makeLead({ outreach_eligible: false });
  assert.match(leadStatus(unsure), /Not outreach-ready/);
});
