// Small lead records shaped like docs/data/leads.json entries.

export const AS_OF = "2026-11-18";

export function makeLead(overrides = {}) {
  const base = {
    id: "a1",
    name: "Nichols Portland, Inc.",
    city: "Wyandotte",
    state: "MI",
    zip: "48192",
    lat: 42.2,
    lon: -83.1,
    industry: "Metal fabrication & machinery",
    naics: "333618",
    employees: 50,
    score: { industry: 3, dust: 3, recency: 3, size: 2, tri_air: 0, total: 11 },
    tri_air_signal: null,
    tier: "Hot",
    confidence: "High",
    hold: null,
    facility_match_review_required: false,
    outreach_eligible: true,
    dust_reason: "dust-specific citation",
    evidence_date: "2026-10-15",
    inspections_since_2019: 1,
    inspections: [
      {
        inspection_id: "348981994",
        opened: "2026-06-08",
        dust_program: null,
        url: "https://www.osha.gov/ords/imis/establishment.inspection_detail?id=348981994.015",
        citations: [
          {
            standard: "Mich. R 325.52007",
            title: "MIOSHA Part 520 Ventilation Control",
            category: "dust",
            type: "Other-than-serious",
            issued: "2026-10-15",
            penalty_usd: 0,
            under_contest: false,
          },
        ],
        other_citations: 0,
      },
    ],
  };
  return { ...base, ...overrides };
}

export function programLead() {
  return makeLead({
    id: "p1",
    name: "Cor-met Inc",
    city: "Brighton",
    score: { industry: 3, dust: 2, recency: 2, size: 1, tri_air: 1, total: 9 },
    employees: 12,
    dust_reason: "dust-related citation or dust-program inspection",
    evidence_date: "2025-03-02",
    tri_air_signal: {
      release_lbs: 20.0,
      chemicals: [
        "Chromium  and Chromium Compounds(except for chromite ore mined in the Transvaal Region)",
        "Nickel compounds",
      ],
      forms: 2,
      reporting_year: 2024,
    },
    inspections: [
      {
        inspection_id: "1",
        opened: "2024-01-10",
        dust_program: null,
        url: "https://example.test/1",
        citations: [
          { standard: "1910.22(a)(1)", title: "Housekeeping", category: "adjacent",
            type: "Serious", issued: "2024-02-01", penalty_usd: 1200, under_contest: false },
        ],
        other_citations: 2,
      },
      {
        inspection_id: "2",
        opened: "2025-03-02",
        dust_program: "Combustible Dust NEP",
        url: "https://example.test/2",
        citations: [],
        other_citations: 0,
      },
    ],
  });
}

export function warmSeriousLead() {
  return makeLead({
    id: "w1",
    name: "Plain Plastics",
    industry: "Plastics, resins & composites",
    naics: "326199",
    employees: null,
    score: { industry: 1, dust: 1, recency: 0, size: 0, tri_air: 0, total: 2 },
    tier: "Warm",
    dust_reason: "serious citation, not dust-related",
    evidence_date: null,
    inspections: [],
  });
}
