// Explains a lead's 0–12 score factor by factor.
// Mirrors hocker/rubric.py and the size bands in hocker/config.py.

export const MAX_SCORE = 12;
export const HOT_MIN = 8;
export const WARM_MIN = 5;
export const SIZE_CORE = [20, 500];
export const SIZE_EDGE = [10, 1000];

export const FACTORS = [
  { key: "industry", label: "Industry fit", short: "Industry", max: 3,
    rule: "Woodworking and metal fabrication earn 3. Cement, glass, minerals and food earn 2. Plastics, pharma and foundries earn 1." },
  { key: "dust", label: "Dust evidence", short: "Dust", max: 3,
    rule: "3 for a dust-specific citation, 2 for a dust-related citation or dust-program inspection, 1 for any other serious citation. Last 36 months." },
  { key: "recency", label: "Recency", short: "Recent", max: 3,
    rule: "Dust evidence within 12 months earns 3, within 24 months 2, within 36 months 1." },
  { key: "size", label: "Site size", short: "Size", max: 2,
    rule: "20–500 employees at the site earns 2. 10–19 or 501–1,000 earns 1." },
  { key: "tri_air", label: "EPA air releases", short: "Air", max: 1,
    rule: "1 point when the site reported metal air releases to EPA TRI. Reporting is not a violation." },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const RECENCY_WINDOW = { 3: 12, 2: 24, 1: 36 };

export function formatDate(iso) {
  if (!iso) return "no date";
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export function cleanChemical(name) {
  return name.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
}

const fmtNumber = (n) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });

function citationsOf(lead) {
  return (lead.inspections || []).flatMap((insp) => (insp.citations || []).map((c) => ({ ...c, insp })));
}

function newestFirst(items) {
  return [...items].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

// In a dust-program inspection, OSHA cites dust hazards under general rules such as
// hazard communication, so the program is named to explain why the citation counts.
function citationText(c) {
  const program = c.insp.dust_program ? ` during a ${c.insp.dust_program} inspection` : "";
  return `${c.title} (${c.standard}), issued ${formatDate(c.issued)}${program}`;
}

function dustEvidenceItems(lead) {
  const level = lead.score.dust;
  const cites = citationsOf(lead);
  if (level === 3) {
    return cites.filter((c) => c.category === "dust")
      .map((c) => ({ date: c.issued, text: citationText(c) }));
  }
  if (level === 2) {
    const adjacent = cites.filter((c) => c.category === "adjacent")
      .map((c) => ({ date: c.issued, text: citationText(c) }));
    const programs = (lead.inspections || []).filter((i) => i.dust_program)
      .map((i) => ({ date: i.opened, text: `${i.dust_program} inspection, opened ${formatDate(i.opened)}` }));
    return [...adjacent, ...programs];
  }
  return [];
}

function dustReason(lead) {
  const level = lead.score.dust;
  if (level === 1) return "A serious OSHA citation that is not dust-related.";
  if (level === 0) return "No qualifying citations in the last 36 months.";
  const items = newestFirst(dustEvidenceItems(lead));
  const match = items.find((i) => i.date === lead.evidence_date) || items[0];
  return match ? `${match.text}.` : `${lead.dust_reason}, ${formatDate(lead.evidence_date)}.`;
}

function recencyReason(lead, asOf) {
  if (!lead.evidence_date) return "There is no dust-related evidence, so recency earns nothing.";
  const window = RECENCY_WINDOW[lead.score.recency];
  const when = `Dust evidence dated ${formatDate(lead.evidence_date)}`;
  return window
    ? `${when}, within ${window} months of the ${formatDate(asOf)} data cut.`
    : `${when}, older than 36 months.`;
}

function sizeReason(lead) {
  const n = lead.employees;
  if (n == null) return "Site headcount isn't on record.";
  const people = `${fmtNumber(n)} employees at the site`;
  if (lead.score.size === 2) return `${people}. 20–500 is the core range.`;
  if (lead.score.size === 1) return `${people}, just outside the 20–500 core range.`;
  return `${people}, outside the 10–1,000 range.`;
}

function triReason(lead) {
  const tri = lead.tri_air_signal;
  if (!tri) return "No 2024 EPA TRI metal air release matched to this site.";
  const chems = tri.chemicals.map(cleanChemical).join(", ");
  return `Reported ${fmtNumber(tri.release_lbs)} lb of metal air releases to EPA TRI for ${tri.reporting_year}: ${chems}.`;
}

function industryReason(lead) {
  return `${lead.industry} (NAICS ${lead.naics}).`;
}

const REASONS = {
  industry: (lead) => industryReason(lead),
  dust: (lead) => dustReason(lead),
  recency: (lead, asOf) => recencyReason(lead, asOf),
  size: (lead) => sizeReason(lead),
  tri_air: (lead) => triReason(lead),
};

export function breakdown(lead, asOf) {
  return FACTORS.map((f) => ({
    key: f.key,
    label: f.label,
    short: f.short,
    max: f.max,
    rule: f.rule,
    points: lead.score[f.key] || 0,
    reason: REASONS[f.key](lead, asOf),
  }));
}

export function whyLabel(lead) {
  return `Why it's ${lead.tier}`;
}

export function tierLine(lead) {
  return `${lead.score.total} of ${MAX_SCORE} points. Hot leads score ${HOT_MIN}–${MAX_SCORE} and have dust evidence; Warm leads score ${WARM_MIN}–${HOT_MIN - 1}.`;
}
