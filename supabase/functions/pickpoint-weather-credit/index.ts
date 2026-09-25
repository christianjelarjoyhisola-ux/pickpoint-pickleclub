import { sendMailerooEmail } from '../_shared/maileroo.ts';

const origins = new Set(['https://pickpointpickle.com', 'https://pickpoint-pickleclub.christianjelarjoyhisola.workers.dev']);
const hostname = 'pickpoint-pickleclub.christianjelarjoyhisola.workers.dev';
const tenantId = '3a4bcfeb-e8a7-417a-8b0c-90c37c3a6175';
const env = (name: string) => { const value = Deno.env.get(name); if (!value) throw new Error('Email service is unavailable.'); return value; };
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

type MailCredit = { id:string; code:string; amount:number; balance:number; email:string; emailSent:boolean; reference?:string; reason?:string; coversBookingFee?:boolean; slots?:Array<{court:string;startsAt:string;endsAt:string;amount:number}> };
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
    const rpc = async (name: string, args: Record<string, unknown>) => {
      const response = await fetch(`${base}/rest/v1/rpc/${name}`, { method: 'POST', headers: publicHeaders, body: JSON.stringify({ p_hostname: hostname, ...args }) });
      const result = await response.json();
      if (!response.ok) throw Object.assign(new Error(result.message || 'Weather credit request failed.'), {status: response.status===401||response.status===403?403:400});
      return result;
    };
    const sendCredit = async (credit: MailCredit, recipient: string) => {
      if (credit.emailSent) return credit;
      try {
        const creditId = encodeURIComponent(credit.id);
        const claim = await fetch(`${base}/rest/v1/pickpoint_weather_credits?id=eq.${creditId}&tenant_id=eq.${tenantId}&email_sent_at=is.null&or=(email_attempt_at.is.null,email_attempt_at.lt.${encodeURIComponent(new Date(Date.now()-60000).toISOString())})`, { method:'PATCH',headers:serviceHeaders(),body:JSON.stringify({email_attempt_at:new Date().toISOString()}) });
        if (!claim.ok || !(await claim.json()).length) return {...credit,emailPending:true};
        const tenant = await fetch(`${base}/rest/v1/tenants?id=eq.${tenantId}&select=reply_to_email,contact_email`,{headers:serviceHeaders()});
        if (!tenant.ok) throw new Error('Email settings unavailable.');
        const [settings] = await tenant.json();
        const money = (n: number) => new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(n);
        const date = (v: string) => new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}).format(new Date(v));
        const slots = (credit.slots || []).map((slot) => `${slot.court}: ${date(slot.startsAt)} – ${date(slot.endsAt)} (PHT), ${money(slot.amount)}`);
        const coverage = credit.coversBookingFee ? 'Your credit includes the booking fee and can cover the total price of your next booking.' : 'This legacy credit covers court charges; any separate booking fee remains payable.';
        const plain = `Weather credit confirmed for ${credit.reference || 'your booking'}. Reason: ${String(credit.reason || 'rain').replaceAll('_',' ')}.\n${slots.join('\n')}\nCredit issued: ${money(credit.amount)}. Available balance: ${money(credit.balance)}. Code: ${credit.code}.\n${coverage} Book at https://pickpointpickle.com/book using this email and enter the code before payment. Unused credit stays on your code. Keep it private.`;
        await sendMailerooEmail({apiKey:env('MAILEROO_API_KEY'),fromAddress:env('MAILEROO_FROM_EMAIL'),fromName:'PickPoint Pickle Club',replyTo:settings.reply_to_email||settings.contact_email,to:recipient,subject:'Your PickPoint weather credit is confirmed',
          referenceId:credit.id.replaceAll('-','').slice(0,24),
          plainText:plain,html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;color:#102a43"><h1>Your rain check is ready</h1><p>Booking ${escape(credit.reference || '')} · ${escape(String(credit.reason || 'rain').replaceAll('_',' '))}</p><ul>${slots.map((line: string)=>'<li>'+escape(line)+'</li>').join('')}</ul><h2>${escape(money(credit.amount))} weather credit</h2><p>Available balance: ${escape(money(credit.balance))}</p><p style="font-family:monospace;font-size:18px">${escape(credit.code)}</p><p>${escape(coverage)}</p><p>Use this email and enter your code before payment. Any unused balance stays on your code.</p><a href="https://pickpointpickle.com/book">Book your next game</a><p>Keep your voucher code private.</p></div>`});
        const saved=await fetch(`${base}/rest/v1/pickpoint_weather_credits?id=eq.${creditId}&tenant_id=eq.${tenantId}`,{method:'PATCH',headers:serviceHeaders(),body:JSON.stringify({email_sent_at:new Date().toISOString()})});
        if(!saved.ok)throw new Error('Email status could not be saved.');
        return {...credit,emailSent:true};
      } catch {return {...credit,emailPending:true};}
    };
    try {
      if(body.action==='slots') return reply(await rpc('get_pickpoint_weather_slots',{p_date:body.date}));
      if(body.action==='issue_slots') {
        const result=await rpc('issue_pickpoint_weather_slots',{p_date:body.date,p_selection:body.selection,p_request_id:body.requestId,p_reason:body.reason});
        // Bounded email concurrency; the credits were already committed atomically.
        for(let i=0;i<result.credits.length;i+=4) {
          const group=await Promise.all(result.credits.slice(i,i+4).map((c: MailCredit)=>sendCredit(c,c.email)));
          result.credits.splice(i,group.length,...group);
        }
        return reply(result);
      }
      if(body.action==='email_credit') {
        const credit=await rpc('get_pickpoint_weather_credit_email',{p_credit_id:body.creditId});
        return reply({credit:await sendCredit(credit,credit.email)});
      }
      if(!['get','issue','email'].includes(body.action))return reply({message:'Unknown credit action.'},400);
      const result=await rpc('manage_pickpoint_weather_credit',{p_booking_id:body.bookingId,p_amount:body.action==='issue'?body.amount:null,p_reason:body.reason||'rain'});
      if(body.action==='get'||!result.credit)return reply(result);
      result.credit=await sendCredit(result.credit,result.email);
      if(result.credit.emailPending)result.emailPending=true;
      return reply(result);
    } catch(error) { return reply({message:error instanceof Error?error.message:'Weather credit request failed.'},error instanceof Error && 'status' in error ? Number(error.status) : 400); }
  } catch { return reply({ message: 'Weather credits are temporarily unavailable. Please try again.' }, 503); }
});
