// Loads the dashboard data and holds the pure helpers for folders, filters and sorting.

export const PRIORITY_SIZE = 100;
const DATA_URL = "data/leads.json";

export const SIGNALS = [
  { id: "nep", label: "Combustible Dust NEP",
    test: (l) => l.inspections.some((i) => i.dust_program === "Combustible Dust NEP") },
  { id: "silica", label: "Silica",
    test: (l) => l.inspections.some((i) => i.dust_program === "Silica emphasis program"
      || (i.citations || []).some((c) => (c.standard || "").includes("1910.1053"))) },
  { id: "tri", label: "EPA metal air releases", test: (l) => Boolean(l.tri_air_signal) },
  { id: "wood", label: "Woodworking", test: (l) => l.industry.toLowerCase().includes("wood") },
  { id: "metal", label: "Metal fabrication", test: (l) => l.industry.toLowerCase().includes("metal") },
];

export const FOLDERS = [
  { id: "priority", label: "Priority", group: "leads" },
  { id: "all", label: "All leads", group: "leads" },
  { id: "hot", label: "Hot", group: "leads" },
  { id: "warm", label: "Warm", group: "leads" },
  { id: "hold", label: "On hold", group: "leads" },
  { id: "reached", label: "Reached out", group: "pipeline" },
  { id: "contact", label: "In contact", group: "pipeline" },
  { id: "audit", label: "Assessment booked", group: "pipeline" },
];

export const SORTS = [
  { id: "score", label: "Score" },
  { id: "evidence", label: "Newest evidence" },
  { id: "name", label: "Name" },
];

export async function loadData() {
  const res = await fetch(DATA_URL);
  if (!res.ok) throw new Error(`Could not load ${DATA_URL} (HTTP ${res.status})`);
  return prepare(await res.json());
}

export function prepare(raw) {
  if (!raw || !Array.isArray(raw.leads)) throw new Error("Lead data is missing its leads list");
  const leads = raw.leads.map((lead, i) => ({ ...lead, rank: i + 1 }));
  return {
    asOf: raw.as_of,
    territory: raw.territory || [...new Set(leads.map((l) => l.state))].sort(),
    windowMonths: raw.window_months,
    triYear: raw.tri_reporting_year,
    counts: raw.counts || {},
    leads,
    industries: [...new Set(leads.map((l) => l.industry))].sort(),
  };
}

export function priorityLeads(leads) {
  return leads.filter((l) => l.tier === "Hot" && l.outreach_eligible).slice(0, PRIORITY_SIZE);
}

export function matchesSignal(lead, signalId) {
  if (!signalId) return true;
  const signal = SIGNALS.find((s) => s.id === signalId);
  return signal ? signal.test(lead) : true;
}

export function matchesQuery(lead, query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return true;
  if (lead.name.toLowerCase().includes(q)) return true;
  if ((lead.city || "").toLowerCase().includes(q)) return true;
  if ((lead.zip || "").includes(q)) return true;
  return lead.inspections.some((i) => (i.citations || []).some((c) =>
    (c.standard || "").toLowerCase().includes(q) || (c.title || "").toLowerCase().includes(q)));
}

export function applyFilters(leads, { state, industry, signal, readyOnly, query } = {}) {
  return leads.filter((l) =>
    (!state || l.state === state)
    && (!industry || l.industry === industry)
    && (!readyOnly || l.outreach_eligible)
    && matchesSignal(l, signal)
    && matchesQuery(l, query));
}

const byRank = (a, b) => a.rank - b.rank;
const SORTERS = {
  score: byRank,
  evidence: (a, b) => {
    if (a.evidence_date === b.evidence_date) return byRank(a, b);
    if (!a.evidence_date) return 1;
    if (!b.evidence_date) return -1;
    return a.evidence_date < b.evidence_date ? 1 : -1;
  },
  name: (a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || byRank(a, b),
};

export function sortLeads(leads, sortId) {
  return [...leads].sort(SORTERS[sortId] || byRank);
}

export function signalCounts(leads) {
  return Object.fromEntries(SIGNALS.map((s) => [s.id, leads.filter(s.test).length]));
}

export function folderLeads(leads, folderId, stageOf) {
  switch (folderId) {
    case "priority": return priorityLeads(leads);
    case "all": return leads;
    case "hot": return leads.filter((l) => l.tier === "Hot");
    case "warm": return leads.filter((l) => l.tier === "Warm");
    case "hold":
    case "reached":
    case "contact":
    case "audit": return leads.filter((l) => stageOf(l) === folderId);
    default: return [];
  }
}

export function folderCounts(leads, stageOf) {
  return Object.fromEntries(FOLDERS.map((f) => [f.id, folderLeads(leads, f.id, stageOf).length]));
}

export function leadStatus(lead) {
  if (lead.hold === "contested citation") {
    return "On hold: contested citation. A person should review the record before anyone contacts this plant. "
      + "A contested citation is not a sales talking point.";
  }
  if (lead.hold) return `On hold: ${lead.hold}. A person should review the record before anyone contacts this plant.`;
  if (lead.outreach_eligible) return "Ready for outreach. Check the public OSHA record before contacting anyone.";
  return "Not outreach-ready: the headcount or industry code is uncertain, or the facility match needs review.";
}
