---
name: devops-cicd
description: Contenedores Docker, pipelines CI/CD, configuración de entorno y despliegues para OS-CAR.
---

# DevOps & CI/CD Skill — OS-CAR

Esta skill establece las prácticas operativas, empaquetado y automatización de despliegue para OS-CAR.

## 1. Docker Multi-Stage Build
Para producción o entornos auto-alojados, utilizar un Dockerfile multi-etapa optimizado que minimice el tamaño de imagen:

```dockerfile
# Dockerfile
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm prisma generate
RUN pnpm build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

## 2. GitHub Actions CI Workflow
Toda Pull Request debe pasar automáticamente la suite de calidad antes de fusionarse:

```yaml
name: CI Quality Gate

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile
      - run: pnpm prisma generate
      - run: pnpm lint
      - run: pnpm exec tsc --noEmit
      - run: pnpm test
      - run: pnpm build
```

## 3. Validación de Variables de Entorno en Build Time
El archivo `src/env.mjs` valida todas las variables requeridas usando Zod. Si falta una variable crítica (ej. `DATABASE_URL` o `AUTH_SECRET`), el proceso de build se interrumpe de inmediato evitando despliegues rotos.
