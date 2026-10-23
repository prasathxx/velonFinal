// Cloudflare Turnstile verification. The widget (client-side) uses PUBLIC_TURNSTILE_SITE_KEY;
// the server verifies the token it produces with TURNSTILE_SECRET.
//
// When either env var is missing (local dev, or this repo before the owner sets up Cloudflare),
// we fall back to Cloudflare's published *test* keys: site key 1x00000000000000000000AA and
// secret 1x0000000000000000000000000000000AA. Cloudflare documents that secret as "always passes"
// for any token — so we short-circuit locally instead of making a real network call to Cloudflare
// with a key that was never meant to hit their servers for real traffic. The matching "always
// fails" test secret (2x00...AA) is handled the same way, for completeness/testing.
// Any other secret (a real one) does a real POST to the siteverify endpoint.

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000AA';
const TEST_SECRET_ALWAYS_PASS = '1x0000000000000000000000000000000AA';
const TEST_SECRET_ALWAYS_FAIL = '2x0000000000000000000000000000000AA';

export function getTurnstileSiteKey(): string {
  const key = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY;
  return key && key.length > 0 ? key : TURNSTILE_TEST_SITE_KEY;
}

function getSecret(): string {
  const secret = import.meta.env.TURNSTILE_SECRET;
  return secret && secret.length > 0 ? secret : TEST_SECRET_ALWAYS_PASS;
}

export async function verifyTurnstile(token: string, remoteIp?: string): Promise<boolean> {
  if (!token) return false;

  const secret = getSecret();

  // Cloudflare's documented sandbox secrets: no network call, deterministic result.
  if (secret === TEST_SECRET_ALWAYS_PASS) return true;
  if (secret === TEST_SECRET_ALWAYS_FAIL) return false;

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.set('remoteip', remoteIp);
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) return false;
    const data: { success?: boolean } = await res.json();
    return data.success === true;
  } catch (err) {
    console.error('turnstile_verify_failed', err);
    return false;
  }
}
