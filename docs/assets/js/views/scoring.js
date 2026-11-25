// How scoring works: the rubric, explained with the filter meter as its legend.

import { FACTORS, MAX_SCORE, HOT_MIN, WARM_MIN, formatDate } from "../score.js";
import { el, fmt } from "../dom.js";
import { territoryStats, coverageGaps as coverageGapsOf } from "../briefing.js";
import { filterMeter, factorPleats } from "../widgets/filter-meter.js";
import { viewHeader } from "./nav.js";

const FULL = { industry: 3, dust: 3, recency: 3, size: 2, tri_air: 1, total: MAX_SCORE };

function ruleList() {
  return el("ul", { class: "rule-list card", style: "padding-top:0;padding-bottom:0" },
    FACTORS.map((f) => el("li", {},
      factorPleats(f.max, f.max),
      el("div", {}, el("div", { class: "rule-name", text: f.label }), el("div", { class: "rule-text", text: f.rule })),
      el("span", { class: "rule-max", text: `up to ${f.max}` }))));
}

function tiers() {
  return el("div", { class: "tier-grid" },
    el("div", { class: "card hot" }, el("strong", { text: `${HOT_MIN}–${MAX_SCORE}` }),
      el("span", { text: "Hot. Needs dust evidence; can't reach Hot on EPA data alone." })),
    el("div", { class: "card" }, el("strong", { text: `${WARM_MIN}–${HOT_MIN - 1}` }),
      el("span", { text: "Warm. Worth watching; searchable in All leads." })),
    el("div", { class: "card" }, el("strong", { text: `0–${WARM_MIN - 1}` }),
      el("span", { text: "Not shown. Too little evidence to act on." })));
}

function coverageGaps(data) {
  const gaps = coverageGapsOf(territoryStats(data.leads, data.territory));
  const lines = gaps.length
    ? gaps.map((g) => el("p", {}, el("strong", { text: `${g.name}: ` }),
      `${fmt(g.hot)} Hot and ${fmt(g.warm)} Warm leads. ${g.why} Until then the scorer sees no dust evidence there, so this list may understate ${g.name}.`))
    : [el("p", { text: "Every territory state has Hot leads in the current data." })];
  return el("section", { class: "card gap-card", id: "coverage-gaps", tabindex: "-1", "aria-labelledby": "gaps-title" },
    el("h3", { id: "gaps-title", text: "Where the scorer can't see yet" }), ...lines);
}

/** A real lead from the data (the top-ranked Warm one) shows earned beside empty pleats. */
function warmExample(leads) {
  const lead = leads.find((l) => l.tier === "Warm");
  if (!lead) return null;
  return el("div", { class: "legend-pair" }, el("span", { class: "legend-key" }, filterMeter(lead.score, "md"),
    `${lead.name}, a Warm lead with ${lead.score.total} points: green pleats earned, empty pleats not`));
}

export function renderScoring(container, ctx, route) {
  const { data } = ctx;
  document.title = "How scoring works · HockerAI";
  container.replaceChildren(
    viewHeader("How scoring works", "Every lead gets a 0–12 score from public records."),
    el("div", { class: "prose" },
      el("p", { class: "lede",
        text: "The score is drawn as a filter cartridge with 12 pleats, one per point. A solid green pleat is a point earned; an empty one is a point not earned. Each group of pleats is one reason a plant may need dust collection soon. On any lead, select a group, or choose “Why it's Hot”, to see the record behind every pleat." }),
      el("section", { class: "card legend-card", "aria-label": "Score legend" },
        filterMeter(FULL, "lg", { animate: true }),
        el("p", { text: "A perfect 12: every pleat earned. Industry 3 · Dust 3 · Recent 3 · Size 2 · Air 1" }),
        warmExample(data.leads)),
      el("h2", { text: "The five factors" }),
      ruleList(),
      el("h2", { text: "Tiers" }),
      tiers(),
      el("h2", { text: "Safety holds" }),
      el("div", { class: "card status-card hold" },
        el("p", { text: "A fatality in the last 36 months, a serious injury in the last 24 months, or a contested citation puts a lead on hold, whatever its score. A person reviews the record before anyone reaches out, and a contested citation is never a sales talking point." })),
      el("h2", { text: "Coverage gaps" }),
      coverageGaps(data),
      el("h2", { text: "Sources" }),
      el("div", { class: "card" },
        el("p", { text: `OSHA enforcement records (inspections and citations) through ${formatDate(data.asOf)}, scored over the last ${data.windowMonths} months, plus EPA Toxics Release Inventory ${data.triYear} metal air releases matched to a single facility.` }),
        el("p", { text: "A citation is an allegation until it is final. TRI reporting is not a violation. Scores rank where to look first; they are not a verdict on any plant." }))));
  if (route?.params?.section === "gaps") {
    const target = document.getElementById("coverage-gaps");
    requestAnimationFrame(() => { target?.scrollIntoView({ block: "center" }); target?.focus({ preventScroll: true }); });
  }
}
