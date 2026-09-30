"""The retry loop, run against a fake client (no API calls)."""
import json
from types import SimpleNamespace

from hocker import briefs
from tests.test_verify import FACTS, GOOD

LEAD = {
    "id": "f123", "name": FACTS["facility"]["name"], "city": "Grand Rapids", "state": "MI",
    "industry": FACTS["facility"]["industry"], "naics": "337110", "employees": 60,
    "score": {k: FACTS["lead_score"][k] for k in ("industry", "dust", "recency", "size", "total")},
    "tier": "Hot",
    "inspections": [{**i, "url": "x", "citations": [{**c, "under_contest": False} for c in i["citations"]]}
                    for i in FACTS["inspections"]],
}


class FakeClient:
    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = []
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        self.calls.append(kwargs)
        text = json.dumps(self.replies.pop(0))
        return SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text=text)],
                               usage=SimpleNamespace(input_tokens=1000, output_tokens=300))


def test_facts_match_the_verifier_fixture():
    assert briefs.facts_for(LEAD, "2026-09-23") == FACTS


def test_good_draft_passes_first_try():
    client = FakeClient([GOOD])
    rec = briefs.write_brief(client, LEAD, "2026-09-23")
    assert rec["status"] == "verified" and len(rec["attempts"]) == 1
    assert client.calls[0]["output_config"]["format"]["type"] == "json_schema"


def test_bad_draft_is_retried_with_feedback():
    bad = {**GOOD, "why_now": "Penalties total $12,375."}
    client = FakeClient([bad, GOOD])
    rec = briefs.write_brief(client, LEAD, "2026-09-23")
    assert rec["status"] == "verified" and len(rec["attempts"]) == 2
    feedback = client.calls[1]["messages"][-1]["content"]
    assert "12375" in feedback


def test_draft_that_fails_twice_is_flagged():
    bad = {**GOOD, "why_now": "Penalties total $12,375."}
    rec = briefs.write_brief(FakeClient([bad, bad]), LEAD, "2026-09-23")
    assert rec["status"] == "needs human edit"
