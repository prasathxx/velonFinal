# Velon Labs site v3: multipage, contact to Google Sheets, legal, SEO, accessibility

Stack: Astro 5 (static), GSAP, Lenis, three/r3f drone, deployed on Vercel. Dev server: `npm run dev` on :3950.
All copy lives in `src/data/site.ts`. Local only: no git commit, push or deploy.

## Owner decisions (fixed)

- **Brand:** the company brand is **Velon Labs** (it used to be "Velon"). The legal name stays "Velon Super Intelligence LLP".
  - Write "Velon Labs" in titles, metadata, the wordmark text, copy and JSON-LD.
  - Product names stay "Velon Campus", "Velon Spaces" and so on.
- **The old "Velon Labs" offering is renamed "Velon Build"** (slug `build`), because "Labs" is now the company name. It is the custom software and AI build service.
- **Domain:** `https://velonlabs.in` is the canonical URL. Every vercel.app host gets `X-Robots-Tag: noindex`.
- **Address:** "Coimbatore, Tamil Nadu, India". No street address, no phone number. WhatsApp comes later, so leave no placeholder for it.
- **Healthcare:** remove it everywhere.
- **Lineup split:**
  - **Products:** Campus, Spaces, Cart, Works.
  - **Services:** Build, Studio.
- **Product material:** keep the current copy. Cards link to `/contact?interest=<slug>` until landing pages exist. `hasPage: false` for all.
- **LinkedIn:** hide the link (no company URL yet).
- **Multipage:**
  - Keep the home page as it is now, with the same sections and look.
  - Each nav item gets its own page: `/products`, `/services`, `/process`, `/focus`, `/contact`.
  - Nav order: Products · Services · Process · Focus · Contact.
  - Home sections get a "See all →" link to their page.
  - Keep the section ids on home so old `#…` links still scroll.

## Catalog: one source of truth in `src/data/site.ts`

`offerings[]` has `{slug, name, kind: 'product'|'service', summary, tags, monogram, hasPage}`:

| Slug | Kind | Monogram |
|---|---|---|
| campus | product | Ca |
| spaces | product | Sp |
| cart | product | Ct |
| works | product | Wk |
| build | service | Bd |
| studio | service | St |

Summaries and tags come from the existing items. Helpers:
- `products` and `services` (filters of `offerings`)
- `hrefFor(o)`: returns `/${kind}s/${slug}` when `hasPage` is true, otherwise `/contact?interest=${slug}`
- `nav[]`

Focus items get an explicit `monogram` field: Education **Ed**, Property **Pr**, Ecommerce **Ec**, Agencies **Ag**, Anything else **+**. The sector for "Anything else" changes to "Velon Build".

## Bugs to fix

1. **Focus list:** it renders an empty 6th `<li>`. Render only real items, and derive the "01 / 05" counter from the item count.
2. **Initials:** replace the initials function with the explicit monogram field.
3. **Legal links:** turn them into real pages, `/privacy`, `/terms`, `/security` and `/cookies`.
4. **Product, Focus and footer links:** every one goes through `hrefFor`.
5. **Access pass:**
   - Remove "YOURNAME / GUEST". Show "VISITOR / VELON LABS".
   - After a successful contact form submit, put the visitor's name on the pass. Store it in sessionStorage with try/catch, and update the pass if it's on the page.
   - The ID becomes `VLN-` plus the current year plus a random 4-digit number per session.
6. **Stats strip:**
   - Drop the duplicate "6 products" and the padded "Ways to work: 2" and "Process: 4 steps".
   - Use honest figures: Products 4, Services 2, Studio: Coimbatore.
   - Replace "Team: 1" with words, as a note ("One team builds and runs every product"), not the number 1.
   - The hero line "Six products, and counting" becomes "Four products. Two ways we build for you."
7. **Quotes:** keep the "Velon team" commitments quotes, but label them "Our commitments" (values, not testimonials). Move them to `/process`; home keeps them too.

## Accessibility

- **RollLink** (the text-roll effect): give one real label `<span class="sr-only">` and wrap the animated copies in `aria-hidden="true"`.
- **Decorative elements:** add `aria-hidden="true"` to the HUD/telemetry string, the access pass and the drone canvases. The pass must not be focusable.
- **Reduced motion:** with `prefers-reduced-motion`, pause the drone, the marquee and the scroll effects, and show the static poster.
- **Mobile menu:**
  - Trap focus inside it, close it on Escape, and send focus back to the button.
  - Close it on navigation. On a multipage Astro site it closes naturally, but also close it on any link click inside the menu.
- **Focus rings:** visible on everything.
- **Forms:** label every field, and announce errors through `aria-live="polite"`.

## Contact pipeline

The flow is: browser → `POST /api/contact` (Astro server endpoint) → Google Sheets API, signed in with a service account.

- **Endpoint setup:** add the `@astrojs/vercel` adapter. Keep `output: 'static'` and put `export const prerender = false` on `src/pages/api/contact.ts`.
- **Validation** with zod:
  - `name` 1–100
  - `email` up to 200
  - `company` optional, up to 200
  - `phone` optional, up to 20, matching `^[+\d\s-]*$`
  - `interest`: one of the offering slugs, or `other`
  - `message` 10–5000
  - `page`, `utmSource` and `utmCampaign`
  - `consent: true`
  - `website`, a honeypot that must be empty
  - `turnstileToken`
