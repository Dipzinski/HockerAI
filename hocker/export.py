"""Write the outputs: lead CSV, Markdown report, new-lead delta, dashboard JSON, run log."""
from __future__ import annotations

import csv
import json
from collections import Counter
from datetime import date

import duckdb

from . import config
from .facilities import strip_record_prefix

OSHA_LINK = "https://www.osha.gov/ords/imis/establishment.inspection_detail?id={}.015"
VIOL_TYPES = {"S": "Serious", "W": "Willful", "R": "Repeat", "O": "Other-than-serious", "U": "Unclassified"}
KEEP_UPPER = {"LLC", "USA", "US", "II", "III", "IV", "CNC", "AG", "LP"}
SMALL_WORDS = {"AND", "OF", "THE", "FOR", "DBA"}


def pretty_name(name: str) -> str:
    """OSHA stores most names in capitals; make them readable without mangling acronyms."""
    name = strip_record_prefix(name)
    if not name.isupper():
        return name
    words = []
    for i, w in enumerate(name.split()):
        core = w.strip(".,")
        if core in KEEP_UPPER or (len(core) <= 3 and not core.isalpha()):
            words.append(w)
        elif core in SMALL_WORDS and i > 0:
            words.append(w.lower())
        else:
            words.append(w.capitalize())
    return " ".join(words)


def public_hold(reason: str | None) -> str | None:
    """Short label for the public dashboard; incident details stay out of it."""
    if reason is None:
        return None
    return "contested citation" if "contest" in reason else "recent serious incident"


def _leads(con: duckdb.DuckDBPyConnection) -> list[dict]:
    rel = con.sql("""
        SELECT s.*, f.name, f.address, f.city, f.state, f.zip5, f.naics, f.employees,
               f.n_inspections, f.n_inspections_window, f.last_inspection, z.lat, z.lon
        FROM scores s JOIN facilities f USING (facility_id)
        LEFT JOIN zip_centroids z ON z.zip5 = f.zip5
        ORDER BY s.total DESC, s.evidence_date DESC NULLS LAST, f.employees DESC NULLS LAST, f.name
    """)
    return [dict(zip(rel.columns, r)) for r in rel.fetchall()]


def _evidence_by_facility(con: duckdb.DuckDBPyConnection, ids: set[str]) -> dict[str, list[dict]]:
    """Inspections with dust-related evidence, newest first. Unrelated citations are only counted."""
    rows = con.sql("""
        SELECT facility_id, activity_nr, open_date, dust_program, kind, citation, title, category,
               viol_type, evidence_date, current_penalty, initial_penalty, contest_date, final_order_date
        FROM evidence
        ORDER BY facility_id, open_date DESC, activity_nr, kind DESC, category, citation
    """).fetchall()
    out: dict[str, dict[int, dict]] = {}
    for (fid, nr, opened, program, kind, citation, title, category, vtype, issued,
         penalty, initial, contest, final) in rows:
        if fid not in ids:
            continue
        insp = out.setdefault(fid, {}).setdefault(nr, {
            "inspection_id": str(nr), "opened": str(opened), "dust_program": program,
            "url": OSHA_LINK.format(nr), "citations": [], "other_citations": 0})
        if kind != "citation":
            continue
        if category == "other":
            insp["other_citations"] += 1
            continue
        insp["citations"].append({
            "standard": citation, "title": title, "category": category,
            "type": VIOL_TYPES.get(vtype, vtype), "issued": str(issued),
            "penalty_usd": round(penalty if penalty is not None else (initial or 0)),
            "under_contest": contest is not None and final is None,
        })
    return {fid: [i for i in v.values() if i["citations"] or i["dust_program"]] for fid, v in out.items()}


def _lead_record(r: dict, inspections: list[dict]) -> dict:
    return {
        "id": r["facility_id"], "name": pretty_name(r["name"]), "city": (r["city"] or "").title(),
        "state": r["state"], "zip": r["zip5"], "lat": r["lat"], "lon": r["lon"],
        "industry": r["industry"], "naics": r["naics"], "employees": r["employees"],
        "score": {"industry": r["industry_pts"], "dust": r["dust_pts"], "recency": r["recency_pts"],
                  "size": r["size_pts"], "total": r["total"]},
        "tier": r["tier"], "confidence": r["confidence"], "hold": public_hold(r["hold_reason"]),
        "outreach_eligible": r["outreach_eligible"], "dust_reason": r["dust_reason"],
        "evidence_date": str(r["evidence_date"]) if r["evidence_date"] else None,
        "inspections_since_2019": r["n_inspections"], "inspections": inspections,
    }


