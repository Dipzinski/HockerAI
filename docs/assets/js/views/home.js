// Home: a few glanceable widgets. Everything else is one click away.

import { priorityLeads, signalCounts, folderCounts, SIGNALS } from "../data.js";
import { STAGES } from "../pipeline.js";
import { formatDate } from "../score.js";
import { el, icon, fmt, plural } from "../dom.js";
import { buildHash } from "../router.js";
import { filterMeter } from "../widgets/filter-meter.js";
import { mountDotMap } from "../widgets/dot-map.js";
import { viewHeader } from "./nav.js";

const TOP_COUNT = 5;
let unmountMap = () => {};

function widgetHead(iconName, label, more) {
  return el("div", { class: "widget-head" }, icon(iconName), el("span", { text: label }),
    more ? el("a", { class: "more", href: more.href }, more.label, icon("chevronRight")) : null);
}

function topLeadsWidget(priority) {
  const rows = priority.slice(0, TOP_COUNT).map((l, i) => el("li", {},
    el("a", { class: "mini-row", href: buildHash({ view: "leads", folder: "priority", id: l.id }) },
      el("span", { class: "mini-rank", text: i + 1 }),
      el("span", { class: "mini-text" },
        el("span", { class: "mini-title", text: l.name }),
        el("span", { class: "mini-sub", text: `${l.city}, ${l.state} · ${l.industry}` })),
      filterMeter(l.score, "sm"),
      el("span", { class: "mini-score", text: l.score.total }))));
  return el("section", { class: "widget glass w-top", "aria-label": "Top leads" },
    widgetHead("star", "Top leads", { href: "#/leads/priority", label: `All ${priority.length}` }),
    el("ul", { class: "mini-rows" }, rows),
    el("div", { class: "widget-foot", text: "Ranked by a 12-point score. Open a lead to see why it ranks where it does." }));
}

function priorityWidget(data, priority) {
  const fresh = data.counts.previous_run ? data.counts.new_hot_since_last_run : null;
  return el("a", { class: "widget glass w-prio", href: "#/leads/priority" },
    widgetHead("star", "Priority"),
    el("div", { class: "big-number", text: fmt(priority.length) }),
    el("div", { class: "widget-note", text: "Hot leads ready to contact" }),
    fresh == null ? null : el("div", { class: "widget-foot accent", text: `${plural(fresh, "new Hot lead")} since the last run` }));
}

function pipelineWidget(ctx) {
  const counts = folderCounts(ctx.data.leads, ctx.pipeline.stageOf);
  const tracked = STAGES.filter((s) => ["reached", "contact", "audit"].includes(s.id));
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

function mapWidget(data) {
  const canvas = el("canvas", { class: "dot-map", role: "img",
    "aria-label": `Map of ${fmt(data.leads.length)} lead locations across ${data.territory.join(", ")}` });
  const hot = data.leads.filter((l) => l.tier === "Hot").length;
  const widget = el("a", { class: "widget glass w-map", href: "#/map" },
    widgetHead("map", "Where they are"),
    canvas,
    el("div", { class: "legend" },
      el("span", {}, el("i", { class: "hot" }), `${fmt(hot)} Hot`),
      el("span", {}, el("i", { class: "warm" }), `${fmt(data.leads.length - hot)} Warm`)));
  return { widget, canvas };
}

export function renderHome(container, ctx) {
  const { data } = ctx;
  const priority = priorityLeads(data.leads);
  const map = mapWidget(data);
  unmountMap();
  container.replaceChildren(
    viewHeader("Overview", `Public OSHA records through ${formatDate(data.asOf)} · ${data.territory.length} states`),
    el("div", { class: "widget-grid" },
      topLeadsWidget(priority), priorityWidget(data, priority), pipelineWidget(ctx),
      map.widget, signalsWidget(data)),
  );
  unmountMap = mountDotMap(map.canvas, data.leads);
}

export function leaveHome() {
  unmountMap();
  unmountMap = () => {};
}
