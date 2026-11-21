from datetime import datetime, timezone

from hocker.lead_eval import evaluate_rankings, snapshot_score_run


def test_snapshot_score_run_tracks_version_and_features():
    snapshot = snapshot_score_run([
        {
            "facility_id": "abc-1",
            "name": "Alpha Works",
            "state": "MI",
            "tier": "Hot",
            "confidence": "High",
            "hold_reason": None,
            "outreach_eligible": True,
            "total": 11,
            "industry_pts": 3,
            "dust_pts": 3,
            "recency_pts": 3,
            "size_pts": 2,
            "tri_air_pts": 0,
            "evidence_date": "2026-05-01",
            "dust_reason": "dust-specific citation",
        }
    ], as_of="2026-09-23", score_version="rubric-v1")

    lead = snapshot[0]
    assert lead["facility_id"] == "abc-1"
    assert lead["score_version"] == "rubric-v1"
    assert lead["feature_values"]["dust"] == 3
    assert lead["total"] == 11
    assert lead["scored_at"].endswith("Z")
    parsed = datetime.fromisoformat(lead["scored_at"].replace("Z", "+00:00"))
    assert parsed.tzinfo == timezone.utc


def test_evaluate_rankings_reports_precision_recall_and_lift():
    ordered = [
        {"facility_id": "a", "total": 11},
        {"facility_id": "b", "total": 10},
        {"facility_id": "c", "total": 8},
    ]
    outcomes = [
        {"facility_id": "a", "outcome": "qualified"},
        {"facility_id": "d", "outcome": "qualified"},
        {"facility_id": "c", "outcome": "disqualified"},
    ]

    report = evaluate_rankings(ordered, outcomes, k=2, positive_label="qualified")
    assert report["k"] == 2
    assert report["precision_at_k"] == 1.0
    assert report["labeled_leads_at_k"] == 1
    assert report["labeled_coverage_at_k"] == 0.5
    assert report["qualified_outcomes"] == 2
    assert report["lift_at_k"] == 1.5


def test_unknown_outcomes_are_excluded_and_string_false_is_not_positive():
    report = evaluate_rankings(
        [{"facility_id": "a"}, {"facility_id": "b"}, {"facility_id": "c"}],
        [
            {"facility_id": "a", "outcome": "qualified"},
            {"facility_id": "b", "outcome": "unknown"},
            {"facility_id": "c", "qualified": "false"},
            {"facility_id": "d", "disposition": "disqualified"},
        ],
        k=3,
    )
    assert report["qualified_outcomes"] == 1
    assert report["precision_at_k"] == 1.0
    assert report["recall_at_k"] == 1.0
    assert report["lift_at_k"] == 2.0
    assert report["labeled_leads_at_k"] == 1
    assert report["labeled_coverage_at_k"] == 0.3333


def test_precision_is_unavailable_when_top_k_has_no_known_outcomes():
    report = evaluate_rankings(
        [{"facility_id": "a"}, {"facility_id": "b"}],
        [{"facility_id": "a", "outcome": "unknown"}],
        k=2,
    )

    assert report["precision_at_k"] is None
    assert report["labeled_leads_at_k"] == 0
    assert report["labeled_coverage_at_k"] == 0.0
    assert report["lift_at_k"] is None
