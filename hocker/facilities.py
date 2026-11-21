"""Merge inspection records into facilities (entity resolution).

OSHA has no stable facility ID: each inspection stores the establishment name and
address as typed by the inspector, so one plant shows up as "SAUDER WOODWORKING CO",
"Sauder Woodworking Company", and so on. Two inspections are treated as the same
facility when they share a ZIP code and either
  1. the same normalized name, or
  2. the same normalized street address and a similar name
     (so two tenants of one industrial building stay separate).
Linked records are grouped with union-find.
"""
from __future__ import annotations

import hashlib
import re
from collections import defaultdict
from typing import Iterable

LEGAL_SUFFIXES = {
    "INC", "INCORPORATED", "LLC", "CO", "COMPANY", "CORP", "CORPORATION",
    "LTD", "LIMITED", "LP", "LLP", "PLLC", "PC", "THE",
}
STREET_WORDS = {
    "STREET": "ST", "AVENUE": "AVE", "AV": "AVE", "ROAD": "RD", "DRIVE": "DR",
    "BOULEVARD": "BLVD", "LANE": "LN", "COURT": "CT", "PARKWAY": "PKWY",
    "HIGHWAY": "HWY", "PLACE": "PL", "CIRCLE": "CIR", "TRAIL": "TRL",
    "NORTH": "N", "SOUTH": "S", "EAST": "E", "WEST": "W", "SUITE": "STE",
}


def _tokens(text: str) -> list[str]:
    text = text.upper().replace("&", " AND ")
    return re.sub(r"[^A-Z0-9 ]+", " ", text).split()


def strip_record_prefix(name: str) -> str:
    """Some state records put an internal number before the name: "110584 - ACME INC"."""
    return re.sub(r"^\s*\d{5,}\s*-\s*", "", name).rstrip("* ").strip()


def normalize_name(name: str | None) -> str:
    """Uppercase, drop punctuation, legal suffixes, and anything after "DBA"."""
    raw = strip_record_prefix(name or "").upper()
    raw = re.split(r"\b(?:D/B/A|DBA|D B A)\b", raw)[0]
    text = re.sub(r"\bL L C\b", "LLC", " ".join(_tokens(raw)))
    return " ".join(t for t in text.split() if t not in LEGAL_SUFFIXES)


def normalize_address(address: str | None) -> str:
    """Uppercase, standard abbreviations, no suite or unit numbers."""
    raw = (address or "").upper()
    raw = re.split(r"\b(?:STE|SUITE|UNIT|BLDG|#)\b", raw)[0]
    tokens = [STREET_WORDS.get(t, t) for t in _tokens(raw)]
    return " ".join(tokens)


def zip5(zipcode: str | None) -> str:
    digits = re.sub(r"\D", "", zipcode or "")
    return digits[:5].zfill(5) if digits else ""


def names_similar(a: str, b: str) -> bool:
    """True when two normalized names share their first word or half their words."""
    ta, tb = set(a.split()), set(b.split())
    if not ta or not tb:
        return False
    if a.split()[0] == b.split()[0]:
        return True
    return len(ta & tb) / len(ta | tb) >= 0.5


class UnionFind:
    def __init__(self) -> None:
        self.parent: dict[str, str] = {}

    def find(self, x: str) -> str:
        self.parent.setdefault(x, x)
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a: str, b: str) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            # Keep the smaller key as the root so results don't depend on input order.
            if rb < ra:
                ra, rb = rb, ra
            self.parent[rb] = ra


def resolve_with_review(
    rows: Iterable[tuple[str, str, str, str, str]],
) -> tuple[dict[str, str], set[str]]:
    """Resolve inspections and identify records that need manual matching review.

    rows: (activity_nr, estab_name, site_address, site_zip, site_state)
    Records without both a ZIP and state remain unmerged and are returned in the
    review set. For otherwise unambiguous name/ZIP pairs, keep the prior stable ID.
    """
    records = list(rows)
    states_by_name_zip: dict[tuple[str, str], set[str]] = defaultdict(set)
    normalized: list[tuple[str, str, str, str, str]] = []
    for activity_nr, name, address, zipcode, state in records:
        z = zip5(zipcode)
        n = normalize_name(name) or f"UNNAMED {activity_nr}"
        st = (state or "").strip().upper()
        normalized.append((activity_nr, n, address, z, st))
        if z and st:
            states_by_name_zip[(n, z)].add(st)

    uf = UnionFind()
    by_address: dict[tuple[str, str, str], list[str]] = defaultdict(list)
    name_key: dict[str, str] = {}
    key_name: dict[str, str] = {}
    review_required: set[str] = set()

    for activity_nr, n, address, z, state in normalized:
        if not z or not state:
            # Missing location data cannot establish identity: never name-only merge.
            key = f"{n}|{state}|{z}|REVIEW|{activity_nr}"
            review_required.add(activity_nr)
        elif len(states_by_name_zip[(n, z)]) > 1:
            key = f"{n}|{state}|{z}"
        else:
            # Preserve established IDs for the usual, single-state name/ZIP group.
            key = f"{n}|{z}"
        name_key[activity_nr] = key
        key_name[key] = n
        uf.find(key)
        addr = normalize_address(address)
        if state and z and addr and any(ch.isdigit() for ch in addr):
            by_address[(addr, state, z)].append(key)

    # Link different names only when the street address, state, and ZIP all agree.
    for keys in by_address.values():
        unique = sorted(set(keys))
        for i, a in enumerate(unique):
            for b in unique[i + 1:]:
                if names_similar(key_name[a], key_name[b]):
                    uf.union(a, b)

    return ({nr: facility_id(uf.find(key)) for nr, key in name_key.items()}, review_required)


def resolve(rows: Iterable[tuple[str, str, str, str, str]]) -> dict[str, str]:
    """Map each inspection to a facility ID; use resolve_with_review for review flags."""
    return resolve_with_review(rows)[0]


def facility_id(root_key: str) -> str:
    """Short, stable ID derived from the group's root key."""
    return "f" + hashlib.sha1(root_key.encode()).hexdigest()[:10]
