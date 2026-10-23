// Append a lead row to Google Sheets, authenticated as a service account.
//
// Flow: sign a short-lived JWT with the service account's RSA private key (RS256, via Node's
// built-in crypto — no google-auth-library dependency needed for this one call), exchange it at
// Google's OAuth token endpoint for an access token, then POST the row with
// valueInputOption=RAW so anything a visitor typed (including a leading "=") is stored as a
// literal string, never evaluated as a formula.
//
// Env vars (see .env.example / docs/CONTACT-SETUP.md):
//   GOOGLE_SA_EMAIL   service account client_email
//   GOOGLE_SA_KEY     service account private_key, with real newlines escaped as \n
//   LEADS_SHEET_ID    the spreadsheet ID (the long id in the sheet's URL)
//
// If any of the three is missing, appendLeadRow throws "sheets_env_missing" — the API route
// turns that into a 502 with the fallback email, per PLAN-v3.md.

import { createSign } from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const SHEET_TAB = 'Leads';
const APPEND_RANGE = `${SHEET_TAB}!A:L`;

function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function signAssertion(email: string, privateKeyPem: string): string {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claimSet = {
    iss: email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claimSet))}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = base64url(signer.sign(privateKeyPem));
  return `${signingInput}.${signature}`;
}

async function getAccessToken(email: string, privateKeyPem: string): Promise<string> {
  const assertion = signAssertion(email, privateKeyPem);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`token_exchange_failed:${res.status}:${text}`);
  }
  const data: { access_token?: string } = await res.json();
  if (!data.access_token) throw new Error('token_exchange_no_token');
  return data.access_token;
}

interface SheetsEnv { email: string; privateKey: string; sheetId: string }

function readEnv(): SheetsEnv {
  const email = import.meta.env.GOOGLE_SA_EMAIL;
  const rawKey = import.meta.env.GOOGLE_SA_KEY;
  const sheetId = import.meta.env.LEADS_SHEET_ID;
  if (!email || !rawKey || !sheetId) {
    throw new Error('sheets_env_missing');
  }
  return { email, privateKey: rawKey.replace(/\\n/g, '\n'), sheetId };
}

/** Appends one row to the Leads tab. Row order must match the columns documented in CONTACT-SETUP.md. */
export async function appendLeadRow(row: string[]): Promise<void> {
  const { email, privateKey, sheetId } = readEnv();
  const accessToken = await getAccessToken(email, privateKey);

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(APPEND_RANGE)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: [row] }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`sheets_append_failed:${res.status}:${text}`);
  }
}
