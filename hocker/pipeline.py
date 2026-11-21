"""Build the lead list: load -> stage -> resolve facilities -> features -> score -> check -> export."""
from __future__ import annotations

import json
import time
from datetime import date

import duckdb

from . import checks, config, export, facilities, load, rubric, standards, tri


def _run_sql(con: duckdb.DuckDBPyConnection, name: str) -> None:
    con.execute((config.SQL_DIR / name).read_text())


def build_standard_lookup(con: duckdb.DuckDBPyConnection) -> None:
    codes = [r[0] for r in con.sql("SELECT DISTINCT standard FROM violations").fetchall()]
    rows = [(s.code, s.citation, s.title, s.category) for s in map(standards.parse, codes)]
    con.execute("CREATE OR REPLACE TABLE standard_lookup "
                "(standard VARCHAR, citation VARCHAR, title VARCHAR, category VARCHAR)")
    con.executemany("INSERT INTO standard_lookup VALUES (?, ?, ?, ?)", rows)


def build_facility_map(con: duckdb.DuckDBPyConnection) -> None:
    rows = con.sql("SELECT CAST(activity_nr AS VARCHAR), estab_name, site_address, zip5, site_state "
                   "FROM inspections").fetchall()
    mapping, review_required = facilities.resolve_with_review(rows)
    con.execute("CREATE OR REPLACE TABLE facility_map "
                "(activity_nr BIGINT, facility_id VARCHAR, review_required BOOLEAN)")
    con.executemany("INSERT INTO facility_map VALUES (?, ?, ?)",
                    [(int(k), v, k in review_required) for k, v in mapping.items()])


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
    for fid, naics, employees, conflict, fatal, hosp, contested, air_lbs in con.sql("""
            SELECT f.facility_id, f.naics, f.employees, f.naics_conflict,
                   h.fatality_date, h.hospitalization_date, h.contested_date,
                   coalesce(t.release_lbs, 0)
            FROM facilities f JOIN holds h USING (facility_id)
            LEFT JOIN tri_air_signals t USING (facility_id)""").fetchall():
        s = rubric.score(naics, employees, conflict, evidence.get(fid, []), as_of,
                         fatal, hosp, contested, air_lbs)
        industry, _ = config.industry_for(naics)
        rows.append((fid, industry, s.industry, s.dust, s.recency, s.size, s.tri_air, s.total, s.tier,
                     s.confidence, s.hold_reason, s.outreach_eligible, s.evidence_date,
                     s.reasons[0]))

    con.execute("""CREATE OR REPLACE TABLE scores (
        facility_id VARCHAR, industry VARCHAR, industry_pts INT, dust_pts INT, recency_pts INT,
        size_pts INT, tri_air_pts INT, total INT, tier VARCHAR, confidence VARCHAR, hold_reason VARCHAR,
        outreach_eligible BOOLEAN, evidence_date DATE, dust_reason VARCHAR)""")
    con.executemany("INSERT INTO scores VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", rows)


def build_tri_signals(con: duckdb.DuckDBPyConnection) -> tri.MatchStats:
    files = [config.RAW_DIR / f"TRI_{config.TRI_DATA_YEAR}_{state}.csv"
             for state in config.TERRITORY]
    missing = [path.name for path in files if not path.is_file()]
    if missing:
        raise FileNotFoundError(
            f"Missing EPA TRI files ({', '.join(missing)}); run `python -m hocker download` first."
        )
    facilities = con.sql("SELECT facility_id, name, state, zip5 FROM facilities").fetchall()
    signals, stats = tri.read_signals(files, facilities)
    con.execute("""CREATE OR REPLACE TABLE tri_air_signals (
        facility_id VARCHAR, release_lbs DOUBLE, chemicals VARCHAR, forms INT)""")
    con.executemany(
        "INSERT INTO tri_air_signals VALUES (?, ?, ?, ?)",
        [(fid, float(signal.release_lbs), "; ".join(signal.chemicals), signal.forms)
         for fid, signal in signals.items()],
    )
    return stats


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
    tri_stats = build_tri_signals(con)

    print(f"Scoring facilities as of {as_of} ...")
    score_facilities(con, as_of)

    results = checks.run(con)
    failed = [r for r in results if not r.passed]
    for r in results:
        print(f"  [{'PASS' if r.passed else 'FAIL'}] {r.name}: {r.detail}")
    if failed:
        raise SystemExit(f"{len(failed)} data-quality check(s) failed; outputs not written.")

    tri_matches = {
        "matched_forms": tri_stats.matched_forms,
        "unmatched_forms": tri_stats.unmatched_forms,
        "ambiguous_forms": tri_stats.ambiguous_forms,
        "facilities_with_signal": con.sql("SELECT count(*) FROM tri_air_signals").fetchone()[0],
        "reporting_year": config.TRI_DATA_YEAR,
    }
    summary = export.run(con, as_of, load_counts, results, tri_matches)
    summary["seconds"] = round(time.time() - started, 1)
    print(json.dumps(summary["counts"], indent=2))
    con.close()
    return summary
