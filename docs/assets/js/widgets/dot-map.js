// Dots for every located lead, painted on a canvas over the state outlines.
// albers() stays exported from here for callers that import it.

import { albers } from "./projection.js";
import { projectedBounds } from "./us-geo.js";

export { albers };

const SETTLE_MS = 950;
const WARM_END = 0.55;
const HOT_START = 0.3;

export function projectLeads(leads) {
  return leads.filter((l) => l.lat != null && l.lon != null)
    .map((l) => ({ hot: l.tier === "Hot", p: albers(l.lat, l.lon) }));
}

export function pointBounds(points) {
  return projectedBounds(points.map((d) => d.p));
}

const clamp01 = (n) => Math.max(0, Math.min(1, n));
const easeOut = (t) => 1 - (1 - t) ** 3;

/** Layer opacity and radius boost at settle progress 0..1: warm dots appear first, Hot dots land on top. */
export function settleState(progress) {
  const warm = easeOut(clamp01(progress / WARM_END));
  const hot = easeOut(clamp01((progress - HOT_START) / (1 - HOT_START)));
  return { warmAlpha: warm, hotAlpha: hot, hotBoost: 1 + (1 - hot) * 0.9 };
}

function paint(canvas, points, fit, progress) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const g = canvas.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, rect.width, rect.height);
  const k = rect.width / fit.width;
  const style = getComputedStyle(canvas);
  const { warmAlpha, hotAlpha, hotBoost } = settleState(progress);
  const layers = [
    { hot: false, color: style.getPropertyValue("--dot-warm").trim(), r: 0.8 + 1.1 * k, alpha: warmAlpha },
    { hot: true, color: style.getPropertyValue("--accent-fill").trim(), r: (1.2 + 1.7 * k) * hotBoost, alpha: hotAlpha },
  ];
  for (const layer of layers) {
    g.globalAlpha = layer.alpha;
    g.fillStyle = layer.color;
    g.beginPath();
    for (const d of points) {
      if (d.hot !== layer.hot) continue;
      const [x, y] = fit.at(d.p);
      g.moveTo(x * k + layer.r, y * k);
      g.arc(x * k, y * k, layer.r, 0, Math.PI * 2);
    }
    g.fill();
  }
  g.globalAlpha = 1;
}

/**
 * Paints now and again whenever the canvas resizes or the color scheme flips.
 * The first paint settles in (warm, then Hot) unless the visitor prefers reduced motion.
 */
export function mountDotMap(canvas, points, fit, onResize = () => {}) {
  let frame = 0;
  let progress = 1;
  const redraw = () => { paint(canvas, points, fit, progress); onResize(); };
  const observer = new ResizeObserver(redraw);
  observer.observe(canvas);
  const scheme = window.matchMedia("(prefers-color-scheme: dark)");
  scheme.addEventListener("change", redraw);
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const start = performance.now();
    progress = 0;
    const tick = (now) => {
      progress = clamp01((now - start) / SETTLE_MS);
      paint(canvas, points, fit, progress);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }
  redraw();
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    scheme.removeEventListener("change", redraw);
  };
}
