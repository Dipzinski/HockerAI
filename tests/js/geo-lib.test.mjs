import { test } from "node:test";
import assert from "node:assert/strict";

import { decodeArcs, simplify, snap, deltaEncode, deltaDecode, buildAsset, geometryRings }
  from "../../scripts/geo-lib.mjs";

const topology = {
  transform: { scale: [0.5, 0.5], translate: [10, 20] },
  arcs: [
    [[0, 0], [2, 0], [0, 2]],
    [[2, 2], [-2, 0], [0, -2]],
    [[2, 0], [0, 2]],
    [[0, 0], [10, 0], [0, 10], [-10, 0], [0, -10]],
  ],
  objects: { states: { geometries: [
    { type: "Polygon", id: "01", properties: { name: "Alpha" }, arcs: [[0, 1]] },
    { type: "MultiPolygon", id: "02", properties: { name: "Beta" }, arcs: [[[~0, 2]], [[3]]] },
    { type: "Polygon", id: "99", properties: { name: "Skipped" }, arcs: [[2]] },
  ] } },
};

test("decodeArcs turns quantized deltas into absolute lon/lat", () => {
  const arcs = decodeArcs(topology);
  assert.deepEqual(arcs[0], [[10, 20], [11, 20], [11, 21]]);
  assert.deepEqual(arcs[2][1], [11, 21]);
});

test("simplify keeps endpoints and drops points inside the tolerance", () => {
  const line = [[0, 0], [1, 0.001], [2, 0], [3, 2]];
  const out = simplify(line, 0.05);
  assert.deepEqual(out[0], [0, 0]);
  assert.deepEqual(out[out.length - 1], [3, 2]);
  assert.ok(out.length < line.length);
  assert.equal(simplify([[0, 0], [1, 1]], 5).length, 2);
});

test("delta encoding round-trips on the snap grid", () => {
  const grid = snap([[-83.114, 42.2], [-83.1, 42.21], [-83.1004, 42.2096]], 0.01);
  assert.equal(grid.length, 2, "points that collapse onto a neighbour are dropped");
  const back = deltaDecode(deltaEncode(grid), 0.01);
  assert.equal(back.length, 2);
  assert.ok(Math.abs(back[0][0] + 83.11) < 1e-9);
});

test("buildAsset keeps only listed states and shares arcs between neighbours", () => {
  const asset = buildAsset(topology, { "01": "AA", "02": "BB" }, { minRingArea: 0 });
  assert.deepEqual(Object.keys(asset.states), ["AA", "BB"]);
  assert.equal(asset.names.AA, "Alpha");
  const used = (abbr) => asset.states[abbr].flat().map((r) => (r < 0 ? ~r : r));
  const shared = used("AA").filter((i) => used("BB").includes(i));
  assert.ok(shared.length >= 1, "a border arc is stored once and referenced by both states");
});

test("buildAsset drops tiny rings but never changes arcs that survive", () => {
  const tiny = buildAsset(topology, { "02": "BB" }, { minRingArea: 1000 });
  assert.equal(tiny.states.BB.length, 0);
  assert.equal(geometryRings(topology.objects.states.geometries[1]).length, 2);
  assert.deepEqual(geometryRings({ type: "Point" }), []);
});
