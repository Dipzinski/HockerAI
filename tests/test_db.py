import duckdb
import pytest

from hocker import db


@pytest.fixture
def con():
    con = duckdb.connect(":memory:")
    con.execute("CREATE TABLE t AS SELECT range AS x FROM range(5)")
    yield con
    con.close()


def test_scalar_returns_the_single_value(con):
    assert db.scalar(con, "SELECT count(*) FROM t") == 5


def test_scalar_leaves_the_connection_free_for_the_next_query(con):
    # On DuckDB 2.x a half-read execute() result blocks the next relation query.
    db.scalar(con, "SELECT max(x) FROM t")
    assert con.sql("SELECT min(x) FROM t").fetchall() == [(0,)]


def test_scalar_rejects_a_query_that_returns_more_than_one_row(con):
    with pytest.raises(ValueError, match="one row with one column"):
        db.scalar(con, "SELECT x FROM t")


def test_scalar_rejects_a_query_that_returns_no_rows(con):
    with pytest.raises(ValueError, match="one row with one column"):
        db.scalar(con, "SELECT x FROM t WHERE false")


def test_scalar_rejects_a_query_that_returns_more_than_one_column(con):
    with pytest.raises(ValueError, match="one row with one column"):
        db.scalar(con, "SELECT 1, 2")
