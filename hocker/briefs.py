"""Write a lead brief and a draft email for top Hot leads with Claude, then verify them.

Claude sees only one facility's OSHA records (as JSON) and must answer in a fixed
JSON schema (structured output). Every draft goes through verify.check(); a failing
draft gets one retry with the list of problems, and a draft that still fails is
marked for a person to fix. Nothing is sent to anyone: a rep reads, edits, and sends.
"""
from __future__ import annotations

import json
import os
from collections import Counter
from typing import List

from pydantic import BaseModel

from . import config, verify

BRIEFS_DIR = config.OUTPUT_DIR / "briefs"
PRICE_PER_MTOK = {"claude-opus-5-5": (4.00, 20.00)}  # input, output (USD)

SYSTEM_PROMPT = """You write sales research for Hocker North America, which designs and installs \
industrial dust collection and extraction systems. A sales rep reads your brief, edits the email, \
and decides whether to send it; nothing you write is sent automatically.

You get one facility's public OSHA inspection records as JSON: the dust-related citations in full, and a count of unrelated citations (other_citations). Use only those facts.
- Every talking point cites the inspection_id values it comes from.
- Copy numbers (dates, dollar amounts, standards, headcounts, counts) exactly as they appear in the \
facts. Don't compute new numbers such as totals, averages, or percentages. If a number isn't in the \
facts, leave it out.
- An OSHA citation is an allegation until it is final: say the facility was "cited", not that it \
"violated" or "failed".
- Don't mention injuries, deaths, lawsuits, or anything that isn't in the facts.
- Don't promise compliance or results, and don't mention prices.
- The email goes to the role in suggested_contact_role, with no personal name. Under 150 words, \
plain and specific, at most one reference to the public OSHA record, no dollar amounts, no fear \
tactics. End with the two lines "[Rep name]" and "Hocker North America".
- In why_now, explain in 2-3 sentences why this facility is worth a call this month."""


class TalkingPoint(BaseModel):
    point: str
    inspection_ids: List[str]


class Brief(BaseModel):
    why_now: str
    talking_points: List[TalkingPoint]
    suggested_contact_role: str
    email_subject: str
    email_body: str


BRIEF_SCHEMA = {
    "type": "object",
    "properties": {
        "why_now": {"type": "string"},
        "talking_points": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "point": {"type": "string"},
                    "inspection_ids": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["point", "inspection_ids"],
                "additionalProperties": False,
            },
        },
        "suggested_contact_role": {"type": "string"},
        "email_subject": {"type": "string"},
        "email_body": {"type": "string"},
    },
    "required": ["why_now", "talking_points", "suggested_contact_role", "email_subject", "email_body"],
    "additionalProperties": False,
}


def facts_for(lead: dict, as_of: str) -> dict:
    """The only information Claude gets about a facility."""
    return {
        "as_of": as_of,
        "facility": {
            "name": lead["name"], "city": lead["city"], "state": lead["state"],
            "industry": lead["industry"], "naics": lead["naics"],
            "employees_at_site": lead["employees"],
        },
        "lead_score": {**lead["score"], "tier": lead["tier"], "out_of": 11,
                       "window_months": config.EVIDENCE_WINDOW_MONTHS},
        "inspections": [
            {
                "inspection_id": i["inspection_id"], "opened": i["opened"],
                "dust_program": i["dust_program"],
                "citations": [{k: c[k] for k in ("standard", "title", "category", "type", "issued",
                                                 "penalty_usd")} for c in i["citations"]],
                "other_citations": i["other_citations"],
            }
            for i in lead["inspections"]
        ],
    }


def _request(client, messages: list):
    return client.beta.messages.create(
        model=config.BRIEF_MODEL,
        max_tokens=16000,
        system=SYSTEM_PROMPT,
        messages=messages,
        output_config={"effort": config.BRIEF_EFFORT,
                       "format": {"type": "json_schema", "schema": BRIEF_SCHEMA}},
        # If a safety classifier declines, the API retries on a fallback model in the same call.
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
    )


def _parse(response) -> Brief:
    if response.stop_reason == "refusal":
        raise ValueError("model declined the request")
    text = next(b.text for b in response.content if b.type == "text")
    return Brief.model_validate_json(text)


