import { test } from "node:test";
import assert from "node:assert/strict";

import { parseRoute, buildHash } from "../../docs/assets/js/router.js";

test("empty or unknown hashes go home", () => {
  assert.deepEqual(parseRoute(""), { view: "home", folder: null, id: null, params: {} });
  assert.equal(parseRoute("#/nowhere").view, "home");
});

test("lead routes carry folder, id and filter params", () => {
  const route = parseRoute("#/leads/hot/fba4a5207d7?signal=nep&state=MI");
  assert.equal(route.view, "leads");
  assert.equal(route.folder, "hot");
  assert.equal(route.id, "fba4a5207d7");
  assert.deepEqual(route.params, { signal: "nep", state: "MI" });
});

test("leads without a folder default to priority", () => {
  const route = parseRoute("#/leads");
  assert.equal(route.folder, "priority");
  assert.equal(route.id, null);
});

test("buildHash round-trips and drops empty params", () => {
  const hash = buildHash({ view: "leads", folder: "all", id: "a b", params: { state: "OH", signal: "", ready: null } });
  assert.equal(hash, "#/leads/all/a%20b?state=OH");
  assert.deepEqual(parseRoute(hash), { view: "leads", folder: "all", id: "a b", params: { state: "OH" } });
  assert.equal(buildHash({ view: "map", params: { tab: "state" } }), "#/map?tab=state");
  assert.equal(buildHash({ view: "home" }), "#/home");
});

test("industry names with ampersands survive the round trip", () => {
  const params = { industry: "Metal fabrication & machinery" };
  assert.deepEqual(parseRoute(buildHash({ view: "leads", folder: "hot", params })).params, params);
});
