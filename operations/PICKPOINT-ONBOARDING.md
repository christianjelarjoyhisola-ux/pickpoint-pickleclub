# PickPoint guarded onboarding

This checklist deliberately separates a polished private preview from an
operational tenant. Completing frontend development does not activate public
booking.

## Provisional implementation values

- Name: PickPoint Pickle Club
- Immutable slug: `pickpoint-pickleclub`
- Locale/currency/time zone: `en-PH` / `PHP` / `Asia/Manila`
- Preview-only inventory: two courts
- Preview-only hours: 06:00–22:00
- Preview-only rates: PHP 300/hour before 16:00 and PHP 400/hour afterward
- Preview-only duration: one to three whole hours
- Preview-only lead/horizon: 60 minutes / 30 days
- Payment presentation: existing full-payment receipt flow

These values live only in the PickPoint configuration boundary. Do not promote
them to operational court, pricing, or policy records without venue-owner
confirmation.

## Shared platform onboarding order

Use the existing guarded platform-owner workflows; never insert client-chosen
tenant UUIDs or expose a service-role key.

1. Completed: the guarded identity migration provisioned `pickpoint-pickleclub`
   as `setup_required`; the exact Sites hostname is active and court inventory
   remains empty. The migration verified non-PickPoint tenant identity, domain,
   billing, and provisioning rows were unchanged.
2. Confirm the permanent public name, exact domain, city/address, court count,
   court names/types, operating hours, rates, booking limits, cancellation and
   reschedule policy, contact details, and payment/remittance destinations.
3. Completed for the private Sites origin:
   `pickpoint-pickleclub.boothsandbeyondoffic.chatgpt.site`. Add only any future
   owner-approved custom hostname through `provision_tenant_domain`; add the
   same exact URLs to the Supabase Auth redirect allowlist. Do not use wildcards.
4. Provision the first owner membership through
   `provision_tenant_membership`; never commit an owner UUID or password.
5. Configure courts and rates through `manage_tenant_court` and the shared
   schedule/pricing workflows.
6. Configure venue contact, payment destination, platform billing, and
   remittance details through the guarded activation settings workflow.
7. Publish the versioned refund/reschedule policy and validate customer policy
   acceptance evidence.
8. Run public booking, payment receipt, manual review, confirmation email,
   cancellation, manager reschedule, blocked-date, role, and bidirectional
   tenant-isolation tests from the exact registered origin.
9. Verify the connected `/manage` server-authorized court, block, booking,
   receipt-review, schedule, and rescheduling contracts with the first owner.
   Keep mutations disabled until role/capability responses are verified from
   the final registered origin.
10. Ask the platform owner to perform initial activation only after every
   readiness check passes.

## Required production values still missing

- Any owner-approved custom production domain
- Full venue address and public map/location wording
- Final court inventory, types, amenities, and accessibility details
- Final operating and holiday hours
- Final regular/event rates, fees, rental rates, and taxes
- Cancellation, refund, no-show, weather, and rescheduling terms
- Owner Auth user ID, staff roster, and role assignments
- Reply-to email, phone, sender identity, and payment/remittance details

Until those values are supplied, keep the tenant setup-required and the site
private or no-index.
