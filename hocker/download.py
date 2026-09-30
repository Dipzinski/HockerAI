"""Download the OSHA bulk files from the Department of Labor, skipping unchanged ones.

The DOL republishes each table as a zip of CSV chunks once a day. A sidecar
`.meta.json` stores the Last-Modified header from the last download, so a rerun
only fetches files that changed.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import requests

from . import config


def _download(url: str, dest: Path, retries: int = 3) -> None:
    tmp = dest.with_suffix(dest.suffix + ".part")
    for attempt in range(1, retries + 1):
        try:
            with requests.get(url, stream=True, timeout=60) as r:
                r.raise_for_status()
                with open(tmp, "wb") as f:
                    for chunk in r.iter_content(chunk_size=1 << 20):
                        f.write(chunk)
            tmp.replace(dest)
            return
        except requests.RequestException as e:
            if attempt == retries:
                raise
            wait = 5 * attempt
            print(f"  retry {attempt} for {dest.name} in {wait}s ({e})")
            time.sleep(wait)


def fetch(url: str, dest: Path) -> bool:
    """Download url to dest if the server copy is newer. Returns True if downloaded."""
    meta_path = dest.with_suffix(".meta.json")
    head = requests.head(url, timeout=30, allow_redirects=True)
    head.raise_for_status()
    remote = {
        "last_modified": head.headers.get("Last-Modified"),
        "size": int(head.headers.get("Content-Length", 0)),
    }
    if dest.exists() and meta_path.exists():
        local = json.loads(meta_path.read_text())
        if local == remote and dest.stat().st_size == remote["size"]:
            print(f"  {dest.name}: unchanged ({remote['last_modified']})")
            return False
    print(f"  {dest.name}: downloading {remote['size'] / 1e6:,.0f} MB")
    _download(url, dest)
    meta_path.write_text(json.dumps(remote))
    return True


def run() -> dict[str, str]:
    """Fetch every table. Returns {table: Last-Modified} for the run log."""
    config.RAW_DIR.mkdir(parents=True, exist_ok=True)
    stamps = {}
    for table in config.DOL_TABLES:
        dest = config.RAW_DIR / f"OSHA_{table}.zip"
        fetch(config.DOL_URL.format(table=table), dest)
        stamps[table] = json.loads(dest.with_suffix(".meta.json").read_text())["last_modified"]
    fetch(config.ZCTA_URL, config.RAW_DIR / "zcta_gazetteer.zip")
    return stamps
