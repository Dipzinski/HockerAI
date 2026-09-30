"""Load the territory's inspections and related records from the DOL zips into DuckDB.

Each zip holds 4-270 CSV chunks. The chunks are extracted to a temporary folder,
read with DuckDB in one pass, filtered, and the folder is deleted. Only rows tied
to target-industry inspections in the territory are kept, so the 3.7 GB download
becomes a database of a few MB.
"""
from __future__ import annotations

import shutil
import tempfile
import zipfile
from pathlib import Path

import duckdb

from . import config

CSV_OPTIONS = "header=true, all_varchar=true, delim=',', quote='\"', escape='\"', store_rejects=true"


def _extract(table: str, workdir: Path) -> str:
    out = workdir / table
    with zipfile.ZipFile(config.RAW_DIR / f"OSHA_{table}.zip") as z:
        z.extractall(out)
    return str(out / "*.csv")


def _naics_filter(column: str) -> str:
    return " OR ".join(f"{column} LIKE '{p}%'" for p in config.TARGET_NAICS_PREFIXES)


def run(con: duckdb.DuckDBPyConnection) -> dict[str, int]:
    """Create the raw_* tables. Returns row counts per table (and CSV rows rejected)."""
    states = ", ".join(f"'{s}'" for s in config.TERRITORY)
    counts: dict[str, int] = {}
    with tempfile.TemporaryDirectory(dir=config.DATA_DIR) as tmp:
        work = Path(tmp)

        glob = _extract("inspection", work)
        counts["inspection_rows_national"] = con.sql(
            f"SELECT count(*) FROM read_csv('{glob}', {CSV_OPTIONS})").fetchone()[0]
        con.execute(f"""
            CREATE OR REPLACE TABLE raw_inspection AS
            SELECT * FROM read_csv('{glob}', {CSV_OPTIONS})
            WHERE site_state IN ({states})
              AND open_date >= '{config.LOAD_START}'
              AND ({_naics_filter('naics_code')})
        """)
        shutil.rmtree(work / "inspection")

        for table in ("violation", "emphasis_codes", "accident_injury"):
            key = "rel_insp_nr" if table == "accident_injury" else "activity_nr"
            glob = _extract(table, work)
            con.execute(f"""
                CREATE OR REPLACE TABLE raw_{table} AS
                SELECT * FROM read_csv('{glob}', {CSV_OPTIONS})
                WHERE {key} IN (SELECT activity_nr FROM raw_inspection)
            """)
            shutil.rmtree(work / table)

        glob = _extract("accident", work)
        con.execute(f"""
            CREATE OR REPLACE TABLE raw_accident AS
            SELECT * FROM read_csv('{glob}', {CSV_OPTIONS})
            WHERE summary_nr IN (SELECT summary_nr FROM raw_accident_injury)
        """)
        counts["csv_rows_rejected"] = con.sql("SELECT count(*) FROM reject_errors").fetchone()[0]

    zcta = config.RAW_DIR / "zcta_gazetteer.zip"
    with zipfile.ZipFile(zcta) as z, tempfile.TemporaryDirectory(dir=config.DATA_DIR) as tmp:
        name = z.namelist()[0]
        z.extract(name, tmp)
        con.execute(f"""
            CREATE OR REPLACE TABLE zip_centroids AS
            SELECT trim(geoid) AS zip5, trim(lat)::DOUBLE AS lat, trim(lon)::DOUBLE AS lon
            FROM read_csv('{Path(tmp) / name}', delim='\\t', header=true, all_varchar=true,
                          names=['geoid', 'aland', 'awater', 'aland_sqmi', 'awater_sqmi', 'lat', 'lon'])
        """)

    for table in ("inspection", "violation", "emphasis_codes", "accident_injury", "accident"):
        counts[f"raw_{table}"] = con.sql(f"SELECT count(*) FROM raw_{table}").fetchone()[0]
    return counts
