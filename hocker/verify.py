"""Check a Claude-written brief against the facility's records before a person sees it.

The model is told to use only the facts it was given; this module checks that it did.
A draft fails if it
  - cites an inspection ID that isn't in the facility's records,
  - has a talking point with no inspection ID,
  - contains a number that doesn't appear in the records (a made-up penalty, date,
    headcount, or standard), or states a count of citations/inspections that is wrong,
  - mentions a banned topic (injuries, lawsuits, guarantees, prices),
  - puts a dollar amount in the email, runs past the word limit, or drops the sign-off.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

EMAIL_WORD_LIMIT = 170
SIGN_OFF = "Hocker North America"
BANNED = {
    "injury or death": r"\b(injur\w*|fatal\w*|death|died|killed|amputat\w*|hospitali\w*)",
    "legal action": r"\b(lawsuit\w*|litigation|sued|attorney\w*)\b",
    "compliance guarantee": r"\b(guarantee\w*|ensure(s|d)? (your )?compliance|make (you|your \w+) compliant|"
                            r"bring (you|your \w+) into compliance|osha[- ]approved)",
    "pricing": r"\b(price[sd]?|pricing|discount\w*|cost[s]? (only|just))\b",
}
_NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")
_COUNT_CLAIM = re.compile(r"\b(\d{1,3})\s+(?:[\w-]+\s+)?(citations?|violations?|inspections?)\b", re.IGNORECASE)
# Numbers that describe the rep's offer rather than the facility, e.g. "a 20-minute call".
_OFFER_NUMBER = re.compile(r"\b\d{1,3}[- ]minutes?\b", re.IGNORECASE)


ISSUE_KINDS = (
    ("unknown inspection ID", "unknown inspection ID"),
    ("cites no inspection ID", "talking point without a source"),
    ("is not in the records", "number not in the records"),
    ("doesn't match the records", "wrong count"),
    ("mentions", "banned topic"),
    ("dollar amount", "dollar amount in email"),
    ("words (limit", "email too long"),
    ("sign-off", "missing sign-off"),
)


def kind(issue: str) -> str:
    for needle, label in ISSUE_KINDS:
        if needle in issue:
            return label
    return "unusable response"


@dataclass
class Result:
    passed: bool
    issues: list = field(default_factory=list)


def _norm(token: str) -> str:
    token = token.replace(",", "").rstrip(".")
    try:
        value = float(token)
    except ValueError:
        return token
    return str(int(value)) if value == int(value) else repr(value)


def numbers_in(text: str) -> set[str]:
    return {_norm(t) for t in _NUMBER.findall(text)}


def allowed_counts(facts: dict) -> set[int]:
    """Counts a draft may state: citations or inspections in total, per inspection, or per category."""
    inspections = facts["inspections"]
    citations = [c for i in inspections for c in i["citations"]]
    counts = {len(inspections), len(citations)}
    counts |= {len(i["citations"]) for i in inspections}
    counts |= {i.get("other_citations", 0) for i in inspections}
    counts.add(len(citations) + sum(i.get("other_citations", 0) for i in inspections))
    for category in ("dust", "adjacent", "other"):
        counts.add(sum(c["category"] == category for c in citations))
    counts.add(sum(c["category"] in ("dust", "adjacent") for c in citations))
    return counts


def check(draft: dict, facts: dict) -> Result:
    issues = []
    known_ids = {i["inspection_id"] for i in facts["inspections"]}
    allowed_numbers = numbers_in(json.dumps(facts))

    for n, tp in enumerate(draft["talking_points"], 1):
        ids = tp["inspection_ids"]
        if not ids:
            issues.append(f"talking point {n} cites no inspection ID")
        for i in ids:
            if i not in known_ids:
                issues.append(f"talking point {n} cites unknown inspection ID {i}")

    fields = {"why_now": draft["why_now"], "email_subject": draft["email_subject"],
              "email_body": draft["email_body"]}
    fields.update({f"talking point {n}": tp["point"] for n, tp in enumerate(draft["talking_points"], 1)})

    counts = allowed_counts(facts)
    for name, text in fields.items():
        for number in sorted(numbers_in(_OFFER_NUMBER.sub("", text)) - allowed_numbers):
            issues.append(f"{name}: number {number} is not in the records")
        for value, noun in _COUNT_CLAIM.findall(text):
            if int(value) not in counts:
                issues.append(f"{name}: '{value} {noun}' doesn't match the records")
        for label, pattern in BANNED.items():
            if re.search(pattern, text, re.IGNORECASE):
                issues.append(f"{name}: mentions {label}")

    body = draft["email_body"]
    if "$" in body:
        issues.append("email_body: contains a dollar amount")
    words = len(body.split())
    if words > EMAIL_WORD_LIMIT:
        issues.append(f"email_body: {words} words (limit {EMAIL_WORD_LIMIT})")
    if SIGN_OFF not in body[-80:]:
        issues.append(f"email_body: doesn't end with the '{SIGN_OFF}' sign-off")
    return Result(not issues, issues)
