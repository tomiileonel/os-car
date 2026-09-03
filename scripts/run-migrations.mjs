import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const envFile = path.join(root, ".env");

if (!fs.existsSync(envFile)) {
  console.error("ERROR: No se encontró el archivo .env. Copia .env.example a .env.");
  process.exit(1);
}

const envContent = fs.readFileSync(envFile, "utf8");
const match = envContent.match(/DATABASE_URL=["']?([^"'\r\n]+)["']?/);
const dbUrl = match ? match[1] : "";

if (!dbUrl || dbUrl.includes("ep-sample-123") || dbUrl.includes("user:password")) {
  console.log("=================================================================");
  console.log(" AVISO: DATABASE_URL contiene valores placeholder de ejemplo.");
  console.log("=================================================================");
  console.log("Para migrar las tablas de Better Auth a tu base de datos Neon:");
  console.log("1. Abre tu archivo .env");
  console.log("2. Pega tu cadena de conexión real de Neon en DATABASE_URL (usa el host -pooler)");
  console.log("3. Vuelve a ejecutar: npm run auth:migrate");
  console.log("=================================================================");
  process.exit(0);
}

console.log("Conectando con la base de datos y aplicando migraciones de Better Auth...");
try {
  execSync("npx @better-auth/cli migrate -y", { stdio: "inherit", shell: true });
  console.log("Migraciones aplicadas con éxito.");
} catch (err) {
  console.error("Error al ejecutar las migraciones:", err.message);
  process.exit(1);
}
