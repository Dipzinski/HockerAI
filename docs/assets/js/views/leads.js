// Leads: list pane (folders, search, filters, export) beside the detail pane.

import { FOLDERS, SIGNALS, SORTS, applyFilters, folderLeads, sortLeads } from "../data.js";
import { stageLabel } from "../pipeline.js";
import { leadRows, downloadCsv } from "../csv.js";
import { el, icon, fmt, plural, toast, isPhone } from "../dom.js";
import { buildHash } from "../router.js";
import { filterMeter } from "../widgets/filter-meter.js";
import { createFilterPopover } from "./filter-popover.js";
import { renderDetail } from "./detail.js";
import { sidebarToggle } from "./nav.js";

const PAGE_SIZE = 60;
const NEAR_ROWS = 3 * PAGE_SIZE; // a selection this close below the window just extends it
const WINDOW_LEAD_IN = 10; // rows kept above a selection when the window jumps to it
const SEARCH_DELAY_MS = 120;

function readFilters(params, data) {
  return {
    state: data.territory.includes(params.state) ? params.state : null,
    industry: data.industries.includes(params.industry) ? params.industry : null,
    signal: SIGNALS.some((s) => s.id === params.signal) ? params.signal : null,
    readyOnly: params.ready === "1",
    sort: SORTS.some((s) => s.id === params.sort) ? params.sort : "score",
  };
}

function toParams(f) {
  return { state: f.state, industry: f.industry, signal: f.signal,
    ready: f.readyOnly ? "1" : null, sort: f.sort === "score" ? null : f.sort };
}

function activeFilterCount(f) {
  return [f.state, f.industry, f.signal, f.readyOnly].filter(Boolean).length;
}

