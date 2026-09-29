import fs from 'node:fs/promises';
// Input is the exact deployed create-booking source extracted from a saved ESZIP backup.
const root=process.argv[2]||'tmp/live-booking-source';
function replaceOnce(source,old,next){if(!source.includes(old))throw new Error('Deployed source differs: '+old);return source.replace(old,next);}
let source=await fs.readFile(root+'/source/index.ts','utf8');
source=replaceOnce(source,'rawSessions.length > 18','(body.tenantSlug !== "pickpoint-pickleclub" && rawSessions.length > 18)');
source=replaceOnce(source,'if (totalCourtHours > 18)', 'if (bookings[0].tenantSlug !== "pickpoint-pickleclub" && totalCourtHours > 18)');
await fs.writeFile(root+'/source/index.ts',source);
let booking=await fs.readFile(root+'/_shared/booking.ts','utf8');booking=replaceOnce(booking,'integerBetween(body.durationHours, "Duration", 1, 18)','integerBetween(body.durationHours, "Duration", 1, tenantSlug === "pickpoint-pickleclub" ? 24 : 18)');
await fs.writeFile(root+'/_shared/booking.ts',booking);
console.log('Applied PickPoint-only duration changes; other venues retain their rules.');
