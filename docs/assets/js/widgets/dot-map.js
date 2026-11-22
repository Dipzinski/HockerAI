// A library-free dot map: every lead plotted on an Albers USA projection in a <canvas>.

const DEG = Math.PI / 180;
const PHI1 = 29.5 * DEG;
const PHI2 = 45.5 * DEG;
const PHI0 = 37.5 * DEG;
const LAMBDA0 = -96 * DEG;
const N = (Math.sin(PHI1) + Math.sin(PHI2)) / 2;
const C = Math.cos(PHI1) ** 2 + 2 * N * Math.sin(PHI1);
const RHO0 = Math.sqrt(C - 2 * N * Math.sin(PHI0)) / N;
const PADDING = 12;

/** Albers equal-area conic for the lower 48. Returns [x, y] with y pointing up. */
export function albers(lat, lon) {
  const rho = Math.sqrt(C - 2 * N * Math.sin(lat * DEG)) / N;
  const theta = N * (lon * DEG - LAMBDA0);
  return [rho * Math.sin(theta), RHO0 - rho * Math.cos(theta)];
}

function projectAll(leads) {
  return leads.filter((l) => l.lat != null && l.lon != null)
    .map((l) => ({ hot: l.tier === "Hot", p: albers(l.lat, l.lon) }));
}

function bounds(points) {
  const xs = points.map((d) => d.p[0]);
  const ys = points.map((d) => d.p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

function draw(canvas, points, box) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const spanX = box.maxX - box.minX || 1;
  const spanY = box.maxY - box.minY || 1;
  const scale = Math.min((rect.width - PADDING * 2) / spanX, (rect.height - PADDING * 2) / spanY);
  const offX = (rect.width - spanX * scale) / 2;
  const offY = (rect.height - spanY * scale) / 2;
  const style = getComputedStyle(canvas);
  const layers = [
    { hot: false, color: style.getPropertyValue("--dot-warm").trim(), r: 1.25 },
    { hot: true, color: style.getPropertyValue("--accent-fill").trim(), r: 1.9 },
  ];
  for (const layer of layers) {
    ctx.fillStyle = layer.color;
    ctx.beginPath();
    for (const d of points) {
      if (d.hot !== layer.hot) continue;
      const x = offX + (d.p[0] - box.minX) * scale;
      const y = offY + (box.maxY - d.p[1]) * scale;
      ctx.moveTo(x + layer.r, y);
      ctx.arc(x, y, layer.r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}

/** Draws the map now and again whenever the canvas resizes or the color scheme flips. */
export function mountDotMap(canvas, leads) {
  const points = projectAll(leads);
  if (!points.length) return () => {};
  const box = bounds(points);
  const redraw = () => draw(canvas, points, box);
  const observer = new ResizeObserver(redraw);
  observer.observe(canvas);
  const scheme = window.matchMedia("(prefers-color-scheme: dark)");
  scheme.addEventListener("change", redraw);
  redraw();
  return () => {
    observer.disconnect();
    scheme.removeEventListener("change", redraw);
  };
}
