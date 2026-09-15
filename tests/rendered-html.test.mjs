import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");
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

function title(html) {
  return html.match(/<title>(.*?)<\/title>/i)?.[1].replaceAll("&amp;", "&") ?? "";
}

test("renders the complete customer and owner routes", async () => {
  const paths = ["/", "/courts", "/book", "/book?mode=manage", "/manage"];
  const responses = await Promise.all(paths.map((path) => render(path)));
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html/i);
    const html = await response.text();
    assert.match(html, /<html[^>]+lang="en-PH"/i);
    assert.match(html, /<main[^>]+id="main-content"/i);
    assert.doesNotMatch(html, /Dinktopia|codex-preview|Your site is taking shape/i);
  }
});

test("uses PickPoint titles and no-index preview metadata", async () => {
  const [home, courts, book] = await Promise.all([
    render("/").then((response) => response.text()),
    render("/courts").then((response) => response.text()),
    render("/book").then((response) => response.text()),
  ]);
  assert.equal(title(home), "Home · PickPoint Pickle Club");
  assert.equal(title(courts), "Courts · PickPoint Pickle Club");
  assert.equal(title(book), "Book a Court · PickPoint Pickle Club");
  assert.match(home, /name="robots" content="noindex, nofollow"/i);
});

test("pins the browser to one tenant and one Supabase project", async () => {
  const [registry, config, client] = await Promise.all([
    source("../app/tenants/registry.ts"),
    source("../app/tenants/pickpoint-pickleclub/config.ts"),
    source("../app/lib/platform/client.ts"),
  ]);
  assert.match(registry, /ACTIVE_TENANT_SLUG = "pickpoint-pickleclub" as const/);
  assert.match(registry, /"pickpoint-pickleclub": pickPointConfig/);
  assert.match(config, /productionDomain: "pickpoint-pickleclub\.christianjelarjoyhisola\.workers\.dev"/);
  assert.match(client, /SHARED_SUPABASE_ORIGIN = "https:\/\/neqvrwtofiolcuxewdze\.supabase\.co"/);
  assert.match(client, /REGISTERED_MANAGEMENT_ORIGIN = "https:\/\/pickpoint-pickleclub\.christianjelarjoyhisola\.workers\.dev"/);
  assert.doesNotMatch(client, /service[_-]?role|SUPABASE_SERVICE/i);
});

test("keeps provisioning additive, guarded, and setup-required", async () => {
  const sql = await source("../operations/2026-09-15-provision-pickpoint.sql");
  assert.match(sql, /Target: Supabase project neqvrwtofiolcuxewdze only/);
  assert.match(sql, /public\.provision_tenant\(/);
  assert.match(sql, /public\.provision_tenant_domain\(/);
  assert.match(sql, /NON_PICKPOINT_TENANT_STATE_CHANGED/);
  assert.match(sql, /status = 'setup_required'/);
  assert.match(sql, /from public\.courts where tenant_id = v_tenant_id\) <> 0/);
  assert.doesNotMatch(sql, /update\s+public\.|delete\s+from\s+public\./i);
});

test("retains atomic booking and overlap-safe server transport", async () => {
  const client = await source("../app/lib/platform/client.ts");
  assert.match(client, /normalizeBookingSessions/);
  assert.match(client, /clientRequestId/);
  assert.match(client, /create-booking/);
  assert.match(client, /sessions: normalizedSessions/);
  assert.doesNotMatch(client, /tenantId\s*:/);
});

test("keeps the visible v1 admin navigation lean", async () => {
  const manage = await source("../app/manage/page.tsx");
  const nav = manage.slice(manage.indexOf("const NAV_ITEMS"), manage.indexOf("function NavIcon"));
  for (const label of ["Today", "Schedule", "Bookings", "Setup"]) {
    assert.match(nav, new RegExp(label.replaceAll("&", "&")));
  }
  assert.doesNotMatch(nav, /Customers|Money|Insights|Court blocks|Launch|Team & access/);
});

test("applies the premium PickPoint palette and generated logo", async () => {
  const [globalCss, publicCss, logo] = await Promise.all([
    source("../app/globals.css"),
    source("../app/pickpoint-pickleclub.css"),
    readFile(new URL("../public/pickpoint-pickleclub-logo.png", import.meta.url)),
  ]);
  assert.match(globalCss, /--ink: #041630/);
  assert.match(publicCss, /--lime: #b8f000/);
  assert.equal(logo.readUInt32BE(16), 1254);
  assert.equal(logo.readUInt32BE(20), 1254);
});

test("adds focused WebMCP tools and hardened response headers", async () => {
  const booking = await source("../app/booking-experience.tsx");
  assert.match(booking, /name: "check_pickpoint_availability"/);
  assert.match(booking, /readOnlyHint: true/);
  assert.match(booking, /name: "start_pickpoint_booking"/);
  const response = await render("/", "https://pickpoint-pickleclub.christianjelarjoyhisola.workers.dev");
  assert.match(response.headers.get("content-security-policy") ?? "", /default-src 'self'/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(response.headers.get("strict-transport-security") ?? "", /max-age=31536000/);
});