- **Turnstile:**
  - Verify server-side with `TURNSTILE_SECRET`. The widget uses `PUBLIC_TURNSTILE_SITE_KEY`.
  - In dev with no keys, use Cloudflare's always-pass test keys: site `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA`.
- **Rate limit:** 5 requests per IP per 10 minutes, kept in memory per instance. Leave a comment that Upstash or Vercel WAF is the production upgrade.
- **Sheets:**
  - Sign a JWT with the service-account key using Node's `crypto` (RS256), exchange it for a token at `https://oauth2.googleapis.com/token`, then append.
  - Use `valueInputOption=RAW` so formulas typed by visitors are stored as text, not run.
  - Env vars: `GOOGLE_SA_EMAIL`, `GOOGLE_SA_KEY` (private key with `\n` escapes) and `LEADS_SHEET_ID`.
- **Sheet:** a tab named `Leads`, with these columns:
  Timestamp (IST) | Name | Email | Company | Phone | Interest | Message | Page | UTM source | UTM campaign | Consent | Privacy version
- **Privacy version:** `PRIVACY_VERSION = '2026-10-21'`.
- **If saving fails:** return 502, log `lead_append_failed`, and have the UI show `hello@velonlabs.in` as the fallback while keeping what the visitor typed.
- **Form:**
  - Read `?interest=` to pre-select the offering.
  - Capture `utm_*` on the first landing into sessionStorage.
  - The consent checkbox starts unchecked and links to `/privacy`.
  - Include the hidden honeypot.
  - States: loading, success and error, announced through `aria-live`. Disable the button while sending.
  - Keep `mailto:` only as a secondary link.
- **`/contact` page:** the form, the email address, "Coimbatore, Tamil Nadu, India" and "We reply within one working day."
- **Owner setup doc:** write `docs/CONTACT-SETUP.md` covering the Google Cloud project, enabling the Sheets API, the service account and its JSON key, sharing the sheet as Editor, Vercel env vars, Turnstile keys, and an optional Apps Script that emails the team on each new row.

## Legal (plain-English drafts with a "reviewed by counsel: pending" note)

- **`/privacy`** (DPDP Act 2023):
  - the exact fields collected
  - why: to reply to enquiries
  - processors: Vercel, Google (Sheets), Cloudflare (Turnstile)
  - retention: 24 months, then deletion
  - the visitor's rights: access, correction, erasure, withdrawing consent
  - grievance contact: hello@velonlabs.in
  - version date 2026-10-21
- **`/terms`:** short terms for a marketing site.
- **`/security`:** hosting on Vercel, HTTPS everywhere, access control on lead data, and reporting issues to security@velonlabs.in. Also publish `public/.well-known/security.txt`.
- **`/cookies`:** no non-essential cookies and no analytics yet, so no banner. Turnstile may set a strictly necessary cookie.
- **Footer:**
  - columns: Company (the nav), Products, Services, Legal
  - the line "© 2026 Velon Super Intelligence LLP · Coimbatore, Tamil Nadu, India"
  - no LLPIN or GSTIN yet: the owner adds them later through a `site.ts` field that only shows when filled

## SEO and headers

- **Every page:** a unique title (`%s — Velon Labs`), description, canonical (`https://velonlabs.in/<path>`) and the OG image `/og.jpg`.
- **robots.txt:** `User-agent: * / Allow: / / Sitemap: https://velonlabs.in/sitemap-index.xml`. `@astrojs/sitemap` already generates the sitemap; check that it covers the new pages.
- **Home JSON-LD:** Organization: name "Velon Labs", legalName, url, logo, email, address (Coimbatore, Tamil Nadu, IN). No `sameAs` yet.
- **Custom 404:** `src/pages/404.astro`, with links to the products and home.
- **`vercel.json` headers** (merge with the existing cache rules):
  - on every path: HSTS `max-age=63072000; includeSubDomains; preload`, nosniff, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()` and `X-Frame-Options: DENY`
  - `Content-Security-Policy-Report-Only`: `default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:`
  - `X-Robots-Tag: noindex` on every path when the host is `velon-page.vercel.app`, plus a second rule for any `*.vercel.app` host (a regex `has` value)

## Checks before saying done

- `npm run build` passes and `npx astro check` shows no new errors.
- With the dev server on :3950, curl every route: `/`, `/products`, `/services`, `/process`, `/focus`, `/contact`, `/privacy`, `/terms`, `/security`, `/cookies`, plus a missing path for the 404.
- Grep the built HTML in `dist/`:
  - no `#privacy`, `#terms`, `#security` or `#cookies` links
  - no "Healthcare", "YOURNAME" or `linkedin.com/"`
  - no "Aam" or "Ae" monograms
- POST to `/api/contact` with the test Turnstile keys and no Sheets env: expect a 502 storage error.
- A POST with `=1+1` as the message must be sent as RAW. Code review is enough here.
