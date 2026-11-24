// Home: one hero (briefing + the #1 lead) with supporting widgets ranked beneath it.

import { priorityLeads, signalCounts, folderCounts, SIGNALS } from "../data.js";
import { STAGES } from "../pipeline.js";
import { formatDate } from "../score.js";
import { el, icon, fmt } from "../dom.js";
import { buildHash } from "../router.js";
import { filterMeter } from "../widgets/filter-meter.js";
import { createMapWidget } from "../widgets/map-widget.js";
import { pipelineIsEmpty } from "../briefing.js";
import { createHero } from "./home-hero.js";
import { viewHeader } from "./nav.js";

const NEXT_COUNT = 4;
let unmountMap = () => {};

function widgetHead(iconName, label, more) {
  return el("div", { class: "widget-head" }, icon(iconName), el("span", { text: label }),
    more ? el("a", { class: "more", href: more.href }, more.label, icon("chevronRight")) : null);
}

function nextLeadsWidget(priority) {
  const rows = priority.slice(1, 1 + NEXT_COUNT).map((l, i) => el("li", {},
    el("a", { class: "mini-row", href: buildHash({ view: "leads", folder: "priority", id: l.id }) },
      el("span", { class: "mini-rank", text: i + 2 }),
      el("span", { class: "mini-text" },
        el("span", { class: "mini-title", text: l.name }),
        el("span", { class: "mini-sub", text: `${l.city}, ${l.state} · ${l.industry}` })),
      filterMeter(l.score, "sm"),
      el("span", { class: "mini-score", text: l.score.total }))));
  return el("section", { class: "widget glass w-top", "aria-label": "Next in line" },
    widgetHead("star", "Next in line", { href: "#/leads/priority", label: `All ${priority.length}` }),
    el("ul", { class: "mini-rows" }, rows),
    el("div", { class: "widget-foot", text: "Ranked by a 12-point score. Open a lead to see why it ranks where it does." }));
}

function pipelineWidget(ctx) {
  const counts = folderCounts(ctx.data.leads, ctx.pipeline.stageOf);
  const tracked = STAGES.filter((s) => ["reached", "contact", "audit"].includes(s.id));
  if (pipelineIsEmpty(counts, tracked.map((s) => s.id))) {
    return el("section", { class: "widget glass w-pipe is-quiet", "aria-label": "Pipeline" },
      icon("reached"),
      el("p", {}, "No leads in the pipeline yet. Stages are saved in this browser. ",
        el("a", { href: "#/leads/hold", text: `${fmt(counts.hold)} on hold` })));
  }
  const max = Math.max(1, ...tracked.map((s) => counts[s.id]));
  const bars = tracked.map((s) => el("a", { class: "stage-bar", href: `#/leads/${s.id}` },
    el("span", { text: s.label }), el("span", { class: "n", text: fmt(counts[s.id]) }),
    el("span", { class: "track" }, el("span", { class: "fill", style: `width:${(100 * counts[s.id]) / max}%` }))));
  return el("section", { class: "widget glass w-pipe", "aria-label": "Pipeline" },
    widgetHead("reached", "Pipeline"),
    el("div", { class: "stage-bars" }, bars),
    el("div", { class: "widget-foot" }, "Saved in this browser. ",
      el("a", { href: "#/leads/hold", text: `${fmt(counts.hold)} on hold` })));
}

function signalsWidget(data) {
  const hot = data.leads.filter((l) => l.tier === "Hot");
  const counts = signalCounts(hot);
  const max = Math.max(1, ...Object.values(counts));
  const rows = SIGNALS.map((s) => el("li", {},
    el("a", { class: "signal-row", href: buildHash({ view: "leads", folder: "hot", params: { signal: s.id } }) },
      el("span", { text: s.label }),
      el("span", { class: "track" }, el("span", { class: "fill", style: `width:${(100 * counts[s.id]) / max}%` })),
      el("span", { class: "n", text: fmt(counts[s.id]) }))));
  return el("section", { class: "widget glass w-sig", "aria-label": "Signals" },
    widgetHead("spark", `Signals in ${fmt(hot.length)} Hot leads`),
    el("ul", { class: "signal-rows" }, rows));
}

export function renderHome(container, ctx) {
  const { data } = ctx;
  const priority = priorityLeads(data.leads);
  const hero = createHero(data, priority);
  const map = createMapWidget(data);
  const widgets = [nextLeadsWidget(priority), map.node, signalsWidget(data), pipelineWidget(ctx)];
  widgets.forEach((w, i) => { w.classList.add("rise"); w.style.setProperty("--i", String(i + 1)); });
  unmountMap();
  container.replaceChildren(
    viewHeader("Overview", `Public OSHA records through ${formatDate(data.asOf)} · ${data.territory.length} states`),
    el("div", { class: "home-grid" }, hero.node, ...widgets));
  hero.start();
  unmountMap = map.mount();
}

export function leaveHome() {
  unmountMap();
  unmountMap = () => {};
}
