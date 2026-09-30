"""Command line: python -m hocker {download,build,briefs,all}."""
from __future__ import annotations

import argparse
import warnings

warnings.filterwarnings("ignore", message=".*OpenSSL.*")  # macOS system Python uses LibreSSL


def main() -> None:
    parser = argparse.ArgumentParser(prog="hocker", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("download", help="fetch the OSHA bulk files (skips unchanged files)")
    b = sub.add_parser("build", help="load, score, check, and export leads")
    b.add_argument("--skip-load", action="store_true", help="reuse the tables already in DuckDB")
    br = sub.add_parser("briefs", help="write verified lead briefs with Claude for top Hot leads")
    br.add_argument("--limit", type=int, default=None)
    br.add_argument("--dry-run", action="store_true", help="write the prompt inputs only; no API calls")
    sub.add_parser("all", help="download + build")
    args = parser.parse_args()

    if args.command in ("download", "all"):
        from . import download
        download.run()
    if args.command in ("build", "all"):
        from . import pipeline
        pipeline.build(skip_load=getattr(args, "skip_load", False))
    if args.command == "briefs":
        from . import briefs
        briefs.run(limit=args.limit, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
