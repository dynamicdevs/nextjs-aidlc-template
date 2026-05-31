# Next.js Template

Next.js 16 + TypeScript + Tailwind CSS v4 + PostgreSQL + Prisma con tooling de desarrollo Docker multi-contenedor.

## Requisitos

### Opción A: Docker (Recomendado)
- Docker 24+
- Docker Compose v2
- VS Code con extensión "Dev Containers"

### Opción B: Node.js local
- Node.js 24+
- pnpm
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

### 5. Iniciar servidor

```bash
pnpm dev
```

### 6. Abrir en el navegador

```
http://localhost:3000
```

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

Este template utiliza **AI-DLC (AI-Driven Development Life Cycle)**, una metodología de AWS Labs que transforma la codificación asistida por IA en un proceso disciplinado y repetible con validación humana en cada etapa.

- **INCEPTION**: Análisis de requisitos → diseño → unidades de trabajo
- **CONSTRUCTION**: Diseño funcional → código → tests (por unidad)
- **OPERATIONS**: Despliegue y operación

Las reglas están en `.aidlc/aidlc-rules/` y se activan automáticamente con los plugins `opencode-aidlc` / `claudecode-aidlc`.

## Más información

- [Architecture](docs/ARCHITECTURE.md)
- [Stack](docs/STACK.md)
- [Workflows](docs/WORKFLOWS.md)
