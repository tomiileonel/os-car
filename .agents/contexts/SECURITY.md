# Security Context — OS-CAR

## Threat Model & Trust Boundaries
- **Límites de Confianza**:
  1. Cliente Web / Dispositivo Móvil vs Servidor de Aplicación.
  2. Aplicación vs Base de Datos (Neon DB).
  3. Aplicación vs APIs de terceros (WhatsApp Business, Stripe, pasarelas de pago).
  4. Aislamiento entre talleres (Multi-tenancy: un taller jamás puede ver o mutar datos de otro taller).

## Authentication & Session Management
- **Mecanismo**: Auth.js / NextAuth con cookies `HttpOnly`, `SameSite=Lax`, `Secure` en producción.
- **Tokens de Invitación / Acceso de Cliente**: Magic links criptográficos con expiración de 48 horas y un solo uso para visualización/aprobación de presupuestos sin fricción de contraseña.

## Authorization & RBAC
- Todo acceso a datos debe validar tres dimensiones en el servidor:
  1. ¿Está autenticado?
  2. ¿Tiene el rol necesario para esta operación?
  3. ¿El recurso solicitado pertenece al mismo `workshopId` del usuario en sesión?

## Sensitive Data & Secret Protection
- Nunca imprimir ni almacenar en logs contraseñas, hashes, tokens de WhatsApp o secretos de API.
- Cero claves en el código fuente. Uso estricto de variables de entorno tipadas mediante Zod (`env.mjs`).
- Los clientes finales solo tienen acceso de lectura a sus propios vehículos y OTs; no pueden ver costos internos de repuestos ni notas privadas de mecánicos.

## Gate de Seguridad (G4 & G7)
- Ningún cambio que afecte autenticación, middlewares, permisos o pagos se aprueba sin el veto favorable de `security-review`.
