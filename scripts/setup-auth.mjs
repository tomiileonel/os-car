import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
fs.mkdirSync(path.join(root, "lib"), { recursive: true });
fs.mkdirSync(path.join(root, "app", "api", "auth", "[...all]"), { recursive: true });

const authTs = `import { betterAuth } from "better-auth";
import { Pool } from "pg";

export const auth = betterAuth({
  database: new Pool({
    connectionString: process.env.DATABASE_URL,
  }),
  emailAndPassword: {
    enabled: true,
  },
});

export type Session = typeof auth.$Infer.Session;
`;
fs.writeFileSync(path.join(root, "lib", "auth.ts"), authTs, "utf8");

const authClientTs = `import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
});

export const { signIn, signUp, signOut, useSession } = authClient;
`;
fs.writeFileSync(path.join(root, "lib", "auth-client.ts"), authClientTs, "utf8");

const routeTs = `import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { POST, GET } = toNextJsHandler(auth);
`;
fs.writeFileSync(path.join(root, "app", "api", "auth", "[...all]", "route.ts"), routeTs, "utf8");

const targetEnv = path.join(root, ".env");
if (!fs.existsSync(targetEnv)) {
  const secret = crypto.randomBytes(32).toString("hex");
  const template = fs.readFileSync(path.join(root, ".env.example"), "utf8");
  const filled = template.replace("change-this-to-a-secure-random-secret-key-in-production-min-32-chars", secret);
  fs.writeFileSync(targetEnv, filled, "utf8");
  console.log("Created environment file with generated secret.");
}

console.log("Better Auth files written successfully.");
