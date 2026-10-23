// Every string and number on the page lives here. Components only read from `site` (or the catalog
// helpers below). Tomorrow's sheet maps 1:1: each top-level key is a tab, each field a column (see PLAN.md §9).
// v3 catalog (PLAN-v3.md): one source of truth for products, services, nav and hrefFor. Owner copy, 21 Oct 2026.

export interface Link { label: string; href: string }
export interface Fact { label: string; value: string; suffix?: string }
export interface Step { num: string; title: string; body: string }
// A stat tile is either a counted number (`value`) or a short line of words (`display`); never both.
export interface Stat { value?: number; display?: string; suffix?: string; label: string; decimals?: number; note?: string }
export interface Case { client: string; monogram: string; outcome: string; year: string; sector: string; offeringSlug: string; image?: string }
export interface Quote { quote: string; name?: string; role?: string; company?: string }

export interface EngagementItem { title: string; body: string }

/** The catalog: every product and service, in one list. `hasPage` flips on once a dedicated
 * landing page exists for that slug (true for the four products — /products/<slug> — cards route
 * there via `hrefFor`; the two services still route to the contact form until they get a page). */
export interface Offering {
  slug: string; name: string; kind: 'product' | 'service';
  summary: string; tags: string[]; monogram: string; hasPage: boolean;
  /** Card photo under /public; the card falls back to the open glass look while the file is missing. */
  image?: string;
  /** Product detail page content (/products/<slug>): kept honest — written only from `summary`/`tags`
   * above or existing page copy. Optional: only the four products with `hasPage: true` set these. */
  problem?: string; features?: string[]; audience?: string;
}

export const offerings: Offering[] = [
  {
    slug: 'campus', image: '/img/card-campus.jpg', name: 'Velon Campus', kind: 'product', monogram: 'Ca', hasPage: true,
    summary: 'A school operating system: admissions, academics, fees, communication and daily operations in one place.',
    tags: ['School ERP', 'Fees', 'Parents'],
    problem: 'Schools run admissions, fees, academics and parent updates across spreadsheets, paper registers and group chats that don’t talk to each other.',
    features: ['Admissions and enquiries', 'Academics and attendance', 'Fees and billing', 'Parent communication', 'Daily operations in one dashboard'],
    audience: 'Schools that want admissions, fees, academics and parent communication running in one system instead of several disconnected tools.',
  },
  {
    slug: 'spaces', image: '/img/card-spaces.jpg', name: 'Velon Spaces', kind: 'product', monogram: 'Sp', hasPage: true,
    summary: 'Property management for owners and managers: units, tenants, rent, billing and maintenance.',
    tags: ['Tenants', 'Rent', 'Maintenance'],
    problem: 'Owners and managers track units, tenants, rent and maintenance requests across spreadsheets, calls and WhatsApp threads.',
    features: ['Unit and tenant records', 'Rent collection and billing', 'Maintenance requests', 'Owner and manager dashboards'],
    audience: 'Property owners and managers who want rent, tenants and maintenance in one place instead of spreadsheets and phone calls.',
  },
  {
    slug: 'cart', image: '/img/card-cart.jpg', name: 'Velon Cart', kind: 'product', monogram: 'Ct', hasPage: true,
    summary: 'Shopify automation for abandoned carts, order updates, retention and campaigns, without manual work.',
    tags: ['Shopify', 'Retention', 'Flows'],
    problem: 'Abandoned carts, order updates and win-back campaigns eat manual hours that Shopify automation should already be handling.',
    features: ['Abandoned cart recovery', 'Order update messaging', 'Retention campaigns', 'Shopify-native automation flows'],
    audience: 'Shopify stores that want cart recovery, order updates and retention campaigns running automatically, without manual work.',
  },
  {
    slug: 'works', image: '/img/card-works.jpg', name: 'Velon Works', kind: 'product', monogram: 'Wk', hasPage: true,
    summary: 'A workspace for marketing and digital agencies: clients, projects, approvals and reporting.',
    tags: ['Projects', 'Approvals', 'Reporting'],
    problem: 'Agencies lose time chasing approvals and pulling reports from scattered tools, one client at a time.',
    features: ['Client and project workspaces', 'Approval workflows', 'Client reporting', 'Centralised agency operations'],
    audience: 'Marketing and digital agencies that want clients, projects, approvals and reporting in one workspace.',
  },
  {
    slug: 'build', image: '/img/card-build.jpg', name: 'Velon Build', kind: 'service', monogram: 'Bd', hasPage: false,
    summary: 'Custom software and AI systems built to order: agents, ERP, CRM, HRM, automations and 3D websites.',
    tags: ['Agentic AI', 'ERP/CRM', 'Automation'],
  },
  {
    slug: 'studio', image: '/img/card-studio.jpg', name: 'Velon Studio', kind: 'service', monogram: 'St', hasPage: false,
    summary: 'Branding, content, storytelling and PR, plus the process automation and ecommerce growth behind them.',
    tags: ['Branding', 'Content', 'Growth'],
  },
];

