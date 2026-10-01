# Changelog

All notable changes that reach `main`, newest release first.

Each entry is a **release**: the merge of `develop` into `main` (`:rocket: chore(release): …`). Its
title is that merge's subject and its text is the merge's body: it is written once, in the message,
and `scripts/changelog-release.mjs` copies it here (skill `release`). Work branches do not touch this
file; what is in `develop` and not yet in `main` is `git log --first-parent main..develop`.

The `[Unreleased]` notes below predate this process: the first release folds them into its message,
and the script replaces that section with the release entry.

## 2026-10-01 — Agentes en paralelo en worktrees aislados, herdr con zsh y AI-DLC v2

Cada agente trabaja ahora en su propio worktree aislado. `.devcontainer/wt/new <nombre>` crea la
rama `agent/<nombre>` con su base de datos, sus puertos y su contenedor de la app;
`.devcontainer/wt/status` muestra la flota y `wt/teardown` la desmonta sin dejar restos. Las
skills `worktree`, `worktree-close` y `release` guían el ciclo completo (crear, fusionar en
`develop`, liberar a `main`), y unos hooks de Claude Code impiden escribir en el checkout
principal. `develop` pasa a ser la rama de integración, y este CHANGELOG se escribe al liberar.

El devcontainer trae herdr para las terminales de los agentes, un panel por worktree, con la
configuración del proyecto en `.herdr/config.toml`. Sus paneles abren zsh: antes caían en /bin/sh
porque el contenedor no exporta SHELL. Además, el `post-create` instala Archify como skill global
de Claude Code, para generar diagramas interactivos en HTML autocontenido.

AI-DLC pasa a la v2 (2.10.0). El CLI nativo `aidlc`, fijado en `.aidlc-version`, configura Claude
Code, Codex y opencode con `pnpm aidlc:setup`, y sustituye a las reglas v0.1.x de
`.aidlc/aidlc-rules/` y a los paquetes `claudecode-aidlc`, `opencode-aidlc` y
`codex-aidlc-plugin`. El workspace `aidlc/` se versiona; los runtimes se generan en cada máquina.
Los MCP de Claude Code se escriben en `.mcp.json`, porque `.claude/settings.json` es de AI-DLC.

Dependencias al día: Next.js 16.3, React 19.3, Prisma 7.10, Biome 2.5, dotenv 18, pnpm 12 y el
resto de minors y parches. TypeScript sigue en 6.0 y ESLint en 9 hasta que `typescript-eslint` y
los plugins de ESLint de Next.js admitan TypeScript 7 y ESLint 10. Recoge también las notas que
quedaban sin liberar: `lucide-react`, los rangos de versiones y los builds de dependencias
aprobados en pnpm.

Para quien lo opera, no hay migraciones nuevas. En `.env.example` el host de la base de datos pasa
de `postgres` a `nextjs-postgres`, el nombre del contenedor, así que hay que actualizar
`DATABASE_URL` y `DIRECT_URL` en el `.env`. Hay que reconstruir el devcontainer (herdr,
`HOST_WORKSPACE_PATH` y el montaje espejo del repo que necesitan los worktrees); su `post-create`
instala AI-DLC y Archify, y `pnpm aidlc:setup` lo reintenta si falla. Después, en Claude Code se
aprueban los hooks del proyecto con `/hooks` y se reinicia, y en Codex se elige confiar en ellos.
pnpm pasa a la 12 (`packageManager`).

El gate pasó sobre este árbol: `pnpm install`, `pnpm check`, `pnpm lint`, `pnpm build` y
`pnpm test` en verde. La suite de tests aún está vacía (0 tests), así que solo prueba que el runner
arranca.

No trae tests de la app ni CI. Tras desplegar, conviene comprobar que `.devcontainer/wt/status`
corre sin errores y que un panel nuevo de herdr abre zsh.

## [0.1.0] - 2026-06-13

- Initial project template with Next.js, TypeScript, Tailwind CSS, Prisma, Docker, and AI-DLC tooling.
