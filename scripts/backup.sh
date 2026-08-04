#!/usr/bin/env bash
# Database backup for Computer Room Manager.
# Usage: DATABASE_URL=postgres://... ./scripts/backup.sh [output-dir]
# Schedule via cron/systemd. Keep backups off-box (object storage) for durability.
set -euo pipefail

OUT_DIR="${1:-./backups}"
mkdir -p "$OUT_DIR"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$OUT_DIR/crm-${STAMP}.sql.gz"

echo "Backing up database → $FILE"
pg_dump --no-owner --no-privileges "$DATABASE_URL" | gzip > "$FILE"

# Retain the 14 most recent backups locally.
ls -1t "$OUT_DIR"/crm-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm --
echo "Done. Local backups:"
ls -1t "$OUT_DIR"/crm-*.sql.gz | head
