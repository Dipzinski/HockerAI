import csv
from decimal import Decimal

import pytest

from hocker import config, tri

HEADERS = [
    tri.YEAR, tri.FACILITY_NAME, tri.STATE, tri.ZIP, tri.CHEMICAL, tri.METAL,
    tri.FORM_TYPE, tri.UNIT, tri.FUGITIVE_AIR, tri.STACK_AIR,
    *tri.NAICS_COLUMNS,
]


def row(**overrides):
    values = {
        tri.YEAR: str(config.TRI_DATA_YEAR),
        tri.FACILITY_NAME: "SAUDER WOODWORKING CO",
        tri.STATE: "MI",
        tri.ZIP: "49001-1234",
        tri.CHEMICAL: "Chromium",
        tri.METAL: "YES",
        tri.FORM_TYPE: "R",
        tri.UNIT: "Pounds",
        tri.FUGITIVE_AIR: "2.5",
        tri.STACK_AIR: "1.5",
        tri.NAICS_COLUMNS[0]: "332710",
        **{column: "" for column in tri.NAICS_COLUMNS[1:]},
    }
    return {**values, **overrides}


def write_file(tmp_path, rows):
    path = tmp_path / f"TRI_{config.TRI_DATA_YEAR}_MI.csv"
    with path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=HEADERS)
        writer.writeheader()
        writer.writerows(rows)
    return path


def test_matches_metal_air_release_by_normalized_name_zip_and_state(tmp_path):
    path = write_file(tmp_path, [row()])
    signals, stats = tri.read_signals(
        [path], [("f1", "Sauder Woodworking Company", "MI", "49001")]
    )
    assert signals["f1"].release_lbs == Decimal("4.0")
    assert signals["f1"].chemicals == ("Chromium",)
    assert signals["f1"].forms == 1
    assert (stats.matched_forms, stats.unmatched_forms, stats.ambiguous_forms) == (1, 0, 0)


def test_ignores_nonmetal_and_form_a_rows(tmp_path):
    path = write_file(tmp_path, [
        row(**{tri.METAL: "NO"}),
        row(**{tri.FORM_TYPE: "A"}),
    ])
    signals, stats = tri.read_signals(
        [path], [("f1", "Sauder Woodworking Company", "MI", "49001")]
    )
    assert not signals
    assert stats.matched_forms == stats.unmatched_forms == stats.ambiguous_forms == 0


def test_does_not_score_unmatched_or_ambiguous_names(tmp_path):
    path = write_file(tmp_path, [row(), row(**{tri.FACILITY_NAME: "UNMATCHED COMPANY"})])
    signals, stats = tri.read_signals(
        [path], [
            ("f1", "Sauder Woodworking Company", "MI", "49001"),
            ("f2", "Sauder Woodworking Co", "MI", "49001"),
        ]
    )
    assert not signals
    assert stats.ambiguous_forms == 1
    assert stats.unmatched_forms == 1


def test_unmatched_form_count_is_limited_to_target_industries(tmp_path):
    path = write_file(tmp_path, [
        row(**{tri.FACILITY_NAME: "UNMATCHED COMPANY"}),
        row(**{tri.FACILITY_NAME: "ANOTHER COMPANY", tri.NAICS_COLUMNS[0]: "541330"}),
    ])
    _, stats = tri.read_signals(
        [path], [("f1", "Sauder Woodworking Company", "MI", "49001")]
    )
    assert stats.unmatched_forms == 1


def test_rejects_wrong_year_state_and_invalid_amount(tmp_path):
    path = write_file(tmp_path, [row(**{tri.YEAR: "2023"})])
    with pytest.raises(ValueError, match="expected"):
        tri.read_signals([path], [])

    path = write_file(tmp_path, [row(**{tri.STATE: "OH"})])
    with pytest.raises(ValueError, match="expected MI"):
        tri.read_signals([path], [])

    path = write_file(tmp_path, [row(**{tri.FUGITIVE_AIR: "not-a-number"})])
    with pytest.raises(ValueError, match="Invalid EPA TRI amount"):
        tri.read_signals([path], [("f1", "Sauder Woodworking Company", "MI", "49001")])
