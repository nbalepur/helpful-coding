import argparse
import csv
import json
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List


def _ensure_repo_on_path() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    if str(repo_root) not in sys.path:
        sys.path.insert(0, str(repo_root))


def _serialize(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def _get_tables():
    from database.config import Base
    import database.sqlalchemy_models  # noqa: F401
    return list(Base.metadata.sorted_tables)


def _fetch_rows(table) -> List[Dict[str, Any]]:
    from database.config import engine

    with engine.connect() as conn:
        result = conn.execute(table.select())
        return [dict(row._mapping) for row in result]


def _export_json(output_path: Path) -> None:
    data: Dict[str, List[Dict[str, Any]]] = {}
    for table in _get_tables():
        rows = _fetch_rows(table)
        data[table.name] = rows

    output_path.write_text(
        json.dumps(data, default=_serialize, indent=2),
        encoding="utf-8",
    )


def _export_csv(output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    for table in _get_tables():
        rows = _fetch_rows(table)
        output_file = output_dir / f"{table.name}.csv"
        if not rows:
            output_file.write_text("", encoding="utf-8")
            continue

        fieldnames = list(rows[0].keys())
        with output_file.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            writer.writeheader()
            for row in rows:
                writer.writerow({k: _serialize(v) for k, v in row.items()})


def _print_stats() -> None:
    from sqlalchemy import func, select
    from database.config import engine

    print("📊 Database stats")
    for table in _get_tables():
        with engine.connect() as conn:
            count = conn.execute(select(func.count()).select_from(table)).scalar_one()
        print(f"  • {table.name}: {count}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Export database data or stats")
    parser.add_argument(
        "command",
        choices=["json", "csv", "stats"],
        help="Export format or stats",
    )
    parser.add_argument(
        "output",
        nargs="?",
        help="Output file (json) or directory (csv)",
    )
    args = parser.parse_args()

    _ensure_repo_on_path()
    if args.command == "json":
        output_path = Path(args.output or "data_export.json")
        _export_json(output_path)
        print(f"✅ Exported JSON to {output_path}")
        return 0
    if args.command == "csv":
        output_dir = Path(args.output or "data_export")
        _export_csv(output_dir)
        print(f"✅ Exported CSV files to {output_dir}")
        return 0

    _print_stats()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
