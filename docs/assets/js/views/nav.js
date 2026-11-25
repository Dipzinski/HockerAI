// Sidebar (desktop and tablet) and the floating tab bar (phone).
// Both are built once and then updated in place, so keyboard focus survives navigation.

import { FOLDERS, folderCounts } from "../data.js";
import { formatDate } from "../score.js";
import { el, icon, fmt } from "../dom.js";
import { buildHash } from "../router.js";

const FOLDER_ICONS = {
  priority: "star", all: "tray", hot: "hot", warm: "warm", hold: "hold",
  reached: "reached", contact: "contact", audit: "audit",
};
const TABS = [
  { view: "home", label: "Home", icon: "home" },
  { view: "leads", label: "Leads", icon: "tray" },
  { view: "map", label: "Map", icon: "map" },
  { view: "scoring", label: "Scoring", icon: "pleats" },
];

let sidebarItems = null;
let tabItems = null;
let sidebarOpener = null;

function setCurrent(link, current) {
  if (current) link.setAttribute("aria-current", "page");
  else link.removeAttribute("aria-current");
}

function navItem({ href, label, iconName, folderId = null, view = null }) {
  const countEl = folderId ? el("span", { class: "nav-count" }) : null;
  const link = el("a", { class: "nav-item", href }, icon(iconName), el("span", { text: label }), countEl);
  return { link, countEl, folderId, view };
}

function buildSidebar(data) {
  const folderItems = (group) => FOLDERS.filter((f) => f.group === group).map((f) => navItem({
    href: buildHash({ view: "leads", folder: f.id }), label: f.label, iconName: FOLDER_ICONS[f.id], folderId: f.id }));
  const items = [
    navItem({ href: "#/home", label: "Home", iconName: "home", view: "home" }),
    "Leads", ...folderItems("leads"),
    "Pipeline", ...folderItems("pipeline"),
    "More",
    navItem({ href: "#/map", label: "Map", iconName: "map", view: "map" }),
    navItem({ href: "#/scoring", label: "How scoring works", iconName: "pleats", view: "scoring" }),
  ];
  document.getElementById("sidebar-nav").replaceChildren(...items.map((item) =>
    (typeof item === "string" ? el("div", { class: "nav-section", text: item }) : item.link)));
  document.getElementById("sidebar-foot").replaceChildren(
    el("div", { text: `OSHA data through ${formatDate(data.asOf)}` }),
    el("div", { text: `${data.territory.length} states · EPA TRI ${data.triYear}` }));
  return items.filter((item) => typeof item !== "string");
}

export function renderSidebar(ctx, route) {
  const { data, pipeline } = ctx;
  if (!sidebarItems) sidebarItems = buildSidebar(data);
  const counts = folderCounts(data.leads, pipeline.stageOf);
  for (const item of sidebarItems) {
    if (item.folderId) {
      item.countEl.textContent = fmt(counts[item.folderId]);
      setCurrent(item.link, route.view === "leads" && route.folder === item.folderId);
    } else {
      setCurrent(item.link, route.view === item.view);
    }
  }
}

export function renderTabbar(route) {
  if (!tabItems) {
    tabItems = TABS.map((t) => ({ view: t.view,
      link: el("a", { class: "tab-item", href: `#/${t.view}` }, icon(t.icon), el("span", { text: t.label })) }));
    document.getElementById("tabbar").replaceChildren(...tabItems.map((t) => t.link));
  }
  for (const t of tabItems) setCurrent(t.link, route.view === t.view);
}

/** Toolbar button that opens the sidebar on tablet widths. */
export function sidebarToggle() {
  const button = el("button", { class: "icon-btn sidebar-toggle", type: "button", "aria-label": "Show sidebar",
    "aria-controls": "sidebar", onClick: () => setSidebar(true, button) }, icon("sidebar"));
  return button;
}

/**
 * Opens or closes the slide-over sidebar. While it is open the content behind it is inert,
 * so keyboard focus stays in the sidebar; closing with restoreFocus returns focus to the opener.
 */
export function setSidebar(open, opener = null, { restoreFocus = false } = {}) {
  const app = document.getElementById("app");
  const wasOpen = app.classList.contains("sidebar-open");
  app.classList.toggle("sidebar-open", open);
  document.getElementById("scrim").hidden = !open;
  document.getElementById("content").inert = open;
  if (open) {
    sidebarOpener = opener;
    document.querySelector("#sidebar .nav-item")?.focus();
    return;
  }
  if (wasOpen && restoreFocus && sidebarOpener?.isConnected) sidebarOpener.focus();
  if (wasOpen) sidebarOpener = null;
}

export function viewHeader(title, subtitle, ...actions) {
  return el("header", { class: "view-head" }, sidebarToggle(),
    el("div", { class: "titles" }, el("h1", { class: "large-title", text: title }),
      subtitle ? el("p", { class: "subtitle", text: subtitle }) : null),
    actions);
}
