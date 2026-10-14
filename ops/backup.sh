#!/usr/bin/env bash
set -euo pipefail
umask 077
mkdir -p backups
file="backups/poputi-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose exec -T db pg_dump -U poputi -d poputi -Fc > "$file.tmp"
test -s "$file.tmp"
mv "$file.tmp" "$file"
sha256sum "$file" > "$file.sha256"
printf 'Backup: %s\n' "$file"
