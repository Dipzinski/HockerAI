"""The 0-11 lead-scoring rubric, carried over from v1 and computed from OSHA records.

| Criterion      | Points | Source                                                   |
|----------------|--------|----------------------------------------------------------|
| Industry fit   | 0-3    | NAICS code of the most recent inspection                 |
| Dust evidence  | 0-3    | Citations and dust-program inspections, last 36 months  |
| Recency        | 0-3    | Months since the dust evidence (dust evidence only)      |
| Site size      | 0-2    | Employees at the inspected site                          |

Hot 8-11, Warm 5-7, Archive 0-4. A facility with no citation or dust-program
inspection in the window is Archive whatever its total: industry and size alone
say nothing about why to call now. v1 used a "growth/hiring signal" as the third
criterion, but it had no reliable source, so v2 uses recency instead: a recent
citation comes with an abatement deadline, which is when a plant buys equipment.
Only dust-related evidence earns recency points, so a lead can't reach Hot on
unrelated citations (the most a facility with no dust evidence can score is 6).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Optional, Sequence

from . import config
from .standards import ADJACENT, DUST

HOT, WARM, ARCHIVE = "Hot", "Warm", "Archive"
SERIOUS_TYPES = {"S", "W", "R"}  # serious, willful, repeat


@dataclass(frozen=True)
class Evidence:
    activity_nr: int
    kind: str              # "citation" or "program_inspection"
    evidence_date: date
    category: str          # dust / adjacent / other
    viol_type: Optional[str] = None


@dataclass
class Score:
    industry: int
    dust: int
    recency: int
    size: int
    evidence_date: Optional[date]
    tier: str
    confidence: str
    hold_reason: Optional[str]
    outreach_eligible: bool
    reasons: list = field(default_factory=list)

    @property
    def total(self) -> int:
        return self.industry + self.dust + self.recency + self.size


def months_before(d: date, months: int) -> date:
    """The same calendar day `months` earlier (clamped for short months)."""
    y, m = divmod(d.year * 12 + (d.month - 1) - months, 12)
    for day in (d.day, 30, 29, 28):
        try:
            return date(y, m + 1, day)
        except ValueError:
            continue
    raise ValueError(d)


def dust_points(evidence: Sequence[Evidence]) -> tuple[int, Optional[date], str]:
    """Strongest dust evidence: 3 dust citation, 2 related citation or dust-program
    inspection, 1 any serious/willful/repeat citation, 0 none.
    Returns (points, date of the newest evidence at that level or None, reason)."""
    dust = [e.evidence_date for e in evidence if e.kind == "citation" and e.category == DUST]
    if dust:
        return 3, max(dust), "dust-specific citation"
    related = [e.evidence_date for e in evidence
               if (e.kind == "citation" and e.category == ADJACENT) or e.kind == "program_inspection"]
    if related:
        return 2, max(related), "dust-related citation or dust-program inspection"
    if any(e.kind == "citation" and e.viol_type in SERIOUS_TYPES for e in evidence):
        return 1, None, "serious citation, not dust-related"
    return 0, None, "no citations in the last 36 months"


def recency_points(evidence_date: Optional[date], as_of: date) -> int:
    if evidence_date is None:
        return 0
    for points, months in ((3, 12), (2, 24), (1, config.EVIDENCE_WINDOW_MONTHS)):
        if evidence_date >= months_before(as_of, months):
            return points
    return 0


def size_points(employees: Optional[int]) -> int:
    if employees is None:
        return 0
    lo, hi = config.SIZE_CORE
    if lo <= employees <= hi:
        return 2
    lo, hi = config.SIZE_EDGE
    if lo <= employees <= hi:
        return 1
    return 0


def tier_for(total: int, dust: int) -> str:
    if dust == 0:
        return ARCHIVE
    if total >= 8:
        return HOT
    if total >= 5:
        return WARM
    return ARCHIVE


def confidence_for(employees: Optional[int], naics_conflict: bool) -> str:
    """High when the headcount is known and the industry code is consistent across inspections."""
    issues = int(employees is None) + int(bool(naics_conflict))
    return ("High", "Medium", "Low")[issues]


def hold_for(fatality_date: Optional[date], hospitalization_date: Optional[date],
             contested_date: Optional[date]) -> Optional[str]:
    if fatality_date:
        return "fatality in the last 36 months"
    if hospitalization_date:
        return f"serious injury in the last {config.HOLD_INJURY_MONTHS} months"
    if contested_date:
        return "citation under contest"
    return None


def score(naics: Optional[str], employees: Optional[int], naics_conflict: bool,
          evidence: Sequence[Evidence], as_of: date,
          fatality_date: Optional[date] = None, hospitalization_date: Optional[date] = None,
          contested_date: Optional[date] = None) -> Score:
    _, industry = config.industry_for(naics)
    dust, evidence_date, dust_reason = dust_points(evidence)
    recency = recency_points(evidence_date, as_of)
    size = size_points(employees)
    total = industry + dust + recency + size
    tier = tier_for(total, dust)
    confidence = confidence_for(employees, naics_conflict)
    hold = hold_for(fatality_date, hospitalization_date, contested_date)
    eligible = tier != ARCHIVE and hold is None and confidence != "Low"
    return Score(industry, dust, recency, size, evidence_date, tier, confidence, hold,
                 eligible, [dust_reason])
