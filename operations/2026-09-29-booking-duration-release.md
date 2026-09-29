# PickPoint booking duration correction

Both live courts had an unintended three-hour maximum. PickPoint now allows bookings throughout its available operating day (currently 05:00–00:00). Public multi-court bookings no longer have a combined court-hour cap. Operating hours, availability, pricing and payment validation remain enforced.

Applied migration: `20260929010000_pickpoint_remove_booking_hour_cap.sql`. The database changes are scoped to PickPoint; other tenants retain their existing duration rules.

The shared `create-booking` Edge function was patched from its exact deployed source using `2026-09-29-patch-booking-duration.mjs` and deployed as active version 27. This patch also preserves other tenants' limits. The input source must be extracted from the pre-change ESZIP backup; the patch deliberately fails against different/already-patched source.

Frontend production deployment: `2af37eba-babe-4a0f-8730-e182e54617cd` at https://pickpointpickle.com.

Validation completed:

- Full test suite and TypeScript check passed.
- The rollback-only SQL regression created 19 hours on each court (38 court-hours), checked 38 slots and PHP 8,870 inclusive total, then rolled back. No bookings remained and no emails were sent.
- Edge parsing accepted a 19-hour PickPoint session and retained the existing rejection for another tenant.
- A live 38-court-hour request reached policy acceptance validation, proving duration validation passed without creating a booking.
- Production frontend assets matched local build hashes; home and management pages returned HTTP 200.

The SQL regression assumes both current courts are active and the selected day is free. A conflict should fail the regression; never clear real bookings to run it.
