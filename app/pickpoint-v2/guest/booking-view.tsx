"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Search, Upload } from "lucide-react";
import { bookingStatus, cancelUnpaidBooking, createBooking, getAvailability, submitPaymentReceipt } from "../../lib/platform/client";
import type { AvailabilityResponse, BookingConfirmation, PaymentMethod, PublicCourt } from "../../lib/platform/types";
import { GuestShell } from "./guest-shell";
import { isPublicBookingReady } from "./readiness";
import { useTenant } from "./use-tenant";

type Step = "select" | "details" | "payment" | "done";
type BookingViewProps = { initialMode: "book" | "manage"; initialCourtSlug?: string };

const pad = (value: number) => String(value).padStart(2, "0");
const isoDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const minutes = (time: string) => { const [hour, minute] = time.slice(0, 5).split(":").map(Number); return hour * 60 + minute; };
const timeLabel = (time: string) => new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit" }).format(new Date(`2020-01-01T${time}:00`));
const money = (amount: number, currency = "PHP") => new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);

function numberSetting(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function rateFor(court: PublicCourt, start: string): number | null {
  const regular = court.pricingConfig?.regular;
  if (!regular || typeof regular !== "object") return null;
  const bands = (regular as { bands?: unknown }).bands;
  if (!Array.isArray(bands)) return null;
  const minute = minutes(start);
  for (const raw of bands) {
    if (!raw || typeof raw !== "object") continue;
    const band = raw as { start?: unknown; end?: unknown; hourlyRate?: unknown };
    if (typeof band.start === "string" && typeof band.end === "string" && typeof band.hourlyRate === "number" && minute >= minutes(band.start) && minute < minutes(band.end)) return band.hourlyRate;
  }
  return null;
}

function estimate(court: PublicCourt | undefined, start: string, duration: number) {
  if (!court) return null;
  let total = 0;
  for (let index = 0; index < duration; index += 1) {
    const hour = `${pad(Math.floor(minutes(start) / 60) + index)}:00`;
    const rate = rateFor(court, hour);
    if (rate == null) return null;
    total += rate;
  }
  return total;
}

function storedToken(reference: string) {
  try { return window.localStorage.getItem(`pickpoint-booking:${reference.trim().toUpperCase()}`) || ""; } catch { return ""; }
}

function addDays(value: Date, days: number) {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
}

function publishedPolicy(value: Record<string, unknown> | null | undefined) {
  if (!value) return null;
  const nested = value.publishedPolicy;
  const row = nested && typeof nested === "object" && !Array.isArray(nested)
    ? nested as Record<string, unknown>
    : value;
  const content = typeof row.content === "string" ? row.content : "";
  if (!content) return null;
  return {
    title: typeof row.title === "string" ? row.title : "Booking and cancellation rules",
    content,
    version: typeof row.version === "string" ? row.version : null,
  };
}

export function BookingView({ initialMode, initialCourtSlug }: BookingViewProps) {
  const { data, error: tenantError, loading } = useTenant();
  const [mode, setMode] = useState(initialMode);
  const [step, setStep] = useState<Step>("select");
  const [date, setDate] = useState(() => isoDate(new Date()));
  const [duration, setDuration] = useState(1);
  const [courtId, setCourtId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "" });
  const [accepted, setAccepted] = useState(false);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [paymentReference, setPaymentReference] = useState("");
  const [lookupReference, setLookupReference] = useState("");
  const [lookupResult, setLookupResult] = useState<Record<string, unknown> | null>(null);
  const [bookingClock] = useState(() => Date.now());
  const bookingAttemptId = useRef<string | null>(null);

  const courts = useMemo(() => data?.courts ?? [], [data]);
  const selectedCourtId = courtId || courts.find((item) => item.slug === initialCourtSlug)?.id || courts[0]?.id || "";
  const court = courts.find((item) => item.id === selectedCourtId);
  const live = isPublicBookingReady(data);
  const minDuration = court ? numberSetting((court.pricingConfig?.regular as { minimumHours?: unknown } | undefined)?.minimumHours, 1) : 1;
  const maxDuration = court ? numberSetting((court.pricingConfig?.regular as { maximumHours?: unknown } | undefined)?.maximumHours, 3) : 3;
  const paymentMethod: PaymentMethod | undefined = data?.paymentMethods[0];
  const policy = publishedPolicy(data?.refundReschedulePolicy);
  const maximumAdvanceDays = court ? numberSetting(court.publicConfig?.maximumAdvanceDays, 30) : 30;
  const minimumLeadMinutes = court ? numberSetting(court.publicConfig?.minimumLeadMinutes, 0) : 0;
  const maximumDate = isoDate(addDays(new Date(), maximumAdvanceDays));

  useEffect(() => {
    if (!live || !date) return;
    let active = true;
    getAvailability(date).then((result) => { if (active) setAvailability(result); }).catch((reason: unknown) => { if (active) setMessage(reason instanceof Error ? reason.message : "Times are unavailable."); });
    return () => { active = false; };
  }, [date, live]);

  const slots = useMemo(() => {
    if (!court || !availability) return [];
    const availabilityCourt = availability.courts.find((item) => item.id === court.id);
    if (!availabilityCourt) return [];
    const opening = Math.ceil(minutes(court.opensAt) / 60);
    const closing = Math.floor(minutes(court.closesAt) / 60);
    const result: string[] = [];
    for (let hour = opening; hour + duration <= closing; hour += 1) {
      const slotStart = `${date}T${pad(hour)}:00:00`;
      const slotEnd = `${date}T${pad(hour + duration)}:00:00`;
      const blocked = availabilityCourt.unavailable.some((entry) => entry.startsAt < slotEnd && entry.endsAt > slotStart);
      const leadTime = new Date(slotStart).getTime() - bookingClock;
      if (!blocked && leadTime >= minimumLeadMinutes * 60_000) result.push(`${pad(hour)}:00`);
    }
    return result;
  }, [availability, bookingClock, court, date, duration, minimumLeadMinutes]);

  const estimatedTotal = estimate(court, startTime, duration);
  const resetSelection = () => { setStep("select"); setConfirmation(null); setStartTime(""); setMessage(""); };

  async function reserve(event: React.FormEvent) {
    event.preventDefault();
    if (!court || !startTime || !live || !accepted) return;
    setBusy(true); setMessage("");
    try {
      bookingAttemptId.current ||= crypto.randomUUID();
      const result = await createBooking({ courtId: court.id, bookingDate: date, startTime, durationHours: duration, customer, guestCount: 1, policyAccepted: true, policyVersion: policy?.version, clientRequestId: bookingAttemptId.current });
      setConfirmation(result);
      try { window.localStorage.setItem(`pickpoint-booking:${result.reference.toUpperCase()}`, result.bookingToken); } catch { /* Private browsing may deny storage. */ }
      setStep(paymentMethod ? "payment" : "done");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "We could not hold that time. Please choose another.");
      getAvailability(date).then(setAvailability).catch(() => undefined);
    }
    finally { setBusy(false); }
  }

  async function sendReceipt(event: React.FormEvent) {
    event.preventDefault();
    if (!confirmation || !paymentMethod || !receipt) return;
    setBusy(true); setMessage("");
    try {
      await submitPaymentReceipt({ reference: confirmation.reference, token: confirmation.bookingToken, method: paymentMethod.code || paymentMethod.methodCode || paymentMethod.displayName, paymentReference: paymentReference.trim() || undefined, file: receipt });
      setStep("done");
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "The receipt could not be submitted."); }
    finally { setBusy(false); }
  }

  async function findBooking(event: React.FormEvent) {
    event.preventDefault();
    const reference = lookupReference.trim().toUpperCase();
    const token = storedToken(reference);
    if (!token) { setMessage("This browser does not have the secure key for that reference. Contact the venue for help."); setLookupResult(null); return; }
    setBusy(true); setMessage("");
    try { setLookupResult(await bookingStatus(reference, token)); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : "That booking could not be found."); }
    finally { setBusy(false); }
  }

  async function cancelBooking() {
    const reference = lookupReference.trim().toUpperCase();
    const token = storedToken(reference);
    if (!token || !window.confirm(`Cancel unpaid booking ${reference}?`)) return;
    setBusy(true); setMessage("");
    try {
      await cancelUnpaidBooking(reference, token);
      setLookupResult(await bookingStatus(reference, token));
      setMessage("The unpaid booking was cancelled.");
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "The booking could not be cancelled."); }
    finally { setBusy(false); }
  }

  if (mode === "manage") return (
    <GuestShell current="manage">
      <section className="pp-book-head"><p className="pp-kicker">My booking</p><h1>Find your reservation.</h1><p>For privacy, bookings can be opened only on the browser used to make them.</p></section>
      <section className="pp-lookup">
        <form onSubmit={findBooking}>
          <label htmlFor="booking-reference">Booking reference</label>
          <div><input id="booking-reference" value={lookupReference} onChange={(event) => setLookupReference(event.target.value)} placeholder="e.g. PP-123456" autoCapitalize="characters" required /><button className="pp-button pp-button-blue" disabled={busy}><Search /> {busy ? "Checking…" : "Find booking"}</button></div>
        </form>
        {message && <p className="pp-form-message" role="alert">{message}</p>}
        {lookupResult && <div className="pp-found"><Check /><div><span>Booking found</span><strong>{lookupReference.toUpperCase()}</strong><p>Status: {String((lookupResult.booking as Record<string, unknown> | undefined)?.status ?? "Available")}</p>{(lookupResult.booking as Record<string, unknown> | undefined)?.paymentStatus === "unpaid" && !["cancelled", "expired"].includes(String((lookupResult.booking as Record<string, unknown> | undefined)?.status)) && <button className="pp-text-button" disabled={busy} onClick={cancelBooking}>Cancel unpaid booking</button>}</div></div>}
        <button className="pp-text-button" onClick={() => { setMode("book"); setMessage(""); }}>Make a new booking instead <ArrowRight /></button>
      </section>
    </GuestShell>
  );

  return (
    <GuestShell current="book">
      <section className="pp-book-head"><p className="pp-kicker">Book a court</p><h1>{step === "select" ? "When do you want to play?" : step === "details" ? "Who is the booking for?" : step === "payment" ? "Complete your payment." : "Your booking is recorded."}</h1><p>One court. One continuous time. No account required.</p></section>
      <div className="pp-book-layout">
        <ol className="pp-steps" aria-label="Booking progress">{["Time", "Details", "Payment", "Done"].map((label, index) => { const activeIndex = ["select", "details", "payment", "done"].indexOf(step); return <li key={label} aria-current={index === activeIndex ? "step" : undefined} className={index <= activeIndex ? "is-active" : ""}><i>{index < activeIndex ? <Check aria-hidden="true" /> : index + 1}</i><b>{label}</b></li>; })}</ol>

        {(loading || tenantError) && <div className="pp-state">{loading ? "Checking venue setup…" : tenantError}</div>}
        {data && !live && <div className="pp-setup"><span>Reservations are not open yet</span><h2>PickPoint is completing its court setup.</h2><p>Online booking will open after the venue confirms its courts, prices, payment details, and booking rules.</p><Link className="pp-button pp-button-outline" href="/">Return home</Link></div>}

        {data && live && step === "select" && (
          <section className="pp-book-card">
            <div className="pp-fields-row"><label>Date<input type="date" value={date} min={isoDate(new Date())} max={maximumDate} onChange={(event) => { setAvailability(null); setMessage(""); setDate(event.target.value); setStartTime(""); bookingAttemptId.current = null; }} /></label><label>Duration<select value={duration} onChange={(event) => { setDuration(Number(event.target.value)); setStartTime(""); bookingAttemptId.current = null; }}>{Array.from({ length: maxDuration - minDuration + 1 }, (_, index) => minDuration + index).map((value) => <option key={value} value={value}>{value} hour{value === 1 ? "" : "s"}</option>)}</select></label></div>
            <fieldset className="pp-court-choice"><legend>Choose a court</legend>{courts.map((item) => <button type="button" key={item.id} aria-pressed={item.id === selectedCourtId} className={item.id === selectedCourtId ? "is-selected" : ""} onClick={() => { setCourtId(item.id); setStartTime(""); bookingAttemptId.current = null; }}><span>{item.name}</span><small>{item.opensAt}–{item.closesAt}</small></button>)}</fieldset>
            <fieldset className="pp-time-choice"><legend>Available start times</legend>{availability ? slots.length ? <div>{slots.map((slot) => <button type="button" key={slot} aria-pressed={slot === startTime} className={slot === startTime ? "is-selected" : ""} onClick={() => { setStartTime(slot); bookingAttemptId.current = null; }}>{timeLabel(slot)}</button>)}</div> : <p>No continuous {duration}-hour times are available for this court.</p> : <p>Checking available times…</p>}</fieldset>
            {message && <p className="pp-form-message" role="alert">{message}</p>}
            <div className="pp-card-action"><span>{startTime ? <><small>Estimated court total</small><strong>{estimatedTotal == null ? "Confirmed next" : money(estimatedTotal, court?.currency)}</strong></> : "Choose a start time to continue"}</span><button className="pp-button pp-button-blue" disabled={!startTime} onClick={() => setStep("details")}>Continue <ArrowRight /></button></div>
          </section>
        )}

        {step === "details" && court && (
          <form className="pp-book-card pp-details" onSubmit={reserve}>
            <button type="button" className="pp-back" onClick={() => setStep("select")}><ArrowLeft /> Change time</button>
            <div className="pp-fields-row"><label>Full name<input value={customer.name} onChange={(event) => setCustomer({ ...customer, name: event.target.value })} autoComplete="name" required /></label><label>Mobile number<input value={customer.phone} onChange={(event) => setCustomer({ ...customer, phone: event.target.value })} autoComplete="tel" inputMode="tel" required /></label></div>
            <label>Email address<input type="email" value={customer.email} onChange={(event) => setCustomer({ ...customer, email: event.target.value })} autoComplete="email" required /></label>
            {policy && <details className="pp-policy"><summary>{policy.title}</summary><p>{policy.content}</p></details>}
            <label className="pp-check"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} required /><span><strong>I agree to the booking and cancellation rules shown above.</strong><small>Your court is held only after the server accepts this request.</small></span></label>
            {message && <p className="pp-form-message" role="alert">{message}</p>}
            <div className="pp-card-action"><span><small>{court.name}</small><strong>{date} · {timeLabel(startTime)} · {duration}h</strong></span><button className="pp-button pp-button-blue" disabled={busy || !accepted}>{busy ? "Holding your court…" : "Reserve this time"} <ArrowRight /></button></div>
          </form>
        )}

        {step === "payment" && confirmation && paymentMethod && (
          <form className="pp-book-card pp-payment" onSubmit={sendReceipt}>
            <div className="pp-payment-title"><span>{paymentMethod.displayName}</span><strong>{money(confirmation.totalAmount, confirmation.currency)}</strong><p>Send the exact total to the venue account below, then upload the receipt.</p></div>
            <dl><div><dt>Account name</dt><dd>{paymentMethod.accountName || "Provided by the venue"}</dd></div><div><dt>Account number</dt><dd>{paymentMethod.accountNumber || paymentMethod.accountReference || "See venue instructions"}</dd></div></dl>
            {paymentMethod.instructions && <p className="pp-instructions">{paymentMethod.instructions}</p>}
            <label>Payment reference (optional)<input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} /></label>
            <label className="pp-upload"><Upload /><span><strong>{receipt?.name || "Choose payment receipt"}</strong><small>PNG, JPG or WebP · maximum 2 MB</small></span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setReceipt(event.target.files?.[0] || null)} required /></label>
            {message && <p className="pp-form-message" role="alert">{message}</p>}
            <button className="pp-button pp-button-blue pp-full" disabled={busy || !receipt}>{busy ? "Submitting…" : "Submit receipt for review"} <ArrowRight /></button>
          </form>
        )}

        {step === "done" && confirmation && (
          <section className="pp-book-card pp-confirmed"><div className="pp-checkmark"><Check /></div><p className="pp-kicker">Booking received</p><h2>{confirmation.reference}</h2><p>{paymentMethod ? "Your receipt was submitted for venue review. Keep this reference until payment is confirmed." : "Keep this reference. The venue will confirm the next step."}</p><dl><div><dt>Court</dt><dd>{confirmation.courtName}</dd></div><div><dt>Total</dt><dd>{money(confirmation.totalAmount, confirmation.currency)}</dd></div><div><dt>Status</dt><dd>{confirmation.status.replaceAll("_", " ")}</dd></div></dl><div className="pp-actions"><button className="pp-button pp-button-outline" onClick={resetSelection}>Book another time</button><Link className="pp-button pp-button-blue" href="/book?mode=manage">View this booking</Link></div></section>
        )}
      </div>
    </GuestShell>
  );
}
