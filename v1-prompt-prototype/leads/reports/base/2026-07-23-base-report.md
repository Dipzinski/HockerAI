# Base Sweep Report — 2026-07-23

**Note on scope:** This batch is a **smoke test of the pipeline plumbing** (verifying CSV write + report generation end-to-end), not a full base sweep. It covers 5 leads, all in a single industry (woodworking/cabinetry, NAICS 337xxx/321918) and a single state (Ohio), rather than the normal wide pass across all 7 ICP industries. Treat volume and industry mix as non-representative of a standard base sweep.

---

## 1. Summary

- **Leads processed this run:** 5
- **By class:** 🔥 Hot: 0 | 🟡 Warm: 5 | ⛔ Archive: 0
- **Re-signals:** N/A (base sweep — re-signal tracking applies to daily scans only)
- **No leads reached Hot in this batch.** All 5 are Warm (score range 5–7/11), driven by real but non-dust-specific compliance citations (machine guarding / LOTO) combined with partial growth signals. None met the Archive-override conditions (no active litigation, closure, or financial distress found for any of the 5), but **one lead (Appalachian Wood Floors, Inc.) is flagged for mandatory manual review before any outreach** due to a severe injury pattern and active OSHA Severe Violator Enforcement Program (SVEP) status — see Section 3.
- **Confidence:** All 5 leads carry `enrichment_confidence: Medium` — OSHA compliance data is verified and cited for every lead, but facility-level headcount is unconfirmed or inconsistent across sources for all 5, which caps confidence below High per the rubric's confidence definition.

---

## 2. Reach out today

**None.** No lead in this batch reached Hot classification (8–11/11), so there is nothing on the automatic "reach out today" list this run. All 5 Warm leads below are eligible for lighter-touch/nurture-queue outreach per the rubric, and pass the Enrichment → Outreach handoff rule (`icp_fit_score >= 3` and `enrichment_confidence != Low`) — except **Appalachian Wood Floors**, which requires manual review first regardless of score (see below).

---

## 3. Everything else this run

| Company | Class | ICP Fit Score | Enrichment Confidence | Reason / Notes |
|---|---|---|---|---|
| Sauder Woodworking Co. | 🟡 Warm | 6/11 | Medium | Closed LOTO citation (not dust-specific) + verified hiring/new-plant growth signal; company-wide size (~2,000) exceeds target range, facility-level headcount unconfirmed. Decision-maker corrected during enrichment: current CEO is Nolan Pike, not Kevin Sauder (retired 10/21/2024). |
| Riceland Cabinet Corporation | 🟡 Warm | 6/11 | Medium | Still-open WILLFUL machine-guarding citation ($82,512, not dust-specific) + routine hiring only; no decision-maker identified. |
| Mullet Cabinet | 🟡 Warm | 5/11 | Medium | Closed serious machine-guarding citation (not dust-specific) + job postings only, no in-window expansion; company rebranded as Mullwoods in 2024 — decision-maker updated from founder-era owner (Dean Mullet, per BBB) to current President Vince Mullet. |
| Appalachian Wood Floors, Inc. (dba Graf Custom Hardwood) | 🟡 Warm | 5/11 | Medium | Not an Archive per the rubric's formal triggers (no litigation/closure/financial distress found), but flagged for **mandatory manual review before any outreach**: SVEP-listed after a May 2024 rip-saw incident causing a worker's partial arm amputation, plus a severe repeat-violation pattern ($255,528 in penalties, 10 OH inspections since 2021). Ethically sensitive per the rubric's catch-all — a human must sign off before this lead goes to the outreach agent. |
| Daniel's Amish Collection, LLC | 🟡 Warm | 5/11 | Medium | Closed serious LOTO/machine-guarding citations (not dust-specific, >2 yrs old) + one current job posting; no decision-maker identified. |

---

## 4. CSV reference

Full enriched records for all 5 leads are in `/leads/master_leads.csv` (`lead_id`s: `sauder-woodworking-co-archbold-oh`, `riceland-cabinet-corporation-wooster-oh`, `mullet-cabinet-millersburg-oh`, `appalachian-wood-floors-inc-portsmouth-oh`, `daniels-amish-collection-llc-dundee-oh`). Outreach drafts for any specific lead can be requested from the `outreach-drafting` agent by `lead_id` or company name — except **Appalachian Wood Floors, Inc.**, which should not be sent to the outreach agent until a human has completed the manual review flagged above.