def write_brief(client, lead: dict, as_of: str) -> dict:
    """Draft, verify, and retry once with the verifier's feedback."""
    facts = facts_for(lead, as_of)
    messages = [{"role": "user", "content": "Facility records:\n" + json.dumps(facts, indent=1)}]
    attempts, usage = [], Counter()
    for attempt in (1, 2):
        response = _request(client, messages)
        usage["input_tokens"] += response.usage.input_tokens
        usage["output_tokens"] += response.usage.output_tokens
        try:
            draft = _parse(response).model_dump()
            result = verify.check(draft, facts)
        except (ValueError, StopIteration) as e:  # refusal, no text, or schema mismatch
            draft, result = None, verify.Result(False, [f"unusable response: {e}"])
        attempts.append({"attempt": attempt, "passed": result.passed, "issues": result.issues})
        if result.passed:
            break
        messages += [
            {"role": "assistant", "content": response.content},
            {"role": "user", "content": "A checker found these problems:\n- " + "\n- ".join(result.issues)
             + "\nRewrite the whole response so it fixes them and still follows every rule."},
        ]
    return {
        "facility_id": lead["id"], "name": lead["name"], "model": config.BRIEF_MODEL,
        "status": "verified" if result.passed else "needs human edit",
        "attempts": attempts, "usage": dict(usage), "facts": facts, "brief": draft,
    }


def _markdown(rec: dict) -> str:
    b, f = rec["brief"], rec["facts"]["facility"]
    lines = [f"# {rec['name']} ({f['city']}, {f['state']})", "",
             f"Status: **{rec['status']}** after {len(rec['attempts'])} attempt(s) · model {rec['model']}", ""]
    if b:
        lines += ["## Why now", b["why_now"], "", "## Talking points"]
        lines += [f"- {tp['point']} (inspection {', '.join(tp['inspection_ids'])})" for tp in b["talking_points"]]
        lines += ["", f"## Draft email to: {b['suggested_contact_role']}", f"**Subject:** {b['email_subject']}",
                  "", b["email_body"]]
    for a in rec["attempts"]:
        if a["issues"]:
            lines += ["", f"Checker issues on attempt {a['attempt']}:"] + [f"- {i}" for i in a["issues"]]
    return "\n".join(lines) + "\n"


def run(limit: int | None = None, dry_run: bool = False, client=None) -> dict:
    data = json.loads((config.DOCS_DATA_DIR / "leads.json").read_text())
    leads = [l for l in data["leads"] if l["tier"] == "Hot" and l["outreach_eligible"]]
    leads = leads[: limit or config.BRIEF_LIMIT]
    BRIEFS_DIR.mkdir(parents=True, exist_ok=True)

    if dry_run:
        for lead in leads:
            (BRIEFS_DIR / f"{lead['id']}.facts.json").write_text(
                json.dumps(facts_for(lead, data["as_of"]), indent=1))
        print(f"Wrote prompt inputs for {len(leads)} leads to {BRIEFS_DIR} (no API calls).")
        return {"dry_run": True, "leads": len(leads)}

    if client is None:
        if not os.environ.get("ANTHROPIC_API_KEY"):
            raise SystemExit("Set ANTHROPIC_API_KEY first (see README: 'AI briefs'). "
                             "Use --dry-run to see the prompt inputs without calling the API.")
        import anthropic
        client = anthropic.Anthropic()

    records = []
    for n, lead in enumerate(leads, 1):
        rec = write_brief(client, lead, data["as_of"])
        records.append(rec)
        (BRIEFS_DIR / f"{lead['id']}.json").write_text(json.dumps(rec, indent=1))
        (BRIEFS_DIR / f"{lead['id']}.md").write_text(_markdown(rec))
        print(f"  {n:>2}. {rec['status']:<16} {lead['name']}")

    issue_types = Counter(verify.kind(i) for r in records for a in r["attempts"] for i in a["issues"])
    tokens_in = sum(r["usage"]["input_tokens"] for r in records)
    tokens_out = sum(r["usage"]["output_tokens"] for r in records)
    price_in, price_out = PRICE_PER_MTOK.get(config.BRIEF_MODEL, (0, 0))
    summary = {
        "as_of": data["as_of"], "model": config.BRIEF_MODEL, "briefs": len(records),
        "passed_first_try": sum(r["attempts"][0]["passed"] for r in records),
        "fixed_on_retry": sum(len(r["attempts"]) == 2 and r["attempts"][1]["passed"] for r in records),
        "needs_human_edit": sum(r["status"] != "verified" for r in records),
        "issues_caught": sum(len(a["issues"]) for r in records for a in r["attempts"]),
        "issue_kinds": dict(issue_types),
        "input_tokens": tokens_in, "output_tokens": tokens_out,
        "cost_usd": round(tokens_in / 1e6 * price_in + tokens_out / 1e6 * price_out, 2),
    }
    (BRIEFS_DIR / "summary.json").write_text(json.dumps(summary, indent=1))
    (config.DOCS_DATA_DIR / "briefs.json").write_text(json.dumps(
        {r["facility_id"]: {"status": r["status"], "attempts": len(r["attempts"]), **(r["brief"] or {})}
         for r in records}, separators=(",", ":")))
    print(json.dumps(summary, indent=1))
    return summary
