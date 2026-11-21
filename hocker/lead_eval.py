"""Support score snapshots and baseline evaluation for lead-ranking work.

This module intentionally keeps the current rule-based score as the control and
adds the minimum operational instrumentation the improvement plan calls for:
versioned snapshots of the scored lead set and a simple baseline evaluation for
precision@K / recall@K / lift@K on known outcomes.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

DEFAULT_POSITIVE_LABEL = "qualified"
DEFAULT_SCORE_VERSION = "rubric-v1"
DEFAULT_K = 25


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def normalize_disposition(value: str | None) -> str:
    """Normalize the sales disposition values recommended by the plan."""
    if not value:
        return "unknown"
    normalized = value.strip().lower().replace(" ", "_")
    allowed = {
        "no_relevant_process",
        "wrong_facility_entity",
        "existing_customer",
        "out_of_territory",
        "not_now",
        "no_response_after_defined_cadence",
        "qualified",
        "disqualified",
        "unknown",
    }
    return normalized if normalized in allowed else "unknown"


def snapshot_score_run(
    ranked_leads: Sequence[Mapping[str, Any]],
    *,
    as_of: str,
    score_version: str = DEFAULT_SCORE_VERSION,
    path: str | Path | None = None,
    scored_at: str | None = None,
) -> list[dict[str, Any]]:
    """Persist a versioned, time-stamped score snapshot for each lead.

    The snapshot deliberately keeps the exact numeric fields that matter for a
    time-ordered retrospective or pilot: the lead's score, tier, confidence,
    evidence date, and the original feature values used to compute it.
    """
    run_scored_at = scored_at or _utc_now()
    snapshot = []
    for lead in ranked_leads:
        snapshot.append({
            "facility_id": lead.get("facility_id"),
            "name": lead.get("name"),
            "state": lead.get("state"),
            "tier": lead.get("tier"),
            "confidence": lead.get("confidence"),
            "hold_reason": lead.get("hold_reason"),
            "outreach_eligible": bool(lead.get("outreach_eligible")),
            "score_version": score_version,
            "scored_at": run_scored_at,
            "as_of": as_of,
            "total": int(lead.get("total", lead.get("score", {}).get("total", 0))),
            "feature_values": {
                "industry": lead.get("industry_pts", lead.get("score", {}).get("industry", 0)),
                "dust": lead.get("dust_pts", lead.get("score", {}).get("dust", 0)),
                "recency": lead.get("recency_pts", lead.get("score", {}).get("recency", 0)),
                "size": lead.get("size_pts", lead.get("score", {}).get("size", 0)),
                "tri_air": lead.get("tri_air_pts", lead.get("score", {}).get("tri_air", 0)),
            },
            "evidence_date": lead.get("evidence_date"),
            "score_explanation": lead.get("dust_reason"),
        })

    if path is not None:
        file_path = Path(path)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(json.dumps({
            "score_version": score_version,
            "as_of": as_of,
            "scored_at": run_scored_at,
            "leads": snapshot,
        }, indent=1, default=str))
    return snapshot


def evaluate_rankings(
    ranked_leads: Sequence[Mapping[str, Any]],
    outcomes: Iterable[Mapping[str, Any]],
    *,
    k: int | None = DEFAULT_K,
    positive_label: str = DEFAULT_POSITIVE_LABEL,
) -> dict[str, Any]:
    """Compute precision@K, recall@K, and lift@K for a scored lead list.

    `ranked_leads` should be ordered by the score/ranking the team intends to work.
    `outcomes` should map facility IDs to a disposition or outcome record. Unknown
    or invalid labels are excluded from the baseline; `qualified` is only used as
    a fallback when it is an actual boolean.
    """
    ordered = list(ranked_leads)
    if not ordered:
        return {
            "k": 0,
            "precision_at_k": None,
            "recall_at_k": 0.0,
            "lift_at_k": None,
            "qualified_outcomes": 0,
            "total_leads": 0,
            "labeled_leads_at_k": 0,
            "labeled_coverage_at_k": 0.0,
        }

    outcome_by_facility: dict[str, bool] = {}
    for row in outcomes:
        facility_id = row.get("facility_id")
        if facility_id is None:
            continue
        raw_label = row.get("outcome", row.get("disposition"))
        label = normalize_disposition(raw_label) if isinstance(raw_label, str) else "unknown"
        qualified = row.get("qualified")
        if label != "unknown":
            outcome_by_facility[str(facility_id)] = label == normalize_disposition(positive_label)
        elif isinstance(qualified, bool):
            # Do not let values such as the string "false" become positive by truthiness.
            outcome_by_facility[str(facility_id)] = qualified

    positive_ids = {facility_id for facility_id, positive in outcome_by_facility.items() if positive}
    limit = min(len(ordered), k) if k is not None else len(ordered)
    hits = 0
    labeled_leads = 0
    for lead in ordered[:limit]:
        facility_id = str(lead.get("facility_id"))
        if facility_id in outcome_by_facility:
            labeled_leads += 1
            if facility_id in positive_ids:
                hits += 1

    precision = hits / labeled_leads if labeled_leads else None
    recall = hits / len(positive_ids) if positive_ids else 0.0
    baseline_rate = sum(outcome_by_facility.values()) / max(len(outcome_by_facility), 1)
    lift = (precision / baseline_rate) if precision is not None and baseline_rate else None

    return {
        "k": limit,
        "precision_at_k": round(precision, 4) if precision is not None else None,
        "recall_at_k": round(recall, 4),
        "lift_at_k": round(lift, 4) if lift is not None else None,
        "qualified_outcomes": len(positive_ids),
        "total_leads": len(ordered),
        "labeled_leads_at_k": labeled_leads,
        "labeled_coverage_at_k": round(labeled_leads / limit, 4) if limit else 0.0,
    }
