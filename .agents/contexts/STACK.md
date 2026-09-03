# Stack Context — OS-CAR

## Core Runtime & Language
- **Runtime**: Node.js 20+ LTS
- **Language**: TypeScript 5.x (`strict: true`, `noImplicitAny: true`, `exactOptionalPropertyTypes: true`)
- **Package Manager**: pnpm (o npm como fallback)

## Frontend Framework & UI
- **Framework**: Next.js 15+ (App Router)
- **UI Library**: React 19 (Server Components, Actions, useActionState, Suspense)
- **Styling**: Tailwind CSS v4 con variables CSS y tema de alto contraste para tablets de taller
- **Icons**: Lucide React
- **Forms & Validation**: React Hook Form + Zod resolvers

## Backend, Database & ORM
- **Database**: PostgreSQL 16+ (Neon Serverless Postgres con connection pooling)
- **ORM**: Prisma ORM 5.x / 6.x
- **Migrations**: Prisma Migrate con estrategia expand-and-contract
- **Data Validation**: Zod 3.x

## Security & Auth
- **Authentication**: Better Auth con persistencia en PostgreSQL / Neon y cliente React (`better-auth/react`)
- **Password Hashing**: Gestionado nativamente por Better Auth (Argon2id/Scrypt de alta entropía)
- **Authorization**: RBAC jerárquico (`SUPER_ADMIN`, `WORKSHOP_OWNER`, `SERVICE_ADVISOR`, `MECHANIC`, `CUSTOMER`)

## Testing & Quality
- **Unit & Integration**: Vitest
- **Component Testing**: React Testing Library
- **Linting & Formatting**: ESLint 9+ (Flat config) + Prettier
- **E2E Testing**: Playwright (para flujos críticos de OT y presupuesto)
