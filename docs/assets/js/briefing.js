// Home briefing: every figure is computed from the lead data, nothing is typed in.

import { formatDate } from "./score.js";

/** Known reasons a territory state has no Hot leads. Only states listed here get an explanation. */
export const GAP_NOTES = {
  CA: {
    name: "California",
    why: "Cal/OSHA cites its own Title 8 rules, which the scorer doesn't classify yet.",
  },
};

const REASON_ORDER = ["dust", "industry", "recency", "size", "tri_air"];

export function territoryStats(leads, territory) {
  return territory.map((state) => {
    const inState = leads.filter((l) => l.state === state);
    const hot = inState.filter((l) => l.tier === "Hot").length;
    return { state, hot, warm: inState.length - hot, total: inState.length };
  });
}

export function coverageGaps(stats) {
  return stats.filter((s) => s.hot === 0 && GAP_NOTES[s.state])
    .map((s) => ({ ...s, name: GAP_NOTES[s.state].name, why: GAP_NOTES[s.state].why }));
}

export function newestEvidence(leads) {
  return leads.reduce((best, l) => (l.evidence_date && (!best || l.evidence_date > best) ? l.evidence_date : best), null);
}

function joinNames(names) {
  if (names.length < 2) return names[0] || "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const num = (n) => n.toLocaleString("en-US");

/** The plain-text form of a briefing sentence, for aria-labels and tests. */
export function sentenceText(parts) {
  return parts.map((p) => `${p.num}${p.text}`).join("");
}

/** True when no lead sits in any of the given pipeline stages. */
export function pipelineIsEmpty(counts, stageIds) {
  return stageIds.every((id) => !counts[id]);
}

/**
 * @param {{asOf:string, territory:string[], counts:object, leads:object[]}} data
 * @param {object[]} priority the Priority folder
 */
export function briefing(data, priority) {
  const hot = data.leads.filter((l) => l.tier === "Hot").length;
  const fresh = data.counts.previous_run ? data.counts.new_hot_since_last_run : null;
  const newest = newestEvidence(data.leads);
  const gaps = coverageGaps(territoryStats(data.leads, data.territory));
  const headline = fresh == null
    ? { value: hot, label: "Hot leads in the territory" }
    : { value: fresh, label: fresh === 1 ? "new Hot lead since the last run" : "new Hot leads since the last run" };
  const sentence = [{ num: num(headline.value), text: ` ${headline.label}. ` }];
  if (priority.length) {
    sentence.push({ num: num(priority.length), text: ` ${priority.length === 1 ? "is" : "are"} ready to contact.` });
  }
  const lines = [];
  if (newest) lines.push(`The newest dust evidence on file is dated ${formatDate(newest)}.`);
  if (gaps.length) lines.push(`${joinNames(gaps.map((g) => g.name))} ${gaps.length > 1 ? "have" : "has"} no Hot leads yet.`);
  return { headline, sentence, lines, gaps, hotCount: hot };
}

const DATE = "[A-Z][a-z]{2} \\d{1,2}, \\d{4}";
const DATE_TAIL = new RegExp(`,\\s+(?:issued |opened )?${DATE}`, "g");
const DATA_CUT = new RegExp(`\\s+of the ${DATE} data cut`);

/** Joins the words inside each (…) with no-break spaces so a code like "(Mich. R 325.52007)" never splits. */
export function keepTogether(text) {
  return text.replace(/\([^()]*\)/g, (group) => group.replace(/ /g, " "));
}

/**
 * A factor reason shortened for the hero callouts: its first sentence, minus citation dates (the
 * Recency callout gives the evidence date) and the data-cut tail. It only removes words, so the
 * points it explains (a program inspection, "within 12 months", "just outside the core range") stay.
 */
export function shortReason(text) {
  const first = text.split(/\.\s+(?=[A-Z][a-z]|\d)/)[0].replace(/\.$/, "");
  return keepTogether(first.replace(DATA_CUT, "").replace(DATE_TAIL, ""));
}

/** The factor that best explains why a lead ranks where it does. */
export function spotlightReason(rows) {
  for (const key of REASON_ORDER) {
    const row = rows.find((r) => r.key === key);
    if (row && row.points === row.max) return row;
  }
  return rows.reduce((a, b) => (b.points > a.points ? b : a));
}
