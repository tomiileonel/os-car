export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export class MemorySlidingWindow {
  private readonly maxBuckets: number;
  private readonly buckets = new Map<string, number[]>();

  constructor(maxBuckets = 10_000) {
    this.maxBuckets = maxBuckets;
  }

  record(key: string, limit: number, windowMs: number, now: number): RateLimitDecision {
    const windowStart = now - windowMs;
    const previous = this.buckets.get(key);
    const fresh: number[] = [];

    if (previous !== undefined) {
      for (let i = 0; i < previous.length; i += 1) {
        const timestamp = previous[i];
        if (timestamp !== undefined && timestamp > windowStart) {
          fresh.push(timestamp);
        }
      }
    }

    // Política de desalojo determinista LRU si se alcanza la capacidad máxima en Edge isolate
    if (this.buckets.size >= this.maxBuckets && !this.buckets.has(key)) {
      const oldestKey = this.buckets.keys().next().value;
      if (oldestKey !== undefined) {
        this.buckets.delete(oldestKey);
      }
    }

    if (fresh.length < limit) {
      fresh.push(now);
      // Re-inserción explícita para mantener orden LRU estricto en JavaScript Map
      this.buckets.delete(key);
      this.buckets.set(key, fresh);
      return {
        allowed: true,
        remaining: limit - fresh.length,
        retryAfterMs: 0,
      };
    }

    const oldest = fresh[0] ?? now;
    const retryAfterMs = Math.max(0, oldest + windowMs - now);
    this.buckets.delete(key);
    this.buckets.set(key, fresh);
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs,
    };
  }

  get size(): number {
    return this.buckets.size;
  }

  reset(): void {
    this.buckets.clear();
  }
}

export const memoryLimiter = new MemorySlidingWindow(10_000);

/**
 * Sliding window rate limiter for Edge Runtime (Next.js Middleware).
 * Pure Web Standards implementation — strictly decoupled from Node.js TCP/ioredis.
 */
export async function slidingWindowRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitDecision> {
  return memoryLimiter.record(key, limit, windowMs, Date.now());
}
