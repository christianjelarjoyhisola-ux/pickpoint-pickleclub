# PickPoint Pickle Club

A premium, mobile-first court booking site and owner workspace for the isolated
`pickpoint-pickleclub` tenant in the shared Supabase booking platform.

## Product scope

- Customer flow: browse courts, check live availability, select court-hours,
  enter player details, review pricing, submit payment proof, receive a booking
  reference, and look up or cancel an unpaid booking.
- Owner workspace: today's schedule, bookings and payment review, court blocks,
  venue/court/rate/policy settings, launch readiness, and team access.
- Deliberately deferred: leagues, memberships, loyalty, coaching, tournaments,
  waitlists, promo campaigns, and forecasting.

## Tenant isolation

- Supabase project: `neqvrwtofiolcuxewdze` only.
- Immutable tenant slug: `pickpoint-pickleclub`.
- Registered origin: `pickpoint-pickleclub.boothsandbeyondoffic.chatgpt.site`.
- The browser never accepts a tenant UUID and cannot switch tenants.
- Live reads and writes use the platform's tenant-aware RPCs, Edge Functions,
  Row Level Security, origin checks, and overlap constraints.
- The tenant was provisioned through the guarded, idempotent onboarding RPC and
  remains `setup_required`. No other tenant row was changed during provisioning.

The production tenant intentionally has no invented courts, owner, price,
payment destination, or contact details. Public booking must remain disabled
until the venue owner supplies those facts and the platform readiness gate
passes. The private site shows clearly labelled preview data in the meantime.

## Local development

Node.js 22.13 or newer is required.

```text
npm install
npm run dev
npm run lint
npm run build
npm test
```

Only browser-safe configuration belongs in the frontend:

```text
NEXT_PUBLIC_SUPABASE_URL=https://neqvrwtofiolcuxewdze.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-or-anon-key>
NEXT_PUBLIC_SITE_URL=https://pickpoint-pickleclub.boothsandbeyondoffic.chatgpt.site
```

Never add service-role keys, database passwords, payment secrets, receipt
verification secrets, or owner passwords to this repository.

## Production onboarding

See `operations/PICKPOINT-ONBOARDING.md`. Configure the exact venue address,
operating hours, real courts and rates, contact/reply-to details, payment and
remittance destinations, policies, and first owner before activating booking.
