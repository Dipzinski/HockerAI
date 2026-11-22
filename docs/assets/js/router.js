// Hash routes: #/home, #/leads/<folder>/<id>?filters, #/map?tab=…, #/scoring

export const VIEWS = ["home", "leads", "map", "scoring"];

export function parseRoute(hash) {
  const raw = (hash || "").replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean).map((p) => {
    try { return decodeURIComponent(p); } catch { return p; }
  });
  const params = Object.fromEntries(new URLSearchParams(query));
  const view = VIEWS.includes(parts[0]) ? parts[0] : "home";
  if (view === "leads") return { view, folder: parts[1] || "priority", id: parts[2] || null, params };
  return { view, folder: null, id: null, params };
}

export function buildHash({ view, folder, id, params }) {
  let path = `#/${view}`;
  if (view === "leads") {
    path += `/${encodeURIComponent(folder || "priority")}`;
    if (id) path += `/${encodeURIComponent(id)}`;
  }
  const kept = Object.entries(params || {}).filter(([, v]) => v != null && v !== "" && v !== false);
  const query = new URLSearchParams(kept).toString();
  return query ? `${path}?${query}` : path;
}
