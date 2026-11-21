import json
from datetime import date, datetime, timezone

from hocker import config
from hocker.export import HISTORY_RUNS, _delta


def _read(tmp_path, name):
    return json.loads((tmp_path / name).read_text())


def test_score_snapshot_history_keeps_the_latest_runs_and_run_timestamps_are_consistent(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    ranked = [{"facility_id": "facility-1", "total": 7}]

    for day in range(1, 16):
        _delta([], date(2026, 1, day), ranked)

    history = _read(tmp_path, "score_snapshots.json")["history"]
    kept = [f"2026-01-{day:02d}" for day in range(15, 15 - HISTORY_RUNS, -1)]
    assert [entry["as_of"] for entry in history] == kept
    state_history = _read(tmp_path, "state.json")["history"]
    assert [entry["as_of"] for entry in state_history] == kept
    state_timestamps = {entry["as_of"]: entry["scored_at"] for entry in state_history}

    for entry in history:
        run_timestamp = entry["scored_at"]
        assert run_timestamp == entry["leads"][0]["scored_at"]
        assert run_timestamp == state_timestamps[entry["as_of"]]
        assert run_timestamp.endswith("Z")
        parsed = datetime.fromisoformat(run_timestamp.replace("Z", "+00:00"))
        assert parsed.tzinfo == timezone.utc


def test_rerunning_the_same_date_replaces_that_run_instead_of_adding_one(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    ranked = [{"facility_id": "facility-1", "total": 7}]

    _delta(["a"], date(2026, 1, 1), ranked)
    _delta(["a"], date(2026, 1, 2), ranked)
    _delta(["a"], date(2026, 1, 2), ranked)

    assert [e["as_of"] for e in _read(tmp_path, "score_snapshots.json")["history"]] == ["2026-01-02", "2026-01-01"]
    assert [e["as_of"] for e in _read(tmp_path, "state.json")["history"]] == ["2026-01-02", "2026-01-01"]


def test_rerun_on_the_same_date_still_compares_new_hot_leads_with_the_earlier_date(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)

    assert _delta(["a"], date(2026, 1, 1)) == []  # first run: nothing to compare with
    assert _delta(["a", "b"], date(2026, 1, 2)) == ["b"]
    assert _delta(["a", "b"], date(2026, 1, 2)) == ["b"]  # same data again: "b" is still new
    assert _read(tmp_path, "state.json")["previous_as_of"] == "2026-01-01"


def test_state_file_from_before_history_still_counts_as_the_earlier_run(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    (tmp_path / "state.json").write_text(json.dumps(
        {"as_of": "2025-09-23", "previous_as_of": None, "hot_ids": ["a"]}))

    assert _delta(["a", "b"], date(2026, 1, 2)) == ["b"]
    assert _delta(["a", "b"], date(2026, 1, 2)) == ["b"]
    assert [e["as_of"] for e in _read(tmp_path, "state.json")["history"]] == ["2026-01-02", "2025-09-23"]
