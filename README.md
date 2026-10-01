# Next.js Template

Next.js 16 + TypeScript + Tailwind CSS v4 + PostgreSQL + Prisma con tooling de desarrollo Docker multi-contenedor.

## Requisitos

### Opción A: Docker (Recomendado)
- Docker 24+
- Docker Compose v2
- VS Code con extensión "Dev Containers"

### Opción B: Node.js local
- Node.js 24+
- pnpm 12 (`corepack enable` usa la versión de `packageManager`)
- PostgreSQL 18 (o usar DATABASE_URL apuntando a PostgreSQL)

---

## Desarrollo con Docker

### 1. Iniciar servicios

```bash
docker compose up -d
```

### 2. Esperar a que pnpm termine de instalar

```bash
docker compose logs -f pnpm
```

Cuando veas `done` o el proceso termine, las dependencias están listas.

### 3. Generar cliente Prisma y ejecutar migraciones

```bash
docker compose exec app pnpm prisma:generate
docker compose exec app pnpm prisma migrate dev
```

### 4. Abrir VS Code en Dev Container

```
View > Command Palette > "Dev Containers: Reopen in Container"
```

### 5. Iniciar debugger

```
F5 > "Next.js: debug (attach)"
```

### 6. Abrir en el navegador

```
http://localhost:3000
```

### Comandos útiles

```bash
# Ver estado de servicios
docker compose ps

# Ver logs
docker compose logs -f app
docker compose logs -f postgres

# Acceder a PostgreSQL
docker compose exec postgres psql -U username -d nextjs

# Detener
docker compose down

# Reconstruir imágenes
docker compose up -d --build

# Limpiar volúmenes
docker compose down -v
```

---

## Desarrollo con Node.js local

### 1. Instalar dependencias

```bash
pnpm install
```

### 2. Configurar variables de entorno

Copia `.env.example` a `.env`:

```env
DATABASE_URL=postgresql://username:password@localhost:5432/nextjs
```

### 3. Iniciar PostgreSQL

```bash
# Docker
docker run -d -p 5432:5432 -v postgres_data:/var/lib/postgresql \
  -e POSTGRES_DB=nextjs -e POSTGRES_USER=username \
  -e POSTGRES_PASSWORD=password postgres:18-alpine
```

### 4. Generar cliente Prisma y migraciones

```bash
pnpm prisma:generate
pnpm prisma migrate dev
```

### 5. Configurar AI-DLC (opcional)

Instala el CLI `aidlc` en la versión de `.aidlc-version` y configura las herramientas de IA instaladas:

```bash
pnpm aidlc:setup
```

### 6. Iniciar servidor

```bash
pnpm dev
```

### 7. Abrir en el navegador

```
http://localhost:3000
```

---

## Worktrees para agentes en paralelo

Tooling para lanzar **varios agentes a la vez sin que se pisen el código ni la base de datos**.
Cada agente trabaja en su propio `git worktree`, con su rama, su base de datos Postgres y
(opcionalmente) su propia app en un puerto propio. Todo vive en `.devcontainer/wt/`; los agentes
lo usan a través de las skills `worktree`, `worktree-close` y `release` (`.agent/skills/`).

### Modelo mental

```
Stack raíz (proyecto `nextjs-app`)    ← compartido: nextjs-postgres, pgAdmin
  /var/www/html                       ← árbol principal (rama develop)
  .worktrees/
    login/   → rama agent/login  · BD nextjs_login  · app :3100 · debug :9329
    perfil/  → rama agent/perfil · BD nextjs_perfil · app :3200 · debug :9429
    release/ → rama main (el worktree de las releases, sin slot ni BD propia)
```

- Los worktrees viven **dentro** del repo (`.worktrees/`, gitignoreado) para quedar dentro del bind
  mount `.:/var/www/html` y ser visibles desde los contenedores.
- **Requisito:** el stack raíz arriba (`docker compose up -d`). Nunca `docker compose down`: el
  devcontainer vive en ese mismo compose.
- Las rutas que git registra son las del **host** (`$HOST_WORKSPACE_PATH`, que `devcontainer.json`
  monta también en su ruta real), así que GitKraken o lazygit abren los worktrees desde fuera del
  contenedor. Requiere el repo en una ruta Linux, macOS o WSL.

### Flujo de trabajo

```bash
.devcontainer/wt/new <nombre>           # worktree + rama agent/<nombre> + pnpm install + BD + .env + AI-DLC
.devcontainer/wt/new <nombre> --seed    # además aplica las migraciones y el seed en su BD
cd .worktrees/<nombre>                  # aquí se abre el agente (claude, codex, opencode…)
.devcontainer/wt/app up <nombre>        # su propia app → http://localhost:<APP_PORT>
.devcontainer/wt/app logs <nombre>      # sus logs
.devcontainer/wt/app down <nombre>      # la para; la BD se queda hasta el teardown
.devcontainer/wt/status                 # flota (slot, puerto, BD, contenedor), bolts de AI-DLC y restos
.devcontainer/wt/teardown <nombre> --branch   # para la app, borra la BD, quita el worktree y la rama
```

