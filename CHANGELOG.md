# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

- Add `lucide-react`, update package version ranges, and enable approved pnpm dependency builds.
- Migrate to AI-DLC v2 (2.10.0): the native `aidlc` CLI is pinned in `.aidlc-version` and
  `scripts/setup-aidlc.sh` (`pnpm aidlc:setup`, run by the devcontainer) configures Claude Code,
  Codex and opencode. Replaces the vendored v0.1.x rules in `.aidlc/aidlc-rules/` and the
  `claudecode-aidlc`, `opencode-aidlc` and `codex-aidlc-plugin` packages. The `aidlc/` workspace
  is committed; harness runtimes are generated per machine.
- Write Claude Code MCP servers to `.mcp.json`; `.claude/settings.json` is now owned by AI-DLC.

## [0.1.0] - 2026-06-13

- Initial project template with Next.js, TypeScript, Tailwind CSS, Prisma, Docker, and AI-DLC tooling.
