"""Back up and restore the SQLite database with SQLite's online backup API.

    python -m app.backup backup [--dir backups] [--every SECONDS]
    python -m app.backup restore <backup file> [--dir backups]

The backup API copies a consistent snapshot, including writes still sitting
in the WAL file, while the app keeps running; copying the .db file by hand
could miss those or catch a write half-done. Restore with the app stopped:
it first backs up the database it replaces (`pre-restore-...`), then copies
the chosen backup over it.
"""

import argparse
import os
import sqlite3
import sys
import time
from contextlib import closing
from datetime import datetime
from pathlib import Path

from sqlalchemy.engine import make_url

from app.db import DATABASE_URL


def database_path() -> Path:
    return Path(make_url(os.environ.get("DATABASE_URL") or DATABASE_URL).database)


def _copy(source: Path, target: Path) -> None:
    with closing(sqlite3.connect(source)) as src, closing(sqlite3.connect(target)) as dst:
        src.backup(dst)


def backup(db_path: Path, backup_dir: Path, now: datetime | None = None,
           prefix: str = "tournament_tracker") -> Path:
    """Copy `db_path` into `backup_dir` as <prefix>-<YYYYmmdd-HHMMSS>.db."""
    if not Path(db_path).exists():
        raise ValueError(f"no database at {db_path}")
    backup_dir = Path(backup_dir)
    backup_dir.mkdir(parents=True, exist_ok=True)
    target = backup_dir / f"{prefix}-{(now or datetime.now()).strftime('%Y%m%d-%H%M%S')}.db"
    _copy(Path(db_path), target)
    return target


def _check_usable(backup_file: Path) -> None:
    try:
        with closing(sqlite3.connect(backup_file)) as connection:
            result = connection.execute("PRAGMA integrity_check").fetchone()[0]
    except sqlite3.DatabaseError as error:
        raise ValueError(f"{backup_file} is not a usable SQLite database ({error})") from error
    if result != "ok":
        raise ValueError(f"{backup_file} is not a usable SQLite database ({result})")


def restore(backup_file: Path, db_path: Path, backup_dir: Path) -> Path | None:
    """Replace the database at `db_path` with `backup_file`.

    Returns the backup taken of the replaced database, if there was one.
    """
    backup_file = Path(backup_file)
    if not backup_file.is_file():
        raise ValueError(f"no backup file {backup_file}")
    _check_usable(backup_file)
    replaced = backup(db_path, backup_dir, prefix="pre-restore") if Path(db_path).exists() else None
    _copy(backup_file, Path(db_path))
    return replaced


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.backup", description=__doc__.splitlines()[0])
    commands = parser.add_subparsers(dest="command", required=True)
    backup_command = commands.add_parser("backup", help="take a timestamped backup")
    backup_command.add_argument(
        "--every", type=int, metavar="SECONDS", help="keep taking one every SECONDS"
    )
    restore_command = commands.add_parser("restore", help="replace the database with a backup")
    restore_command.add_argument("file", type=Path)
    for command in (backup_command, restore_command):
        command.add_argument("--dir", type=Path, default=Path(os.environ.get("BACKUP_DIR", "backups")))
    args = parser.parse_args(argv)

    try:
        if args.command == "restore":
            replaced = restore(args.file, database_path(), args.dir)
            print(f"Restored {args.file}." + (f" The replaced database is in {replaced}." if replaced else ""))
            return 0
        while True:
            print(f"Backed up to {backup(database_path(), args.dir)}", flush=True)
            if not args.every:
                return 0
            time.sleep(args.every)
    except ValueError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
