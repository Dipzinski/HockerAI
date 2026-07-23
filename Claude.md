# Hocker North America — AI Sales Pipeline Project

**Company:** Hocker North America (industrial dust collection systems)
**Project goal:** Use AI agents to increase sales efficiency — find more of the right leads, qualify them faster, and get personalized outreach in front of the right decision-makers sooner, without sacrificing accuracy or reputation.
**Status:** v0.1 — 3 subagents drafted, needs ICP/CRM decisions before going live
**Owner:** [name]

---

## 1. Why this project exists

Hocker's sales process today likely relies on manual prospecting, generic outreach, and inconsistent follow-up. The bottleneck isn't a lack of potential customers — every facility running sanding, grinding, cutting, blending, or milling operations is a candidate. The bottleneck is **research time per lead**. This project uses AI agents to compress the research and drafting work (industry fit, compliance signals, growth signals, decision-maker ID, message drafting) from hours down to minutes per lead, so the humans on the team spend their time on relationship-building and closing, not googling OSHA records.

**Success looks like:**
- More qualified leads entering the pipeline per week
- Higher connect/reply rate on outreach because messages reference something real and specific (a citation, an expansion, a hiring signal)
- Sales team trusts the pipeline enough to act on it without re-verifying everything from scratch
- No reputational or ethical missteps (e.g., outreach to a company mid-lawsuit or facility closure)

---

## 2. The pipeline

Three subagents, each with a single job, chained in sequence:

```
┌─────────────────────┐     ┌──────────────────────────────┐     ┌───────────────────────────┐
│   Lead Generation    │ ──▶ │ Lead Enrichment &             │ ──▶ │ LinkedIn Outreach          │
│   Agent               │     │ Qualification Agent           │     │ Drafting Agent              │
│                       │     │                                │     │                             │
│ Finds new candidate   │     │ Researches compliance/growth  │     │ Drafts connection request + │
│ companies from scratch│     │ signals, scores ICP fit,       │     │ follow-up sequence for       │
│ across an industry/   │     │ IDs decision-maker, produces   │     │ Hot/Warm leads. Refuses to   │
│ region                │     │ enriched CRM-ready record       │     │ draft for Archive leads      │
└─────────────────────┘     └──────────────────────────────┘     └───────────────────────────┘
   lead-generation.md          lead-enrichment-qualification.md      linkedin-outreach-drafting.md
```

**Handoff rule between stages:**
- Lead Gen → Enrichment: all discovered leads pass through, regardless of initial score (enrichment does the deeper research that determines the real score)
- Enrichment → Outreach: only leads with `icp_fit_score >= 3` **and** `enrichment_confidence != Low` pass automatically. Everything else routes to manual review.
- Outreach agent has final veto power via the Archive classification — a high numeric score never overrides an Archive flag (financial distress, active litigation, facility closure, etc.)

**Human-in-the-loop checkpoint:** every message the Outreach agent produces is a **draft only**. Nothing sends automatically. A human reviews and sends.

---

## 3. Single source of truth: ICP

**This is now unified.** The ICP, buying signals, scoring rubric, classification thresholds, and Archive-override rules live in one place: `.claude/skills/icp-scoring-rubric/SKILL.md`. All three agents (`lead-generation`, `lead-enrichment-qualification`, `linkedin-outreach-drafting`) read that file instead of defining or restating the ICP themselves — if you need to revise the ICP, edit it there only.

The rubric there is still a v0.1 placeholder pending your uncle's confirmation of the real criteria/weighting (see Section 5, open items). It currently defines:

**Target industries, in priority order:**
1. Woodworking / cabinetry / furniture manufacturing
2. Metal fabrication, grinding, welding, finishing
3. Cement, aggregate, mineral processing
4. Food processing (flour, sugar, grain handling)
5. Pharmaceutical / nutraceutical manufacturing
6. Plastics, resin, composite processing
7. Foundries and casting operations

