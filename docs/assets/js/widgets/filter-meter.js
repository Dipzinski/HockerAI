// The score as a pleated filter cartridge: 12 folded pleats in five factor groups.
// Earned pleats are solid green with a lit and a shaded face; unearned ones are empty wells.

import { svg, el } from "../dom.js";
import { meterLabel, meterLayout, factorLayout, pleatFaces } from "./meter-layout.js";

export { meterLabel };

const points = (pts) => pts.map((p) => p.map((n) => Math.round(n * 100) / 100).join(",")).join(" ");

function pleat(unit, layout) {
  const { size: s, top } = layout;
  const [lit, shade] = pleatFaces(unit.x, top, s);
  const wellFaces = [svg("polygon", { points: points(lit), class: "face lit" }),
    svg("polygon", { points: points(shade), class: "face shade" })];
  if (!unit.on) return svg("g", { class: "pleat well", "data-group": unit.key }, wellFaces);
  const earned = svg("g", { class: "pleat earned", style: `animation-delay:${unit.delay}ms` },
    svg("polygon", { points: points(lit), class: "face lit" }),
    svg("polygon", { points: points(shade), class: "face shade" }));
  return svg("g", { class: "pleat-slot", "data-group": unit.key }, svg("g", { class: "well" }, wellFaces), earned);
}

function rails(layout) {
  const { size: s, bodyBottom } = layout;
  return layout.groups.flatMap((g) => ["top", "bottom"].map((side) =>
    svg("rect", { x: g.x0 - 2.5, y: side === "top" ? 0 : bodyBottom + s.railGap, width: g.x1 - g.x0 + 5,
      height: s.rail, rx: s.rail / 2, class: g.full ? "rail full" : "rail", "data-group": g.key })));
}

function groupLabels(layout) {
  return layout.groups.map((g) => svg("text", { x: g.cx, y: layout.height - 3, "text-anchor": "middle",
    "data-group": g.key, class: g.full ? "meter-label full" : "meter-label" }, g.short));
}

function draw(layout, { cls, animate, label }) {
  const root = svg("svg", { viewBox: `0 0 ${layout.width} ${layout.height}`, width: layout.width, height: layout.height,
    class: `meter ${cls}${animate ? " meter-anim" : ""}`,
    ...(label ? { role: "img", "aria-label": label } : { "aria-hidden": "true", focusable: "false" }) });
  root.style.setProperty("--stroke", layout.size.stroke);
  if (layout.size.rail) root.append(...rails(layout));
  root.append(...layout.units.map((u) => pleat(u, layout)));
  if (layout.size.labels) root.append(...groupLabels(layout));
  return root;
}

/**
 * @param {{total:number}} score lead.score
 * @param {"sm"|"md"|"lg"} [size]
 * @param {{animate?: boolean}} [options] animate fills the earned pleats in once, group by group
 * @returns {SVGElement}
 */
export function filterMeter(score, size = "sm", { animate = false } = {}) {
  return draw(meterLayout(score, size), { cls: `meter-${size}`, animate, label: meterLabel(score) });
}

/**
 * The large meter with each factor group as a button next to the drawing (never inside it,
 * so the image keeps its label and no interactive element is nested in it).
 */
export function groupMeter(score, { onGroup, animate = false } = {}) {
  const layout = meterLayout(score, "lg");
  const buttons = layout.groups.map((g) => el("button", {
    type: "button", class: "meter-hit",
    style: `left:${((g.x0 - 4) / layout.width) * 100}%;width:${((g.x1 - g.x0 + 8) / layout.width) * 100}%`,
    "aria-label": `${g.label}: ${g.points} of ${g.max}. Show why`,
    onClick: () => onGroup(g.key) }));
  return el("div", { class: "meter-wrap" },
    draw(layout, { cls: "meter-lg", animate, label: meterLabel(score) }), buttons);
}

/** A single factor's pleats, used beside each reason. */
export function factorPleats(earned, max, { animate = false } = {}) {
  return draw(factorLayout(earned, max), { cls: "meter-fx", animate, label: null });
}
