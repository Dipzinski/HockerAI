// DOM helpers. Text always goes in through textContent, never innerHTML.

const SVG_NS = "http://www.w3.org/2000/svg";

function setProps(node, props) {
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === "class") node.setAttribute("class", value);
    else if (key === "text") node.textContent = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? "" : String(value));
  }
}

export function append(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** @param {string} tag @param {object} [props] @returns {HTMLElement} */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  setProps(node, props);
  return append(node, children);
}

/** @param {string} tag @param {object} [props] @returns {SVGElement} */
export function svg(tag, props = {}, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  setProps(node, props);
  return append(node, children);
}

// 24×24 line icons in the spirit of SF Symbols.
const ICONS = {
  home: "M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1H15v-6.5H9V21H4.5a1 1 0 0 1-1-1z",
  star: "M12 3.6l2.55 5.2 5.75.83-4.16 4.05.98 5.72L12 16.7l-5.12 2.7.98-5.72L3.7 9.63l5.75-.83z",
  tray: "M3.5 13h5l1.5 2.5h4l1.5-2.5h5M5.5 4.5h13l2 8.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19v-6z",
  hot: "M12 6.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z",
  warm: "M12 6.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zM12 6.5v11",
  hold: "M9 5.5v13M15 5.5v13",
  reached: "M20.5 3.5 10 14M20.5 3.5 14 20.5l-4-6.5-6.5-4z",
  contact: "M4 5h16v11H9.5L4 20.5z",
  audit: "M4 6h16v14.5H4zM4 10.5h16M8.5 3.5v4M15.5 3.5v4",
  map: "M9 4.5 3.5 6.5v13l5.5-2 6 2 5.5-2v-13l-5.5 2zM9 4.5v13M15 6.5v13",
  pleats: "M6 6.5v11M10 6.5v11M14 6.5v11M18 6.5v11M3.5 4h17M3.5 20h17",
  search: "M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM15.5 15.5l5 5",
  filter: "M4 7h16M7 12h10M10 17h4",
  share: "M12 3.5v12M8 7.5l4-4 4 4M5.5 11.5v8.5h13v-8.5",
  chevronRight: "M9 5l7 7-7 7",
  chevronLeft: "M15 5l-7 7 7 7",
  external: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
  sidebar: "M4 5h16v14H4zM9.5 5v14",
  close: "M6.5 6.5l11 11M17.5 6.5l-11 11",
  check: "M5 12.5l4.5 4.5L19 7.5",
  warning: "M12 4 2.8 20h18.4zM12 10v4.5M12 17.4v.1",
  shield: "M12 3.5 5 6v5.5c0 4.2 3 7.6 7 9 4-1.4 7-4.8 7-9V6z M9 12l2 2 4-4",
  spark: "M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8z",
};
const FILLED = new Set(["hot", "star", "spark"]);

/** @param {keyof typeof ICONS} name @returns {SVGElement} */
export function icon(name) {
  const filled = FILLED.has(name);
  return svg("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false",
    fill: filled ? "currentColor" : "none", stroke: filled ? "none" : "currentColor",
    "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round" },
  svg("path", { d: ICONS[name] }));
}

export const fmt = (n) => (n == null ? "—" : n.toLocaleString("en-US"));

export function plural(n, word, many = `${word}s`) {
  return `${fmt(n)} ${n === 1 ? word : many}`;
}

/** Only http(s) links from the data are rendered as links. */
export function safeUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url) ? url : null;
}

let toastTimer = null;
export function toast(message) {
  const node = document.getElementById("toast");
  if (!node) return;
  node.replaceChildren(icon("check"), document.createTextNode(message));
  node.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), 2200);
}

export function isPhone() {
  return window.matchMedia("(max-width: 759px)").matches;
}

export function isTyping(target) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName));
}
