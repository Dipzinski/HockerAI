from datetime import date

import duckdb

from hocker import config
from hocker.pipeline import build_facility_map, score_facilities


def test_facility_map_uses_state_and_marks_missing_location_for_review():
    con = duckdb.connect(":memory:")
    con.execute("""CREATE TABLE inspections (
        activity_nr BIGINT, estab_name VARCHAR, site_address VARCHAR,
        zip5 VARCHAR, site_state VARCHAR
    )""")
    con.executemany("INSERT INTO inspections VALUES (?, ?, ?, ?, ?)", [
        (1, "Acme Fabrication", "1 Main St", "", "MI"),
        (2, "Acme Fabrication", "1 Main St", "", "MI"),
        (3, "Acme Fabrication", "1 Main St", "49301", "MI"),
        (4, "Acme Fabrication", "1 Main St", "49301", "IL"),
    ])

    build_facility_map(con)
    rows = con.sql("SELECT activity_nr, facility_id, review_required FROM facility_map").fetchall()
    result = {activity: (facility_id, review) for activity, facility_id, review in rows}

    assert result[1][0] != result[2][0]
    assert result[1][1] and result[2][1]
    assert result[3][0] != result[4][0]
    assert not result[3][1] and not result[4][1]
    con.close()


def test_old_unresolved_contest_holds_outreach_outside_evidence_window():
    con = duckdb.connect(":memory:")
    con.execute("""CREATE TABLE inspections (
        activity_nr BIGINT, estab_name VARCHAR, site_address VARCHAR, site_city VARCHAR,
        site_state VARCHAR, zip5 VARCHAR, naics_code VARCHAR, employees INTEGER,
        open_date DATE, insp_type VARCHAR
    )""")
    con.execute("""INSERT INTO inspections VALUES
        (101, 'Acme Fabrication', '1 Main St', 'Ada', 'MI', '49301', '332710', 60,
         DATE '2025-01-01', 'C'),
        (102, 'Acme Fabrication', '1 Main St', 'Ada', 'MI', '49301', '332710', 60,
         DATE '2026-03-01', 'C')""")
    con.execute("""CREATE TABLE facility_map (
        activity_nr BIGINT, facility_id VARCHAR, review_required BOOLEAN
    )""")
    con.execute("INSERT INTO facility_map VALUES (101, 'facility-1', false), (102, 'facility-1', false)")
    con.execute("CREATE TABLE dust_programs (activity_nr BIGINT, program VARCHAR)")
    con.execute("""CREATE TABLE violations (
        activity_nr BIGINT, issuance_date DATE, citation_id BIGINT, standard VARCHAR,
        viol_type VARCHAR, current_penalty DOUBLE, initial_penalty DOUBLE,
        contest_date DATE, final_order_date DATE
    )""")
    con.execute("""INSERT INTO violations VALUES
        (101, DATE '2020-06-01', 1, 'S1', 'S', 1000, 1000, DATE '2020-07-01', NULL),
        (102, DATE '2026-03-01', 2, 'S1', 'S', 1000, 1000, NULL, NULL)""")
    con.execute("""CREATE TABLE standard_lookup (
        standard VARCHAR, citation VARCHAR, title VARCHAR, category VARCHAR
    )""")
    con.execute("INSERT INTO standard_lookup VALUES ('S1', '29 CFR 1910.94', 'Ventilation', 'dust')")
    con.execute("CREATE TABLE injuries (activity_nr BIGINT, degree VARCHAR, event_date DATE)")
    con.execute("""CREATE TABLE run_params (
        as_of DATE, window_start DATE, injury_start DATE
    )""")
    con.execute("""INSERT INTO run_params VALUES
        (DATE '2026-09-01', DATE '2023-09-01', DATE '2024-09-01')""")

    con.execute((config.SQL_DIR / "02_features.sql").read_text())
    con.execute("CREATE TABLE tri_air_signals (facility_id VARCHAR, release_lbs DOUBLE)")
    score_facilities(con, date(2026, 9, 1))

    evidence = con.sql(
        "SELECT activity_nr FROM evidence WHERE kind = 'citation' ORDER BY activity_nr"
    ).fetchall()
    [(hold_date,)] = con.sql("SELECT contested_date FROM holds WHERE facility_id = 'facility-1'").fetchall()
    [(hold_reason, outreach_eligible)] = con.sql(
        "SELECT hold_reason, outreach_eligible FROM scores WHERE facility_id = 'facility-1'"
    ).fetchall()
    assert evidence == [(102,)]  # old citation is outside scoring evidence
    assert str(hold_date) == "2020-07-01"  # but its unresolved contest still holds outreach
    assert hold_reason == "citation under contest" and not outreach_eligible
    con.close()
