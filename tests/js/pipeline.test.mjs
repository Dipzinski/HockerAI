import { test } from "node:test";
import assert from "node:assert/strict";

import { createPipeline, PIPELINE_KEY, STAGES, stageLabel } from "../../docs/assets/js/pipeline.js";
import { makeLead } from "./fixtures.mjs";

function memoryStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    dump: () => ({ ...store }),
  };
}

test("stage ids stay compatible with saved v5 data", () => {
  assert.deepEqual(STAGES.map((s) => s.id), ["top", "reached", "contact", "audit", "hold"]);
  assert.equal(stageLabel("top"), "Not contacted");
});

test("leads default to Not contacted, or On hold when the data holds them", () => {
  const p = createPipeline(memoryStorage());
  assert.equal(p.stageOf(makeLead()), "top");
  assert.equal(p.stageOf(makeLead({ hold: "recent serious incident" })), "hold");
});

test("setStage saves to storage and survives a reload", () => {
  const storage = memoryStorage();
  createPipeline(storage).setStage("a1", "contact");
  assert.equal(JSON.parse(storage.dump()[PIPELINE_KEY]).a1, "contact");
  assert.equal(createPipeline(storage).stageOf(makeLead()), "contact");
});

test("unknown stages are rejected", () => {
  const p = createPipeline(memoryStorage());
  assert.throws(() => p.setStage("a1", "won"), /Unknown stage/);
});

test("unreadable or invalid saved data falls back to an empty pipeline", () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    const bad = createPipeline(memoryStorage({ [PIPELINE_KEY]: "{not json" }));
    assert.equal(bad.stageOf(makeLead()), "top");
    const junk = createPipeline(memoryStorage({ [PIPELINE_KEY]: JSON.stringify({ a1: "won", b2: 5 }) }));
    assert.equal(junk.stageOf(makeLead()), "top");
  } finally {
    console.warn = warn;
  }
});

test("storage that throws does not break the pipeline", () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); },
      removeItem() { throw new Error("blocked"); } };
    const p = createPipeline(broken);
    p.setStage("a1", "audit");
    assert.equal(p.stageOf(makeLead()), "audit");
  } finally {
    console.warn = warn;
  }
});

test("counts tally every lead by stage", () => {
  const p = createPipeline(memoryStorage());
  p.setStage("b", "reached");
  const leads = [makeLead({ id: "a" }), makeLead({ id: "b" }), makeLead({ id: "c", hold: "contested citation" })];
  assert.deepEqual(p.counts(leads), { top: 1, reached: 1, contact: 0, audit: 0, hold: 1 });
});

test("the old v4 demo key is cleared", () => {
  const storage = memoryStorage({ hocker_pipeline_spaceblack_v4: "{}" });
  createPipeline(storage);
  assert.equal(storage.getItem("hocker_pipeline_spaceblack_v4"), null);
});
