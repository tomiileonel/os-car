export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
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
      return {
        allowed: true,
        remaining: limit - fresh.length,
        retryAfterMs: 0,
      };
    }

    const oldest = fresh[0] ?? now;
    const retryAfterMs = Math.max(0, oldest + windowMs - now);
    this.buckets.set(key, fresh);
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs,
    };
  }

  reset(): void {
    this.buckets.clear();
  }
}

export const memoryLimiter = new MemorySlidingWindow();

/**
 * Sliding window rate limiter for Edge Runtime (Next.js Middleware).
 * Pure Web Standards implementation — strictly decoupled from Node.js TCP/ioredis.
 */
export async function slidingWindowRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  _member?: string
): Promise<RateLimitDecision> {
  return memoryLimiter.record(key, limit, windowMs, Date.now());
}
