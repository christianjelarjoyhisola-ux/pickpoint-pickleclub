# PickPoint weather credits

Owners and admins issue one voucher from a paid booking's **View details** panel.
The existing guest email receives the code. Guests enter it in player details,
using that same email, before submitting payment. Partial use keeps the remaining
balance; fully covered bookings confirm without a receipt. No customer account,
new payment provider, weather automation, or expiry policy is added.

Credit covers the booking subtotal. The existing platform service fee stays
payable and is excluded from issuance. Issuing credit does not cancel the original
reservation or close the court: use the existing cancellation/closure controls
when needed. Amount and reason are immutable after issuance. Existing weather
refunds and weather credits cannot compensate the same booking twice.

## Backend installation

The tenant-specific migration and Edge Function were installed in production on
23 September 2026. Issuance, idempotent retries, full and partial redemption, slot
confirmation, and expiry restoration passed a rollback-only transaction against
the real shared schema. No test bookings or vouchers were retained, and no test
emails were sent to players. Frontend deployment alone does not install the backend.

1. Deploy `supabase/functions/pickpoint-weather-credit` to the existing shared
   Supabase project `neqvrwtofiolcuxewdze`. Include `_shared/maileroo.ts`.
   Disable the gateway JWT check for this function, as with public guest booking
   functions: owner JWTs and guest booking tokens are validated by the database.
   The handler accepts only registered PickPoint origins and the PickPoint slug.
2. Apply `20260923010000_pickpoint_weather_credits.sql` to that same project.
   It depends on the existing bookings, booking tokens, slots, memberships,
   settings, and weather-refund migrations. The migration enables the guest
   feature flag only after creating its database contracts.
3. Deploy the frontend and verify owner issuance, email delivery, partial
   redemption, remaining-payment receipt approval, full redemption, and expiry
   against the actual shared backend before rollout.

Reuse existing server secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `MAILEROO_API_KEY`, `MAILEROO_FROM_EMAIL`, and
`EDGE_INTERNAL_SECRET`. The tenant's existing Reply-To address is used.
No new credentials belong in the browser or this repository.

If voucher email delivery fails, the credit remains saved. The owner can copy the
code or retry delivery. Retries reuse the same voucher; email attempts have a
one-minute cooldown. Fully credited bookings use the platform's existing
idempotent `send-booking-email` confirmation function.

## Accounting and lifecycle

The voucher ledger records issued amount, balance, reason, actor, source booking,
and each redemption. Redemption reduces the booking's stored subtotal and total
to the remaining cash amount, so existing receipt verification checks the correct
top-up. The original total remains in
`metadata.weatherCreditOriginalTotal`; credit tender is recorded in
`metadata.weatherCreditAmount` and the redemption ledger. Reports that need gross
sales versus cash collected should use these separate values.

Booking and voucher row locks serialize spending. A unique source booking prevents
duplicate issuance, and a unique redemption booking makes retries idempotent.
An unpaid booking's cancellation or expiry returns reserved credit once, using
the platform's existing hold-expiry lifecycle. Such bookings cannot be reinstated
after their credit has been returned. Paid bookings retain their redeemed credit;
further weather compensation is a new owner-issued voucher for the affected visit.

## Local verification

The database tests run the actual migration in PostgreSQL/WASM with a minimal
fixture for the shared platform contracts, without production access:

```powershell
npm install --prefix tmp/weather-credit-tools --no-audit --no-fund @electric-sql/pglite@0.5.8
node --test tests/weather-credit.test.mjs
deno test --allow-env supabase/functions/pickpoint-weather-credit/index_test.ts
npx tsc --noEmit
npm run lint
npm test
```

The fixture verifies money constraints, partial/full redemption, retry behavior,
credit restoration, authorization, tenant and origin isolation, and refund
conflicts. It does not replace verification against the shared platform's full
schema, receipt pipeline, expiry jobs, reporting, or real email service.