**Buying signals that raise priority:**
- OSHA/EPA citation related to combustible dust, air quality, or particulate exposure
- Recent facility expansion, new construction, or building permit
- Job postings for EHS Manager, Safety Coordinator, Environmental Compliance roles
- New plant manager / operations VP / EHS director hired in last 6 months
- Facility size: 20–500 employees
- NAICS 321 (wood products), 332 (fabricated metal), 333 (machinery), 327 (cement/mineral), 311 (food)

**Scoring rubric (0–11):** industry fit (0–3), compliance/safety trigger (0–3), growth/hiring signal (0–3), facility size fit (0–2) → Hot 8–11 / Warm 5–7 / Archive 0–4, with Archive always overriding score (active litigation, wrongful-death, facility closure, or financial distress requiring verification). Full detail, including the `enrichment_confidence` field and the Enrichment→Outreach handoff rule, is in the skill file — not duplicated here.

---

## 4. Guardrails that apply across the whole pipeline

These aren't optional and shouldn't be loosened for volume:

- **Never fabricate** a compliance record, growth signal, decision-maker name, or headcount. If it can't be verified from a real source, omit it and flag low confidence — don't guess.
- **Always cite sources** (URL or database) for any signal used in scoring or outreach.
- **Don't overstate ambiguous data as clean or confirmed.** An unsearchable database is not the same as a clean record. An undated incident is not a current one. A water-quality lawsuit is not a dust-safety signal.
- **Archive overrides score.** Active litigation, wrongful-death cases, facility demolition/closure, or financial distress requiring a status check all take precedence over a numeric ICP fit score.
- **Draft, don't send.** Outreach is always a human-approved final step.

---

## 5. What's decided vs. still open

**Decided:**
- Three-stage pipeline structure and handoff logic
- Output schemas for each stage (see individual agent files)
- Hot / Warm / Archive classification and what each unlocks

**Open — needs your uncle's input before this goes live:**
- [ ] Confirm real ICP criteria and weighting (Section 3 above) — replace placeholder
- [ ] Which CRM this integrates with, and field-level mapping
- [ ] Where OSHA/EPA compliance data gets sourced from (public DB vs. paid tool) — state-plan states (like Cal/OSHA) have known coverage gaps that need a workaround
- [ ] Threshold/process for automatic hand-off vs. manual review at each stage
- [ ] Who owns final human review and send for outreach drafts
- [ ] Standing policy for financial-distress companies (always hold? auto-archive above a severity threshold?)
- [ ] Message cadence/timing for the Hot-lead follow-up sequence
- [ ] Brand voice/tone guide — current drafts are functional but generic

---

## 6. How to measure "more efficient and more sales"

Suggested metrics to track once live (adjust with your uncle):

| Metric | What it tells you |
|---|---|
| Leads generated per week | Volume through the top of funnel |
| % of leads reaching Hot classification | Quality of sourcing + enrichment accuracy |
| Time from raw lead → drafted outreach | Efficiency gain vs. manual process |
| Connection request acceptance rate | Whether personalization is landing |
| Reply rate on Hot vs. Warm sequences | Whether hook prioritization (Section 4 of outreach agent) is working |
| Leads correctly archived (no wasted/harmful outreach) | Guardrails doing their job |
| Meetings booked / deals sourced from this pipeline | The actual sales impact |

---

## 7. File map

- `.claude/skills/icp-scoring-rubric/SKILL.md` — **single source of truth**: ICP, buying signals, 0–11 scoring rubric, classification thresholds, Archive-override rules
- `lead-generation.md` — Stage 1: discovers new candidate companies, initial scoring
- `lead-enrichment-qualification.md` — Stage 2: deep research, ICP scoring, decision-maker ID
- `linkedin-outreach-drafting.md` — Stage 3: drafts personalized outreach, enforces Archive refusals
- `README.md` (this file) — project overview, pipeline structure, cross-agent guardrails, open decisions