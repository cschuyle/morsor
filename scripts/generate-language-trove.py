#!/usr/bin/env python3
"""Generate iso639-languages trove JSON from fixtures/data/iso639-source.tsv."""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SOURCE_PATH = REPO_ROOT / "fixtures" / "data" / "iso639-source.tsv"
OUTPUT_PATHS = [
    REPO_ROOT / "fixtures" / "data" / "iso639-languages.json",
    REPO_ROOT / "src" / "main" / "resources" / "reference" / "iso639-languages.json",
]
TROVE_ID = "iso639-languages"


def parse_source(path: Path) -> list[dict]:
    rows: list[dict] = []
    for line_no, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) < 2:
            raise ValueError(f"{path}:{line_no}: expected tab-separated code, title[, aliases]")
        code = parts[0].strip()
        title = parts[1].strip()
        aliases = [a.strip() for a in parts[2].split(",") if a.strip()] if len(parts) > 2 and parts[2].strip() else []
        if not code or not title:
            raise ValueError(f"{path}:{line_no}: code and title are required")
        item: dict = {"code": code, "title": title}
        if aliases:
            item["aliases"] = aliases
        rows.append(item)
    return rows


def build_trove(rows: list[dict]) -> dict:
    """One trove item per lookup key (2- and 3-letter codes) so ISO 639-2 subtitle codes resolve directly."""
    items: list[dict] = []
    seen_codes: set[str] = set()
    for row in rows:
        codes = [row["code"], *row.get("aliases", [])]
        for code in codes:
            c = code.strip()
            if not c or c in seen_codes:
                continue
            seen_codes.add(c)
            items.append({"languageCode": {"code": c, "title": row["title"]}})
    return {
        "id": TROVE_ID,
        "name": "ISO 639 Language Codes",
        "shortName": "Languages",
        "items": items,
    }


def main() -> int:
    if not SOURCE_PATH.is_file():
        print(f"Source file not found: {SOURCE_PATH}", file=sys.stderr)
        return 1
    rows = parse_source(SOURCE_PATH)
    if not rows:
        print(f"No language rows in {SOURCE_PATH}", file=sys.stderr)
        return 1
    trove = build_trove(rows)
    payload = json.dumps(trove, indent=2, ensure_ascii=False) + "\n"
    lookup_count = len(trove["items"])
    for output_path in OUTPUT_PATHS:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(payload, encoding="utf-8")
        print(f"Wrote {lookup_count} lookup keys ({len(rows)} language rows) to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
