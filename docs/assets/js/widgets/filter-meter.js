// The score as a pleated filter cartridge: 12 pleats in five factor groups.

import { FACTORS, MAX_SCORE } from "../score.js";
import { svg } from "../dom.js";

const SIZES = {
  sm: { w: 2.5, gap: 1.25, group: 3.5, h: 14, cap: 0, pad: 0, labels: false, rx: 1.25 },
  lg: { w: 11, gap: 3, group: 11, h: 44, cap: 3, pad: 8, labels: true, rx: 3 },
};
const CAP_GAP = 3;
const LABEL_H = 18;

export function meterLabel(score) {
  const parts = FACTORS.map((f) => `${f.label.toLowerCase()} ${score[f.key] || 0} of ${f.max}`);
  return `Score ${score.total} of ${MAX_SCORE}: ${parts.join(", ")}`;
}

function layout(score, s) {
  let x = s.pad;
  const pleats = [];
  const groups = [];
  FACTORS.forEach((f, gi) => {
    if (gi) x += s.group;
    const start = x;
    for (let i = 0; i < f.max; i += 1) {
      if (i) x += s.gap;
      pleats.push({ x, on: i < (score[f.key] || 0) });
      x += s.w;
    }
    groups.push({ cx: (start + x) / 2, text: f.short });
  });
  return { pleats, groups, width: x + s.pad };
}

/**
 * @param {{total:number}} score lead.score
 * @param {"sm"|"lg"} [size]
 * @returns {SVGElement}
 */
export function filterMeter(score, size = "sm") {
  const s = SIZES[size];
  const { pleats, groups, width } = layout(score, s);
  const top = s.cap ? s.cap + CAP_GAP : 0;
  const bodyBottom = top + s.h;
  const height = bodyBottom + (s.cap ? CAP_GAP + s.cap : 0) + (s.labels ? LABEL_H : 0);
  const root = svg("svg", { viewBox: `0 0 ${width} ${height}`, width, height,
    class: `meter meter-${size}`, role: "img", "aria-label": meterLabel(score) });

  if (s.cap) {
    const capW = width - s.pad * 2 + 8;
    root.append(svg("rect", { x: s.pad - 4, y: 0, width: capW, height: s.cap, rx: s.cap / 2, class: "meter-cap" }));
    root.append(svg("rect", { x: s.pad - 4, y: bodyBottom + CAP_GAP, width: capW, height: s.cap, rx: s.cap / 2, class: "meter-cap" }));
  }
  for (const p of pleats) {
    root.append(svg("rect", { x: p.x, y: top, width: s.w, height: s.h, rx: s.rx, class: p.on ? "pleat on" : "pleat" }));
    if (p.on && size === "lg") {
      root.append(svg("rect", { x: p.x + s.w * 0.28, y: top + 4, width: s.w * 0.16, height: s.h - 8, rx: 1, class: "pleat-fold" }));
    }
  }
  if (s.labels) {
    for (const g of groups) {
      root.append(svg("text", { x: g.cx, y: height - 4, "text-anchor": "middle", class: "meter-label" }, g.text));
    }
  }
  return root;
}

/** A single factor's pleats, used beside each reason. */
export function factorPleats(points, max) {
  const w = 5;
  const gap = 2.5;
  const h = 18;
  const width = max * w + (max - 1) * gap;
  const root = svg("svg", { viewBox: `0 0 ${width} ${h}`, width, height: h, class: "meter", "aria-hidden": "true" });
  for (let i = 0; i < max; i += 1) {
    root.append(svg("rect", { x: i * (w + gap), y: 0, width: w, height: h, rx: 2, class: i < points ? "pleat on" : "pleat" }));
  }
  return root;
}
