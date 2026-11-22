"""Query helpers that behave the same on DuckDB 1.x and 2.x."""
from __future__ import annotations

from typing import Any

import duckdb


def scalar(con: duckdb.DuckDBPyConnection, sql: str) -> Any:
    """Run a query that returns one row with one column, and return that value.

    DuckDB 2 removed Relation.fetchone(). Connection.execute(sql).fetchone() is no substitute:
    on 2.x it leaves the result half-read, and the next relation query on the connection fails
    with "connection has an unfinished result". fetchall() reads the whole result.
    """
    rows = con.sql(sql).fetchall()
    if len(rows) != 1 or len(rows[0]) != 1:
        width = len(rows[0]) if rows else 0
        raise ValueError(f"expected one row with one column, got {len(rows)} row(s) "
                         f"of {width} column(s) from: {sql}")
    return rows[0][0]
