# v1: prompt-only prototype (July 2026)

The first version of HockerAI: four Claude Code subagents defined in Markdown, sharing one scoring rubric.

| File | What it was |
|---|---|
| `agents/lead-generation.md` | Wide web sweep for prospects across 7 industries |
| `agents/daily-lead-scan.md` | Planned daily delta scan (never scheduled) |
| `agents/lead-enrichment-qualification.md` | Research, 0-11 scoring, confidence, CSV and report writing |
| `agents/outreach-drafting.md` | On-demand email and LinkedIn drafts, human approval required |
| `icp-scoring-rubric.md` | The shared ICP, rubric, tiers, and guardrails |
| `PROJECT_SPEC.md`, `SETUP_GUIDE.md` | The v1 project spec and setup guide for non-technical users |
| `leads/` | Output of the one smoke test (5 Ohio woodworking companies, 2026-07-23) |

Why it was rebuilt: the model did the searching, scoring, and file writing, so results couldn't be reproduced or tested, the guardrails were instructions rather than checks, and the daily scan never ran. v2 (the rest of this repo) keeps the rubric and guardrails and moves them into code. See the main README.
