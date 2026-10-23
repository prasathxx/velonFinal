// POST /api/contact — the only dynamic route on this otherwise-static site.
// Pipeline: zod validation -> honeypot -> rate limit -> Turnstile -> append to Google Sheets.
// See PLAN-v3.md "Contact pipeline" and docs/CONTACT-SETUP.md.
export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { offerings, site } from '../../data/site';
import { verifyTurnstile } from '../../lib/turnstile';
import { checkRateLimit } from '../../lib/ratelimit';
import { appendLeadRow } from '../../lib/sheets';

// Bump this when the privacy policy materially changes; stored on every lead row so we always
// know which version of the policy a visitor agreed to.
export const PRIVACY_VERSION = '2026-10-21';

const FALLBACK_EMAIL = site.meta.email;
const offeringSlugs = new Set(offerings.map((o) => o.slug));

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email().trim().max(200),
  company: z.string().trim().max(200).optional().default(''),
  phone: z
    .string()
    .trim()
    .max(20)
    .regex(/^[+\d\s-]*$/, 'invalid_phone')
    .optional()
    .default(''),
  interest: z
    .string()
    .trim()
    .min(1)
    .refine((v) => v === 'other' || offeringSlugs.has(v), { message: 'invalid_interest' }),
  message: z.string().trim().min(10).max(5000),
  page: z.string().trim().max(500).optional().default(''),
  utmSource: z.string().trim().max(200).optional().default(''),
  utmCampaign: z.string().trim().max(200).optional().default(''),
  consent: z.literal(true),
  // honeypot: real visitors never fill this (it's hidden from sighted + screen-reader users alike
  // in ContactForm.astro); left loose here (not max(0)) so we can report it as its own 400 below
  // instead of folding it into generic validation noise.
  website: z.string().optional().default(''),
  turnstileToken: z.string().min(1, 'missing_turnstile_token'),
});

function jsonResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

function istTimestamp(): string {
  return new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'medium',
  });
}

// Without this, a plain GET falls through to Astro's 404 render, which on Vercel tries to fetch
// itself over 127.0.0.1:443 and crashes the function (FUNCTION_INVOCATION_FAILED).
export const ALL: APIRoute = () =>
  new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json', Allow: 'POST' },
  });

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'invalid_json' }, 400);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ ok: false, error: 'validation', issues: z.treeifyError(parsed.error) }, 400);
  }
  const data = parsed.data;

  // Honeypot filled in -> treat as a bad request. Bots fill every field; sighted/assistive-tech
  // visitors never see or reach this field (see ContactForm.astro).
  if (data.website) {
    return jsonResponse({ ok: false, error: 'honeypot' }, 400);
  }

  const ip = getClientIp(request);
  const rate = checkRateLimit(ip);
  if (!rate.allowed) {
    return jsonResponse({ ok: false, error: 'rate_limited' }, 429);
  }

  const turnstileOk = await verifyTurnstile(data.turnstileToken, ip);
  if (!turnstileOk) {
    return jsonResponse({ ok: false, error: 'turnstile' }, 400);
  }

  const row = [
    istTimestamp(),
    data.name,
    data.email,
    data.company,
    data.phone,
    data.interest,
    data.message,
    data.page,
    data.utmSource,
    data.utmCampaign,
    data.consent ? 'yes' : 'no',
    PRIVACY_VERSION,
  ];

  try {
    await appendLeadRow(row);
  } catch (err) {
    console.error('lead_append_failed', err);
    return jsonResponse({ ok: false, error: 'storage', fallbackEmail: FALLBACK_EMAIL }, 502);
  }

  return jsonResponse({ ok: true, name: data.name }, 200);
};
