"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CloudRain, RefreshCw } from "lucide-react";
import { weatherSlotRequest, type WeatherSlotData, type SlotWeatherCredit } from "../../lib/platform/client";
import s from "./admin.module.css";

const money = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
const clock = (value: string) => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" }).format(new Date(value));
const dateTime = (value: string) => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const errorText = (error: unknown) => error instanceof Error ? error.message : "Weather credits could not be loaded.";

export function WeatherSlots() {
  const [date, setDate] = useState(today), [court, setCourt] = useState("");
  const [data, setData] = useState<WeatherSlotData>({ slots: [], history: [] });
  const [selected, setSelected] = useState<string[]>([]), [reason, setReason] = useState("rain");
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [review, setReview] = useState(false);
  const request = useRef<{ signature: string; id: string } | null>(null), generation = useRef(0);
  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true); setError("");
    try {
      const result = await weatherSlotRequest<WeatherSlotData>({ action: "slots", date });
      if (generation.current === current) setData(result);
    } catch (e) { if (generation.current === current) { setData({ slots: [], history: [] }); setError(errorText(e)); } }
    finally { if (generation.current === current) setLoading(false); }
  }, [date]);
  useEffect(() => {
    let active = true; const guard = generation;
    void Promise.resolve().then(() => { if (active) void load(); });
    return () => { active = false; guard.current++; };
  }, [load]);
  const slots = data.slots.filter(slot => !court || slot.court_id === court);
  const chosen = data.slots.filter(slot => selected.includes(slot.slot_id));
  const total = chosen.reduce((sum, slot) => sum + Number(slot.amount), 0);
  const groups = [...new Set(chosen.map(slot => slot.booking_id))].map(id => {
    const group = chosen.filter(slot => slot.booking_id === id);
    return { ...group[0], slots: group, total: group.reduce((sum, slot) => sum + Number(slot.amount), 0) };
  });
  async function issue() {
    if (busy || !chosen.length) return;
    setBusy(true); setError(""); setNotice("");
    const selection = chosen.map(slot => ({ slotId: slot.slot_id, quoteToken: slot.quote_token })).sort((a, b) => a.slotId.localeCompare(b.slotId));
    const signature = JSON.stringify({ selection, reason, date });
    if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
    try {
      const result = await weatherSlotRequest<{ credits: SlotWeatherCredit[] }>({ action: "issue_slots", date, selection, requestId: request.current.id, reason });
      const pending = result.credits.filter(credit => !credit.emailSent).length;
      setNotice(`${result.credits.length} voucher(s) issued. ${pending ? `${pending} email(s) pending; retry below.` : "Confirmation emails sent."}`);
      setSelected([]); setReview(false); request.current = null;
      await load();
    } catch (e) { setError(`${errorText(e)} If the connection failed, retry the same selection; it will not issue credit twice.`); }
    finally { setBusy(false); }
  }
  async function retryEmail(id: string) {
    setBusy(true); setError("");
    try {
      const result = await weatherSlotRequest<{ credit: SlotWeatherCredit }>({ action: "email_credit", creditId: id });
      setData(current => ({ ...current, history: current.history.map(credit => credit.id === id ? result.credit : credit) }));
      setNotice(result.credit.emailSent ? "Confirmation email sent." : "Credit is saved. Email is still pending; wait one minute before retrying.");
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }
  return <section className={s.weatherWorkspace} aria-label="Weather credits">
    <header><p className={s.weatherEyebrow}><CloudRain /> RAIN CHECKS</p><h1>Weather credits</h1><p>Select completely unused hours affected by rain. Credit includes the booking fee at the original paid rate.</p></header>
    <div className={s.weatherToolbar}>
      <label>Affected date<input type="date" value={date} disabled={busy} onChange={e => { if (e.target.value) { setDate(e.target.value); setSelected([]); setReview(false); setCourt(""); setNotice(""); setLoading(true); } }} /></label>
      <label>Court<select value={court} disabled={busy || loading} onChange={e => { setCourt(e.target.value); setSelected([]); setReview(false); }}><option value="">All courts</option>{[...new Map(data.slots.map(slot => [slot.court_id, slot.court_name])).entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label>Reason<select value={reason} disabled={busy} onChange={e => { setReason(e.target.value); setReview(false); }}><option value="rain">Rain</option><option value="wet_court">Wet court</option><option value="unsafe_weather">Unsafe weather</option></select></label>
      <button type="button" disabled={busy || loading} onClick={() => { setSelected([]); setReview(false); void load(); }}><RefreshCw /> Refresh</button>
    </div>
    {error && <p className={s.weatherError} role="alert">{error}</p>}
    {notice && <p className={s.weatherNotice} role="status">{notice}</p>}
    <section className={s.weatherPanel}><h2>Affected booked slots</h2><p>Only paid bookings with a customer email can receive credit. Unaffected hours stay unchanged. Use Court closures separately when a court must close.</p>
      {loading ? <p role="status">Loading booked slots…</p> : !slots.length ? <p>No booked slots on this date.</p> : <div className={s.weatherSlotGrid}>{slots.map(slot => <label key={slot.slot_id} className={`${s.weatherSlot} ${selected.includes(slot.slot_id) ? s.weatherSlotSelected : ""}`}>
        <input type="checkbox" disabled={busy || !slot.eligible} checked={selected.includes(slot.slot_id)} onChange={e => { setSelected(current => e.target.checked ? [...current, slot.slot_id] : current.filter(id => id !== slot.slot_id)); setReview(false); }} />
        <span><strong>{slot.court_name} · {clock(slot.starts_at)}–{clock(slot.ends_at)}</strong><span>{slot.customer} · {slot.reference}</span><small>{slot.eligible ? slot.email : slot.unavailable_reason}</small><b>{slot.amount == null ? "Price needs review" : `${money(Number(slot.amount))} including booking fee`}</b></span>
      </label>)}</div>}
      <div className={s.weatherSelection}><span>{chosen.length} slot(s) · {groups.length} booking(s) · <strong>{money(total)}</strong></span><button className={s.primary} disabled={busy || loading || !chosen.length || chosen.length > 100} onClick={() => setReview(true)}>Review credits</button></div>
    </section>
    {review && <section className={s.weatherPanel} aria-label="Review weather credits"><h2>Review before issuing</h2>{groups.map(group => <div className={s.weatherReview} key={group.booking_id}><div><strong>{group.customer} · {group.reference}</strong><p>Email to {group.email}</p>{group.slots.map(slot => <p key={slot.slot_id}>{slot.court_name} · {clock(slot.starts_at)}–{clock(slot.ends_at)} · {money(Number(slot.amount))}</p>)}</div><strong>{money(group.total)}</strong></div>)}<p>Issue {money(total)} in reusable credit. Each booking receives its own voucher and email. Selected slots cannot be credited again.</p><button className={s.primary} disabled={busy} onClick={() => void issue()}>{busy ? "Issuing credits & sending emails…" : "Issue credits & email"}</button></section>}
    <section className={s.weatherPanel}><h2>Credit history for this date</h2><p>Original booking and payment records are retained. Credits remain available until used.</p>{data.history.length ? data.history.map(credit => <article className={s.weatherHistory} key={credit.id}>
      <div><h3>{credit.customer} · {credit.reference}</h3><p>{dateTime(credit.issuedAt)} · {credit.reason.replaceAll("_", " ")}</p><p>{credit.slots.map(slot => `${slot.court} ${clock(slot.startsAt)}–${clock(slot.endsAt)}`).join("; ") || "Legacy booking credit"}</p><code>{credit.code}</code><p>{credit.emailSent ? "Email sent" : "Email pending"} · {credit.email}</p></div>
      <div><strong>{money(Number(credit.amount))} issued</strong><p>{money(Number(credit.balance))} available</p>{!credit.emailSent && <button disabled={busy} onClick={() => void retryEmail(credit.id)}>Retry email</button>}</div>
    </article>) : <p>No weather credits issued for this date.</p>}</section>
  </section>;
}
