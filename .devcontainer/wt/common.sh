#!/usr/bin/env bash
# common.sh — shared helpers for the .devcontainer/wt/* scripts: `new` creates the worktree
# with git, and the rest adds what git does not bring: an isolated Postgres database, a .env
# rewritten with per-slot ports, the host path for the bind mount (docker-outside-of-docker)
# and the worktree's own `nextjs-app` container on top of the base compose.
#
# This file is meant to be sourced; it is not executed directly.

# Main repo root: derived from this file's location, unless ROOT_WORKTREE_PATH says
# otherwise. `new` sets it for `isolate`, and it is what lets a branch's copy of these
# scripts run against the root before it is merged (the scripts that run are develop's).
ROOT="${ROOT_WORKTREE_PATH:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
WT_DIR="$ROOT/.worktrees"
# WT_BASE_COMPOSE exists for one case: exercising a branch's compose before it is merged, since
# these scripts always run from the root and would otherwise read develop's.
BASE_COMPOSE="${WT_BASE_COMPOSE:-$ROOT/docker-compose.yml}"

ROOT_PROJECT=nextjs-app               # the root stack: `name:` in docker-compose.yml
SHARED_NET="${ROOT_PROJECT}_nextjs-network"
POSTGRES_CONTAINER=nextjs-postgres
APP_SERVICE=nextjs-app
# A worktree's compose project and container are prefixed so no name can reach the root's:
# `nextjs-<name>` would make a worktree called `app` the root project itself.
WT_PREFIX=nextjs-wt-

APP_PORT_BASE=3000
DEBUG_PORT_BASE=9229
OFFSET_STEP=100
DB_PREFIX=nextjs_

# Ports browsers refuse to open. The app is served to a HUMAN on the host, so a port the
# daemon binds happily but Chrome answers with ERR_UNSAFE_PORT is useless. 6000 (X11) is
# the only one this scheme can produce — slot 30 — but the list is here so the next base
# change is checked against it instead of rediscovered in a browser.
UNSAFE_PORTS="1719 1720 1723 2049 3659 4045 4190 5060 5061 6000 6566 6665 6666 6667 6668 6669 6679 6697 10080"

die()  { printf '\033[1;31mwt:\033[0m %s\n' "$*" >&2; exit 1; }
info() { printf '\033[1;34m▸\033[0m %s\n' "$*"; }

# docker/postgres-safe token
sanitize() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9' '_' | sed 's/^_*//;s/_*$//'; }
db_name()  { printf '%s%s' "$DB_PREFIX" "$1"; }
project_name() { printf '%s%s' "$WT_PREFIX" "$1"; }

# upsert KEY=VALUE into a .env. Uses | as the sed delimiter so URLs/paths don't break, escapes
# what sed would read in the replacement, and guarantees a trailing newline before appending
# (the root .env may not end in \n).
set_env() {
  local f=$1 k=$2 v=$3 esc
  if grep -qE "^${k}=" "$f" 2>/dev/null; then
    esc="$(printf '%s' "$v" | sed -e 's/[\\|&]/\\&/g')"
    sed -i "s|^${k}=.*|${k}=${esc}|" "$f"
  else
    [ -s "$f" ] && [ -n "$(tail -c1 "$f")" ] && printf '\n' >> "$f"
    printf '%s=%s\n' "$k" "$v" >> "$f"
  fi
}
get_env() { grep -E "^${2}=" "$1" 2>/dev/null | head -1 | cut -d= -f2-; }

# A postgres URL with its database swapped, keeping the quotes the .env wrote around it and
# its query string.
with_database() {
  local url=$1 db=$2 q=""
  case "$url" in \"*\") q='"'; url="${url#\"}"; url="${url%\"}" ;; esac
  printf '%s%s%s' "$q" "$(printf '%s' "$url" | sed -E "s#^([a-z]+://[^/]*/)[^?]*#\\1${db}#")" "$q"
}

# The database a postgres URL names, without quotes or query string.
url_database() {
  local url=$1
  url="${url#\"}"; url="${url%\"}"; url="${url#*://*/}"
  printf '%s' "${url%%\?*}"
}

# The superuser of the root stack's Postgres: compose reads DB_USERNAME from the root .env.
pg_user() {
  local u
  u="$(get_env "$ROOT/.env" DB_USERNAME || true)"
  printf '%s' "${u:-username}"
}

# psql against the root stack's shared Postgres.
pg() { docker exec -i "$POSTGRES_CONTAINER" psql -U "$(pg_user)" -d postgres "$@"; }

# Repo path as the host daemon sees it (docker-outside-of-docker). It is read from the
# containers compose created for the root stack: the devcontainer's own mount does NOT work,
# because Docker Desktop gives it an internal path the daemon cannot bind again.
host_repo_path() {
  local c src
  for c in nextjs-app nextjs-pnpm; do
    src=$(docker inspect "$c" --format \
      '{{ range .Mounts }}{{ if eq .Destination "/var/www/html" }}{{ .Source }}{{ end }}{{ end }}' 2>/dev/null) || true
    [ -n "$src" ] && { printf '%s' "$src"; return 0; }
  done
  die "cannot find the repo's host path (is the root stack up? docker compose up -d)."
}

# compose for a worktree's app, on top of the base compose (a single file). `nextjs-app` is
# parameterized with the worktree's .env (APP_CONTAINER_NAME, CODE_PATH, APP_PORT,
# DEBUG_PORT). The caller appends `up -d --no-deps nextjs-app` or `down`.
compose_wt() {
  local name=$1; shift
  docker compose --env-file "$WT_DIR/$name/.env" -f "$BASE_COMPOSE" -p "$(project_name "$name")" "$@"
}

app_port()   { printf '%s' "$((APP_PORT_BASE + OFFSET_STEP * $1))"; }
debug_port() { printf '%s' "$((DEBUG_PORT_BASE + OFFSET_STEP * $1))"; }

# The compose keys of a worktree's .env, all derived from its name and slot. isolate writes
# them on creation and `app up` re-applies them, so a repo that moved on the host or a base
# that changed here reaches the worktrees that already exist.
app_env() {
  local env=$1 name slot
  name="$(sanitize "$(basename "$(dirname "$env")")")"
  slot="$(get_env "$env" WT_SLOT)" || die "no WT_SLOT in $env"
  set_env "$env" APP_PORT           "$(app_port "$slot")"
  set_env "$env" DEBUG_PORT         "$(debug_port "$slot")"
  set_env "$env" APP_CONTAINER_NAME "$(project_name "$name")-app"
  set_env "$env" CODE_PATH          "$(host_repo_path)/.worktrees/$name"
}

# first slot in 1..99 not used by any existing worktree, skipping the ones whose
# app port no browser will open (see UNSAFE_PORTS)
next_slot() {
  local slot env used port
  for slot in $(seq 1 99); do
    port="$(app_port "$slot")"
    case " $UNSAFE_PORTS " in *" $port "*) continue ;; esac
    used=0
    for env in "$WT_DIR"/*/.env; do
      [ -f "$env" ] || continue
      [ "$(get_env "$env" WT_SLOT)" = "$slot" ] && { used=1; break; }
    done
    [ "$used" -eq 0 ] && { printf '%s' "$slot"; return; }
  done
  die "no free port slots left"
}