export function createLeadsView(ctx) {
  const view = document.getElementById("view-leads");
  const pane = document.getElementById("list-pane");
  const detailPane = document.getElementById("detail-pane");
  const { data, pipeline } = ctx;

  let route = { view: "leads", folder: "priority", id: null, params: {} };
  let folder = FOLDERS[0];
  let filters = readFilters({}, data);
  let query = "";
  let list = [];
  let start = 0; // rows list[start..shown) are in the DOM
  let shown = 0;
  let listKey = "";
  let detailId = undefined;
  let searchTimer = null;

  // ----- static list head -----
  const titleEl = el("h1", { class: "list-title" });
  const countEl = el("span", { class: "list-count" });
  const filterBadge = el("span", { class: "badge", hidden: true });
  const filterBtn = el("button", { class: "icon-btn", type: "button", "aria-label": "Filters",
    "aria-haspopup": "dialog", "aria-expanded": "false", onClick: () => togglePopover() }, icon("filter"), filterBadge);
  const exportBtn = el("button", { class: "icon-btn", type: "button", "aria-label": "Export this list as CSV",
    title: "Export CSV", onClick: () => exportList() }, icon("share"));
  const searchInput = el("input", { type: "search", placeholder: "Search", title: "Name, city, ZIP or citation",
    "aria-label": "Search leads", onInput: (e) => onSearch(e.target.value) });
  const sortSelect = el("select", { "aria-label": "Sort", onChange: (e) => applyFilterChange({ ...filters, sort: e.target.value }) },
    SORTS.map((s) => el("option", { value: s.id, text: s.label })));
  const pillLinks = new Map(FOLDERS.map((f) => [f.id, el("a", { text: f.label })]));
  const pills = el("nav", { class: "folder-pills", "aria-label": "Folders" }, [...pillLinks.values()]);
  const chips = el("div", { class: "chips" });
  const listEl = el("ul", { class: "lead-list", role: "list", "aria-label": "Leads" });
  const sentinel = el("li", { class: "sentinel", "aria-hidden": "true" });
  const earlier = el("li", { class: "list-earlier", hidden: true },
    el("button", { class: "pill-btn", type: "button", text: "Show earlier leads", onClick: () => showEarlier() }));

  pane.replaceChildren(
    el("div", { class: "list-head" },
      el("div", { class: "list-title-row" }, sidebarToggle(),
        el("div", { class: "titles" }, titleEl, countEl), filterBtn, exportBtn),
      pills,
      el("div", { class: "search-row" },
        el("label", { class: "search" }, icon("search"), searchInput),
        el("span", { class: "select" }, sortSelect)),
      chips),
    listEl);

  const popover = createFilterPopover({ anchor: filterBtn, host: pane, data });
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) renderMore();
  }, { root: listEl, rootMargin: "600px 0px" });

  // ----- helpers -----
  const hashFor = (id) => buildHash({ view: "leads", folder: folder.id, id, params: route.params });

  function applyFilterChange(next) {
    ctx.navigate({ view: "leads", folder: folder.id, id: route.id, params: toParams(next) }, { replace: true });
  }

  function togglePopover() {
    if (popover.isOpen()) popover.close();
    else popover.open(() => filters, applyFilterChange);
  }

  function onSearch(value) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      query = value;
      render(route);
    }, SEARCH_DELAY_MS);
  }

  function exportList() {
    if (!list.length) {
      toast("Nothing to export");
      return;
    }
    downloadCsv(`hocker-${folder.id}-${data.asOf}.csv`, leadRows(list, pipeline.stageOf));
    toast(`Exported ${plural(list.length, "lead")}`);
  }

  function rowTags(lead) {
    const stage = pipeline.stageOf(lead);
    if (stage === "hold") return el("span", { class: "tag hold" }, el("span", { class: "dot" }), "On hold");
    if (stage !== "top") return el("span", { class: "tag hot" }, el("span", { class: "dot" }), stageLabel(stage));
    return null;
  }

  function rowFor(lead) {
    const tags = rowTags(lead);
    return el("li", {}, el("a", { class: "lead-row", href: hashFor(lead.id), dataset: { id: lead.id },
      "aria-current": lead.id === route.id ? "true" : null },
    el("span", { class: "row-text" },
      el("span", { class: "row-title", text: lead.name }),
      el("span", { class: "row-sub", text: `${lead.city}, ${lead.state} · ${lead.industry}` }),
      tags ? el("span", { class: "row-tags" }, tags) : null),
    el("span", { class: "row-side" },
      el("span", { class: "row-score", text: `${lead.score.total}` }),
      filterMeter(lead.score, "sm"))));
  }

  function renderMore() {
    if (shown >= list.length) return;
    const next = list.slice(shown, shown + PAGE_SIZE);
    shown += next.length;
    sentinel.before(...next.map(rowFor));
  }

  function emptyState() {
    const filtered = activeFilterCount(filters) > 0 || query.trim();
    if (!filtered && folder.group === "pipeline") {
      return el("li", { class: "list-empty" }, el("strong", { text: `No leads marked ${folder.label} yet` }),
        el("span", { text: "Open a lead and set its stage. Stages are saved in this browser." }));
    }
    return el("li", { class: "list-empty" }, el("strong", { text: "No leads match" }),
      filtered ? el("button", { class: "pill-btn", type: "button", text: "Clear search and filters", onClick: () => {
        query = "";
        searchInput.value = "";
        applyFilterChange({ ...readFilters({}, data), sort: filters.sort });
        searchInput.focus();
      } }) : null);
  }

  /** Rebuilds the visible window: rows from `first` up to `last` (at least one page). */
  function renderWindow(first, last) {
    start = Math.min(first, Math.max(0, list.length - 1));
    shown = start;
    earlier.hidden = start === 0;
    listEl.replaceChildren(earlier, sentinel);
    if (!list.length) {
      earlier.after(emptyState());
      return;
    }
    const end = Math.min(Math.max(last, start + PAGE_SIZE), list.length);
    while (shown < end) renderMore();
    observer.observe(sentinel);
  }

  function renderRows(keepScroll) {
    const scrollTop = listEl.scrollTop;
    if (keepScroll) {
      renderWindow(start, shown);
      listEl.scrollTop = scrollTop;
    } else {
      renderWindow(0, PAGE_SIZE);
      listEl.scrollTop = 0;
    }
  }

  /** Adds the page above the window, keeping the rows on screen where they were. */
  function showEarlier() {
    const first = Math.max(0, start - PAGE_SIZE);
    const rows = list.slice(first, start).map(rowFor);
    const anchorRow = earlier.nextElementSibling;
    const topBefore = anchorRow.getBoundingClientRect().top;
    earlier.after(...rows);
    start = first;
    listEl.scrollTop += anchorRow.getBoundingClientRect().top - topBefore;
    if (start === 0) {
      earlier.hidden = true;
      rows[rows.length - 1]?.querySelector("a")?.focus({ preventScroll: true });
    }
  }

  function chip(label, patch) {
    return el("button", { class: "chip", type: "button", "aria-label": `Remove filter ${label}`,
      onClick: () => {
        filterBtn.focus();
        applyFilterChange({ ...filters, ...patch });
      } }, label, icon("close"));
  }

  function renderHead() {
    titleEl.textContent = folder.label;
    countEl.textContent = plural(list.length, "lead");
    const n = activeFilterCount(filters);
    filterBadge.hidden = n === 0;
    filterBadge.textContent = String(n);
    sortSelect.value = filters.sort;
    if (searchInput.value !== query) searchInput.value = query;
    const signal = SIGNALS.find((s) => s.id === filters.signal);
    chips.replaceChildren(
      signal ? chip(signal.label, { signal: null }) : null,
      filters.state ? chip(filters.state, { state: null }) : null,
      filters.industry ? chip(filters.industry, { industry: null }) : null,
      filters.readyOnly ? chip("Outreach-ready", { readyOnly: false }) : null);
    chips.hidden = n === 0;
    for (const [id, link] of pillLinks) {
      link.setAttribute("href", buildHash({ view: "leads", folder: id, params: route.params }));
      if (id === folder.id) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    pillLinks.get(folder.id).scrollIntoView({ block: "nearest", inline: "nearest" });
    document.title = `${folder.label} · HockerAI`;
  }

  function markSelected() {
    const focusInList = listEl.contains(document.activeElement);
    listEl.querySelector('.lead-row[aria-current="true"]')?.removeAttribute("aria-current");
    if (!route.id) return;
    const index = list.findIndex((l) => l.id === route.id);
    if (index < 0) return;
    // Close by: extend the window. Far away (e.g. a map click on lead 4,000): jump the window there.
    if (index < start || index >= shown + NEAR_ROWS) renderWindow(Math.max(0, index - WINDOW_LEAD_IN), index + 1);
    else while (shown <= index) renderMore();
    const row = listEl.querySelector(`.lead-row[data-id="${CSS.escape(route.id)}"]`);
    if (!row) return;
    row.setAttribute("aria-current", "true");
    row.scrollIntoView({ block: "nearest" });
    // Keyboard users moving through the list keep focus on the selected row.
    if (focusInList && document.activeElement !== row) row.focus({ preventScroll: true });
  }

  // ----- public -----
  function render(nextRoute, { force = false } = {}) {
    route = nextRoute;
    folder = FOLDERS.find((f) => f.id === route.folder) || FOLDERS[0];
    filters = readFilters(route.params, data);
    const key = JSON.stringify([folder.id, filters, query.trim()]);
    const filtersChanged = !force && listKey !== "" && key !== listKey;
    if (force || key !== listKey) {
      const base = folderLeads(data.leads, folder.id, pipeline.stageOf);
      list = sortLeads(applyFilters(base, { ...filters, query }), filters.sort);
      renderRows(force && key === listKey);
      listKey = key;
    }
    renderHead();

    // A filter change that hides the open lead moves the selection to the new list.
    // Search keeps it open, like Mail keeps a message open while you search.
    if (filtersChanged && route.id && !query.trim() && !list.some((l) => l.id === route.id)) {
      ctx.navigate({ ...route, folder: folder.id, id: null }, { replace: true });
      return;
    }

    if (!route.id && list.length && !isPhone()) {
      ctx.navigate({ ...route, folder: folder.id, id: list[0].id }, { replace: true });
      return;
    }
    markSelected();
    const lead = route.id ? ctx.leadById.get(route.id) : null;
    // The detail pane is rebuilt only for a new lead; a stage change leaves it (and focus) alone.
    if (detailId !== route.id) {
      renderDetail(detailPane, lead || null, ctx, { ...route, folder: folder.id });
      detailId = route.id;
    }
    view.classList.toggle("has-detail", Boolean(lead));
  }

  function moveSelection(delta) {
    if (!list.length) return;
    const index = list.findIndex((l) => l.id === route.id);
    const next = Math.min(list.length - 1, Math.max(0, index + delta));
    if (next !== index) ctx.navigate({ ...route, folder: folder.id, id: list[next].id }, { replace: true });
  }

  /**
   * List shortcuts. Arrow keys work from the list or with nothing focused; j, k and /
   * only while focus is in the list pane, so single-key shortcuts never fire elsewhere.
   * Returns true when the key was handled.
   */
  function handleKey(e) {
    const target = e.target instanceof Node ? e.target : document.body;
    const inList = listEl.contains(target);
    const inPane = pane.contains(target) && !popover.isOpen();
    const idle = target === document.body || target === document.documentElement;
    const moves = { ArrowDown: 1, ArrowUp: -1, j: 1, k: -1 };
    const arrow = e.key === "ArrowDown" || e.key === "ArrowUp";
    if (e.key in moves && (arrow ? inList || idle : inList)) {
      e.preventDefault();
      moveSelection(moves[e.key]);
      return true;
    }
    if (e.key === "/" && inPane) {
      e.preventDefault();
      searchInput.focus();
      return true;
    }
    return false;
  }

  return {
    render,
    refresh: () => render(route, { force: true }),
    handleKey,
    closePopover: () => {
      const wasOpen = popover.isOpen();
      popover.close({ restoreFocus: true });
      return wasOpen;
    },
    leave: () => {
      clearTimeout(searchTimer);
      popover.close();
    },
  };
}
