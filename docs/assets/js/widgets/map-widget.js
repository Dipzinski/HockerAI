// "Where they are": state outlines (SVG), lead dots (canvas), labelled territory states and a note
// explaining any territory state with no Hot leads. If the outlines fail to load, the dots still show.

import { el, svg, icon, fmt } from "../dom.js";
import { buildHash } from "../router.js";
import { territoryStats, coverageGaps } from "../briefing.js";
import { mountDotMap, projectLeads, pointBounds } from "./dot-map.js";
import { decodeGeo, geoBounds, makeFit, statePath, arcsPath, splitArcs, stateLabelPoint } from "./us-geo.js";

const GEO_URL = "assets/geo/us-states.json";
const FALLBACK_ASPECT = 1.6;

async function loadGeo() {
  const res = await fetch(GEO_URL);
  if (!res.ok) throw new Error(`Could not load ${GEO_URL} (HTTP ${res.status})`);
  return decodeGeo(await res.json());
}

const pct = (n, total) => `${Math.round((n / total) * 1000) / 10}%`;

function stateHref(stat) {
  return buildHash({ view: "leads", folder: stat.hot ? "hot" : "warm", params: { state: stat.state } });
}

function geoLayer(geo, fit, territory, hrefOf) {
  const root = svg("svg", { viewBox: `0 0 ${fit.width} ${fit.height}`, class: "geo", "aria-hidden": "true", focusable: "false" });
  const { marked, rest } = splitArcs(geo, territory);
  const land = Object.keys(geo.states).map((abbr) => {
    const path = svg("path", { d: statePath(geo, abbr, fit), class: territory.includes(abbr) ? "land territory" : "land",
      "data-state": abbr });
    if (territory.includes(abbr)) path.addEventListener("click", () => { location.hash = hrefOf(abbr); });
    return path;
  });
  root.append(svg("g", { class: "lands" }, land),
    svg("path", { d: arcsPath(geo, rest, fit), class: "border" }),
    svg("path", { d: arcsPath(geo, marked, fit), class: "border territory-border" }));
  return root;
}

function stateChip(stat, name, at, fit, root) {
  const hot = el("span", { class: "chip-n", text: fmt(stat.hot) });
  const chip = el("a", { class: stat.hot ? "state-chip" : "state-chip is-gap", href: stateHref(stat),
    style: `left:${pct(at[0], fit.width)};top:${pct(at[1], fit.height)}`,
    "aria-label": `${name}: ${fmt(stat.hot)} Hot, ${fmt(stat.warm)} Warm. Open leads` },
  el("span", { class: "chip-abbr", text: stat.state }), hot);
  const mark = (on) => root.querySelector(`[data-state="${stat.state}"]`)?.classList.toggle("is-active", on);
  for (const [evt, on] of [["mouseenter", true], ["mouseleave", false], ["focus", true], ["blur", false]]) {
    chip.addEventListener(evt, () => mark(on));
  }
  return chip;
}

function gapNote(gap) {
  return el("div", { class: "gap-note glass", role: "note" },
    el("strong", { text: `${gap.name}: no Hot leads yet` }),
    el("p", { text: `${gap.why} ${fmt(gap.warm)} Warm leads are listed.` }),
    el("a", { href: "#/scoring?section=gaps", text: "Coverage gaps" }));
}

function placeLeader(stage, leader, chip, note) {
  const compact = getComputedStyle(note).position === "static";
  leader.hidden = compact;
  if (compact) return;
  const top = chip.offsetTop + chip.offsetHeight / 2;
  const bottom = note.offsetTop;
  leader.style.cssText = `left:${chip.style.left};top:${top}px;height:${Math.max(0, bottom - top)}px`;
}

/** @returns {{node: HTMLElement, mount: () => (() => void)}} */
export function createMapWidget(data) {
  const points = projectLeads(data.leads);
  const hot = points.filter((p) => p.hot).length;
  const allHot = data.leads.filter((l) => l.tier === "Hot").length;
  const stats = territoryStats(data.leads, data.territory);
  const gaps = coverageGaps(stats);
  const canvas = el("canvas", { class: "dot-map", role: "img",
    "aria-label": `Map of ${fmt(points.length)} located leads, ${fmt(hot)} Hot and ${fmt(points.length - hot)} Warm, across ${data.territory.join(", ")}` });
  const stage = el("div", { class: "map-stage" }, canvas);
  const hint = el("span", { class: "legend-hint", hidden: true, text: "Numbers are Hot leads per state. Leads without coordinates are not plotted." });
  const quiet = el("p", { class: "map-quiet", hidden: true, text: "State outlines didn't load, so only lead locations are shown." });
  const frame = el("div", { class: "map-wrap" }, stage);
  const node = el("section", { class: "widget glass w-map", "aria-label": "Where they are" },
    el("div", { class: "widget-head" }, icon("map"), el("span", { text: "Where they are" }),
      el("a", { class: "more", href: "#/map" }, "Open map", icon("chevronRight"))),
    frame,
    el("div", { class: "legend" },
      el("span", {}, el("i", { class: "hot" }), `${fmt(allHot)} Hot`),
      el("span", {}, el("i", { class: "warm" }), `${fmt(data.leads.length - allHot)} Warm`), hint),
    quiet);

  async function mount() {
    let geo = null;
    try { geo = await loadGeo(); } catch (err) { console.warn("State outlines unavailable", err); }
    quiet.hidden = Boolean(geo);
    const fit = makeFit(geo ? geoBounds(geo) : pointBounds(points), 1000, geo ? 10 : 24);
    stage.style.aspectRatio = `${fit.width} / ${fit.height || fit.width / FALLBACK_ASPECT}`;
    let onResize = () => {};
    if (geo) {
      const nameOf = (abbr) => geo.names[abbr] || abbr;
      const hrefOf = (abbr) => stateHref(stats.find((s) => s.state === abbr));
      const layer = geoLayer(geo, fit, data.territory, hrefOf);
      stage.prepend(layer);
      const chips = stats.map((s) => {
        const at = stateLabelPoint(geo, s.state);
        return at ? { chip: stateChip(s, nameOf(s.state), fit.at(at), fit, layer), stat: s } : null;
      }).filter(Boolean);
      stage.append(...chips.map((c) => c.chip));
      hint.hidden = false;
      const gap = gaps[0];
      const target = gap && chips.find((c) => c.stat.state === gap.state);
      if (target) {
        const note = gapNote(gap);
        const leader = el("span", { class: "gap-leader", "aria-hidden": "true" });
        frame.append(note);
        stage.append(leader);
        target.chip.classList.add("has-note");
        onResize = () => placeLeader(stage, leader, target.chip, note);
      }
    }
    return mountDotMap(canvas, points, fit, onResize);
  }

  return {
    node,
    mount() {
      let stop = () => {};
      let gone = false;
      mount().then((fn) => { if (gone) fn(); else stop = fn; }).catch((err) => console.error(err));
      return () => { gone = true; stop(); };
    },
  };
}
