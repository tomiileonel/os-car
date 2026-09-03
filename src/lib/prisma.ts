import { PrismaClient } from '@prisma/client';

declare global {
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
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
