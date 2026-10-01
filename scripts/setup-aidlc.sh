#!/usr/bin/env bash
# Installs the AI-DLC CLI pinned in .aidlc-version and configures AI-DLC for
# every harness in AIDLC_HARNESSES (default: claude codex opencode). Harnesses
# that need a CLI are skipped when it is not installed. Safe to re-run.
#
#   pnpm aidlc:setup
#   AIDLC_HARNESSES="claude codex opencode kiro" pnpm aidlc:setup
#
# Supported: claude, codex, opencode, kiro, kiro-ide, cursor, copilot.
# opencode and copilot cannot coexist (both use .aidlc/), nor kiro and kiro-ide.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
version_file="$root/.aidlc-version"

if [ ! -f "$version_file" ]; then
  echo "aidlc: $version_file not found" >&2
  exit 1
fi

version="$(tr -d '[:space:]' < "$version_file")"
harnesses="${AIDLC_HARNESSES:-claude codex opencode}"

export PATH="${AIDLC_BIN_DIR:-$HOME/.local/bin}:$PATH"

if ! command -v aidlc >/dev/null 2>&1; then
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  curl -fsSL "https://github.com/awslabs/aidlc-workflows/releases/download/v${version}/install.sh" \
    -o "$tmp/install.sh"
  sh "$tmp/install.sh" --version "$version" --quiet --yes
fi

# Installs the pinned release when the active one differs and registers the pin.
aidlc config --pin "$version" --project-dir "$root" --quiet

status=0
for harness in $harnesses; do
  case "$harness" in
    claude | codex | opencode) cli="$harness" ;;
    kiro) cli="kiro-cli" ;;
    *) cli="" ;; # kiro-ide, cursor and copilot can run from the IDE alone
  esac

  if [ -n "$cli" ] && ! command -v "$cli" >/dev/null 2>&1; then
    echo "aidlc: skipping $harness ($cli not found)"
    continue
  fi

  # Refuses to refresh while a workflow is active; finish it and re-run.
  aidlc config --project-dir "$root" --harness "$harness" --mcp none --quiet || status=1
done

aidlc doctor --project-dir "$root" --quiet || true

exit "$status"
