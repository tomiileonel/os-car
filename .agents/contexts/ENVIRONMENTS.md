# Environments Context — OS-CAR

## Environments Lifecycle
1. **Local Development**:
   - URL: `http://localhost:3000`
   - DB: PostgreSQL local (Docker Compose) o branch de desarrollo individual en Neon.
   - Mail: Consola o Mailpit.
   - Mocking: APIs externas mockeadas localmente.
2. **Staging / Preview**:
   - Despliegue automático por Pull Request en Vercel.
   - DB: Neon Branch efímero creado por PR.
   - Tests de regresión e integración automáticos.
3. **Production**:
   - Dominio productivo con TLS/SSL estricto y HSTS.
   - DB: Neon PostgreSQL producción con autoscaling, backups diarios y point-in-time recovery.
   - Despliegue supervisado únicamente bajo Quality Gate G8 con aprobación de `release-manager`.

## Environment Variables Strategy
- Todas las variables deben declararse y validarse al iniciar la aplicación en `src/env.mjs` o `env.ts` utilizando Zod.
- Ningún despliegue avanzará a producción si faltan variables obligatorias.