- `new` se niega **antes de crear nada** si el worktree o la rama ya existen, o si el stack raíz
  está caído. La rama nace del `HEAD` de la raíz, sin sus cambios sin commitear.
- La app de un worktree es su propio contenedor `nextjs-wt-<nombre>-app` (la misma imagen y el
  mismo servicio `nextjs-app` del compose), unido a la red raíz para llegar a `nextjs-postgres`.
  El puerto se publica en el **host**; desde el devcontainer es `nextjs-wt-<nombre>-app:3000`.
- `teardown` se niega si queda un proceso vivo dentro del árbol, y al final **comprueba** que el
  directorio, la entrada de git, la rama, el contenedor y la BD ya no están. Borra sin preguntar lo
  no commiteado: el cierre ordenado (commit, fusión a `develop`, la raíz al día) es la skill
  `worktree-close`.
- Con [herdr](https://herdr.dev) (instalado en el devcontainer): `herdr` en la raíz y un panel por
  worktree con `herdr worktree open --branch agent/<nombre>`. Su configuración del proyecto
  (`.herdr/config.toml`) desactiva `herdr worktree create`.
- No uses `git worktree add/remove` a pelo, ni `herdr worktree create`, ni los worktrees propios
  de Claude Code: no crean ni borran la BD, el `.env` ni el contenedor. `status` muestra lo que se
  haya filtrado. Los worktrees de AI-DLC (`.aidlc/worktrees/bolt-*`) son de `aidlc` y `status` los
  lista aparte.

### Aislamiento por worktree

| Recurso | Aislamiento |
|---------|-------------|
| Código | `.worktrees/<nombre>` + rama `agent/<nombre>` |
| BD | `nextjs_<nombre>` en el **mismo** Postgres (`DATABASE_URL` y `DIRECT_URL` de su `.env`) |
| Puertos | `APP_PORT=3000+100*slot`, `DEBUG_PORT=9229+100*slot` |
| Contenedor | `nextjs-wt-<nombre>-app`, proyecto compose `nextjs-wt-<nombre>` |
| Agentes | MCP, skills, hooks y AI-DLC generados dentro del worktree |

### Liberar a producción

Liberar es fusionar `develop` en `main` y empujar **las dos ramas**, desde el worktree `release`
(`.worktrees/release`, en `main`). El mensaje de la fusión (`:rocket: chore(release): …`) **es** la
entrada de `CHANGELOG.md`: `scripts/changelog-release.mjs` la copia y el hook `commit-msg` rechaza
una release sin ella. El procedimiento completo está en la skill `release`.

---

## Troubleshooting

### Puerto 3000 ya está en uso

Cambia el puerto en `.env`:
```env
APP_PORT=3001
```

### No puedo conectar a PostgreSQL

Verificar que PostgreSQL está corriendo y las credenciales son correctas:
```bash
docker compose exec postgres pg_isready -U username
```

### Debugger no se adjunta

1. Verificar que `app` está corriendo: `docker compose ps`
2. Verificar que el debugger escucha en `0.0.0.0:9229`: `docker port nextjs-app`

---

## Metodología: AI-DLC

Este template utiliza **AI-DLC v2 (AI-Driven Development Life Cycle)**, una metodología de AWS Labs ([awslabs/aidlc-workflows](https://github.com/awslabs/aidlc-workflows)) que transforma la codificación asistida por IA en un proceso disciplinado y repetible con validación humana en cada etapa.

- **INITIALIZATION**: Estado del workflow y detección del workspace
- **IDEATION**: Intención → alcance → viabilidad
- **INCEPTION**: Requisitos → historias → diseño → unidades de trabajo
- **CONSTRUCTION**: Diseño funcional → código → build y test (por unidad)
- **OPERATION**: Despliegue → observabilidad → optimización

La versión está fijada en `.aidlc-version`. El devcontainer instala el CLI `aidlc` y configura Claude Code, Codex y opencode al crearse; fuera de él, ejecuta `pnpm aidlc:setup`. Después inicia un workflow con `/aidlc <qué quieres construir>` (en Codex, `$aidlc`). Más detalles en [AGENTS.md](AGENTS.md#metodología-ai-dlc).

## Más información

- [Architecture](docs/ARCHITECTURE.md)
- [Stack](docs/STACK.md)
- [Workflows](docs/WORKFLOWS.md)
