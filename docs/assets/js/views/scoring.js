// How scoring works: the rubric, explained with the filter meter as its legend.

import { FACTORS, MAX_SCORE, HOT_MIN, WARM_MIN, formatDate } from "../score.js";
import { el } from "../dom.js";
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

export function renderScoring(container, ctx) {
  const { data } = ctx;
  document.title = "How scoring works · HockerAI";
  container.replaceChildren(
    viewHeader("How scoring works", "Every lead gets a 0–12 score from public records."),
    el("div", { class: "prose" },
      el("p", { class: "lede",
        text: "The score is drawn as a filter cartridge with 12 pleats, one per point. Each group of pleats is one reason a plant may need dust collection soon. Open any lead and choose “Why it's Hot” to see the record behind every pleat." }),
      el("section", { class: "card legend-card", "aria-label": "Score legend" },
        filterMeter(FULL, "lg"),
        el("p", { text: "A perfect 12. Industry 3 · Dust 3 · Recent 3 · Size 2 · Air 1" })),
      el("h2", { text: "The five factors" }),
      ruleList(),
      el("h2", { text: "Tiers" }),
      tiers(),
      el("h2", { text: "Safety holds" }),
      el("div", { class: "card status-card hold" },
        el("p", { text: "A fatality in the last 36 months, a serious injury in the last 24 months, or a contested citation puts a lead on hold, whatever its score. A person reviews the record before anyone reaches out, and a contested citation is never a sales talking point." })),
      el("h2", { text: "Sources" }),
      el("div", { class: "card" },
        el("p", { text: `OSHA enforcement records (inspections and citations) through ${formatDate(data.asOf)}, scored over the last ${data.windowMonths} months, plus EPA Toxics Release Inventory ${data.triYear} metal air releases matched to a single facility.` }),
        el("p", { text: "A citation is an allegation until it is final. TRI reporting is not a violation. Scores rank where to look first; they are not a verdict on any plant." }))));
}
