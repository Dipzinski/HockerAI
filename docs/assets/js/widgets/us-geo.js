// Pure geometry for the Home map: decode the compact state asset, project it, fit it to a box,
// and find a label point inside each state. No DOM, so Node tests can import it.

import { albers } from "./projection.js";

const resolveArc = (ref) => (ref < 0 ? ~ref : ref);

/** @returns {{arcs: number[][][], states: Record<string, number[][]>, names: Record<string,string>}} */
export function decodeGeo(asset) {
  if (!asset || asset.v !== 1 || !Array.isArray(asset.arcs) || typeof asset.states !== "object") {
    throw new Error("Unrecognized state geometry");
  }
  const arcs = asset.arcs.map((flat) => {
    const pts = [];
    let x = 0;
    let y = 0;
    for (let i = 0; i + 1 < flat.length; i += 2) {
      x += flat[i];
      y += flat[i + 1];
      pts.push([x * asset.unit, y * asset.unit]);
    }
    return pts;
  });
  return { arcs, states: asset.states, names: asset.names || {} };
}

/** Points ([lon, lat]) of one ring, joining its arcs end to end. */
export function ringLonLat(geo, ring) {
  const out = [];
  ring.forEach((ref) => {
    const pts = geo.arcs[resolveArc(ref)];
    const ordered = ref < 0 ? [...pts].reverse() : pts;
    out.push(...(out.length ? ordered.slice(1) : ordered));
  });
  return out;
}

/** Map of arc index to the states that use it, so each border can be drawn exactly once. */
export function arcUsers(geo) {
  const users = geo.arcs.map(() => new Set());
  for (const [abbr, rings] of Object.entries(geo.states)) {
    for (const ring of rings) ring.forEach((ref) => users[resolveArc(ref)].add(abbr));
  }
  return users;
}

const project = ([lon, lat]) => albers(lat, lon);

export function projectedBounds(points) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY };
}

/** Bounds of every arc point of the geometry, projected. */
export function geoBounds(geo) {
  return projectedBounds(geo.arcs.flatMap((arc) => arc.map(project)));
}

/**
 * A fit from projected coordinates (y up) to a width x height box (y down).
 * @returns {{width:number,height:number,scale:number,at:(p:number[])=>number[]}}
 */
export function makeFit(bounds, width = 1000, pad = 10) {
  const spanX = bounds.maxX - bounds.minX || 1;
  const spanY = bounds.maxY - bounds.minY || 1;
  const scale = (width - pad * 2) / spanX;
  const height = Math.round(spanY * scale + pad * 2);
  const at = ([x, y]) => [pad + (x - bounds.minX) * scale, pad + (bounds.maxY - y) * scale];
  return { width, height, scale, at };
}

const fixed = (n) => Math.round(n * 10) / 10;

/** SVG path data for a list of [lon, lat] points. */
export function pathOf(lonLat, fit, close = false) {
  const body = lonLat.map((p, i) => {
    const [x, y] = fit.at(project(p));
    return `${i ? "L" : "M"}${fixed(x)} ${fixed(y)}`;
  }).join("");
  return close ? `${body}Z` : body;
}

export function statePath(geo, abbr, fit) {
  return (geo.states[abbr] || []).map((ring) => pathOf(ringLonLat(geo, ring), fit, true)).join("");
}

/** One path for the given arcs, each drawn once. */
export function arcsPath(geo, indices, fit) {
  return indices.map((i) => pathOf(geo.arcs[i], fit)).join("");
}

/** Arc indices split into those touching a highlighted state and the rest. */
export function splitArcs(geo, highlighted) {
  const users = arcUsers(geo);
  const marked = [];
  const rest = [];
  users.forEach((set, i) => ((([...set].some((s) => highlighted.includes(s))) ? marked : rest).push(i)));
  return { marked, rest };
}

function ringArea(pts) {
  let sum = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum / 2);
}

export function insideRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function edgeDistance(pt, ring) {
  let best = Infinity;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const sx = b[0] - a[0];
    const sy = b[1] - a[1];
    const len2 = sx * sx + sy * sy;
    const t = len2 ? Math.max(0, Math.min(1, ((pt[0] - a[0]) * sx + (pt[1] - a[1]) * sy) / len2)) : 0;
    best = Math.min(best, Math.hypot(pt[0] - a[0] - t * sx, pt[1] - a[1] - t * sy));
  }
  return best;
}

/** The point deepest inside the ring (a pole of inaccessibility by grid search and one refinement). */
export function labelPoint(ring, cells = 28) {
  const box = projectedBounds(ring);
  let best = { pt: ring[0], d: -1 };
  let [x0, x1, y0, y1] = [box.minX, box.maxX, box.minY, box.maxY];
  for (let pass = 0; pass < 2; pass += 1) {
    const dx = (x1 - x0) / cells;
    const dy = (y1 - y0) / cells;
    for (let i = 0; i <= cells; i += 1) {
      for (let j = 0; j <= cells; j += 1) {
        const pt = [x0 + i * dx, y0 + j * dy];
        if (!insideRing(pt, ring)) continue;
        const d = edgeDistance(pt, ring);
        if (d > best.d) best = { pt, d };
      }
    }
    [x0, x1] = [best.pt[0] - 2 * dx, best.pt[0] + 2 * dx];
    [y0, y1] = [best.pt[1] - 2 * dy, best.pt[1] + 2 * dy];
  }
  return best.pt;
}

/** Projected label point for a state, taken from its largest ring. */
export function stateLabelPoint(geo, abbr) {
  const rings = (geo.states[abbr] || []).map((ring) => ringLonLat(geo, ring).map(project));
  if (!rings.length) return null;
  const largest = rings.reduce((a, b) => (ringArea(b) > ringArea(a) ? b : a));
  return labelPoint(largest);
}
