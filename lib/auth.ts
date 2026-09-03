import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

attachDatabasePool(pool);

export const auth = betterAuth({
  database: pool,
  emailAndPassword: {
    enabled: true,
  },
  rateLimit: {
    storage: "database",
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const allowed = (process.env.ALLOWED_EMAILS ?? "")
            .split(",")
            .map((e) => e.trim().toLowerCase())
            .filter(Boolean);

          if (!allowed.includes(user.email.toLowerCase())) {
            throw new APIError("BAD_REQUEST", { message: "Registro no habilitado" });
          }
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;