def _write_csv(leads: list[dict]) -> None:
    fields = ["rank", "facility_id", "name", "city", "state", "zip5", "industry", "naics", "employees",
              "industry_pts", "dust_pts", "recency_pts", "size_pts", "total", "tier", "confidence",
              "hold_reason", "outreach_eligible", "evidence_date", "dust_reason",
              "n_inspections", "last_inspection"]
    with open(config.OUTPUT_DIR / "leads.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for i, r in enumerate(leads, 1):
            w.writerow({**r, "rank": i, "name": pretty_name(r["name"]), "city": (r["city"] or "").title()})


def _delta(hot_ids: list[str], as_of: date) -> list[str]:
    """Hot leads that weren't Hot in the previous run (v1's "daily scan", done with a state file)."""
    state_path = config.OUTPUT_DIR / "state.json"
    previous = json.loads(state_path.read_text()) if state_path.exists() else None
    new = [i for i in hot_ids if previous is None or i not in set(previous["hot_ids"])]
    state_path.write_text(json.dumps({
        "as_of": str(as_of),
        "previous_as_of": previous["as_of"] if previous else None,
        "hot_ids": hot_ids,
    }, indent=1))
    return new if previous else []


def _report(leads: list[dict], records: dict[str, dict], counts: dict, as_of: date,
            new_hot: list[str], checks) -> str:
    hot = [r for r in leads if r["tier"] == "Hot"]
    lines = [
        f"# Lead report: {as_of}",
        "",
        f"Source: OSHA enforcement data (US Department of Labor), inspections opened {config.LOAD_START} "
        f"to {as_of} at privately owned facilities in {', '.join(config.TERRITORY)} in the 7 target industries. "
        f"Scores use the last {config.EVIDENCE_WINDOW_MONTHS} months.",
        "",
        "## Summary",
        f"- Inspections loaded: {counts['inspections']:,} (from {counts['inspections_national']:,} nationwide)",
        f"- Facilities after merging duplicate records: {counts['facilities']:,}",
        f"- Hot: {counts['hot']:,} | Warm: {counts['warm']:,} | Archive: {counts['archive']:,}",
        f"- Outreach-eligible Hot leads: {counts['hot_eligible']:,} "
        f"(held for human review: {counts['held_hot']:,}; low confidence: {counts['low_conf_hot']:,})",
        f"- New Hot leads since the last run: {len(new_hot) if counts.get('previous_run') else 'n/a (first run)'}",
        f"- Data-quality checks passed: {sum(c.passed for c in checks)}/{len(checks)}",
        "",
        "## Top 25 Hot leads (outreach-eligible)",
        "",
        "| # | Facility | City | Industry | Employees | Score | Newest dust evidence |",
        "|---|---|---|---|---|---|---|",
    ]
    eligible = [r for r in hot if r["outreach_eligible"]]
    for i, r in enumerate(eligible[:25], 1):
        rec = records[r["facility_id"]]
        lines.append(f"| {i} | {rec['name']} | {rec['city']}, {r['state']} | {r['industry']} | "
                     f"{r['employees'] or 'n/a'} | {r['total']}/11 | {r['evidence_date']} |")
    lines += ["", "## Hot leads by state", "", "| State | Hot | Eligible |", "|---|---|---|"]
    by_state = Counter(r["state"] for r in hot)
    by_state_ok = Counter(r["state"] for r in eligible)
    for s in config.TERRITORY:
        lines.append(f"| {s} | {by_state[s]} | {by_state_ok[s]} |")
    lines += ["", "## Hot leads by industry", "", "| Industry | Hot | Eligible |", "|---|---|---|"]
    by_ind = Counter(r["industry"] for r in hot)
    by_ind_ok = Counter(r["industry"] for r in eligible)
    for label, _, _ in config.INDUSTRIES:
        lines.append(f"| {label} | {by_ind[label]} | {by_ind_ok[label]} |")
    lines += ["", "## Data-quality checks", ""]
    lines += [f"- {'PASS' if c.passed else 'FAIL'}: {c.name} ({c.detail})" for c in checks]
    return "\n".join(lines) + "\n"


def run(con: duckdb.DuckDBPyConnection, as_of: date, load_counts: dict, checks) -> dict:
    config.OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    config.DOCS_DATA_DIR.mkdir(parents=True, exist_ok=True)

    leads = _leads(con)
    shown = {r["facility_id"] for r in leads if r["tier"] in ("Hot", "Warm")}
    evidence = _evidence_by_facility(con, shown)
    records = {r["facility_id"]: _lead_record(r, evidence.get(r["facility_id"], []))
               for r in leads if r["facility_id"] in shown}

    tiers = Counter(r["tier"] for r in leads)
    hot = [r for r in leads if r["tier"] == "Hot"]
    counts = {
        "inspections_national": load_counts["inspection_rows_national"],
        "inspections": con.sql("SELECT count(*) FROM inspections").fetchone()[0],
        "citations": con.sql("SELECT count(*) FROM violations").fetchone()[0],
        "facilities": len(leads),
        "hot": tiers["Hot"], "warm": tiers["Warm"], "archive": tiers["Archive"],
        "hot_eligible": sum(r["outreach_eligible"] for r in hot),
        "held_hot": sum(r["hold_reason"] is not None for r in hot),
        "low_conf_hot": sum(r["confidence"] == "Low" and r["hold_reason"] is None for r in hot),
        "held_all": sum(r["hold_reason"] is not None for r in leads),
        "previous_run": (config.OUTPUT_DIR / "state.json").exists(),
    }
    new_hot = _delta([r["facility_id"] for r in hot], as_of)
    counts["new_hot_since_last_run"] = len(new_hot)

    _write_csv(leads)
    (config.OUTPUT_DIR / "report.md").write_text(_report(leads, records, counts, as_of, new_hot, checks))
    if counts["previous_run"]:
        body = [f"# New Hot leads as of {as_of}", ""]
        body += [f"- {records[i]['name']}, {records[i]['city']}, {records[i]['state']} "
                 f"({records[i]['score']['total']}/11)" for i in new_hot] or ["- None since the last run."]
        (config.OUTPUT_DIR / "new_hot_leads.md").write_text("\n".join(body) + "\n")

    dashboard = {
        "as_of": str(as_of),
        "territory": list(config.TERRITORY),
        "window_months": config.EVIDENCE_WINDOW_MONTHS,
        "counts": counts,
        "leads": [records[r["facility_id"]] for r in leads if r["facility_id"] in shown],
    }
    (config.DOCS_DATA_DIR / "leads.json").write_text(json.dumps(dashboard, separators=(",", ":")))

    summary = {"as_of": str(as_of), "load": load_counts, "counts": counts,
               "checks": [c.__dict__ for c in checks]}
    (config.OUTPUT_DIR / "run_log.json").write_text(json.dumps(summary, indent=1, default=str))
    return summary
