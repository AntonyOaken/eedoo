#!/usr/bin/env bash
set -euo pipefail
file="${1:?Usage: ops/restore.sh backups/file.dump}"
# Restore into a separate DB for verification; active DB is untouched.
docker compose exec -T db createdb -U poputi poputi_restore
docker compose exec -T db pg_restore -U poputi -d poputi_restore --exit-on-error < "$file"
docker compose exec -T db psql -U poputi -d poputi_restore -c 'SELECT revision FROM catalog_state; SELECT count(*) FROM places;'
