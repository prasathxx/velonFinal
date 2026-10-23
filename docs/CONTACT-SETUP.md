# Contact form setup (owner's guide)

The contact form at `/contact` sends leads to a Google Sheet. Nothing here is wired up yet with
real keys — set this up once, then add the values to Vercel so the live site can send mail.

Until you do this, the form will show a friendly "something went wrong, email us at
hello@velonlabs.in" error after a visitor submits, and the message they typed is not lost on
their screen. No leads are silently dropped — they just aren't saved anywhere until this is set up.

## 1. Google Cloud: create a project and a service account

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a new project
   (or reuse an existing one), e.g. "velon-labs-site".
2. In **APIs & Services → Library**, search for **Google Sheets API** and click **Enable**.
3. In **APIs & Services → Credentials**, click **Create credentials → Service account**.
   - Name it something like `velon-contact-form`.
   - You don't need to grant it any project-level IAM roles — sheet access is handled by sharing
     the sheet directly with it (step 3 below).
4. Open the new service account, go to the **Keys** tab, click **Add key → Create new key →
   JSON**, and download it. This file has two values you'll need:
   - `client_email` → this is `GOOGLE_SA_EMAIL`
   - `private_key` → this is `GOOGLE_SA_KEY` (see formatting note below)

**Keep this JSON file private.** Don't commit it, email it unencrypted, or paste it into chat.

## 2. Create the sheet

1. Create a new Google Sheet. Name the tab (the one at the bottom) exactly **`Leads`**.
2. In row 1, add these column headers, in this order:

   | A | B | C | D | E | F | G | H | I | J | K | L |
   |---|---|---|---|---|---|---|---|---|---|---|---|
   | Timestamp (IST) | Name | Email | Company | Phone | Interest | Message | Page | UTM source | UTM campaign | Consent | Privacy version |

3. Copy the **spreadsheet ID** from its URL: in
   `https://docs.google.com/spreadsheets/d/THIS_LONG_ID/edit`, the long id between `/d/` and
   `/edit` is `LEADS_SHEET_ID`.
4. Click **Share**, paste the service account's `client_email` (looks like
   `velon-contact-form@your-project.iam.gserviceaccount.com`), and give it **Editor** access.
   Uncheck "Notify people" — it's a robot, not a person.

## 3. Formatting `GOOGLE_SA_KEY`

The downloaded JSON's `private_key` field looks like this, with real newlines:

```
-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEA...
-----END PRIVATE KEY-----
```

Vercel environment variables are single-line, so when you paste it in, replace every real
newline with the two characters `\n`. It should end up as one long line starting with
`-----BEGIN PRIVATE KEY-----\n` and ending `\n-----END PRIVATE KEY-----\n`. The code
(`src/lib/sheets.ts`) converts those `\n` escapes back into real newlines before using the key,
so this exact format is required.

## 4. Cloudflare Turnstile (bot check)

1. Go to the [Cloudflare dashboard](https://dash.cloudflare.com) → **Turnstile**.
2. Add a site for `velonlabs.in` (and your `*.vercel.app` preview domain if you want previews
   protected too). Choose the **Managed** widget mode.
3. You'll get two keys:
   - **Site key** → `PUBLIC_TURNSTILE_SITE_KEY`
   - **Secret key** → `TURNSTILE_SECRET`

Until these are set, the site automatically falls back to Cloudflare's public **test** keys,
which always let submissions through. That's fine for local development, but the real keys
should be set in Vercel before launch so the bot check actually does something.

## 5. Vercel environment variables

In the Vercel project → **Settings → Environment Variables**, add for Production (and Preview,
if you want working previews):

| Name | Value |
|---|---|
| `GOOGLE_SA_EMAIL` | the service account's `client_email` |
| `GOOGLE_SA_KEY` | the private key, formatted as in step 3 |
| `LEADS_SHEET_ID` | the spreadsheet ID from step 2 |
| `PUBLIC_TURNSTILE_SITE_KEY` | from step 4 |
| `TURNSTILE_SECRET` | from step 4 |

Redeploy after adding them — environment variables only take effect on new deployments.

## 6. Optional: get an email the moment a lead comes in

The form writes straight to the sheet; it doesn't send an email itself. If you want to be
notified immediately rather than checking the sheet, add this Apps Script to the spreadsheet:

1. In the sheet, go to **Extensions → Apps Script**.
2. Paste:

   ```javascript
   function onNewLead(e) {
     var row = e.range.getRow();
     if (e.range.getSheetName() !== 'Leads' || row === 1) return;
     var sheet = e.range.getSheet();
     var values = sheet.getRange(row, 1, 1, 12).getValues()[0];
     var [timestamp, name, email, company, phone, interest, message] = values;
     MailApp.sendEmail({
       to: 'hello@velonlabs.in',
       subject: 'New enquiry: ' + name + ' (' + interest + ')',
       body:
         'Name: ' + name + '\n' +
         'Email: ' + email + '\n' +
         'Company: ' + company + '\n' +
         'Phone: ' + phone + '\n' +
         'Interest: ' + interest + '\n\n' +
         'Message:\n' + message + '\n\n' +
         'Submitted: ' + timestamp,
     });
   }
   ```

3. Save it, then in the Apps Script editor go to **Triggers** (clock icon) → **Add Trigger**:
   - Choose function `onNewLead`
   - Event source: **From spreadsheet**
   - Event type: **On form submit** — if that option isn't offered because the sheet isn't
     linked to a Google Form, choose **On change** instead and adjust the guard at the top of the
     function (it already skips anything that isn't a new row in `Leads`).
4. Authorize it the first time it runs (Google will ask).

## How the pipeline works (for reference)

`POST /api/contact` (`src/pages/api/contact.ts`) runs, in order:

1. **zod validation** — rejects malformed input with `400`.
2. **Honeypot check** — a hidden `website` field; if filled, `400`.
3. **Rate limit** — 5 requests per IP per 10 minutes, in-memory per server instance
   (`src/lib/ratelimit.ts`). This is a soft limit — see the comment in that file about upgrading
   to Upstash or Vercel's WAF rate limiting for a real production limit shared across instances.
4. **Turnstile verification** (`src/lib/turnstile.ts`) — rejects likely-bot submissions with `400`.
5. **Append to Google Sheets** (`src/lib/sheets.ts`), signed in as the service account via a
   hand-signed RS256 JWT (no extra auth library needed), using `valueInputOption=RAW` so anything
   a visitor types — including something that looks like a spreadsheet formula — is stored as
   plain text, never evaluated.
6. If the sheet append fails for any reason (missing env vars, revoked access, Google outage),
   the API returns `502` with the fallback email, and the form on screen tells the visitor to
   email that address directly instead of losing their message.
