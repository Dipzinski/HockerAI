import json
from datetime import date, datetime, timezone

from hocker import config
from hocker.export import _delta


def test_score_snapshot_history_is_unbounded_and_run_timestamps_are_consistent(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    ranked = [{"facility_id": "facility-1", "total": 7}]

    for day in range(1, 16):
        _delta([], date(2026, 1, day), ranked)

    snapshots = json.loads((tmp_path / "score_snapshots.json").read_text())
    history = snapshots["history"]
    assert len(history) == 15
    assert {entry["as_of"] for entry in history} == {
        f"2026-01-{day:02d}" for day in range(1, 16)
    }
    state_history = json.loads((tmp_path / "state.json").read_text())["history"]
    state_timestamps = {entry["as_of"]: entry["scored_at"] for entry in state_history}

    for entry in history:
        run_timestamp = entry["scored_at"]
        lead_timestamp = entry["leads"][0]["scored_at"]
        assert run_timestamp == lead_timestamp
        if entry["as_of"] in state_timestamps:
            assert run_timestamp == state_timestamps[entry["as_of"]]
        assert run_timestamp.endswith("Z")
        parsed = datetime.fromisoformat(run_timestamp.replace("Z", "+00:00"))
        assert parsed.tzinfo == timezone.utc
