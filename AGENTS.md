# AGENTS.md

Template Next.js 16 + TypeScript + Tailwind CSS v4 con tooling de desarrollo completo.

## Setup

`.agent/` es la **fuente de verdad** para configuración MCP de herramientas AI. `scripts/generate-mcp.mjs` genera los archivos de configuración MCP para cada herramienta:

| Herramienta | Archivo generado |
|-------------|-----------------|
| Claude Code | `.claude/settings.json` |
| opencode | `.opencode/opencode.json` |
| Cursor | `.cursor/mcp.json` |
| Kiro | `.kiro/mcp.json` |
| Kilocode | `.kilocode/mcp.json` |
| GitHub Copilot | `.copilot/mcp.json` |
| Codex | `.codex/mcp.json` |
| Antigravity | `.antigravity/mcp.json` |

Cada herramienta AI (Claude, opencode, Cursor, Kiro) genera sus propios directorios `commands/` y `skills/` automáticamente.

**Ejecutar tras clonar** para generar la configuración MCP:

```bash
node scripts/generate-mcp.mjs
```

### Configuración de opencode

opencode busca su configuración en `opencode.json` en la raíz del proyecto. Para usar `.opencode/opencode.json`, configura la variable de entorno:

```bash
export OPENCODE_CONFIG=/var/www/html/.opencode/opencode.json
```

El devcontainer ya tiene esta variable configurada en `remoteEnv`.

### Añadir un MCP server

1. Editar `.agent/config/mcp/source.json` (entrada nueva en `servers`)
2. Si el cliente lo necesita en formato distinto a remote, añadir un case en `to_claude_entry()` dentro del script
3. Correr `node scripts/generate-mcp.mjs`

## Metodología: AI-DLC

Este template sigue **AI-DLC (AI-Driven Development Life Cycle)**, una metodología estructurada de AWS Labs para desarrollo asistido por IA.

Inception → Construction → Operations

### Fases

| Fase | Propósito |
|------|-----------|
| **INCEPTION** | Determinar qué construir y por qué — análisis de requisitos, ingeniería inversa, diseño de aplicación, generación de unidades de trabajo |
| **CONSTRUCTION** | Ciclo por unidad: diseño funcional, diseño de NFRs, generación de código, build y test |
| **OPERATIONS** | Despliegue y operación (futura expansión) |

### Reglas AI-DLC

Las reglas están en `.aidlc/aidlc-rules/` y son cargadas automáticamente por `opencode-aidlc` y `claudecode-aidlc` (dev dependencies). El workflow se adapta al contexto: bugs simples saltan etapas; migraciones complejas ejecutan el ciclo completo con validación humana en cada etapa.

### Plugins

| Herramienta | Plugin |
|-------------|--------|
| opencode | `opencode-aidlc` |
| Claude Code | `claudecode-aidlc` |

## Documentación

| Archivo | Contenido |
|---------|-----------|
| `docs/PROJECT.md` | Qué es este template, estructura, convenciones |
| `docs/STACK.md` | Stack técnico, herramientas, dependencias |
| `docs/ARCHITECTURE.md` | Arquitectura Docker, servicios, puertos, volúmenes |
| `docs/WORKFLOWS.md` | Comandos para iniciar, detener y operar el entorno |

## Stack

| Capa | Tecnología |
|------|------------|
| Framework | Next.js 16 (App Router) |
| Lenguaje | TypeScript |
| Estilos | Tailwind CSS v4 |
| UI Components | shadcn/ui (via CLI — `components.json` incluido) |
| Base de datos | PostgreSQL 18 + Prisma |
| Package Manager | pnpm |

## Convenciones

- **App Router únicamente** — nunca Pages Router
- **Tailwind v4 CSS-first** — sin `tailwind.config.*`; tokens en `src/app/globals.css`
- **shadcn/ui CLI** para agregar componentes; iconos via `lucide-react`
- **Context7** — consultar siempre antes de usar cualquier librería externa
- **Server Actions** para lógica de servidor; **Prisma** para DB y migraciones
- Componentes en `src/components`; alias `@/*` apunta a `src/`

## Verificaciones automatizadas

| Script | Qué valida |
|--------|------------|
| `pnpm lint` | ESLint 9 + flat config + tipado |
| `pnpm build` | Next build (TypeScript incluido) |
| `pnpm check` | Biome check (formato + lint) |
| `pnpm format` | Biome format (aplica correcciones) |
