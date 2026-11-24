// The Home hero: a briefing sentence, the #1 lead shown as a product shot of its cartridge,
// and keyed callouts that quote the reason behind each pleat group.

import { breakdown, formatDate } from "../score.js";
import { briefing, sentenceText, shortReason } from "../briefing.js";
import { el, fmt } from "../dom.js";
import { buildHash } from "../router.js";
import { filterMeter } from "../widgets/filter-meter.js";

const COUNT_MS = 900;

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Counts a figure up from zero; the final value is already in the DOM for reduced motion. */
function countUp(node, target) {
  if (prefersReducedMotion() || target < 2) return;
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / COUNT_MS);
    node.textContent = fmt(Math.round(target * (1 - (1 - t) ** 3)));
    if (t < 1 && node.isConnected) requestAnimationFrame(tick);
  };
  node.textContent = "0";
  requestAnimationFrame(tick);
}

function briefColumn(data, priority) {
  const brief = briefing(data, priority);
  const numbers = brief.sentence.map((part) => el("span", { class: "num", text: part.num }));
  const sentence = el("h2", { class: "hero-sentence", id: "hero-title", "aria-label": sentenceText(brief.sentence).trim() },
    brief.sentence.map((part, i) => [numbers[i], part.text]));
  const column = el("div", { class: "hero-brief" },
    el("p", { class: "hero-eyebrow", text: `Briefing · data through ${formatDate(data.asOf)}` }),
    sentence,
    el("p", { class: "hero-more", text: brief.lines.join(" ") }),
    el("div", { class: "hero-actions" },
      el("a", { class: "btn-primary", href: "#/leads/priority" }, `Open the Priority ${fmt(priority.length)}`),
      el("a", { class: "text-link", href: "#/scoring", text: "How scoring works" })));
  return { column, number: numbers[0], target: brief.headline.value };
}

function callouts(rows, meter) {
  const items = rows.map((row) => {
    const item = el("li", { class: row.points ? "callout" : "callout is-empty" },
      el("div", { class: "callout-body" },
        el("div", { class: "callout-head" },
          el("span", { class: "callout-name", text: row.label }),
          el("span", { class: "callout-pts", text: `${row.points}/${row.max}` })),
        el("p", { class: "callout-text", text: shortReason(row.reason) })));
    item.addEventListener("mouseenter", () => { meter.dataset.hl = row.key; });
    item.addEventListener("mouseleave", () => { delete meter.dataset.hl; });
    return item;
  });
  return el("ol", { class: "callouts", "aria-label": "Why it ranks first" }, items);
}

function product(lead, meter) {
  const people = lead.employees == null ? "headcount unknown" : `${fmt(lead.employees)} employees`;
  return el("article", { class: "product", "aria-label": "Top lead" },
    el("p", { class: "spot-tag" }, "Top lead", el("span", { text: ` · Rank ${fmt(lead.rank)}` })),
    el("h3", { class: "spot-name", text: lead.name }),
    el("p", { class: "spot-meta", text: `${lead.city}, ${lead.state} · ${people}` }),
    el("div", { class: "shot" },
      el("span", { class: "spot-total" }, String(lead.score.total), el("small", { text: "/12" })),
      meter),
    el("a", { class: "btn-primary", href: buildHash({ view: "leads", folder: "priority", id: lead.id }),
      "aria-label": `Open lead: ${lead.name}` }, "Open lead"));
}

/** @returns {{node: HTMLElement, start: () => void}} */
export function createHero(data, priority) {
  const brief = briefColumn(data, priority);
  const children = [brief.column];
  if (priority.length) {
    const lead = priority[0];
    const meter = filterMeter(lead.score, "lg", { animate: true });
    children.push(product(lead, meter), callouts(breakdown(lead, data.asOf), meter));
  }
  const node = el("section", { class: "hero rise", style: "--i:0", "aria-labelledby": "hero-title" }, children);
  return { node, start: () => countUp(brief.number, brief.target) };
}
