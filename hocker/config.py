"""Settings for the lead pipeline: territory, target industries, scoring windows, and paths."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
DB_PATH = DATA_DIR / "hocker.duckdb"
OUTPUT_DIR = ROOT / "outputs"
DOCS_DATA_DIR = ROOT / "docs" / "data"
SQL_DIR = ROOT / "sql"

# US Department of Labor bulk downloads (public, no API key, refreshed daily).
DOL_URL = "https://data.dol.gov/data-catalog/OSHA/{table}/OSHA_{table}.zip"
DOL_TABLES = ("inspection", "violation", "emphasis_codes", "accident", "accident_injury")

# Census ZIP Code Tabulation Area centroids, used only to place facilities on the map.
ZCTA_URL = "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_zcta_national.zip"

# Hocker North America is in Ada, MI; the territory is the surrounding Great Lakes states.
TERRITORY = ("MI", "OH", "IN", "IL", "WI")

# Inspections opened on or after this date are loaded.
LOAD_START = "2019-01-01"

# Only evidence from the last 36 months counts toward a score.
EVIDENCE_WINDOW_MONTHS = 36

# v1's seven target industries, in the sales team's priority order, with industry-fit points (0-3).
# A facility's industry comes from the NAICS code on its most recent inspection.
INDUSTRIES = (
    ("Woodworking, cabinets & furniture", ("321", "337"), 3),
    ("Metal fabrication & machinery", ("332", "333"), 3),
    ("Cement, glass & mineral products", ("327",), 2),
    ("Food & grain processing", ("311",), 2),
    ("Pharmaceutical & nutraceutical", ("3254",), 1),
    ("Plastics, resins & composites", ("326", "3252"), 1),
    ("Foundries", ("3315",), 1),
)

TARGET_NAICS_PREFIXES = tuple(p for _, prefixes, _ in INDUSTRIES for p in prefixes)

# Site headcount bands (OSHA's NR_IN_ESTAB): v1's target range was 20-500 employees.
SIZE_CORE = (20, 500)
SIZE_EDGE = (10, 1000)

# Holds: v1's "Archive overrides score" rule, using what OSHA data can show.
HOLD_INJURY_MONTHS = 24

# Claude settings for the brief-writing step.
BRIEF_MODEL = "claude-opus-5-5"
BRIEF_EFFORT = "medium"
BRIEF_LIMIT = 25


def industry_for(naics: str | None) -> tuple[str | None, int]:
    """Return (industry label, industry-fit points) for a NAICS code, or (None, 0)."""
    if not naics:
        return None, 0
    # Longest prefix wins, so 3252 (resins) is not swallowed by a shorter code.
    best = None
    for label, prefixes, points in INDUSTRIES:
        for prefix in prefixes:
            if naics.startswith(prefix) and (best is None or len(prefix) > best[0]):
                best = (len(prefix), label, points)
    return (best[1], best[2]) if best else (None, 0)
