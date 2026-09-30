from datetime import date

from hocker import rubric
from hocker.rubric import Evidence

AS_OF = date(2026, 9, 23)


def cite(category, d, viol_type="S"):
    return Evidence(1, "citation", d, category, viol_type)


def test_recent_dust_citation_at_mid_size_woodshop_is_hot_and_eligible():
    s = rubric.score("337110", 60, False, [cite("dust", date(2026, 5, 1))], AS_OF)
    assert (s.industry, s.dust, s.recency, s.size) == (3, 3, 3, 2)
    assert s.total == 11 and s.tier == "Hot" and s.outreach_eligible


def test_recency_bands():
    assert rubric.recency_points(date(2025, 9, 23), AS_OF) == 3   # 12 months
    assert rubric.recency_points(date(2025, 9, 22), AS_OF) == 2   # just over 12
    assert rubric.recency_points(date(2023, 9, 23), AS_OF) == 1   # 36 months
    assert rubric.recency_points(None, AS_OF) == 0


def test_unrelated_citations_cannot_reach_hot():
    s = rubric.score("332710", 100, False, [cite("other", date(2026, 9, 1))], AS_OF)
    assert s.dust == 1 and s.recency == 0
    assert s.total == 6 and s.tier == "Warm"


def test_no_recent_evidence_is_archive_even_with_good_fit():
    s = rubric.score("321999", 100, False, [], AS_OF)
    assert s.total == 5 and s.tier == "Archive" and not s.outreach_eligible


def test_program_inspection_counts_as_related_evidence():
    ev = [Evidence(1, "program_inspection", date(2026, 1, 10), "adjacent")]
    s = rubric.score("311211", 45, False, ev, AS_OF)
    assert s.dust == 2 and s.recency == 3 and s.tier == "Hot"


def test_strongest_evidence_sets_the_recency_date():
    ev = [cite("adjacent", date(2026, 8, 1)), cite("dust", date(2024, 3, 1))]
    s = rubric.score("332", 50, False, ev, AS_OF)
    assert s.dust == 3 and s.evidence_date == date(2024, 3, 1) and s.recency == 1


def test_size_bands():
    assert [rubric.size_points(n) for n in (None, 5, 10, 20, 500, 501, 1000, 1001)] == [0, 0, 1, 2, 2, 1, 1, 0]


def test_industry_fit_uses_longest_prefix():
    from hocker.config import industry_for
    assert industry_for("325211") == ("Plastics, resins & composites", 1)
    assert industry_for("331511") == ("Foundries", 1)
    assert industry_for("541330") == (None, 0)


def test_holds_override_score():
    ev = [cite("dust", date(2026, 5, 1))]
    s = rubric.score("337110", 60, False, ev, AS_OF, fatality_date=date(2025, 1, 1))
    assert s.tier == "Hot" and s.hold_reason and not s.outreach_eligible
    s = rubric.score("337110", 60, False, ev, AS_OF, contested_date=date(2026, 6, 1))
    assert s.hold_reason == "citation under contest" and not s.outreach_eligible


def test_low_confidence_blocks_outreach():
    s = rubric.score("337110", None, True, [cite("dust", date(2026, 5, 1))], AS_OF)
    assert s.confidence == "Low" and not s.outreach_eligible
