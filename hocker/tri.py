"""Match EPA TRI metal air-release reports to OSHA facilities conservatively."""
from __future__ import annotations

import csv
from collections import defaultdict
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Iterable

from . import config
from .facilities import normalize_name, zip5

YEAR = "1. YEAR"
FACILITY_NAME = "4. FACILITY NAME"
STATE = "8. ST"
ZIP = "9. ZIP"
CHEMICAL = "37. CHEMICAL"
METAL = "44. METAL"
FORM_TYPE = "49. FORM TYPE"
UNIT = "50. UNIT OF MEASURE"
FUGITIVE_AIR = "51. 5.1 - FUGITIVE AIR"
STACK_AIR = "52. 5.2 - STACK AIR"
NAICS_COLUMNS = (
    "30. PRIMARY NAICS", "31. NAICS 2", "32. NAICS 3",
    "33. NAICS 4", "34. NAICS 5", "35. NAICS 6",
)
REQUIRED_COLUMNS = {
    YEAR, FACILITY_NAME, STATE, ZIP, CHEMICAL, METAL, FORM_TYPE, UNIT,
    FUGITIVE_AIR, STACK_AIR, *NAICS_COLUMNS,
}


@dataclass(frozen=True)
class TriAirSignal:
    release_lbs: Decimal
    chemicals: tuple[str, ...]
    forms: int


@dataclass(frozen=True)
class MatchStats:
    matched_forms: int
    unmatched_forms: int
    ambiguous_forms: int


def _amount(value: str | None, column: str, line: int) -> Decimal:
    text = (value or "").strip()
    if not text or text.upper() in {"NA", "N/A", "NE", "NR"}:
        return Decimal(0)
    try:
        amount = Decimal(text.replace(",", ""))
    except InvalidOperation as exc:
        raise ValueError(f"Invalid EPA TRI amount in {column} at line {line}: {text!r}") from exc
    if not amount.is_finite() or amount < 0:
        raise ValueError(f"Invalid EPA TRI amount in {column} at line {line}: {text!r}")
    return amount


def read_signals(
    paths: Iterable[Path],
    facilities: Iterable[tuple[str, str, str, str]],
) -> tuple[dict[str, TriAirSignal], MatchStats]:
    """Return exact name/ZIP/state matches with positive reported metal air releases.

    EPA's TRI Basic Data is a CSV grouped by reporting year. Facilities match only
    when the normalized facility name, five-digit ZIP, and state map to one OSHA
    facility; ambiguous matches are deliberately left unscored.
    """
    facility_ids: dict[tuple[str, str, str], set[str]] = defaultdict(set)
    for facility_id, name, state, zipcode in facilities:
        key = (normalize_name(name), state, zip5(zipcode))
        if all(key):
            facility_ids[key].add(facility_id)

    releases: dict[str, Decimal] = defaultdict(Decimal)
    chemicals: dict[str, set[str]] = defaultdict(set)
    forms: dict[str, int] = defaultdict(int)
    matched = unmatched = ambiguous = 0

    for path in paths:
        state_for_file = path.stem.rsplit("_", 1)[-1]
        if state_for_file not in config.TERRITORY:
            raise ValueError(f"Unexpected EPA TRI state file: {path.name}")
        with path.open(encoding="utf-8-sig", newline="") as source:
            reader = csv.DictReader(source)
            columns = set(reader.fieldnames or ())
            missing = REQUIRED_COLUMNS - columns
            if missing:
                raise ValueError(f"{path.name} is missing EPA TRI columns: {', '.join(sorted(missing))}")
            for line, row in enumerate(reader, start=2):
                if row[YEAR].strip() != str(config.TRI_DATA_YEAR):
                    raise ValueError(
                        f"{path.name} contains TRI year {row[YEAR]!r}; expected {config.TRI_DATA_YEAR}"
                    )
                if row[STATE].strip().upper() != state_for_file:
                    raise ValueError(
                        f"{path.name} contains state {row[STATE]!r} at line {line}; "
                        f"expected {state_for_file}"
                    )
                if row[METAL].strip().upper() != "YES" or row[FORM_TYPE].strip().upper() != "R":
                    continue
                if row[UNIT].strip().lower() != "pounds":
                    continue
                amount = _amount(row[FUGITIVE_AIR], FUGITIVE_AIR, line)
                amount += _amount(row[STACK_AIR], STACK_AIR, line)
                if amount <= 0:
                    continue

                key = (
                    normalize_name(row[FACILITY_NAME]),
                    row[STATE].strip().upper(),
                    zip5(row[ZIP]),
                )
                matches = facility_ids.get(key, set())
                target_industry = any(
                    (row[column] or "").strip().startswith(config.TARGET_NAICS_PREFIXES)
                    for column in NAICS_COLUMNS
                )
                if len(matches) != 1:
                    if matches and target_industry:
                        ambiguous += 1
                    elif target_industry:
                        unmatched += 1
                    continue

                facility_id = next(iter(matches))
                matched += 1
                releases[facility_id] += amount
                chemicals[facility_id].add(row[CHEMICAL].strip())
                forms[facility_id] += 1

    signals = {
        facility_id: TriAirSignal(releases[facility_id], tuple(sorted(chemicals[facility_id])),
                                  forms[facility_id])
        for facility_id in releases
    }
    return signals, MatchStats(matched, unmatched, ambiguous)
