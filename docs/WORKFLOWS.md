# Workflows

## Desarrollo local

### Con Docker (entorno completo)
```bash
# 1. Construir e iniciar todos los servicios
docker compose up -d

# 2. Ver logs de pnpm (esperar a que termine install)
docker compose logs -f pnpm

# 3. Verificar que app está corriendo
docker compose logs app

# 4. Abrir VS Code en devcontainer
#    Command Palette > "Dev Containers: Reopen in Container"
```

### Debug con VS Code
```bash
# 1. En VS Code, F5 o Run > Start Debugging
# 2. Seleccionar "Next.js: debug (attach)"
# 3. El debugger se conecta a app:9229
# 4. Abrir http://localhost:3000
```

### Detener entorno
```bash
docker compose down      # Detener conservando volúmenes
docker compose down -v   # Detener y eliminar volúmenes
```

### Reconstruir imágenes
```bash
docker compose up -d --build
```

## Comandos útiles

### Ver estado de servicios
```bash
docker compose ps
```

### Ver logs de un servicio
```bash
docker compose logs -f app
```

### Ver redes y volúmenes
```bash
docker network ls | grep nextjs
docker volume ls | grep nextjs
```

## AI-DLC Workflow

La metodología AI-DLC v2 orquesta el desarrollo en 5 fases (33 etapas); el *scope* decide cuáles se ejecutan:

```bash
# INITIALIZATION — estado del workflow y detección del workspace (siempre)
# IDEATION       — intención, alcance y viabilidad
# INCEPTION      — prácticas, requisitos, historias, diseño y unidades de trabajo
# CONSTRUCTION   — por unidad: diseño funcional → NFRs → código → build y test → CI
# OPERATION      — pipeline, entornos, despliegue, observabilidad
```

```bash
# En Claude Code u opencode (en Codex usa $aidlc)
/aidlc Añadir notificaciones a clientes   # nuevo workflow (scope inferido)
/aidlc bugfix Arreglar el timeout del login
/aidlc --status                          # fase y etapa actuales
/aidlc --doctor                          # diagnóstico desde la sesión

# En la terminal
pnpm aidlc:setup                         # instalar/configurar AI-DLC (versión de .aidlc-version)
aidlc doctor                             # diagnóstico del CLI, runtimes, hooks y estado
```

Los checkpoints de validación humana ocurren en cada gate. Cada workflow (intent) guarda su estado, auditoría y artefactos en `aidlc/spaces/<space>/intents/<YYMMDD>-<label>/`, que se versionan con el proyecto.

## Comandos del proyecto

```bash
pnpm dev              # Iniciar servidor de desarrollo
pnpm build            # Build de producción
pnpm start            # Iniciar servidor de producción
pnpm lint             # ESLint
pnpm check            # Biome check (formato + lint)
pnpm format           # Biome format (aplica correcciones)
pnpm commit           # Commit con gitmoji
pnpm test             # Ejecutar tests con tsx
pnpm aidlc:setup      # Instalar y configurar AI-DLC
```

## Prisma

```bash
pnpm prisma:generate   # Regenerar cliente Prisma en src/generated/prisma
pnpm prisma:migrate    # Alias de prisma:migrate:deploy
pnpm prisma:migrate:dev      # Crear/aplicar migración durante desarrollo
pnpm prisma:migrate:deploy   # Aplicar migraciones pendientes con DIRECT_URL
pnpm prisma:migrate:status   # Ver estado del historial de migraciones
pnpm prisma:seed       # Ejecutar seed via prisma/seed.ts
pnpm prisma:db:setup   # Migrar, generar cliente y ejecutar seed
pnpm prisma:studio     # Abrir Prisma Studio (GUI)
```

### Migraciones

El schema se gestiona con migraciones Prisma versionadas en `prisma/migrations/`.
Usa `DIRECT_URL` para comandos de CLI y migraciones; reserva `DATABASE_URL` para el
runtime de la app, especialmente si producción usa un pooler transaccional.

```bash
npx prisma migrate dev      # Crear y aplicar una migración durante desarrollo
npx prisma migrate deploy   # Aplicar migraciones pendientes en entornos compartidos/CI
npx prisma migrate status   # Ver estado del historial de migraciones
```

### Acceder a PostgreSQL
```bash
docker compose exec postgres psql -U username -d nextjs
```

### pgAdmin

Disponible en `http://localhost:8082` cuando levantas Docker Compose.

Credenciales por defecto:

```text
admin@nextjs.dev
password
```

## Build de imágenes individuales

```bash
# Base image
docker build -f .devcontainer/Dockerfile --target base .

# Devcontainer
docker build -f .devcontainer/Dockerfile --target devcontainer .

# App
docker build -f .devcontainer/Dockerfile --target app .

# Pnpm
docker build -f .devcontainer/Dockerfile --target pnpm .
```
