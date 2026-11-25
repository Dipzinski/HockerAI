// Map view: full Plotly map (loaded on first visit) plus breakdowns by industry and state.

import { el, fmt } from "../dom.js";
import { buildHash } from "../router.js";
import { viewHeader } from "./nav.js";

const PLOTLY_URL = "https://cdnjs.cloudflare.com/ajax/libs/plotly.js/4.1.1/plotly-geo.min.js";
const PLOTLY_SRI = "sha512-52UdsxXYQSoJim/RyJ3NJ8Tknh+HzLNddf3x4quaz2Ok2ZT0kFx2Vfewij0QunUDUNyoJmlCkH0c5b48Z1QnBg==";
const TABS = [{ id: "map", label: "Map" }, { id: "industry", label: "By industry" }, { id: "state", label: "By state" }];
const TIERS = [{ id: "all", label: "All" }, { id: "Hot", label: "Hot" }, { id: "Warm", label: "Warm" }];

let plotlyPromise = null;
let plotted = null;
let schemeListener = null;

/** Frees the previous Plotly chart (its listeners and WebGL/SVG state) before it is discarded. */
function releasePlot() {
  if (plotted && window.Plotly) window.Plotly.purge(plotted);
  plotted = null;
  if (schemeListener) window.matchMedia("(prefers-color-scheme: dark)").removeEventListener("change", schemeListener);
  schemeListener = null;
}

function loadPlotly() {
  if (window.Plotly) return Promise.resolve(window.Plotly);
  if (!plotlyPromise) {
    plotlyPromise = new Promise((resolve, reject) => {
      const script = el("script", { src: PLOTLY_URL, integrity: PLOTLY_SRI, crossorigin: "anonymous",
        referrerpolicy: "no-referrer", async: true });
      script.addEventListener("load", () => resolve(window.Plotly));
      script.addEventListener("error", () => {
        plotlyPromise = null;
        script.remove();
        reject(new Error("The map library could not load."));
      });
      document.head.append(script);
    });
  }
  return plotlyPromise;
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function trace(leads, tier, color, size) {
  const pts = leads.filter((l) => l.tier === tier && l.lat != null);
  return {
    type: "scattergeo", mode: "markers", name: tier,
    lat: pts.map((l) => l.lat), lon: pts.map((l) => l.lon), customdata: pts.map((l) => l.id),
    text: pts.map((l) => `${l.name}<br>${l.city}, ${l.state} · ${l.score.total}/12`),
    hovertemplate: "%{text}<extra></extra>",
    marker: { size, color, opacity: 0.9, line: { width: 0.5, color: cssVar("--surface") } },
  };
}

function plotLayout() {
  return {
    margin: { l: 0, r: 0, t: 0, b: 0 }, paper_bgcolor: "rgba(0,0,0,0)", showlegend: false,
    hoverlabel: { bgcolor: cssVar("--surface"), bordercolor: cssVar("--separator"),
      font: { color: cssVar("--text"), family: "-apple-system, BlinkMacSystemFont, sans-serif" } },
    geo: { scope: "usa", projection: { type: "albers usa" }, bgcolor: "rgba(0,0,0,0)",
      showland: true, landcolor: cssVar("--fill"), showlakes: false,
      subunitcolor: cssVar("--separator"), countrycolor: cssVar("--separator") },
  };
}

async function drawMap(plot, msg, leads, tier, ctx) {
  try {
    const Plotly = await loadPlotly();
    if (!plot.isConnected) return; // the user left the Map view while the library loaded
    const traces = [];
    if (tier !== "Hot") traces.push(trace(leads, "Warm", cssVar("--dot-warm"), 5));
    if (tier !== "Warm") traces.push(trace(leads, "Hot", cssVar("--accent-fill"), 7));
    await Plotly.react(plot, traces, plotLayout(), { displayModeBar: false, responsive: true });
    msg.hidden = true;
    if (plotted !== plot) {
      plot.on("plotly_click", (ev) => {
        const id = ev.points?.[0]?.customdata;
        if (id) ctx.navigate({ view: "leads", folder: "all", id });
      });
      plotted = plot;
    }
  } catch (err) {
    console.error(err);
    msg.textContent = "The map couldn't load. Check your connection, or use By industry and By state.";
    msg.hidden = false;
  }
}

function bars(leads, key, order) {
  const counts = new Map(order.map((k) => [k, { hot: 0, all: 0 }]));
  for (const l of leads) {
    const c = counts.get(l[key]) || { hot: 0, all: 0 };
    counts.set(l[key], { hot: c.hot + (l.tier === "Hot" ? 1 : 0), all: c.all + 1 });
  }
  const rows = [...counts.entries()].sort((a, b) => b[1].all - a[1].all);
  const max = Math.max(1, ...rows.map(([, c]) => c.all));
  return el("section", { class: "card bars-card" },
    rows.map(([name, c]) => el("div", { class: "bar-row",
      "aria-label": `${name}: ${fmt(c.all)} leads, ${fmt(c.hot)} Hot and ${fmt(c.all - c.hot)} Warm` },
    el("span", { class: "label", text: name }),
    el("span", { class: "track", "aria-hidden": "true" },
      el("span", { class: "fill", style: `width:${(100 * c.hot) / max}%` }),
      el("span", { class: "fill warm", style: `width:${(100 * (c.all - c.hot)) / max}%` })),
    el("span", { class: "n", text: fmt(c.all) }))),
    el("div", { class: "legend", style: "margin-top:12px" },
      el("span", {}, el("i", { class: "hot" }), "Hot"), el("span", {}, el("i", { class: "warm" }), "Warm")));
}

function segmented(items, currentId, hrefFor, label) {
  return el("nav", { class: "segmented", "aria-label": label },
    items.map((t) => el("a", { href: hrefFor(t.id), "aria-current": t.id === currentId ? "true" : null, text: t.label })));
}

export function renderMap(container, ctx, route) {
  const { data } = ctx;
  const tab = TABS.some((t) => t.id === route.params.tab) ? route.params.tab : "map";
  const tier = TIERS.some((t) => t.id === route.params.tier) ? route.params.tier : "all";
  const href = (params) => buildHash({ view: "map", params: { tab, tier: tier === "all" ? null : tier, ...params } });

  const controls = el("div", { class: "map-controls" },
    segmented(TABS, tab, (id) => href({ tab: id === "map" ? null : id }), "Map views"),
    tab === "map" ? segmented(TIERS, tier, (id) => href({ tier: id === "all" ? null : id }), "Tiers") : null);
  const header = viewHeader("Map", `${fmt(data.leads.length)} leads across ${data.territory.join(", ")}`);
  document.title = "Map · HockerAI";

  releasePlot();

  if (tab !== "map") {
    container.replaceChildren(header, controls,
      tab === "industry" ? bars(data.leads, "industry", data.industries) : bars(data.leads, "state", data.territory));
    return;
  }
  const plot = el("div", { class: "map-plot", role: "img", "aria-label": "Map of lead locations. Click a dot to open the lead." });
  const msg = el("div", { class: "map-msg", role: "status", text: "Loading map…" });
  container.replaceChildren(header, controls, el("div", { class: "map-frame glass" }, plot, msg));
  drawMap(plot, msg, data.leads, tier, ctx);
  schemeListener = () => drawMap(plot, msg, data.leads, tier, ctx);
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", schemeListener);
}

export function leaveMap() {
  releasePlot();
}
