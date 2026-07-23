---
name: icp-scoring-rubric
description: Single source of truth for Hocker North America's Ideal Customer Profile, buying signals, scoring rubric, classification thresholds, and Archive-override rules. Read this file before scoring, classifying, or drafting outreach for any lead — lead-generation, lead-enrichment-qualification, and linkedin-outreach-drafting all defer to it instead of their own local definitions.
---

# Hocker North America — ICP, Scoring Rubric & Classification

**Status:** v0.1 placeholder — pending confirmation of real criteria/weighting from Hocker leadership (see `Claude.md` Section 5, open items). Until confirmed, treat this as the working draft all three agents build against.

This file is the **only** place the ICP, scoring criteria, and classification thresholds are defined. If you are `lead-generation`, `lead-enrichment-qualification`, or `linkedin-outreach-drafting`, read this file at the start of your workflow instead of relying on any ICP text embedded in your own agent instructions — if the two ever disagree, this file wins.

---

## 1. Target industries (priority order)

1. Woodworking / cabinetry / furniture manufacturing
2. Metal fabrication, grinding, welding, finishing
3. Cement, aggregate, mineral processing
4. Food processing (flour, sugar, grain handling)
5. Pharmaceutical / nutraceutical manufacturing
6. Plastics, resin, composite processing
7. Foundries and casting operations

**NAICS ranges:** 321 (wood products), 332 (fabricated metal), 333 (machinery), 327 (cement/mineral), 311 (food)

**Facility size:** 20–500 employees at the facility (adjust only if the user states otherwise for a specific engagement)

## 2. Buying signals

Any of the following raises priority:

- OSHA citation or EPA violation related to combustible dust, air quality, or particulate exposure
- Recent facility expansion, new construction, or building permit filed
- Job postings for EHS Manager, Safety Coordinator, Environmental Compliance, or plant-expansion roles
- New plant manager, operations VP, or EHS director hired in the last 6 months

## 3. Scoring rubric (0–11 scale)

Score every lead on these four criteria. Each is scored 0 to the max shown; the total is out of 11.

| Criterion | Max points | What earns full points |
|---|---|---|
| Industry fit | 0–3 | Confirmed NAICS code or clear process description (e.g. "CNC wood router," "abrasive blasting") matching Section 1 |
| Compliance/safety trigger | 0–3 | Verified OSHA/EPA citation or violation specifically tied to combustible dust, particulate, or air-quality exposure (not an unrelated safety/water/environmental matter) |
| Growth/hiring signal | 0–3 | Verified recent expansion, new facility, relevant hiring, or new EHS/plant leadership hire |
| Facility size fit | 0–2 | Confirmed headcount within the 20–500 target range at the specific facility (not company-wide) |

**Total: 0–11.**

This is the single scoring scale used across the pipeline — it replaces any other scale (e.g. a 1–5 score) that may appear in older agent drafts. `icp_fit_score` should always be reported as `x/11`.

## 4. Classification thresholds

| Score | Class | Meaning |
|---|---|---|
| 8–11 | 🔥 **Hot** | Route to sales same day / full outreach sequence |
| 5–7 | 🟡 **Warm** | Add to nurture queue / lighter-touch outreach only |
| 0–4 | ⛔ **Archive** | Log only, no outreach |

## 5. Enrichment confidence (separate from score)

`enrichment_confidence` (High / Medium / Low) measures how well-supported the data behind the score is — it is **not** part of the numeric score and does not get averaged into it. A high score built on unverifiable or partial data must still carry `Low` confidence.

- **High** — every signal used in scoring has a cited, verifiable source
- **Medium** — most signals verified; at least one is inferred or from a lower-confidence source
- **Low** — key signals (industry fit, compliance, or growth) could not be verified from a real source

See Section 6 for how score and confidence combine to gate the handoff to outreach.

## 6. Handoff rule (Enrichment → Outreach)

Only leads with `icp_fit_score >= 3` **and** `enrichment_confidence != Low` pass automatically from enrichment to outreach drafting. Everything else routes to manual review. (Note: this threshold is intentionally lower than the Warm floor of 5 — it lets borderline/low-data leads reach a human reviewer rather than being silently dropped. It is not a green light to draft outreach automatically.)

## 7. Archive overrides score — always

A numeric score, even 11/11, **never** overrides an Archive condition. If any of the following is true, classify as Archive and do not draft outreach, regardless of score:

- Active litigation or wrongful-death case
- Facility demolition, closure, or shutdown in progress
- Financial distress requiring a status check (e.g. recent bankruptcy emergence, discontinued permits) — hold for manual verification rather than auto-archiving or auto-sending
- Any other finding that would make outreach reputationally or ethically inappropriate

When in doubt, hold for manual review rather than guessing at classification either way.

## 8. Guardrails (apply to every stage that touches scoring or outreach)

- **Never fabricate** a compliance record, growth signal, decision-maker name, or headcount. If it can't be verified from a real source, omit it and lower confidence — don't guess.
- **Always cite sources** (URL or database name) for every signal used in scoring or outreach.
- **Don't overstate ambiguous data as clean or confirmed.** An unsearchable database (e.g. a state-plan OSHA state like Cal/OSHA) is not the same as a verified clean record — say so explicitly rather than writing "no issues found."
- **Don't conflate signal types.** A water-quality or Clean Water Act lawsuit is not a dust-safety signal. A generic housekeeping/fall-protection citation is dust-adjacent, not dust-specific — phrase it accordingly, don't inflate it.
- **Don't treat undated incidents as current.** If a compliance or safety record has no verifiable date, exclude it from both scoring and outreach rather than assuming it's recent.
- **Don't cite unresolved headcount as fact.** If a company-size figure is company-wide or third-party-estimated rather than confirmed at the specific facility, speak to scale generally ("a facility of your size") or omit it — don't state a specific number.

---

## Change control

This file is the only place any agent should look for ICP definition, scoring criteria, classification thresholds, or Archive-override rules. If the real ICP is confirmed (see `Claude.md` open items), update it here only — do not re-add ICP definitions to individual agent files.
