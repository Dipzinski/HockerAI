// Pure helpers for build-us-geo.mjs: TopoJSON arc decoding, simplification and compact encoding.
// Shared borders stay seamless because every arc is simplified once and referenced by both neighbours.

/** Absolute [lon, lat] points of every arc in a quantized TopoJSON topology. */
export function decodeArcs(topology) {
  const { scale, translate } = topology.transform;
  return topology.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
    });
  });
}

function distToSegment(p, a, b, xScale) {
  const px = (p[0] - a[0]) * xScale;
  const py = p[1] - a[1];
  const sx = (b[0] - a[0]) * xScale;
  const sy = b[1] - a[1];
  const len2 = sx * sx + sy * sy;
  const t = len2 ? Math.max(0, Math.min(1, (px * sx + py * sy) / len2)) : 0;
  return Math.hypot(px - t * sx, py - t * sy);
}

/** Douglas-Peucker in degrees (longitude shrunk by cos 38 degrees). Endpoints always survive. */
export function simplify(points, tolerance, xScale = 0.79) {
  if (points.length <= 2) return points.slice();
  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop();
    let worst = -1;
    let worstDist = tolerance;
    for (let i = lo + 1; i < hi; i += 1) {
      const d = distToSegment(points[i], points[lo], points[hi], xScale);
      if (d > worstDist) { worst = i; worstDist = d; }
    }
    if (worst > 0) {
      keep[worst] = true;
      stack.push([lo, worst], [worst, hi]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Round to a grid and drop points that collapse onto their neighbour. */
export function snap(points, unit) {
  const out = [];
  for (const [lon, lat] of points) {
    const q = [Math.round(lon / unit), Math.round(lat / unit)];
    const last = out[out.length - 1];
    if (!last || last[0] !== q[0] || last[1] !== q[1]) out.push(q);
  }
  return out;
}

/** [x0, y0, dx, dy, ...] with integers in grid units. */
export function deltaEncode(grid) {
  const flat = [];
  let px = 0;
  let py = 0;
  grid.forEach(([x, y], i) => {
    flat.push(i === 0 ? x : x - px, i === 0 ? y : y - py);
    px = x;
    py = y;
  });
  return flat;
}

/** Inverse of deltaEncode, returning [lon, lat] pairs. */
export function deltaDecode(flat, unit) {
  const out = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i < flat.length; i += 2) {
    x += flat[i];
    y += flat[i + 1];
    out.push([x * unit, y * unit]);
  }
  return out;
}

const resolveArc = (ref) => (ref < 0 ? ~ref : ref);

/** Every ring of a Polygon or MultiPolygon geometry as a list of signed arc references. */
export function geometryRings(geometry) {
  if (geometry.type === "Polygon") return geometry.arcs;
  if (geometry.type === "MultiPolygon") return geometry.arcs.flat();
  return [];
}

function ringArea(ring, arcs) {
  const pts = [];
  for (const ref of ring) {
    const a = arcs[resolveArc(ref)];
    pts.push(...(ref < 0 ? [...a].reverse() : a));
  }
  let sum = 0;
  for (let i = 0; i < pts.length - 1; i += 1) sum += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
  return Math.abs(sum / 2);
}

/**
 * Build the compact asset.
 * @param {object} topology us-atlas states TopoJSON
 * @param {Record<string,string>} fipsToAbbr the states to keep
 */
export function buildAsset(topology, fipsToAbbr, { tolerance = 0.018, unit = 0.01, minRingArea = 0.04 } = {}) {
  const arcs = decodeArcs(topology);
  const kept = {};
  const names = {};
  for (const geometry of topology.objects.states.geometries) {
    const abbr = fipsToAbbr[geometry.id];
    if (!abbr) continue;
    names[abbr] = geometry.properties.name;
    kept[abbr] = geometryRings(geometry).filter((ring) => ringArea(ring, arcs) >= minRingArea || abbr === "DC");
  }
  const remap = new Map();
  const outArcs = [];
  const mapRef = (ref) => {
    const idx = resolveArc(ref);
    if (!remap.has(idx)) {
      remap.set(idx, outArcs.length);
      outArcs.push(deltaEncode(snap(simplify(arcs[idx], tolerance), unit)));
    }
    const mapped = remap.get(idx);
    return ref < 0 ? ~mapped : mapped;
  };
  const states = {};
  for (const abbr of Object.keys(kept).sort()) states[abbr] = kept[abbr].map((ring) => ring.map(mapRef));
  return { v: 1, unit, names, arcs: outArcs, states };
}
