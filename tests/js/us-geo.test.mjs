import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";

import { decodeGeo, ringLonLat, arcUsers, geoBounds, makeFit, splitArcs, insideRing, labelPoint,
  stateLabelPoint, statePath, arcsPath } from "../../docs/assets/js/widgets/us-geo.js";
import { albers } from "../../docs/assets/js/widgets/dot-map.js";

const ASSET = new URL("../../docs/assets/geo/us-states.json", import.meta.url);
const geo = decodeGeo(JSON.parse(readFileSync(ASSET, "utf8")));
const TERRITORY = ["CA", "TX", "FL", "NY", "PA", "IL", "OH", "GA", "NC", "MI"];

test("the shipped asset is small and covers the lower 48 plus DC", () => {
  assert.ok(statSync(ASSET).size < 60 * 1024, "under 60 KB");
  assert.equal(Object.keys(geo.states).length, 49);
  for (const abbr of TERRITORY) assert.ok(geo.states[abbr], `${abbr} present`);
  assert.equal(geo.states.AK, undefined);
});

test("decodeGeo rejects data it does not recognise", () => {
  assert.throws(() => decodeGeo({ v: 2 }), /Unrecognized/);
  assert.throws(() => decodeGeo(null), /Unrecognized/);
});

test("every ring closes on itself, so fills have no gaps", () => {
  for (const [abbr, rings] of Object.entries(geo.states)) {
    for (const ring of rings) {
      const pts = ringLonLat(geo, ring);
      assert.deepEqual(pts[0], pts[pts.length - 1], `${abbr} ring is closed`);
    }
  }
});

test("neighbouring states share border arcs, and each arc is drawn once", () => {
  const users = arcUsers(geo);
  const shared = users.filter((s) => s.size === 2).length;
  assert.ok(shared > 60, `${shared} shared borders`);
  assert.ok(users.every((s) => s.size >= 1 && s.size <= 3));
  const { marked, rest } = splitArcs(geo, TERRITORY);
  assert.equal(marked.length + rest.length, geo.arcs.length);
  assert.equal(new Set([...marked, ...rest]).size, geo.arcs.length);
});

test("a fit maps projected bounds into the box with y flipped", () => {
  const fit = makeFit(geoBounds(geo), 1000, 10);
  assert.equal(fit.width, 1000);
  assert.ok(fit.height > 500 && fit.height < 700);
  const [x, y] = fit.at(albers(42.2, -83.1));
  assert.ok(x > 10 && x < 990 && y > 10 && y < fit.height - 10);
  const [, yNorth] = fit.at(albers(48, -100));
  const [, ySouth] = fit.at(albers(26, -100));
  assert.ok(yNorth < ySouth, "north is up");
});

test("paths are built from the geometry", () => {
  const fit = makeFit(geoBounds(geo));
  assert.match(statePath(geo, "MI", fit), /^M[\d. ]+L.*Z$/);
  assert.equal(statePath(geo, "ZZ", fit), "");
  assert.match(arcsPath(geo, [0, 1], fit), /^M/);
});

test("insideRing and labelPoint find a point inside a concave shape", () => {
  const ell = [[0, 0], [10, 0], [10, 2], [2, 2], [2, 10], [0, 10]];
  assert.ok(insideRing([1, 1], ell));
  assert.ok(!insideRing([5, 5], ell));
  const pt = labelPoint(ell);
  assert.ok(insideRing(pt, ell));
});

test("every territory state gets a label point inside its own largest ring", () => {
  for (const abbr of TERRITORY) {
    const pt = stateLabelPoint(geo, abbr);
    assert.ok(pt, `${abbr} has a label point`);
    const inside = geo.states[abbr].some((ring) =>
      insideRing(pt, ringLonLat(geo, ring).map(([lon, lat]) => albers(lat, lon))));
    assert.ok(inside, `${abbr} label is on land`);
  }
});

test("Florida and Michigan labels avoid the water", () => {
  const fl = stateLabelPoint(geo, "FL");
  const mi = stateLabelPoint(geo, "MI");
  const [, flLat] = fl; // projected y, higher is further north
  assert.ok(flLat > albers(26.5, -81.5)[1] - 0.05, "Florida label is on the peninsula, not the Keys");
  assert.ok(mi[0] > albers(43, -88)[0], "Michigan label is east of Lake Michigan's western shore");
});

test("territory labels do not collide at map size", () => {
  const fit = makeFit(geoBounds(geo));
  const pts = TERRITORY.map((a) => ({ a, at: fit.at(stateLabelPoint(geo, a)) }));
  for (let i = 0; i < pts.length; i += 1) {
    for (let j = i + 1; j < pts.length; j += 1) {
      const dx = Math.abs(pts[i].at[0] - pts[j].at[0]);
      const dy = Math.abs(pts[i].at[1] - pts[j].at[1]);
      assert.ok(dx > 60 || dy > 28, `${pts[i].a} and ${pts[j].a} keep their distance`);
    }
  }
});
