"""Data-quality checks. The build stops before writing outputs if any check fails."""
from __future__ import annotations

from dataclasses import dataclass

import duckdb

from . import config


@dataclass
class Check:
    name: str
    passed: bool
    detail: str


def _one(con: duckdb.DuckDBPyConnection, sql: str):
    return con.sql(sql).fetchone()[0]


def run(con: duckdb.DuckDBPyConnection) -> list[Check]:
    states = ", ".join(f"'{s}'" for s in config.TERRITORY)
    naics = " OR ".join(f"naics LIKE '{p}%'" for p in config.TARGET_NAICS_PREFIXES)
    out: list[Check] = []

    def check(name: str, bad: int, detail_ok: str) -> None:
        out.append(Check(name, bad == 0, detail_ok if bad == 0 else f"{bad:,} bad rows"))

    n = _one(con, "SELECT count(*) FROM inspections")
    check("inspection IDs are unique",
          n - _one(con, "SELECT count(DISTINCT activity_nr) FROM inspections"), f"{n:,} inspections")

    check("every inspection maps to exactly one facility",
          _one(con, """SELECT count(*) FROM inspections i
                       LEFT JOIN (SELECT activity_nr, count(*) c FROM facility_map GROUP BY 1) m
                       USING (activity_nr) WHERE coalesce(m.c, 0) <> 1"""),
          f"{_one(con, 'SELECT count(*) FROM facilities'):,} facilities")

    check("every citation belongs to a loaded inspection",
          _one(con, "SELECT count(*) FROM violations WHERE activity_nr NOT IN "
                    "(SELECT activity_nr FROM inspections)"),
          f"{_one(con, 'SELECT count(*) FROM violations'):,} citations")

    check("withdrawn citations are excluded",
          _one(con, "SELECT count(*) FROM raw_violation r JOIN violations v "
                    "ON CAST(r.activity_nr AS BIGINT) = v.activity_nr AND r.citation_id = v.citation_id "
                    "AND r.standard = v.standard WHERE r.delete_flag = 'X'"),
          "0 withdrawn citations kept")

    check("every cited standard was classified",
          _one(con, "SELECT count(*) FROM violations WHERE standard NOT IN "
                    "(SELECT standard FROM standard_lookup)"),
          f"{_one(con, 'SELECT count(*) FROM standard_lookup'):,} distinct standards")

    check("facilities are in the territory and target industries",
          _one(con, f"SELECT count(*) FROM facilities WHERE state NOT IN ({states}) OR NOT ({naics})"),
          f"states {', '.join(config.TERRITORY)}")

    check("inspection dates are inside the load window",
          _one(con, f"""SELECT count(*) FROM inspections WHERE open_date < DATE '{config.LOAD_START}'
                        OR open_date > (SELECT as_of FROM run_params)"""),
          f"{config.LOAD_START} to as-of date")

    cleared = _one(con, "SELECT count(*) FROM inspections WHERE employees_reported >= 5000")
    check("site headcounts are 1-4,999 or missing",
          _one(con, "SELECT count(*) FROM inspections WHERE employees NOT BETWEEN 1 AND 4999"),
          f"{cleared} company-wide totals cleared")

    check("every facility has exactly one score",
          _one(con, """SELECT count(*) FROM facilities f
                       LEFT JOIN (SELECT facility_id, count(*) c FROM scores GROUP BY 1) s
                       USING (facility_id) WHERE coalesce(s.c, 0) <> 1"""),
          "1 score per facility")

    check("scores are 0-11 and equal the sum of their parts",
          _one(con, """SELECT count(*) FROM scores WHERE total NOT BETWEEN 0 AND 11
                       OR total <> industry_pts + dust_pts + recency_pts + size_pts"""),
          "all totals consistent")

    check("tiers match the score cutoffs",
          _one(con, """SELECT count(*) FROM scores WHERE tier <> CASE WHEN dust_pts = 0 THEN 'Archive'
                       WHEN total >= 8 THEN 'Hot' WHEN total >= 5 THEN 'Warm' ELSE 'Archive' END"""),
          "Hot 8-11, Warm 5-7, Archive 0-4 or no recent evidence")

    check("held or low-confidence leads are never outreach-eligible",
          _one(con, """SELECT count(*) FROM scores WHERE outreach_eligible
                       AND (hold_reason IS NOT NULL OR confidence = 'Low' OR tier = 'Archive')"""),
          f"{_one(con, 'SELECT count(*) FROM scores WHERE hold_reason IS NOT NULL'):,} leads on hold")

    check("every Hot lead has cited dust evidence",
          _one(con, """SELECT count(*) FROM scores s WHERE tier = 'Hot' AND NOT EXISTS (
                       SELECT 1 FROM evidence e WHERE e.facility_id = s.facility_id
                       AND e.category IN ('dust', 'adjacent'))"""),
          "all Hot leads backed by records")
    return out
