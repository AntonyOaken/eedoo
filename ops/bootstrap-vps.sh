#!/usr/bin/env bash
# Install the private VPS preview. No SSH credentials are accepted or stored.
set -euo pipefail
umask 077
app_dir=/opt/poputi
repo_url=https://github.com/AntonyOaken/eedoo.git
if [[ $# -gt 1 || ( $# -eq 1 && "$1" != --dry-run ) ]]; then
  printf 'Usage: sudo bash ops/bootstrap-vps.sh [--dry-run]\n' >&2
  exit 2
fi
if [[ ! -r /etc/os-release ]]; then
  printf 'Cannot detect OS: send the contents of /etc/os-release.\n' >&2
  exit 1
fi
source /etc/os-release
case "$ID" in
  ubuntu) docker_distro=ubuntu; docker_suite=${UBUNTU_CODENAME:-$VERSION_CODENAME} ;;
  debian) docker_distro=debian; docker_suite=$VERSION_CODENAME ;;
  *) printf 'Supported OS: Ubuntu or Debian. Detected: %s\n' "$PRETTY_NAME" >&2; exit 1 ;;
esac
printf 'OS: %s\nArchitecture: %s\n' "$PRETTY_NAME" "$(uname -m)"
awk '/MemTotal/ {printf "RAM: %.1f GiB\n", $2/1024/1024}' /proc/meminfo
df -h /
if [[ ${1:-} == --dry-run ]]; then
  printf 'Plan: install Docker Engine and Compose from the official apt repository; clone %s into %s; generate application secrets; migrate and import PostgreSQL catalog; start preview on 127.0.0.1:8080; check readiness; create DB backup.\n' "$repo_url" "$app_dir"
  exit 0
fi
if [[ $EUID -ne 0 ]]; then
  printf 'Run with sudo. The OS may request your account password in the terminal.\n' >&2
  exit 1
fi
mkdir -p /var/log
exec > >(tee -a /var/log/poputi-bootstrap.log) 2>&1
trap 'printf "Installation failed at line %s. Log: /var/log/poputi-bootstrap.log\n" "$LINENO" >&2' ERR
printf '[1/7] System dependencies\n'
apt-get update
apt-get install -y ca-certificates curl git openssl python3
if command -v docker >/dev/null 2>&1; then
  if ! docker compose version >/dev/null 2>&1; then
    printf 'Docker exists but Compose is missing. No existing Docker packages were replaced.\n' >&2
    exit 1
  fi
else
  install -m 0755 -d /etc/apt/keyrings
  if [[ ! -s /etc/apt/keyrings/docker.asc ]]; then
    curl --fail --show-error --location "https://download.docker.com/linux/$docker_distro/gpg" --output /etc/apt/keyrings/docker.asc
  fi
  chmod a+r /etc/apt/keyrings/docker.asc
  arch=$(dpkg --print-architecture)
  cat > /etc/apt/sources.list.d/docker.sources <<APT
Types: deb
URIs: https://download.docker.com/linux/$docker_distro
Suites: $docker_suite
Components: stable
Architectures: $arch
Signed-By: /etc/apt/keyrings/docker.asc
APT
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker
docker compose version
printf '[2/7] Application source\n'
if [[ -e "$app_dir" ]]; then
  if [[ ! -d "$app_dir/.git" ]]; then
    printf '%s already exists and is not a Git checkout. Nothing was overwritten.\n' "$app_dir" >&2
    exit 1
  fi
  cd "$app_dir"
  [[ $(git remote get-url origin) == "$repo_url" ]] || { printf 'Unexpected repository origin.\n' >&2; exit 1; }
  [[ -z $(git status --porcelain --untracked-files=no) ]] || { printf 'Local source changes exist; stopping before update.\n' >&2; exit 1; }
  [[ $(git branch --show-current) == main ]] || { printf 'Expected main branch.\n' >&2; exit 1; }
  git pull --ff-only origin main
else
  git clone --depth 1 --branch main "$repo_url" "$app_dir"
  cd "$app_dir"
fi
printf '[3/7] Runtime configuration\n'
if [[ ! -e .env ]]; then
  db_password=$(openssl rand -hex 32)
  metrics_token=$(openssl rand -hex 32)
  tile_url=${POPUTI_TILE_URL:-'https://tile.openstreetmap.org/{z}/{x}/{y}.png'}
  if [[ "$tile_url" == *$'\n'* || "$tile_url" == *$'\r'* ]]; then
    printf 'Invalid map provider URL.\n' >&2
    exit 1
  fi
  cat > .env <<ENV
POSTGRES_PASSWORD=$db_password
DATABASE_URL=postgresql://poputi:$db_password@db:5432/poputi
REDIS_URL=redis://redis:6379
CATALOG_BACKEND=postgres
APP_ORIGIN=http://localhost:8080
TRUST_PROXY=1
DB_POOL_SIZE=10
VALHALLA_URL=
PHOTON_URL=
TILE_URL=$tile_url
TILE_ATTRIBUTION=© OpenStreetMap contributors
MEDIA_PUBLIC_URL=
S3_ENDPOINT=
S3_REGION=ru-1
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
METRICS_TOKEN=$metrics_token
ENV
fi
chmod 600 .env
if ! grep -q '^POSTGRES_PASSWORD=' .env || grep -q 'CHANGE_ME' .env; then
  printf 'Existing .env requires configuration. It was preserved.\n' >&2
  exit 1
fi
mkdir -p work public/photos
chmod 755 work public public/photos
printf '[4/7] Build application and tools\n'
docker compose config --quiet
docker compose --profile tools build tools app
printf '[5/7] Database migration and catalog import\n'
docker compose up -d --wait --wait-timeout 120 db redis
docker compose --profile tools run --rm tools pnpm db:migrate
docker compose --profile tools run --rm tools pnpm catalog:export
docker compose --profile tools run --rm tools pnpm catalog:import work/catalog.json
printf '[6/7] Start private preview\n'
docker compose up -d app nginx
ready=0
for attempt in $(seq 1 60); do
  if curl --fail --silent --max-time 3 http://127.0.0.1:8080/api/health/ready >/dev/null; then
    ready=1
    break
  fi
  if (( attempt % 15 == 0 )); then printf 'Waiting for readiness: attempt %s/60\n' "$attempt"; fi
  sleep 2
done
if [[ "$ready" != 1 ]]; then
  docker compose ps
  docker compose logs --tail 50 app nginx
  exit 1
fi
printf '[7/7] First database backup\n'
bash ops/backup.sh
docker compose ps
printf '\nREADY: private preview listens on 127.0.0.1:8080.\n'
printf 'SSH tunnel from your computer: ssh -N -L 8080:127.0.0.1:8080 SSH_USER@SERVER_IP\n'
printf 'Open http://localhost:8080 after establishing the tunnel.\n'
printf 'Saved photo files still require restore from poputi-data.tar.gz or S3 upload.\n'
printf 'Log: /var/log/poputi-bootstrap.log\n'
