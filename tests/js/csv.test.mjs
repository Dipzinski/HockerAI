import { test } from "node:test";
import assert from "node:assert/strict";

import { csvCell, toCsv, leadRows } from "../../docs/assets/js/csv.js";
import { makeLead } from "./fixtures.mjs";

test("plain values pass through and empty values become blank", () => {
  assert.equal(csvCell("Wyandotte"), "Wyandotte");
  assert.equal(csvCell(50), "50");
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(undefined), "");
});

test("commas, quotes and newlines are quoted and escaped", () => {
  assert.equal(csvCell("Nichols, Inc."), '"Nichols, Inc."');
  assert.equal(csvCell('The "Best" Mill'), '"The ""Best"" Mill"');
  assert.equal(csvCell("line one\nline two"), '"line one\nline two"');
});

test("text that a spreadsheet would run as a formula is neutralised", () => {
  assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvCell("+1 shop"), "'+1 shop");
  assert.equal(csvCell("@shop"), "'@shop");
  assert.equal(csvCell(-3), "-3");
});

test("toCsv joins rows with CRLF", () => {
  assert.equal(toCsv([["a", "b"], ["c, d", 1]]), 'a,b\r\n"c, d",1');
});

test("leadRows has a header and one row per lead with stage and status", () => {
  const lead = { ...makeLead(), rank: 7 };
  const rows = leadRows([lead], () => "reached");
  assert.equal(rows.length, 2);
  const header = rows[0];
  const row = Object.fromEntries(header.map((h, i) => [h, rows[1][i]]));
  assert.equal(row.Rank, 7);
  assert.equal(row.Name, "Nichols Portland, Inc.");
  assert.equal(row.Score, 11);
  assert.equal(row.Tier, "Hot");
  assert.equal(row["Pipeline stage"], "Reached out");
  assert.equal(row.Status, "Ready");
});
