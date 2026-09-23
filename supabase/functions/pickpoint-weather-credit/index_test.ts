import { assertEquals } from 'jsr:@std/assert@1';

let handler: (request: Request) => Promise<Response>;
const originalServe = Deno.serve;
// Capture the entry point without opening a port or contacting any service.
Deno.serve = ((callback: typeof handler) => { handler = callback; return {}; }) as typeof Deno.serve;
await import('./index.ts');
Deno.serve = originalServe;
for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'EDGE_INTERNAL_SECRET', 'MAILEROO_API_KEY', 'MAILEROO_FROM_EMAIL']) {
  Deno.env.set(name, name === 'SUPABASE_URL' ? 'https://test.invalid' : name === 'MAILEROO_FROM_EMAIL' ? 'sender@example.com' : 'test-only');
}
const request = (body: Record<string, unknown>, origin = 'https://pickpointpickle.com') => new Request('https://test.invalid/weather', {
  method: 'POST', headers: { origin, authorization: 'Bearer test-only', 'content-type': 'application/json' },
  body: JSON.stringify({ tenantSlug: 'pickpoint-pickleclub', ...body }),
});
const credit = { eligible: true, email: 'player@example.com', maximumAmount: 500, credit: { id: '00000000-0000-4000-8000-000000000001', code: 'RAIN-TEST', amount: 500, balance: 500, emailSent: false } };

Deno.test('rejects unregistered origins before any API call', async () => {
  const response = await handler(request({ action: 'issue' }, 'https://evil.example'));
  assertEquals(response.status, 403);
});
Deno.test('owner authorization failure never reaches email or service-role queries', async () => {
  const original = globalThis.fetch;
  let count = 0;
  globalThis.fetch = (() => { count++; return Promise.resolve(Response.json({ message: 'Weather credits require owner access.' }, { status: 403 })); }) as typeof fetch;
  try { assertEquals((await handler(request({ action: 'issue', bookingId: 'test', amount: 500 }))).status, 403); assertEquals(count, 1); }
  finally { globalThis.fetch = original; }
});
Deno.test('email failure returns the issued voucher and permits an owner retry', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = ((url: string | URL | Request) => {
    const target = String(url);
    if (target.includes('/rpc/')) return Promise.resolve(Response.json(credit));
    if (target.includes('/pickpoint_weather_credits')) return Promise.resolve(Response.json([credit.credit]));
    if (target.includes('/tenants')) return Promise.resolve(Response.json([{ reply_to_email: 'venue@example.com' }]));
    if (target.startsWith('https://smtp.maileroo.com/')) return Promise.resolve(Response.json({ success: false }, { status: 503 }));
    throw new Error('Unexpected request');
  }) as typeof fetch;
  try { const result = await (await handler(request({ action: 'issue', bookingId: 'test', amount: 500 }))).json(); assertEquals(result.credit, credit.credit); assertEquals(result.emailPending, true); }
  finally { globalThis.fetch = original; }
});
Deno.test('fully credited booking remains confirmed when confirmation email fails', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = ((url: string | URL | Request) => Promise.resolve(String(url).includes('/rpc/')
    ? Response.json({ status: 'confirmed', totalAmount: 0, appliedAmount: 500, remainingBalance: 0 })
    : Response.json({ message: 'Email unavailable' }, { status: 503 }))) as typeof fetch;
  try { const result = await (await handler(request({ action: 'apply', reference: 'TEST', code: 'RAIN-TEST', email: 'player@example.com', token: 'test' }))).json(); assertEquals(result.status, 'confirmed'); assertEquals(result.totalAmount, 0); assertEquals(result.emailSent, false); }
  finally { globalThis.fetch = original; }
});
