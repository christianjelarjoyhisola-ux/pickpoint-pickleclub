import { sendMailerooEmail } from '../_shared/maileroo.ts';

const origins = new Set(['https://pickpointpickle.com', 'https://pickpoint-pickleclub.christianjelarjoyhisola.workers.dev']);
const hostname = 'pickpoint-pickleclub.christianjelarjoyhisola.workers.dev';
const tenantId = '3a4bcfeb-e8a7-417a-8b0c-90c37c3a6175';
const env = (name: string) => { const value = Deno.env.get(name); if (!value) throw new Error('Email service is unavailable.'); return value; };
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

Deno.serve(async request => {
  const origin = request.headers.get('origin') || '';
  const headers = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-tenant-slug', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin', 'Cache-Control': 'no-store' };
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (!origins.has(origin)) return reply({ message: 'Origin denied.' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return reply({ message: 'Method not allowed.' }, 405);
  try {
    const body = await request.json();
    if (body.tenantSlug !== 'pickpoint-pickleclub') return reply({ message: 'Tenant denied.' }, 403);
    const base = env('SUPABASE_URL');
    const publicHeaders = { apikey: env('SUPABASE_ANON_KEY'), Authorization: request.headers.get('authorization') || '', 'Content-Type': 'application/json', Origin: origin };
    const serviceHeaders = () => ({ apikey: env('SUPABASE_SERVICE_ROLE_KEY'), Authorization: `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json', Prefer: 'return=representation' });
    // The database validates the owner JWT or the guest booking token before any email is sent.
    if (body.action === 'apply') {
      const response = await fetch(`${base}/rest/v1/rpc/apply_pickpoint_weather_credit`, { method: 'POST', headers: publicHeaders, body: JSON.stringify({ p_hostname: hostname, p_reference: body.reference, p_token: body.token, p_code: body.code, p_email: body.email }) });
      const result = await response.json();
      if (!response.ok) return reply({ message: result.message || 'Credit could not be applied.' }, 400);
      if (result.status === 'confirmed') {
        // Reuse the platform's idempotent confirmation-email delivery.
        try {
          const email = await fetch(`${base}/functions/v1/send-booking-email`, { method: 'POST', headers: { ...serviceHeaders(), 'x-internal-secret': env('EDGE_INTERNAL_SECRET') }, body: JSON.stringify({ tenantSlug: 'pickpoint-pickleclub', bookingReference: body.reference, emailKind: 'booking_confirmed' }) });
          result.emailSent = email.ok;
        } catch { result.emailSent = false; }
      }
      return reply(result);
    }
    if (!['get', 'issue', 'email'].includes(body.action)) return reply({ message: 'Unknown credit action.' }, 400);
    const response = await fetch(`${base}/rest/v1/rpc/manage_pickpoint_weather_credit`, { method: 'POST', headers: publicHeaders, body: JSON.stringify({ p_hostname: hostname, p_booking_id: body.bookingId, p_amount: body.action === 'issue' ? body.amount : null, p_reason: body.reason || 'rain' }) });
    const result = await response.json();
    if (!response.ok) return reply({ message: result.message || 'Credit could not be loaded.' }, response.status === 401 || response.status === 403 ? 403 : 400);
    if (body.action === 'get' || !result.credit || result.credit.emailSent) return reply(result);
    // An atomic claim prevents double-clicks from sending duplicate emails.
    try {
      const creditId = encodeURIComponent(result.credit.id);
      const claim = await fetch(`${base}/rest/v1/pickpoint_weather_credits?id=eq.${creditId}&tenant_id=eq.${tenantId}&email_sent_at=is.null&or=(email_attempt_at.is.null,email_attempt_at.lt.${encodeURIComponent(new Date(Date.now() - 60000).toISOString())})`, { method: 'PATCH', headers: serviceHeaders(), body: JSON.stringify({ email_attempt_at: new Date().toISOString() }) });
      if (!claim.ok) throw new Error('Email claim failed.');
      const claimed = await claim.json();
      if (!claimed.length) return reply({ ...result, emailPending: true });
      const tenant = await fetch(`${base}/rest/v1/tenants?id=eq.${tenantId}&select=reply_to_email,contact_email`, { headers: serviceHeaders() });
      if (!tenant.ok) throw new Error('Email settings unavailable.');
      const [settings] = await tenant.json();
      const amount = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(result.credit.amount);
      const balance = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(result.credit.balance);
      const code = result.credit.code;
      await sendMailerooEmail({ apiKey: env('MAILEROO_API_KEY'), fromAddress: env('MAILEROO_FROM_EMAIL'), fromName: 'PickPoint Pickle Club', replyTo: settings.reply_to_email || settings.contact_email,
        to: result.email, subject: 'Your PickPoint weather credit is ready',
        plainText: `Your next game is on the horizon. We have issued ${amount} in weather credit. Available balance: ${balance}. Code: ${code}. Book at https://pickpointpickle.com/book using this email and enter your code before payment. Credit covers court charges; any separate booking fee remains payable. Unused credit stays on this code. No account needed. Keep your code private.`,
        html: `<div style="background:#f3f5f0;padding:32px 16px;font-family:Arial,sans-serif;color:#183b2d"><div style="max-width:520px;margin:auto;background:white;border-radius:20px;padding:36px"><p style="font-size:12px;letter-spacing:2px">PICKPOINT PICKLE CLUB</p><h1 style="font-size:30px">A little rain.<br>Another day to play.</h1><p>Your weather credit is ready for your next visit.</p><div style="background:#edf4e8;border-radius:14px;padding:24px;margin:24px 0"><strong style="font-size:36px">${escape(amount)}</strong><p>Available: ${escape(balance)}</p><p style="font-family:monospace;font-size:16px;word-break:break-all">${escape(code)}</p></div><p>Book with this email and enter your code before payment. Any unused balance stays on your code.</p><a href="https://pickpointpickle.com/book" style="display:inline-block;background:#183b2d;color:white;padding:14px 22px;border-radius:9px;text-decoration:none">Choose your next game</a><p style="font-size:12px;color:#657268;margin-top:24px">No account needed. Keep this code private. Credit covers court charges; any separate booking fee remains payable.</p></div></div>` });
      const saved = await fetch(`${base}/rest/v1/pickpoint_weather_credits?id=eq.${creditId}&tenant_id=eq.${tenantId}`, { method: 'PATCH', headers: serviceHeaders(), body: JSON.stringify({ email_sent_at: new Date().toISOString() }) });
      if (!saved.ok) throw new Error('Email status could not be saved.');
      result.credit.emailSent = true;
    } catch { result.emailPending = true; }
    // Issuance remains successful if email fails; the owner can copy the code or retry.
    return reply(result);
  } catch { return reply({ message: 'Weather credits are temporarily unavailable. Please try again.' }, 503); }
});
