import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const source = (relative) => readFile(path.join(root, relative), "utf8");
const legacyFiles = [
  "app/booking-experience.tsx",
  "app/pickpoint-pickleclub.css",
  "app/manage/manage.module.css",
  "app/manage/calendar-view.tsx",
  "app/manage/calendar-view.module.css",
  "app/manage/analytics-finance.tsx",
  "app/manage/analytics-finance.module.css",
];
const forbidden = /Dinkhub|Dink Hub|Dinktopia|DINK-|RallyOS|Court Hub|booking-experience|calendar-view|analytics-finance/i;
let workerPromise;

function getWorker() {
  workerPromise ??= import(new URL(`../dist/server/index.js?test=${Date.now()}`, import.meta.url)).then(
    (module) => module.default,
  );
  return workerPromise;
}

async function render(pathname, origin = "http://localhost") {
  const worker = await getWorker();
  return worker.fetch(
    new Request(new URL(pathname, origin), { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

async function resolveImport(from, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = path.resolve(path.dirname(from), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.css`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    try { await access(candidate); return candidate; } catch { /* try the next supported extension */ }
  }
  return null;
}

async function reachableFrom(entries) {
  const pending = entries.map((entry) => path.join(root, entry));
  const seen = new Set();
  while (pending.length) {
    const file = pending.pop();
    if (!file || seen.has(file)) continue;
    seen.add(file);
    if (file.endsWith(".css")) continue;
    const text = await readFile(file, "utf8");
    const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    for (const statement of ast.statements) {
      const specifier = (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
        ? statement.moduleSpecifier.text
        : null;
      if (specifier) {
        const resolved = await resolveImport(file, specifier);
        if (resolved) pending.push(resolved);
      }
    }
  }
  return seen;
}

async function filesUnder(relative) {
  const directory = path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => entry.isDirectory()
    ? filesUnder(path.join(relative, entry.name))
    : [path.join(directory, entry.name)]));
  return nested.flat();
}

test("uses only the new PickPoint presentation graph", async () => {
  for (const file of legacyFiles) {
    await assert.rejects(access(path.join(root, file)));
  }
  const graph = await reachableFrom(["app/layout.tsx", "app/page.tsx", "app/book/page.tsx", "app/courts/page.tsx", "app/manage/page.tsx"]);
  assert.ok([...graph].some((file) => file.includes(`${path.sep}pickpoint-v2${path.sep}guest${path.sep}`)));
  assert.ok([...graph].some((file) => file.includes(`${path.sep}pickpoint-v2${path.sep}admin${path.sep}`)));
  for (const file of graph) assert.doesNotMatch(file, forbidden);
});

test("contains no legacy presentation fingerprint in reachable UI or built output", async () => {
  const files = [
    ...(await filesUnder("app/pickpoint-v2")),
    path.join(root, "app/page.tsx"),
    path.join(root, "app/book/page.tsx"),
    path.join(root, "app/courts/page.tsx"),
    path.join(root, "app/manage/page.tsx"),
    ...(await filesUnder("dist/client")),
  ].filter((file) => /\.(?:ts|tsx|css|js|html)$/.test(file));
  for (const file of files) assert.doesNotMatch(await readFile(file, "utf8"), forbidden, file);
});

test("renders every guest and admin route with PickPoint-only structure", async () => {
  for (const route of ["/", "/courts", "/book", "/book?mode=manage", "/manage"]) {
    const response = await render(route);
    assert.equal(response.status, 200, route);
    const html = await response.text();
    assert.match(html, /<html[^>]+lang="en-PH"/i);
    assert.match(html, /<main[^>]+id="main-content"/i);
    assert.match(html, /PickPoint/i);
    assert.doesNotMatch(html, /\/_vinext\/image\?/i, `${route} must use deployable direct image URLs`);
    assert.doesNotMatch(html, forbidden);
  }
});

test("keeps booking closed until verified tenant readiness is complete", async () => {
  const booking = await source("app/pickpoint-v2/guest/booking-view.tsx");
  const readiness = await source("app/pickpoint-v2/guest/readiness.ts");
  assert.match(readiness, /publicBookingEnabled/);
  assert.match(readiness, /blockingReasons/);
  assert.match(readiness, /courts\.length/);
  assert.match(readiness, /paymentMethods\.length/);
  assert.match(booking, /getAvailability/);
  assert.match(booking, /createBooking/);
  assert.match(booking, /clientRequestId/);
  assert.match(booking, /policyAccepted/);
});

test("supports a tenant-safe atomic multi-court booking grid", async () => {
  const [booking, client, css, migration] = await Promise.all([
    source("app/pickpoint-v2/guest/booking-view.tsx"),
    source("app/lib/platform/client.ts"),
    source("app/pickpoint-v2/guest/guest.css"),
    source("supabase/migrations/20260916010000_pickpoint_public_booking_policy.sql"),
  ]);
  assert.match(booking, /className="pp-schedule"/);
  assert.match(booking, /className="pp-date-picker"/);
  assert.match(booking, /Previous day/);
  assert.match(booking, /Next day/);
  assert.match(booking, /selectedSlotKeys/);
  assert.match(booking, /timeRangeLabel/);
  assert.match(booking, /sessions: selectedSlots\.map/);
  assert.match(booking, /atomicMultiSessionBookingV1/);
  assert.match(booking, /refund, and rescheduling policy/);
  assert.match(client, /get_pickpoint_public_booking_policy/);
  assert.match(css, /\.pp-schedule-scroll/);
  assert.match(migration, /<> 'pickpoint-pickleclub'/);
  assert.match(migration, /request_origin_matches_tenant/);
  assert.match(migration, /atomicMultiSessionBookingV1/);
});

test("shows truthful PickPoint slot states and hides elapsed times", async () => {
  const [booking, client, css, migration, pendingMigration] = await Promise.all([
    source("app/pickpoint-v2/guest/booking-view.tsx"),
    source("app/lib/platform/client.ts"),
    source("app/pickpoint-v2/guest/guest.css"),
    source("supabase/migrations/20260916030000_pickpoint_slot_states.sql"),
    source("supabase/migrations/20260916040000_pickpoint_pending_slot_state.sql"),
  ]);
  assert.match(client, /get_pickpoint_public_availability/);
  assert.match(booking, /visibleScheduleTimes/);
  assert.match(booking, /Past times are hidden/);
  for (const state of ["processing", "pending", "booked", "maintenance", "closed"]) {
    assert.match(booking, new RegExp(state));
    assert.match(css, new RegExp(`slot-${state}`));
  }
  assert.match(css, /width:\s*76px/);
  assert.match(migration, /<> 'pickpoint-pickleclub'/);
  assert.match(migration, /3a4bcfeb-e8a7-417a-8b0c-90c37c3a6175/);
  assert.match(migration, /request_origin_matches_tenant/);
  assert.match(migration, /when occupancy\.status = 'held' then 'processing'/);
  assert.match(migration, /then 'maintenance'/);
  assert.match(pendingMigration, /booking\.payment_status/);
  assert.match(pendingMigration, /then 'pending'/);
  assert.match(pendingMigration, /3a4bcfeb-e8a7-417a-8b0c-90c37c3a6175/);
});

test("protects selected courts, restores progress, and shows authoritative itemized fees", async () => {
  const [booking, client, css] = await Promise.all([
    source("app/pickpoint-v2/guest/booking-view.tsx"),
    source("app/lib/platform/client.ts"),
    source("app/pickpoint-v2/guest/guest.css"),
  ]);
  assert.match(booking, /function holdSelection/);
  assert.match(booking, /Booking details pending/);
  assert.match(booking, /__details_pending_v1__/);
  assert.match(booking, /completeBookingDetails/);
  assert.match(client, /complete_public_booking_details/);
  assert.match(booking, /confirmation\.serviceFeeAmount/);
  assert.match(booking, /confirmation\.totalAmount/);
  assert.match(booking, /className="pp-calendar"/);
  assert.match(booking, /aria-label="Choose a playing date"/);
  assert.match(booking, /pp-date-chevron/);
  assert.match(booking, /remainingHoldSeconds/);
  assert.match(booking, /HOLD_SECONDS = 10 \* 60/);
  assert.match(booking, /cancelUnpaidBooking\(confirmation\.reference/);
  assert.match(booking, /Your 10-minute booking window ended/);
  assert.match(booking, /Complete your booking within/);
  assert.match(booking, /ACTIVE_BOOKING_KEY/);
  assert.match(booking, /bookingStatus\(draft\.confirmation\.reference/);
  assert.match(booking, /Welcome back\. Your booking is still in progress/);
  assert.match(booking, /CompleteBookingSummary/);
  assert.match(booking, /defaultExpanded = false/);
  assert.match(booking, /defaultExpanded=\{false\}/);
  assert.match(booking, /Starts soon/);
  assert.match(booking, /leadLabel/);
  assert.match(booking, /Show or hide the complete booking summary/);
  assert.match(booking, /pp-summary-toggle-total/);
  assert.match(booking, /checkout=\{step === "details" \|\| step === "payment"\}/);
  assert.match(booking, /durationRangeLabel/);
  assert.match(booking, /courtGroups/);
  assert.match(booking, /hourlyRate/);
  assert.match(booking, /customerRateFor/);
  assert.match(booking, /pp-card-action pp-card-action-only/);
  assert.match(booking, /Court time/);
  assert.match(booking, /booking fee FREE/);
  assert.match(booking, /pp-free-fee/);
  assert.doesNotMatch(booking, /Already included in the court price/);
  assert.match(booking, /Total due/);
  assert.match(css, /\.pp-price-breakdown/);
  assert.match(css, /\.pp-complete-summary/);
  assert.match(css, /\.pp-summary-courts/);
  assert.match(css, /\.pp-complete-summary\[open\] \.pp-summary-toggle-action svg/);
  assert.match(css, /@keyframes pp-total-glow/);
  assert.match(css, /\.pp-free-fee/);
  assert.match(css, /\.pp-app\.pp-checkout \.pp-nav \{ display: none; \}/);
  assert.match(css, /\.pp-card-action-only/);
  assert.match(css, /\.pp-resume-notice/);
  assert.match(css, /\.pp-hold-notice/);
  assert.match(css, /\.pp-hold-timer/);
  assert.match(css, /\.pp-hold-timer \{ position: relative;/);
  assert.match(css, /\.pp-schedule-scroll \{[^}]*overflow-x: hidden;[^}]*touch-action: pan-y;/);
  assert.match(css, /\.pp-schedule td button:hover:not\(:disabled\):not\(\.is-selected\)/);
  assert.match(css, /\.pp-schedule td button \{[^}]*touch-action: manipulation;[^}]*user-select: none;/);
  assert.match(booking, /Select a payment method/);
  assert.match(booking, /name="paymentMethod"/);
  assert.match(booking, /paymentMethodCode/);
  assert.match(booking, /Automatic receipt verification/);
  assert.match(booking, /13-digit GCash transaction reference/);
  assert.match(booking, /Verify payment receipt/);
  assert.match(booking, /receiptOutcome\?\.status === "auto_approved"/);
  assert.match(css, /\.pp-payment-methods/);
  assert.match(css, /\.pp-auto-check/);
  assert.match(css, /\.pp-payment-destination > dl > div/);
  assert.match(css, /\.pp-summary-meta dd \{ min-width: 0;[^}]*overflow-wrap: anywhere;/);
  assert.doesNotMatch(css, /\.pp-summary-meta dd \{[^}]*text-overflow: ellipsis/);
  assert.match(css, /@keyframes pp-hold-intro/);
  assert.match(css, /@keyframes pp-calendar-in/);
});

test("keeps the admin lean and capability-controlled", async () => {
  const admin = await source("app/pickpoint-v2/admin/PickPointDesk.tsx");
  assert.match(admin, /\["today","schedule","bookings","courts","payments","settings"\]/);
  for (const action of ["booking:create", "booking:cancel", "payment:approve", "schedule:block", "tenant:publish"]) {
    assert.match(admin, new RegExp(action.replace(":", "\\:")));
  }
  assert.match(admin, /session\.capabilities/);
  assert.match(admin, /x\.id!=="setup-status"&&x\.id!=="public-booking"/);
  assert.match(admin, /disabled=\{!activationReady\|\|busy\("tenant:publish"\)\}/);
  assert.match(admin, /aria-busy=/);
  assert.match(admin, /Saving details…/);
  assert.match(admin, /Publishing…/);
  assert.match(admin, /Confirming…/);
  assert.match(admin, /aria-live=\{error\?"assertive":"polite"\}/);
  assert.match(admin, /Confirm payment/);
  assert.match(admin, /Reject payment/);
  assert.match(admin, /Detected reference/);
  assert.match(admin, /Verification confidence/);
  assert.doesNotMatch(admin, /<iframe src=\{review\.receipt\.signedUrl\}/);
  assert.match(admin, /Customer payment methods/);
  assert.match(admin, /Add payment method/);
  assert.match(admin, /paymentEvidence\.paymentMethod/);
  assert.match(admin, /area==="courts"/);
  assert.match(admin, /area==="payments"/);
  assert.match(admin, /area==="settings"/);
  assert.doesNotMatch(admin, /area==="setup"/);
  for (const operation of ["loadCalendarDay", "loadPaymentReceipt", "payment:reject", "booking:update", "schedule:unblock", "court:create", "court:update", "business:update", "policy:publish", "remittance:update"]) {
    assert.match(admin, new RegExp(operation.replace(":", "\\:")));
  }
  assert.match(admin, /Edit court/);
  assert.match(admin, /Save court/);
  assert.match(admin, /Cancelled \/ rejected/);
  assert.match(admin, /bookingGroup/);
  assert.match(admin, /booking:details-ui/);
  assert.match(admin, /View details/);
  assert.match(admin, /In progress/);
  assert.match(admin, /receiptDetailsScroll/);
  assert.doesNotMatch(admin, />Check in</);
  assert.match(admin, /Every booking in one place/);
  assert.match(admin, /status updates automatically/i);
  assert.match(admin, /Time & date/);
  assert.match(admin, /Reference & total/);
  assert.match(admin, /function TodayCourtList/);
  assert.match(admin, /The nearest future reservation for each court/);
  assert.match(admin, /Later reservations scheduled for today/);
  assert.doesNotMatch(admin, /area==="today"[^\n]*<BookingFilters/);
  assert.doesNotMatch(admin, /analytics|revenue chart|customer crm/i);
});

test("pins every browser request to the PickPoint tenant and shared project", async () => {
  const [registry, config, client, adapter] = await Promise.all([
    source("app/tenants/registry.ts"),
    source("app/tenants/pickpoint-pickleclub/config.ts"),
    source("app/lib/platform/client.ts"),
    source("app/manage/management-adapter.ts"),
  ]);
  assert.match(registry, /ACTIVE_TENANT_SLUG = "pickpoint-pickleclub" as const/);
  assert.match(config, /pickpoint-pickleclub\.christianjelarjoyhisola\.workers\.dev/);
  assert.match(config, /minimumLeadMinutes: 0/);
  assert.match(config, /offPeakHourlyRate: 270/);
  assert.match(config, /peakHourlyRate: 320/);
  assert.match(client, /neqvrwtofiolcuxewdze\.supabase\.co/);
  assert.match(client, /SHARED_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(client, /NEXT_PUBLIC_SUPABASE_URL\?\.trim\(\) \|\| SHARED_SUPABASE_ORIGIN/);
  assert.match(client, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY\?\.trim\(\) \|\|/);
  assert.match(client, /REGISTERED_MANAGEMENT_ORIGIN/);
  assert.doesNotMatch(client, /reference: `DINK-/);
  assert.doesNotMatch(client, /tenantId\s*:/);
  assert.doesNotMatch(client, /SUPABASE_SERVICE|service[_-]?role/i);
  assert.match(adapter, /LIVE_TENANT_SCOPE_MISMATCH/);
  assert.match(adapter, /assertPickPointContext/);
});

test("uses the supplied transparent PickPoint brand assets and palette", async () => {
  const [guestCss, adminCss, logo] = await Promise.all([
    source("app/pickpoint-v2/guest/guest.css"),
    source("app/pickpoint-v2/admin/admin.module.css"),
    readFile(path.join(root, "public/pickpoint-mark-v4.png")),
  ]);
  assert.match(guestCss, /#041630/i);
  assert.match(guestCss, /#b8f000/i);
  assert.match(adminCss, /#041630/i);
  const shell = await source("app/pickpoint-v2/guest/guest-shell.tsx");
  assert.match(shell, /pickpoint-wordmark-v3\.png/);
  assert.match(shell, /pp-brand-mark/);
  assert.match(await source("app/layout.tsx"), /pickpoint-mark-v4\.png/);
  assert.doesNotMatch(guestCss, /\.pp-hero-title > img \{ display: none/);
  assert.equal(logo.readUInt32BE(16), 1327);
  assert.equal(logo.readUInt32BE(20), 1186);
  assert.equal(logo[25], 6, "PNG must use RGBA color type");
});

test("keeps the guest booking flow phone-safe and understandable", async () => {
  const [css, shell, booking, home, courts, admin, client, courtPhotoMigration] = await Promise.all([
    source("app/pickpoint-v2/guest/guest.css"),
    source("app/pickpoint-v2/guest/guest-shell.tsx"),
    source("app/pickpoint-v2/guest/booking-view.tsx"),
    source("app/pickpoint-v2/guest/guest-home.tsx"),
    source("app/pickpoint-v2/guest/courts-view.tsx"),
    source("app/pickpoint-v2/admin/PickPointDesk.tsx"),
    source("app/lib/platform/client.ts"),
    source("supabase/migrations/20260916020000_pickpoint_court_photos.sql"),
  ]);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /\.pp-nav\s*\{[\s\S]*position:\s*fixed/);
  assert.match(css, /font-size:\s*16px/);
  assert.match(css, /overflow-x:\s*clip/);
  assert.match(shell, /aria-current=/);
  assert.match(shell, /className="pp-admin-login" href="\/manage"/);
  assert.match(booking, /<ol className="pp-steps"/);
  assert.doesNotMatch(booking, /blockingReasons\.map/);
  assert.match(home, /Get directions/);
  assert.match(home, /Online booking is opening soon/);
  assert.match(courts, /clock12/);
  assert.match(courts, /aria-expanded=/);
  assert.match(courts, /pp-court-detail/);
  assert.match(admin, /uploadTenantCourtPhoto/);
  assert.match(client, /COURT_PHOTO_SCOPE_INVALID/);
  assert.match(courtPhotoMigration, /3a4bcfeb-e8a7-417a-8b0c-90c37c3a6175/);
  assert.doesNotMatch(courtPhotoMigration, /for all/i);
});

test("keeps hardened production response headers", async () => {
  const response = await render("/", "https://pickpoint-pickleclub.christianjelarjoyhisola.workers.dev");
  assert.match(response.headers.get("content-security-policy") ?? "", /default-src 'self'/);
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-src[^;]+https:\/\/\*\.supabase\.co/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(response.headers.get("strict-transport-security") ?? "", /max-age=31536000/);
});
