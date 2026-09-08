/**
 * Punto de importación canónico para infraestructura server-side.
 * El singleton real vive en src/lib/prisma.ts para conservar compatibilidad
 * con los módulos existentes del baseline.
 */
export { prisma } from "@/lib/prisma";
