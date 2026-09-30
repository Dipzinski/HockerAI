"""Build the lead list: load -> stage -> resolve facilities -> features -> score -> check -> export."""
from __future__ import annotations

import json
import time
from datetime import date

import duckdb

from . import checks, config, export, facilities, load, rubric, standards


def _run_sql(con: duckdb.DuckDBPyConnection, name: str) -> None:
    con.execute((config.SQL_DIR / name).read_text())


def build_standard_lookup(con: duckdb.DuckDBPyConnection) -> None:
    codes = [r[0] for r in con.sql("SELECT DISTINCT standard FROM violations").fetchall()]
    rows = [(s.code, s.citation, s.title, s.category) for s in map(standards.parse, codes)]
    con.execute("CREATE OR REPLACE TABLE standard_lookup "
                "(standard VARCHAR, citation VARCHAR, title VARCHAR, category VARCHAR)")
    con.executemany("INSERT INTO standard_lookup VALUES (?, ?, ?, ?)", rows)


def build_facility_map(con: duckdb.DuckDBPyConnection) -> None:
    rows = con.sql("SELECT CAST(activity_nr AS VARCHAR), estab_name, site_address, zip5 "
                   "FROM inspections").fetchall()
    mapping = facilities.resolve(rows)
    con.execute("CREATE OR REPLACE TABLE facility_map (activity_nr BIGINT, facility_id VARCHAR)")
    con.executemany("INSERT INTO facility_map VALUES (?, ?)",
                    [(int(k), v) for k, v in mapping.items()])


def build_run_params(con: duckdb.DuckDBPyConnection) -> date:
    as_of = con.sql("SELECT greatest((SELECT max(open_date) FROM inspections), "
                    "(SELECT max(issuance_date) FROM violations))").fetchone()[0]
    con.execute("CREATE OR REPLACE TABLE run_params AS SELECT ?::DATE AS as_of, "
                "?::DATE AS window_start, ?::DATE AS injury_start",
                [as_of, rubric.months_before(as_of, config.EVIDENCE_WINDOW_MONTHS),
                 rubric.months_before(as_of, config.HOLD_INJURY_MONTHS)])
    return as_of


def score_facilities(con: duckdb.DuckDBPyConnection, as_of: date) -> None:
    evidence: dict[str, list[rubric.Evidence]] = {}
    for fid, nr, kind, d, category, viol_type in con.sql(
            "SELECT facility_id, activity_nr, kind, evidence_date, category, viol_type "
            "FROM evidence").fetchall():
        evidence.setdefault(fid, []).append(rubric.Evidence(nr, kind, d, category, viol_type))

    rows = []
    for fid, naics, employees, conflict, fatal, hosp, contested in con.sql("""
            SELECT f.facility_id, f.naics, f.employees, f.naics_conflict,
                   h.fatality_date, h.hospitalization_date, h.contested_date
            FROM facilities f JOIN holds h USING (facility_id)""").fetchall():
        s = rubric.score(naics, employees, conflict, evidence.get(fid, []), as_of,
                         fatal, hosp, contested)
        industry, _ = config.industry_for(naics)
        rows.append((fid, industry, s.industry, s.dust, s.recency, s.size, s.total, s.tier,
                     s.confidence, s.hold_reason, s.outreach_eligible, s.evidence_date,
                     s.reasons[0]))

    con.execute("""CREATE OR REPLACE TABLE scores (
        facility_id VARCHAR, industry VARCHAR, industry_pts INT, dust_pts INT, recency_pts INT,
        size_pts INT, total INT, tier VARCHAR, confidence VARCHAR, hold_reason VARCHAR,
        outreach_eligible BOOLEAN, evidence_date DATE, dust_reason VARCHAR)""")
    con.executemany("INSERT INTO scores VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", rows)


def build(skip_load: bool = False) -> dict:
    started = time.time()
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(config.DB_PATH))

    if skip_load:
        print("Using the tables already in", config.DB_PATH.name)
    else:
        print("Loading OSHA files into DuckDB ...")
        counts = load.run(con)
        con.execute("CREATE OR REPLACE TABLE load_counts (name VARCHAR, n BIGINT)")
        con.executemany("INSERT INTO load_counts VALUES (?, ?)", list(counts.items()))
    load_counts = dict(con.sql("SELECT name, n FROM load_counts").fetchall())

    print("Staging, resolving facilities, and building features ...")
    _run_sql(con, "01_staging.sql")
    build_standard_lookup(con)
    build_facility_map(con)
    as_of = build_run_params(con)
    _run_sql(con, "02_features.sql")

    print(f"Scoring facilities as of {as_of} ...")
    score_facilities(con, as_of)

    results = checks.run(con)
    failed = [r for r in results if not r.passed]
    for r in results:
        print(f"  [{'PASS' if r.passed else 'FAIL'}] {r.name}: {r.detail}")
    if failed:
        raise SystemExit(f"{len(failed)} data-quality check(s) failed; outputs not written.")

    summary = export.run(con, as_of, load_counts, results)
    summary["seconds"] = round(time.time() - started, 1)
    print(json.dumps(summary["counts"], indent=2))
    con.close()
    return summary