export const products = offerings.filter((o) => o.kind === 'product');
export const services = offerings.filter((o) => o.kind === 'service');
/** Cards link to a real `/products/<slug>` or `/services/<slug>` once that page exists; until then,
 * every card routes to the contact form with the offering pre-selected. */
export const hrefFor = (o: Offering): string => (o.hasPage ? `/${o.kind}s/${o.slug}` : `/contact?interest=${o.slug}`);
export const offeringBySlug = (slug: string): Offering => offerings.find((o) => o.slug === slug)!;

// Primary nav, in order (PLAN-v3): Products · Services · Process · Focus · Contact. Real routes — no #anchors.
const navLinks: Link[] = [
  { label: 'Products', href: '/products' },
  { label: 'Services', href: '/services' },
  { label: 'Process', href: '/process' },
  { label: 'Focus', href: '/focus' },
  { label: 'Contact', href: '/contact' },
];

export interface Site {
  meta: {
    name: string; legalName: string; tagline: string; description: string; url: string;
    email: string; phone: string; address: string; socials: Link[];
  };
  nav: { links: Link[]; cta: Link };
  hero: {
    eyebrow: string; headlineLines: string[]; subline: string; lead: string;
    primaryCta: Link; secondaryCta: Link; facts: Fact[]; aside: string;
  };
  logos: { label: string; items: { name: string; href?: string }[] };
  solutions: { eyebrow: string; title: string; intro?: string };
  engagement: { eyebrow: string; title: string; intro?: string; items: EngagementItem[] };
  process: { eyebrow: string; title: string; intro?: string; steps: Step[] };
  numbers: { eyebrow: string; title: string; items: Stat[] };
  cases: { eyebrow: string; title: string; intro?: string; items: Case[] };
  quotes: { eyebrow: string; items: Quote[] };
  cta: { eyebrow: string; lines: string[]; outlineLineIndex: number; lead: string; button: Link; email: string; note: string };
  footer: { columns: { title: string; links: Link[] }[]; legal: string; legalId: string; backToTop: string; blurb: string; credits: string };
  badge: { kicker: string; holder: string; role: string; id: string; note: string; event: string };
  telemetry: { labels: { waypoint: string; altitude: string; heading: string; landed: string } };
}

