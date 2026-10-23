// In-memory, per-serverless-instance rate limiter: 5 requests per IP per 10 minutes.
//
// Production upgrade note: a serverless platform runs many short-lived instances, so this map is
// NOT shared across them — it only throttles bursts that land on the same warm instance. For a
// real limit across the whole deployment, swap this for Upstash Redis (@upstash/ratelimit) or
// Vercel's built-in WAF rate limiting rules, both of which are shared and persistent.

const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 5;

interface Bucket { count: number; resetAt: number }

const buckets = new Map<string, Bucket>();

// Opportunistic sweep so the map doesn't grow unbounded on a long-lived instance.
let lastSweep = 0;
function sweep(now: number) {
  if (now - lastSweep < WINDOW_MS) return;
  lastSweep = now;
  for (const [ip, bucket] of buckets) {
    if (now > bucket.resetAt) buckets.delete(ip);
  }
}

export interface RateLimitResult { allowed: boolean; remaining: number; retryAfterMs: number }

export function checkRateLimit(ip: string): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_REQUESTS - 1, retryAfterMs: 0 };
  }

  if (bucket.count >= MAX_REQUESTS) {
    return { allowed: false, remaining: 0, retryAfterMs: bucket.resetAt - now };
  }

  bucket.count += 1;
  return { allowed: true, remaining: MAX_REQUESTS - bucket.count, retryAfterMs: 0 };
}
