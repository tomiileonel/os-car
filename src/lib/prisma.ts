import { PrismaClient } from '@prisma/client';

declare global {
  var __prisma: PrismaClient | undefined;
}

const NEON_DEFAULT_DB_URL =
  "postgresql://neondb_owner:npg_2gdmzhyxcs5e@ep-delicate-sound-ace3v0r9-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require";

function createPrismaClient(): PrismaClient {
  const datasourceUrl =
    process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0
      ? process.env.DATABASE_URL.trim()
      : NEON_DEFAULT_DB_URL;

  const client = new PrismaClient({
    datasourceUrl,
    log:
      process.env.NODE_ENV === 'production'
        ? [
            { emit: 'stdout', level: 'warn' },
            { emit: 'stdout', level: 'error' },
          ]
        : [
            { emit: 'event', level: 'query' },
            { emit: 'stdout', level: 'info' },
            { emit: 'stdout', level: 'warn' },
            { emit: 'stdout', level: 'error' },
          ],
    errorFormat: 'minimal',
  });

  if (process.env.NODE_ENV !== 'production') {
    client.$on('query' as never, (e: { query: string; duration: number }) => {
      if (e.duration > 1000) {
        console.warn('[Prisma] Slow Query Detected', {
          duration: `${e.duration}ms`,
          query: e.query.substring(0, 200),
          timestamp: new Date().toISOString(),
        });
      }
    });
  }

  return client;
}

export const prisma = global.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}
