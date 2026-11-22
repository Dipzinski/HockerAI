// Start-up, routing between views, and app-wide keyboard shortcuts.

import { loadData } from "./data.js";
import { createPipeline, stageLabel } from "./pipeline.js";
import { parseRoute, buildHash } from "./router.js";
import { el, toast, isPhone, isTyping } from "./dom.js";
import { renderSidebar, renderTabbar, setSidebar } from "./views/nav.js";
import { renderHome, leaveHome } from "./views/home.js";
import { createLeadsView } from "./views/leads.js";
import { renderMap, leaveMap } from "./views/map.js";
import { renderScoring } from "./views/scoring.js";

const app = document.getElementById("app");
const stateMsg = document.getElementById("state-msg");

function memoryStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

function browserStorage() {
  try {
    return window.localStorage || memoryStorage();
  } catch (err) {
    console.warn("Browser storage is unavailable; pipeline stages will last for this visit only", err);
    return memoryStorage();
  }
}

function showMessage(title, detail) {
  stateMsg.replaceChildren(el("strong", { text: title }), detail ? el("span", { text: detail }) : null);
  stateMsg.hidden = false;
}

async function start() {
  let data;
  try {
    data = await loadData();
  } catch (err) {
    console.error(err);
    showMessage("Couldn't load the lead data.", "Reload the page to try again.");
    return;
  }
  stateMsg.hidden = true;

  const ctx = {
    data,
    pipeline: createPipeline(browserStorage()),
    leadById: new Map(data.leads.map((l) => [l.id, l])),
    navigate,
    onStageChange,
  };
  const leadsView = createLeadsView(ctx);
  const views = {
    home: () => renderHome(document.getElementById("view-home"), ctx),
    leads: (route) => leadsView.render(route),
    map: (route) => renderMap(document.getElementById("view-map"), ctx, route),
    scoring: () => renderScoring(document.getElementById("view-scoring"), ctx),
  };
  let currentView = null;

  function render() {
    const route = parseRoute(location.hash);
    if (currentView !== route.view) {
      if (currentView === "home") leaveHome();
      if (currentView === "map") leaveMap();
      if (currentView === "leads") leadsView.leave();
      app.dataset.view = route.view;
    }
    if (route.view === "home") document.title = "HockerAI";
    setSidebar(false);
    renderSidebar(ctx, route);
    renderTabbar(route);
    const sameStaticView = currentView === route.view && (route.view === "home" || route.view === "scoring");
    currentView = route.view;
    if (!sameStaticView) views[route.view](route);
  }

  function navigate(route, { replace = false } = {}) {
    const hash = buildHash(route);
    if (replace) {
      history.replaceState(null, "", hash);
      render();
    } else if (location.hash === hash) {
      render();
    } else {
      location.hash = hash;
    }
  }

  function onStageChange(lead, stage) {
    ctx.pipeline.setStage(lead.id, stage);
    toast(`${lead.name}: ${stageLabel(stage)}`);
    renderSidebar(ctx, parseRoute(location.hash));
    if (currentView === "leads") leadsView.refresh();
  }

  function onKey(e) {
    if (e.key === "Escape") {
      if (currentView === "leads" && leadsView.closePopover()) return;
      if (app.classList.contains("sidebar-open")) { setSidebar(false, null, { restoreFocus: true }); return; }
      const route = parseRoute(location.hash);
      if (currentView === "leads" && route.id && isPhone()) navigate({ ...route, id: null });
      return;
    }
    if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey || currentView !== "leads") return;
    leadsView.handleKey(e);
  }

  document.getElementById("scrim").addEventListener("click", () => setSidebar(false, null, { restoreFocus: true }));
  window.addEventListener("hashchange", render);
  window.addEventListener("keydown", onKey);
  render();
}

start();
