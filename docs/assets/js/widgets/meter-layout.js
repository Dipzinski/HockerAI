// Geometry of the score meter: one pleat per point, grouped by factor. Pure, so Node tests can import it.

import { FACTORS, MAX_SCORE } from "../score.js";

/**
 * Sizes in SVG user units. d is how far a pleat's ridge rises above its edges, which is what
 * makes each unit read as a fold with a lit face and a shaded face.
 */
export const METER_SIZES = {
  sm: { w: 6.2, gap: 1, group: 7, h: 17, d: 1.8, rail: 0, railGap: 0, pad: 1, labels: false, stroke: 0.8 },
  md: { w: 9, gap: 0.5, group: 9, h: 28, d: 3, rail: 0, railGap: 0, pad: 1, labels: false, stroke: 1 },
  lg: { w: 15, gap: 0, group: 12, h: 46, d: 7, rail: 4, railGap: 3, pad: 6, labels: true, stroke: 1.3 },
  fx: { w: 6.5, gap: 1.5, group: 0, h: 20, d: 2, rail: 0, railGap: 0, pad: 1, labels: false, stroke: 0.9 },
};
const LABEL_H = 17;
const BASE_DELAY_MS = 120;
const GROUP_DELAY_MS = 150;
const PLEAT_DELAY_MS = 45;

export function meterLabel(score) {
  const parts = FACTORS.map((f) => `${f.label.toLowerCase()} ${score[f.key] || 0} of ${f.max}`);
  return `Score ${score.total} of ${MAX_SCORE}: ${parts.join(", ")}`;
}

/** The two faces of one pleat as point lists: [litFace, shadedFace]. */
export function pleatFaces(x, top, s) {
  const mid = x + s.w / 2;
  const bottom = top + s.h;
  return [
    [[x, top + s.d], [mid, top], [mid, bottom], [x, bottom - s.d]],
    [[mid, top], [x + s.w, top + s.d], [x + s.w, bottom - s.d], [mid, bottom]],
  ];
}

/**
 * @param {Array<{key:string,short:string,label:string,max:number,points:number}>} groups
 * @param {keyof typeof METER_SIZES} sizeKey
 */
export function layoutGroups(groups, sizeKey) {
  const s = METER_SIZES[sizeKey];
  const top = s.rail ? s.rail + s.railGap : 0;
  const bodyBottom = top + s.h;
  let x = s.pad;
  const units = [];
  const laid = groups.map((g, groupIndex) => {
    if (groupIndex) x += s.group;
    const x0 = x;
    for (let i = 0; i < g.max; i += 1) {
      if (i) x += s.gap;
      units.push({ x, on: i < g.points, groupIndex, key: g.key,
        delay: BASE_DELAY_MS + groupIndex * GROUP_DELAY_MS + i * PLEAT_DELAY_MS });
      x += s.w;
    }
    return { key: g.key, label: g.label, short: g.short, x0, x1: x, cx: (x0 + x) / 2,
      points: g.points, max: g.max, full: g.points === g.max };
  });
  const height = bodyBottom + (s.rail ? s.railGap + s.rail : 0) + (s.labels ? LABEL_H : 0);
  return { size: s, units, groups: laid, top, bodyBottom, width: x + s.pad, height };
}

export function meterLayout(score, sizeKey) {
  return layoutGroups(FACTORS.map((f) => ({ ...f, points: score[f.key] || 0 })), sizeKey);
}

/** A single factor's pleats, for the breakdown and scoring rows. */
export function factorLayout(points, max) {
  return layoutGroups([{ key: "factor", label: "", short: "", max, points }], "fx");
}
