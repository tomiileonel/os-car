import { createClient, RedisClientType } from 'redis';

declare global {
  var __redis: RedisClientType | undefined;
}

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_PREFIX = 'oscar:';

/**
 * Script Lua atómico para Sliding Window Rate Limiter (Gate G4).
 * Garantiza atomicidad ACID en memoria: previene race conditions
 * cuando múltiples requests entran en paralelo al clúster.
 *
 * KEYS[1] = Clave del bucket (ej: oscar:ratelimit:user:abc123)
 * ARGV[1] = limit (número máximo de requests permitidos)
 * ARGV[2] = windowMs (tamaño de la ventana en milisegundos)
 * ARGV[3] = now (timestamp actual en ms)
 * ARGV[4] = member (identificador único del request: now + nonce)
 *
 * Retorna: [allowed (1|0), remaining, resetAtMs]
 */
export const SLIDING_WINDOW_LUA_SCRIPT = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)

if count < limit then
  redis.call('ZADD', key, now, member)
  redis.call('PEXPIRE', key, window)
  return {1, limit - count - 1, now + window}
else
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local resetAt = now + window
  if #oldest >= 2 then
    resetAt = tonumber(oldest[2]) + window
  end
  return {0, 0, resetAt}
end
`;

function createRedisClient(): RedisClientType {
  const client = createClient({
    url: REDIS_URL,
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          console.error('[Redis] Max reconnection attempts reached');
          return new Error('Max reconnection attempts');
        }
        return Math.min(retries * 100, 3000);
      },
    },
  });

  client.on('error', (err) => {
    console.error('[Redis] Connection Error', {
      message: err.message,
      code: err.code,
      timestamp: new Date().toISOString(),
    });
  });

  client.on('connect', () => {
    console.info('[Redis] Connected', { url: REDIS_URL });
  });

  client.on('reconnecting', () => {
    console.warn('[Redis] Reconnecting', { timestamp: new Date().toISOString() });
  });

  return client;
}

export const redis = global.__redis ?? createRedisClient();

if (process.env.NODE_ENV !== 'production') {
  global.__redis = redis;
}

if (!redis.isOpen) {
  redis.connect().catch((err) => {
    console.error('[Redis] Initial connection failed', { error: err.message });
  });
}

export function redisKey(namespace: string, key: string): string {
  return `${REDIS_PREFIX}${namespace}:${key}`;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

/**
 * Rate Limiting Distribuido con Sliding Window atómico (Gate G4).
 * Utiliza EVAL con script Lua para garantizar atomicidad en clúster.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const member = `${now}:${crypto.randomUUID()}`;

  const result = (await redis.eval(SLIDING_WINDOW_LUA_SCRIPT, {
    keys: [key],
    arguments: [String(limit), String(windowMs), String(now), member],
  })) as number[];

  return {
    allowed: result[0] === 1,
    remaining: Number(result[1]),
    resetAt: Number(result[2]),
    limit,
  };
}

export async function setIdempotentResult(
  key: string,
  result: unknown,
  ttlMs: number
): Promise<void> {
  const serialized = JSON.stringify(result);
  await redis.set(key, serialized, { PX: ttlMs });
}

export async function getIdempotentResult<T>(key: string): Promise<T | null> {
  const result = await redis.get(key);
  if (!result) return null;
  try {
    return JSON.parse(result) as T;
  } catch {
    return null;
  }
}

export async function addToBlacklist(jti: string, ttlMs: number): Promise<void> {
  const key = redisKey('blacklist', jti);
  await redis.set(key, '1', { PX: ttlMs });
}

export async function isBlacklisted(jti: string): Promise<boolean> {
  const key = redisKey('blacklist', jti);
  const exists = await redis.exists(key);
  return exists === 1;
}
