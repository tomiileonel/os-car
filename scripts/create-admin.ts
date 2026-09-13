/**
 * OS-CAR · Bootstrap del primer administrador (OWNER) de un taller.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/create-admin.ts \
 *     --workshop <workshopId> \
 *     --email owner@taller.com \
 *     --name "Nombre Apellido" \
 *     [--role OWNER]
 *
 * Requiere DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL en el
 * entorno (mismas vars que la app).
 *
 * Deliberadamente reusa auth.api.signUpEmail (lib/auth.ts) en vez de
 * insertar filas a mano en las tablas de Better Auth: reimplementar el
 * hashing de contraseñas a mano es frágil (Better Auth usa scrypt vía
 * @noble/hashes con password.normalize("NFKC") antes de derivar la
 * clave — un desajuste de un solo parámetro deja al admin sin poder
 * loguearse y falla en silencio hasta el primer intento de login).
 * Pasar por auth.api.signUpEmail garantiza que el hash generado siempre
 * es compatible con lib/auth.ts, sin importar cómo cambie internamente
 * la librería en futuras versiones.
 *
 * Para admins subsiguientes (workshop que ya tiene al menos un OWNER),
 * usar la UI en /admin/equipo o POST /api/admin/invite en su lugar.
 */
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { auth, INTERNAL_SIGNUP_HEADER } from "../lib/auth";

const CANONICAL_ROLES = ["OWNER", "TALLER_SUPERVISOR", "ADMIN", "MECANICO", "RECEPCIONISTA"] as const;
type CanonicalRole = (typeof CANONICAL_ROLES)[number];

interface ParsedArgs {
  workshop?: string;
  email?: string;
  name?: string;
  role?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2) as keyof ParsedArgs;
    args[key] = argv[i + 1];
    i += 1;
  }
  return args;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    console.error(`[create-admin] Falta la variable de entorno ${name}.`);
    process.exit(1);
  }
  return value;
}

function generateTemporaryPassword(): string {
  return randomBytes(24).toString("base64url");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const workshopId = args.workshop;
  const email = args.email?.trim().toLowerCase();
  const displayName = args.name?.trim();
  const role = (args.role ?? "OWNER").toUpperCase() as CanonicalRole;

  if (!workshopId || !email || !displayName) {
    console.error(
      '[create-admin] Uso: npx tsx --env-file=.env scripts/create-admin.ts --workshop <id> --email <email> --name "<nombre>" [--role OWNER]'
    );
    process.exit(1);
  }
  if (!CANONICAL_ROLES.includes(role)) {
    console.error(`[create-admin] Rol inválido '${role}'. Válidos: ${CANONICAL_ROLES.join(", ")}`);
    process.exit(1);
  }

  requireEnv("DATABASE_URL");
  const authSecret = requireEnv("BETTER_AUTH_SECRET");

  const prisma = new PrismaClient();

  try {
    const workshop = await prisma.workshop.findFirst({
      where: { id: workshopId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!workshop) {
      console.error(`[create-admin] No existe un workshop activo con id '${workshopId}'.`);
      process.exit(1);
    }

    const existingAdmin = await prisma.adminUser.findFirst({
      where: { workshopId, email, deletedAt: null },
      select: { id: true },
    });
    if (existingAdmin) {
      console.error(`[create-admin] Ya existe un AdminUser activo con email '${email}' en este taller.`);
      process.exit(1);
    }

    const temporaryPassword = generateTemporaryPassword();

    const signUpResult = await auth.api.signUpEmail({
      body: { name: displayName, email, password: temporaryPassword },
      headers: new Headers({ [INTERNAL_SIGNUP_HEADER]: authSecret }),
    });

    if (!signUpResult?.user?.id) {
      console.error("[create-admin] Better Auth no devolvió un usuario válido.");
      process.exit(1);
    }

    const adminUser = await prisma.adminUser.create({
      data: {
        workshopId,
        authUserId: signUpResult.user.id,
        displayName,
        email,
        role,
        active: true,
        // null intencional: fuerza el flujo de cambio de contraseña en
        // el primer login (ver AdminUser.passwordChangedAt).
        passwordChangedAt: null,
      },
    });

    console.log("[create-admin] Administrador creado con éxito.");
    console.log(`  workshop:  ${workshop.name} (${workshop.id})`);
    console.log(`  adminUser: ${adminUser.id}`);
    console.log(`  email:     ${email}`);
    console.log(`  role:      ${role}`);
    console.log(`  password:  ${temporaryPassword}`);
    console.log(
      "\nComunicá esta contraseña por un canal seguro fuera de banda. No queda guardada en ningún lado más que el hash."
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[create-admin] Error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
