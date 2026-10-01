#!/usr/bin/env bash
# Installs the AI-DLC CLI pinned in .aidlc-version and configures AI-DLC for Claude Code
# plus every harness in AIDLC_HARNESSES (default: codex opencode) whose CLI is installed.
# Safe to re-run.
#
#   pnpm aidlc:setup
#   AIDLC_HARNESSES="codex opencode kiro" pnpm aidlc:setup
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
# Claude Code always goes first, with or without its CLI: the AI-DLC block versioned in
# .gitignore is the one its projection writes, and in a fresh clone AI-DLC refuses to adopt
# that block for any other harness configured first.
harnesses="claude"
for harness in ${AIDLC_HARNESSES:-codex opencode}; do
  [ "$harness" = claude ] || harnesses="$harnesses $harness"
done

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
fresh=0
configured=()
for harness in $harnesses; do
  case "$harness" in
    codex | opencode) cli="$harness" ;;
    kiro) cli="kiro-cli" ;;
    *) cli="" ;; # claude (see above); kiro-ide, cursor and copilot can run from the IDE alone
  esac
  case "$harness" in
    claude) dir=.claude ;;
    codex) dir=.codex ;;
    kiro | kiro-ide) dir=.kiro ;;
    cursor) dir=.cursor ;;
    *) dir=.aidlc ;; # opencode and copilot
  esac

  if [ -n "$cli" ] && ! command -v "$cli" >/dev/null 2>&1; then
    echo "aidlc: skipping $harness ($cli not found)"
    continue
  fi

  [ -f "$root/$dir/tools/data/aidlc-projection.json" ] || fresh=1
  # Refuses to refresh while a workflow is active; finish it and re-run.
  if aidlc config --project-dir "$root" --harness "$harness" --mcp none --quiet; then
    configured+=("$harness")
  else
    status=1
  fi
done

# Harnesses scaffolded together are only complete after a second pass: AI-DLC 2.10 adds some of
# the Codex and opencode stage runners when it refreshes them next to their siblings.
if [ "$fresh" -eq 1 ] && [ "${#configured[@]}" -gt 1 ]; then
  for harness in "${configured[@]}"; do
    aidlc config --project-dir "$root" --harness "$harness" --mcp none --quiet >/dev/null || status=1
  done
fi

aidlc doctor --project-dir "$root" --quiet || true

exit "$status"
