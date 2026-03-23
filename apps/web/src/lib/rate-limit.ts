const rateLimit = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(
  key: string,
  maxRequests: number = 10,
  windowMs: number = 60000
): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const entry = rateLimit.get(key);

  if (rateLimit.size > 10000) {
    for (const [k, v] of rateLimit) {
      if (v.resetTime < now) rateLimit.delete(k);
    }
  }

  if (!entry || entry.resetTime < now) {
    rateLimit.set(key, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetIn: windowMs };
  }

  entry.count++;
  if (entry.count > maxRequests) {
    return { allowed: false, remaining: 0, resetIn: entry.resetTime - now };
  }

  return { allowed: true, remaining: maxRequests - entry.count, resetIn: entry.resetTime - now };
}
