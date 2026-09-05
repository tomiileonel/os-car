import type { Redis } from "ioredis";

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, 0, now - windowMs)
local count = redis.call('ZCARD', key)
if count < limit then
  redis.call('ZADD', key, now, member)
  redis.call('PEXPIRE', key, windowMs)
  return {1, limit - count - 1, 0}
end
local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
local retryAfterMs = windowMs
if oldest and oldest[2] then
  retryAfterMs = tonumber(oldest[2]) + windowMs - now
end
if retryAfterMs < 0 then
  retryAfterMs = 0
end
return {0, 0, retryAfterMs}
`;

let redisClient: Redis | null = null;
let lastFailureAt = 0;
const REDIS_RETRY_COOLDOWN_MS = 30_000;

async function getRedisClient(): Promise<Redis | null> {
  const redisUrl = process.env.REDIS_URL;
  if (typeof redisUrl !== "string" || redisUrl.length === 0) {
    return null;
  }
  const now = Date.now();
  if (now - lastFailureAt < REDIS_RETRY_COOLDOWN_MS) {
    return null;
  }
  if (redisClient) {
    return redisClient;
  }
  try {
    const { default: RedisCtor } = await import("ioredis");
    redisClient = new RedisCtor(redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    return redisClient;
  } catch {
    lastFailureAt = Date.now();
    redisClient = null;
    return null;
  }
}

export async function slidingWindowRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  member: string
): Promise<RateLimitDecision> {
  const client = await getRedisClient();
  if (client) {
    try {
      const now = Date.now();
      const raw = await client.eval(
        SLIDING_WINDOW_LUA,
        1,
        key,
        String(now),
        String(windowMs),
        String(limit),
        member
      );
      const [allowedFlag, remaining, retryAfterMs] = raw as unknown as [number, number, number];
      return { allowed: allowedFlag === 1, remaining, retryAfterMs };
    } catch {
      lastFailureAt = Date.now();
    }
  }
  return memoryLimiter.record(key, limit, windowMs, Date.now());
}

export class MemorySlidingWindow {
  private buckets = new Map<string, number[]>();

  record(key: string, limit: number, windowMs: number, now: number): RateLimitDecision {
    const windowStart = now - windowMs;
    const previous = this.buckets.get(key) ?? [];
    const fresh = previous.filter((timestamp) => timestamp > windowStart);

    if (fresh.length < limit) {
      fresh.push(now);
      this.buckets.set(key, fresh);
      return { allowed: true, remaining: limit - fresh.length, retryAfterMs: 0 };
    }

    this.buckets.set(key, fresh);
    const oldest = fresh[0] ?? now;
    return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, oldest + windowMs - now) };
  }

  reset(): void {
    this.buckets.clear();
  }
}

export const memoryLimiter = new MemorySlidingWindow();
