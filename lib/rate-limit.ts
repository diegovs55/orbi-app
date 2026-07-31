/**
 * lib/rate-limit.ts — RC-01f
 *
 * Rate limiting centralizado con Upstash Redis + sliding window.
 * Si las credenciales no están configuradas, retorna { ok: true } como
 * fallback seguro — desarrollo local funciona sin Redis.
 */

import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Caché de instancias por (limit, window) para no recrearlas en cada request
const limiterCache = new Map<string, Ratelimit>();

function getLimiter(limit: number, windowSeconds: number): Ratelimit {
  const key = `${limit}:${windowSeconds}`;
  const cached = limiterCache.get(key);
  if (cached) return cached;

  const limiter = new Ratelimit({
    redis: new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    }),
    limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
    prefix: "orbi:rl",
  });
  limiterCache.set(key, limiter);
  return limiter;
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  retryAfter: number;
}

/**
 * Verifica el rate limit para la IP del request.
 * Sin credenciales Upstash → fallback seguro, siempre ok: true.
 */
export async function checkRateLimit(
  req: NextRequest,
  endpoint: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return { ok: true, limit, remaining: limit, retryAfter: 0 };
  }

  try {
    const ip = getClientIp(req);
    const limiter = getLimiter(limit, windowSeconds);
    const { success, limit: l, remaining, reset } = await limiter.limit(`${endpoint}:${ip}`);
    const retryAfter = success ? 0 : Math.max(0, Math.ceil((reset - Date.now()) / 1000));
    return { ok: success, limit: l, remaining, retryAfter };
  } catch {
    // Error de red con Upstash → fail open (no bloquear usuarios legítimos)
    return { ok: true, limit, remaining: limit, retryAfter: 0 };
  }
}

/**
 * Respuesta estándar 429 con cabecera Retry-After.
 * Typed as NextResponse<never> para ser asignable a cualquier NextResponse<T>.
 */
export function rateLimitResponse(retryAfter: number): NextResponse<never> {
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter > 0 ? retryAfter : 60),
        "X-RateLimit-Limit": "0",
      },
    },
  ) as NextResponse<never>;
}
