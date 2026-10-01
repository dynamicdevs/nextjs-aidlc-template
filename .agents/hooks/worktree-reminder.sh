#!/bin/sh
# UserPromptSubmit: keeps the "work in a worktree" rule alive across compaction.
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
[ -f "$ROOT/.agents/hooks/.disabled" ] && exit 0
# A linked worktree has .git as a file: the session already follows the rule.
[ -d "$ROOT/.git" ] || exit 0

active=$(git -C "$ROOT" worktree list 2>/dev/null | tail -n +2 | awk '{print $NF" "$1}' | tr '\n' ' ')
[ -z "$active" ] && active="(none)"

jq -n --arg root "$ROOT" --arg active "$active" '{
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit",
    additionalContext: ("Project rule: every code-change request and every /aidlc workflow is worked from its own git worktree, never in the main checkout at " + $root + ". Create or reuse one with `.devcontainer/wt/new <name>` (skill `worktree`) and edit under .worktrees/<name>/. Read-only work, .claude/ config and the final merge into develop are exempt. Active worktrees: " + $active)
  }
}'
