// CSV export of whatever list is on screen.

import { stageLabel } from "./pipeline.js";

const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

export function csvCell(value) {
  if (value == null) return "";
  if (typeof value === "number") return String(value);
  let text = String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

const HEADER = ["Rank", "Name", "City", "State", "ZIP", "Industry", "Employees", "Score", "Tier",
  "Dust evidence", "Evidence date", "Status", "Pipeline stage"];

export function leadRows(leads, stageOf) {
  const rows = leads.map((l) => [
    l.rank, l.name, l.city, l.state, l.zip, l.industry, l.employees, l.score.total, l.tier,
    l.dust_reason, l.evidence_date, l.hold ? `On hold: ${l.hold}` : (l.outreach_eligible ? "Ready" : "Not ready"),
    stageLabel(stageOf(l)),
  ]);
  return [HEADER, ...rows];
}

export function downloadCsv(filename, rows) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