export const site: Site = {
  meta: {
    name: 'Velon Labs',
    legalName: 'Velon Super Intelligence LLP',
    tagline: 'AI-first software products and custom builds',
    description:
      'Velon Labs is an AI-first software company building products and custom systems across industries. Ready-to-run software, built to your needs. Coimbatore, India.',
    url: 'https://velonlabs.in/',
    email: 'hello@velonlabs.in',
    phone: '',
    address: 'Coimbatore, Tamil Nadu, India',
    // No company page yet: the link stays hidden until there is one (owner decision).
    socials: [],
  },

  nav: {
    links: navLinks,
    cta: { label: 'Talk to us', href: '/contact' },
  },

  hero: {
    eyebrow: 'Run on Velon',
    headlineLines: ['Software,', 'made to be', 'relied on.'],
    subline: 'Excellence runs on good systems.',
    lead: 'AI-first intelligence products for people who keep things running.',
    primaryCta: { label: 'Explore Velon', href: '/products' },
    secondaryCta: { label: 'Speak with us', href: '/contact' },
    facts: [
      { label: 'Launch', value: 'Weeks, not quarters' },
      { label: 'Support', value: 'One named contact' },
      { label: 'Replies', value: '1 working day' },
    ],
    aside: 'Coimbatore — Tamil Nadu — India',
  },

  logos: {
    label: 'Built for',
    items: [
      { name: 'Education' },
      { name: 'Real estate' },
      { name: 'Ecommerce' },
      { name: 'Marketing' },
      { name: 'Anything else → Velon Build' },
    ],
  },

  // Items come from the catalog (`offerings`) by default — see Solutions.astro.
  solutions: {
    eyebrow: 'Products',
    title: 'Four products. Two services.',
    intro:
      'We spot problems that software should have solved years ago, and ship products that solve them. Every Velon product is built to be used from day one, and when a ready-made product is not the fit, our services build it with you.',
  },

  engagement: {
    eyebrow: 'Pricing',
    title: 'How engagement works',
    intro: 'Two ways to pay for two ways we build, no surprises either way.',
    items: [
      { title: 'Product subscription', body: 'From ₹[X] per [school / unit] per month.' },
      { title: 'Custom build', body: 'Scoped and quoted after a discovery call.' },
    ],
  },

  process: {
    eyebrow: 'Process',
    title: 'Four steps from first call to a running system.',
    steps: [
      { num: '01', title: 'Discover', body: 'We talk to the people who do the work, map how things really run, and agree what success looks like.' },
      { num: '02', title: 'Configure', body: 'We start from a Velon product, not a blank page. Most of it is proven; we build the part that makes it yours — or, for a custom build, from a short discovery that scopes it.' },
      { num: '03', title: 'Launch', body: 'We roll out one team at a time, migrate your data, and run old and new side by side until the numbers match.' },
      { num: '04', title: 'Run', body: 'Launch is the start. We stay on with monitoring, roadmap reviews and a named contact who knows your setup.' },
    ],
  },

  numbers: {
    eyebrow: 'How we work with you',
    title: 'One team, from first call to long after launch.',
    items: [
      { display: 'Discover, configure, launch, run', label: 'Process' },
      { display: 'Products and custom builds', label: 'Lineup' },
      { display: 'Coimbatore', label: 'Studio' },
      { display: 'One team builds and runs every product', label: 'Team' },
    ],
  },

  // Items come with an explicit `offeringSlug` — Cases.astro resolves the link through `hrefFor`.
  cases: {
    eyebrow: 'Focus',
    title: 'Where we build.',
    items: [
      { client: 'Education', image: '/img/focus-education.jpg', monogram: 'Ed', outcome: 'One system for admissions, academics, fees and parents.', year: '', sector: 'Velon Campus', offeringSlug: 'campus' },
      { client: 'Property', image: '/img/focus-property.jpg', monogram: 'Pr', outcome: 'Rent, tenants and maintenance without spreadsheets.', year: '', sector: 'Velon Spaces', offeringSlug: 'spaces' },
      { client: 'Ecommerce', image: '/img/focus-ecommerce.jpg', monogram: 'Ec', outcome: 'Recover carts and keep customers coming back, automatically.', year: '', sector: 'Velon Cart', offeringSlug: 'cart' },
      { client: 'Agencies', image: '/img/focus-agencies.jpg', monogram: 'Ag', outcome: 'Projects, approvals and client reporting in one workspace.', year: '', sector: 'Velon Works', offeringSlug: 'works' },
      { client: 'Anything else', image: '/img/focus-build.jpg', monogram: '+', outcome: 'Got a problem that software should have solved? We build it to your brief.', year: '', sector: 'Velon Build', offeringSlug: 'build' },
    ],
  },

  quotes: {
    eyebrow: 'Our commitments',
    items: [
      { quote: 'Built and running before we sell it, so you start from working software, not a pitch.' },
      { quote: 'Launch is where our work starts. We stay on to run it with you.' },
    ],
  },

  cta: {
    eyebrow: 'Contact',
    lines: ["Let's build", 'the next one.'],
    outlineLineIndex: 1,
    lead: "Tell us what your team is working around today. We'll reply with a suggested product, a custom build plan, or both.",
    button: { label: 'Start a project', href: '/contact' },
    email: 'hello@velonlabs.in',
    note: 'We reply within one working day.',
  },

  footer: {
    blurb: 'Velon Labs is an AI-first software company building products and custom systems across industries.',
    columns: [
      { title: 'Company', links: navLinks },
      { title: 'Products', links: products.map((p) => ({ label: p.name.replace('Velon ', ''), href: hrefFor(p) })) },
      { title: 'Services', links: services.map((s) => ({ label: s.name.replace('Velon ', ''), href: hrefFor(s) })) },
      { title: 'Legal', links: [
        { label: 'Privacy', href: '/privacy' },
        { label: 'Terms', href: '/terms' },
        { label: 'Security', href: '/security' },
        { label: 'Cookies', href: '/cookies' },
      ] },
    ],
    legal: '© 2026 Velon Super Intelligence LLP · Coimbatore, Tamil Nadu, India',
    // LLPIN/GSTIN: the owner fills this in later. Empty hides the line entirely (Footer.astro).
    legalId: '',
    backToTop: 'Back to top',
    // CC BY 3.0 requires the attribution: keep this line wherever the drone model ships
    credits: 'Drone model by NateGazzard (poly.pizza/m/DNbUoMtG3H), CC BY 3.0, recoloured.',
  },

  // The 3D access pass (fixed, top right). Holder/id are placeholders until a visitor is known —
  // flight-bridge.ts fills in the real name and a session ID once the contact form or sessionStorage say who it is.
  badge: {
    kicker: 'Access pass',
    holder: 'Visitor',
    role: 'Velon Labs',
    id: 'VLN-2026-0000',
    note: 'Drag the pass',
    event: 'Kick-off call',
  },

  // Flight HUD (desktop): WP 02 / SOLUTIONS · ALT 0.84 · HDG 114
  telemetry: {
    labels: { waypoint: 'WP', altitude: 'ALT', heading: 'HDG', landed: 'LANDED' },
  },
};
