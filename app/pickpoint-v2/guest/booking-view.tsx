"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, Copy, Search, Upload } from "lucide-react";
import { bookingStatus, cancelUnpaidBooking, completeBookingDetails, createBooking, getAvailability, submitPaymentReceipt } from "../../lib/platform/client";
import type { PaymentReceiptSubmission } from "../../lib/platform/client";
import type { AvailabilityResponse, BookingConfirmation, PaymentMethod, PublicCourt } from "../../lib/platform/types";
import { GuestShell } from "./guest-shell";
import { isPublicBookingReady } from "./readiness";
import { useTenant } from "./use-tenant";

type Step = "select" | "details" | "method" | "payment" | "done";
type BookingViewProps = { initialMode: "book" | "manage"; initialCourtSlug?: string };
type SlotState = "available" | "processing" | "pending" | "booked" | "maintenance" | "closed" | "lead-time" | "not-offered" | "checking";
const HOLD_SECONDS = 10 * 60;
const ACTIVE_BOOKING_KEY = "pickpoint-active-booking-v2";

type BookingResumeDraft = {
  version: 2;
  savedAt: number;
  step: Exclude<Step, "done">;
  date: string;
  selectedSlotKeys: string[];
  confirmation: BookingConfirmation | null;
  customer: { name: string; email: string; phone: string };
  paymentPolicyAccepted: boolean;
  paymentMethodCode: string;
  paymentReference: string;
  holdEndsAt: number | null;
};

const slotStateLabel: Record<SlotState, string> = {
  available: "Available",
  processing: "Processing",
  pending: "Pending",
  booked: "Booked",
  maintenance: "Maintenance",
  closed: "Closed",
  "lead-time": "Starts soon",
  "not-offered": "Not offered",
  checking: "Checking",
};

const pad = (value: number) => String(value).padStart(2, "0");
const isoDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const minutes = (time: string) => { const [hour, minute] = time.slice(0, 5).split(":").map(Number); return hour * 60 + minute; };
const timeLabel = (time: string) => new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit" }).format(new Date(`2020-01-01T${time}:00`));
const compactHourLabel = (time: string) => timeLabel(time).replace(":00", "").replaceAll(" ", "");
const timeRangeLabel = (time: string) => {
  const endMinutes = (minutes(time) + 60) % (24 * 60);
  const endTime = `${pad(Math.floor(endMinutes / 60))}:00`;
  return `${compactHourLabel(time)}-${compactHourLabel(endTime)}`;
};
const durationRangeLabel = (time: string, durationHours: number) => {
  const endMinutes = (minutes(time) + durationHours * 60) % (24 * 60);
  const endTime = `${pad(Math.floor(endMinutes / 60))}:${pad(endMinutes % 60)}`;
  return `${compactHourLabel(time)}-${compactHourLabel(endTime)}`;
};
const money = (amount: number, currency = "PHP") => new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
const bookingDateLabel = (date: string) => new Intl.DateTimeFormat("en-PH", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${date}T12:00:00`));
const paymentCode = (method: PaymentMethod) => method.code || method.methodCode || method.displayName.toLowerCase().replace(/[^a-z0-9]+/g, "_");
const isGcash = (method: PaymentMethod | null | undefined) => Boolean(method && paymentCode(method) === "gcash");

function CompleteBookingSummary({ confirmation, bookingDate, defaultExpanded = false }: { confirmation: BookingConfirmation; bookingDate: string; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const sessions = (confirmation.sessions?.length ? [...confirmation.sessions] : [{
    courtId: "primary",
    courtName: confirmation.courtName,
    bookingDate,
    startTime: confirmation.startsAt.slice(11, 16),
    durationHours: 1,
    startsAt: confirmation.startsAt,
    endsAt: confirmation.endsAt,
    subtotalAmount: confirmation.subtotalAmount,
  }]).sort((left, right) => left.startsAt.localeCompare(right.startsAt) || left.courtName.localeCompare(right.courtName, undefined, { numeric: true }));
  const courtGroups = [...sessions.reduce((groups, session) => {
    const key = session.courtId || session.courtName;
    const current = groups.get(key) || { courtId: key, courtName: session.courtName, sessions: [], courtHours: 0, subtotalAmount: 0 };
    current.sessions.push(session);
    current.courtHours += session.durationHours;
    current.subtotalAmount += session.subtotalAmount;
    groups.set(key, current);
    return groups;
  }, new Map<string, { courtId: string; courtName: string; sessions: typeof sessions; courtHours: number; subtotalAmount: number }>()).values()]
    .sort((left, right) => left.courtName.localeCompare(right.courtName, undefined, { numeric: true }));
  const courtHours = sessions.reduce((total, session) => total + session.durationHours, 0);
  const feePerHour = courtHours ? confirmation.serviceFeeAmount / courtHours : 0;
  return <details className="pp-selection-review pp-complete-summary" open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
    <summary aria-label="Show or hide the complete booking summary">
      <span className="pp-summary-toggle-total"><small>Total due</small><strong>{money(confirmation.totalAmount, confirmation.currency)}</strong></span>
      <span className="pp-summary-toggle-action"><span>View details</span><ChevronDown aria-hidden="true" /></span>
    </summary>
    <div className="pp-summary-expanded-head"><span><small>Booking summary</small><strong>Reservation details</strong></span><span>{courtHours} court-hour{courtHours === 1 ? "" : "s"}</span></div>
    <dl className="pp-summary-meta"><div><dt>Playing date</dt><dd>{bookingDateLabel(bookingDate)}</dd></div><div><dt>Booking reference</dt><dd>{confirmation.reference}</dd></div></dl>
    <ul className="pp-summary-courts">{courtGroups.map((court) => { const customerCourtTotal = court.subtotalAmount + feePerHour * court.courtHours; return <li key={court.courtId} className="pp-summary-court"><header><strong>{court.courtName}</strong><span>{court.courtHours} hour{court.courtHours === 1 ? "" : "s"} · {money(customerCourtTotal, confirmation.currency)}</span></header><ul>{court.sessions.map((session, index) => { const venueHourlyRate = session.durationHours ? session.subtotalAmount / session.durationHours : session.subtotalAmount; const customerHourlyRate = venueHourlyRate + feePerHour; const customerSessionTotal = session.subtotalAmount + feePerHour * session.durationHours; return <li key={`${session.startTime}-${index}`}><span>{durationRangeLabel(session.startTime, session.durationHours)}</span><small>{money(customerHourlyRate, confirmation.currency)} × {session.durationHours} hour{session.durationHours === 1 ? "" : "s"}</small><strong>{money(customerSessionTotal, confirmation.currency)}</strong></li>; })}</ul></li>; })}</ul>
    <dl className="pp-price-breakdown"><div><dt>Court time</dt><dd>{money(confirmation.totalAmount, confirmation.currency)}</dd></div><div><dt>Booking fee</dt><dd><span className="pp-free-fee">FREE</span></dd></div><div><dt>Total due</dt><dd>{money(confirmation.totalAmount, confirmation.currency)}</dd></div></dl>
  </details>;
}

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
    const bandEnd = typeof band.end === "string" ? minutes(band.end) : -1;
    const normalizedBandEnd = bandEnd === 0 ? 24 * 60 : bandEnd;
    if (typeof band.start === "string" && typeof band.hourlyRate === "number" && minute >= minutes(band.start) && minute < normalizedBandEnd) return band.hourlyRate;
  }
  return null;
}

function closingMinutes(court: PublicCourt) {
  const value = minutes(court.closesAt);
  return value === 0 ? 24 * 60 : value;
}

function slotKey(courtId: string, startTime: string) {
  return `${courtId}|${startTime}`;
}

function splitSlotKey(value: string) {
  const separator = value.indexOf("|");
  return { courtId: value.slice(0, separator), startTime: value.slice(separator + 1) };
}

function storedToken(reference: string) {
  try { return window.localStorage.getItem(`pickpoint-booking:${reference.trim().toUpperCase()}`) || ""; } catch { return ""; }
}

function addDays(value: Date, days: number) {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
}

function addMonths(value: string, monthsToAdd: number) {
  const [year, month] = value.slice(0, 7).split("-").map(Number);
  const result = new Date(year, month - 1 + monthsToAdd, 1, 12);
  return `${result.getFullYear()}-${pad(result.getMonth() + 1)}`;
}

function calendarDates(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(year, monthNumber - 1, 1, 12);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = addDays(first, -mondayOffset);
  return Array.from({ length: 42 }, (_, index) => isoDate(addDays(start, index)));
}

function bookingFeeAmount(fee: { feeMode?: string; feeAmount?: number } | undefined, subtotal: number, courtHours: number) {
  const amount = numberSetting(fee?.feeAmount, 0);
  if (fee?.feeMode === "fixed_per_hour") return amount * courtHours;
  if (fee?.feeMode === "percentage") return subtotal * amount / 100;
  return amount;
}

function customerRateFor(court: PublicCourt, start: string, fee: { feeMode?: string; feeAmount?: number } | undefined) {
  const venueRate = rateFor(court, start);
  if (venueRate == null) return null;
  return venueRate + (fee?.feeMode === "fixed_per_hour" ? numberSetting(fee.feeAmount, 0) : 0);
}

function clockAt(timestamp: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "00";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    minute: Number(part("hour")) * 60 + Number(part("minute")),
  };
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
    intro: typeof row.intro === "string" ? row.intro : "Please review these rules before booking.",
    content,
    version: typeof row.version === "string" ? row.version : null,
  };
}

export function BookingView({ initialMode, initialCourtSlug }: BookingViewProps) {
  const { data, error: tenantError, loading } = useTenant();
  const [mode, setMode] = useState(initialMode);
  const [step, setStep] = useState<Step>("select");
  const [date, setDate] = useState(() => isoDate(new Date()));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => isoDate(new Date()).slice(0, 7));
  const [selectedSlotKeys, setSelectedSlotKeys] = useState<string[]>([]);
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "" });
  const [paymentPolicyAccepted, setPaymentPolicyAccepted] = useState(false);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [paymentMethodCode, setPaymentMethodCode] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [accountCopied, setAccountCopied] = useState(false);
  const [receiptOutcome, setReceiptOutcome] = useState<PaymentReceiptSubmission | null>(null);
  const [resumeNotice, setResumeNotice] = useState("");
  const [lookupReference, setLookupReference] = useState("");
  const [lookupResult, setLookupResult] = useState<Record<string, unknown> | null>(null);
  const [bookingClock] = useState(() => Date.now());
  const [holdIntro, setHoldIntro] = useState(false);
  const [holdEndsAt, setHoldEndsAt] = useState<number | null>(null);
  const [remainingHoldSeconds, setRemainingHoldSeconds] = useState<number | null>(null);
  const bookingAttemptId = useRef<string | null>(null);
  const dateFieldRef = useRef<HTMLDivElement | null>(null);
  const resumeChecked = useRef(false);

  const courts = useMemo(() => data?.courts ?? [], [data]);
  const live = isPublicBookingReady(data);
  const multiSessionEnabled = data?.capabilities?.atomicMultiSessionBookingV1 === true;
  const paymentMethods = useMemo(() => data?.paymentMethods ?? [], [data]);
  const paymentMethod = paymentMethods.find((method) => paymentCode(method) === paymentMethodCode);
  const policy = publishedPolicy(data?.refundReschedulePolicy);
  const primaryCourt = courts.find((item) => item.slug === initialCourtSlug) ?? courts[0];
  const maximumAdvanceDays = primaryCourt ? numberSetting(primaryCourt.publicConfig?.maximumAdvanceDays, 30) : 30;
  const minimumDate = isoDate(new Date());
  const maximumDate = isoDate(addDays(new Date(), maximumAdvanceDays));
  const selectedDateLabel = new Intl.DateTimeFormat("en-PH", { weekday: "short", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00`));
  const calendarMonthLabel = new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric" }).format(new Date(`${calendarMonth}-01T12:00:00`));
  const calendarCells = useMemo(() => calendarDates(calendarMonth), [calendarMonth]);
  const previousCalendarMonth = addMonths(calendarMonth, -1);
  const nextCalendarMonth = addMonths(calendarMonth, 1);

  function chooseDate(nextDate: string) {
    setAvailability(null);
    setMessage("");
    setDate(nextDate);
    setCalendarMonth(nextDate.slice(0, 7));
    setCalendarOpen(false);
    setSelectedSlotKeys([]);
    bookingAttemptId.current = null;
  }

  function moveDate(days: number) {
    chooseDate(isoDate(addDays(new Date(`${date}T12:00:00`), days)));
  }

  useEffect(() => {
    if (!live || !date) return;
    let active = true;
    getAvailability(date).then((result) => { if (active) setAvailability(result); }).catch((reason: unknown) => { if (active) setMessage(reason instanceof Error ? reason.message : "Times are unavailable."); });
    return () => { active = false; };
  }, [date, live]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [step]);

  useEffect(() => {
    if (!calendarOpen) return;
    const closeCalendar = (event: MouseEvent) => {
      if (!dateFieldRef.current?.contains(event.target as Node)) setCalendarOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCalendarOpen(false);
    };
    document.addEventListener("mousedown", closeCalendar);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeCalendar);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [calendarOpen]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(async () => {
      let draft: BookingResumeDraft | null = null;
      try {
        draft = JSON.parse(window.localStorage.getItem(ACTIVE_BOOKING_KEY) || "null") as BookingResumeDraft | null;
      } catch { /* Ignore damaged browser storage. */ }
      if (!active || !draft || draft.version !== 2 || !/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || !Array.isArray(draft.selectedSlotKeys)) {
        resumeChecked.current = true;
        return;
      }
      const selectionIsRecent = Date.now() - draft.savedAt < 6 * 60 * 60 * 1000;
      const activeReservation = draft.confirmation && draft.holdEndsAt && draft.holdEndsAt > Date.now();
      if (!selectionIsRecent || (!activeReservation && draft.confirmation)) {
        window.localStorage.removeItem(ACTIVE_BOOKING_KEY);
        resumeChecked.current = true;
        return;
      }
      if (activeReservation && draft.confirmation) {
        try {
          const result = await bookingStatus(draft.confirmation.reference, draft.confirmation.bookingToken);
          const booking = result.booking as Record<string, unknown> | undefined;
          if (["cancelled", "expired", "completed"].includes(String(booking?.status ?? "").toLowerCase())) {
            window.localStorage.removeItem(ACTIVE_BOOKING_KEY);
            resumeChecked.current = true;
            return;
          }
        } catch {
          window.localStorage.removeItem(ACTIVE_BOOKING_KEY);
          resumeChecked.current = true;
          return;
        }
      }
      if (!active) return;
      setDate(draft.date);
      setCalendarMonth(draft.date.slice(0, 7));
      setSelectedSlotKeys(draft.selectedSlotKeys);
      setCustomer(draft.customer || { name: "", email: "", phone: "" });
      setPaymentPolicyAccepted(draft.paymentPolicyAccepted === true);
      setPaymentMethodCode(draft.paymentMethodCode || "");
      setPaymentReference(draft.paymentReference || "");
      setConfirmation(draft.confirmation);
      setHoldEndsAt(activeReservation ? draft.holdEndsAt : null);
      setRemainingHoldSeconds(activeReservation && draft.holdEndsAt ? Math.max(0, Math.ceil((draft.holdEndsAt - Date.now()) / 1000)) : null);
      setStep(activeReservation ? draft.step : "select");
      setResumeNotice(activeReservation ? "Welcome back. Your booking is still in progress." : "Welcome back. Your recent court selection has been restored.");
      resumeChecked.current = true;
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!resumeChecked.current) return;
    if (step === "done" || (!confirmation && selectedSlotKeys.length === 0)) {
      window.localStorage.removeItem(ACTIVE_BOOKING_KEY);
      return;
    }
    const draft: BookingResumeDraft = {
      version: 2,
      savedAt: Date.now(),
      step: step === "done" ? "select" : step,
      date,
      selectedSlotKeys,
      confirmation,
      customer,
      paymentPolicyAccepted,
      paymentMethodCode,
      paymentReference,
      holdEndsAt,
    };
    try { window.localStorage.setItem(ACTIVE_BOOKING_KEY, JSON.stringify(draft)); } catch { /* Private browsing may deny storage. */ }
  }, [confirmation, customer, date, holdEndsAt, paymentMethodCode, paymentPolicyAccepted, paymentReference, selectedSlotKeys, step]);

  useEffect(() => {
    if (!confirmation || !holdEndsAt || (step !== "details" && step !== "method" && step !== "payment")) return;
    const updateRemaining = () => {
      const remaining = Math.max(0, Math.ceil((holdEndsAt - Date.now()) / 1000));
      setRemainingHoldSeconds(remaining);
      if (remaining > 0) return;
      cancelUnpaidBooking(confirmation.reference, confirmation.bookingToken).catch(() => undefined);
      setHoldIntro(false);
      setConfirmation(null);
      setHoldEndsAt(null);
      setSelectedSlotKeys([]);
      bookingAttemptId.current = null;
      setStep("select");
      setMessage("Your 10-minute booking window ended. Please choose the court times again.");
      getAvailability(date).then(setAvailability).catch(() => undefined);
    };
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [confirmation, date, holdEndsAt, step]);

  useEffect(() => {
    if (!holdIntro) return;
    const timer = window.setTimeout(() => setHoldIntro(false), 4000);
    return () => window.clearTimeout(timer);
  }, [holdIntro]);

  const scheduleTimes = useMemo(() => {
    if (!courts.length) return [];
    const opening = Math.min(...courts.map((court) => Math.ceil(minutes(court.opensAt) / 60)));
    const closing = Math.max(...courts.map((court) => Math.floor(closingMinutes(court) / 60)));
    const result: string[] = [];
    for (let hour = opening; hour < closing; hour += 1) {
      result.push(`${pad(hour)}:00`);
    }
    return result;
  }, [courts]);

  const visibleScheduleTimes = useMemo(() => {
    const tenantClock = clockAt(bookingClock, availability?.timezone || data?.tenant.timezone || "Asia/Manila");
    if (date !== tenantClock.date) return scheduleTimes;
    return scheduleTimes.filter((time) => minutes(time) > tenantClock.minute);
  }, [availability?.timezone, bookingClock, data?.tenant.timezone, date, scheduleTimes]);

  const selectedSlots = useMemo(() => {
    const courtOrder = new Map(courts.map((court, index) => [court.id, index]));
    return selectedSlotKeys.map(splitSlotKey).sort((left, right) =>
      left.startTime.localeCompare(right.startTime) ||
      (courtOrder.get(left.courtId) ?? 0) - (courtOrder.get(right.courtId) ?? 0)
    );
  }, [courts, selectedSlotKeys]);
  const selectedSet = useMemo(() => new Set(selectedSlotKeys), [selectedSlotKeys]);
  const estimatedTotal = selectedSlots.reduce((total, selection) => {
    const selectedCourt = courts.find((court) => court.id === selection.courtId);
    return total + (selectedCourt ? rateFor(selectedCourt, selection.startTime) ?? 0 : 0);
  }, 0);
  const estimatedBookingFee = bookingFeeAmount(data?.bookingFee, estimatedTotal, selectedSlots.length);
  const estimatedGrandTotal = estimatedTotal + estimatedBookingFee;
  const holdExpiryLabel = holdEndsAt
    ? new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", timeZone: data?.tenant.timezone || "Asia/Manila" }).format(new Date(holdEndsAt))
    : null;
  const holdCountdown = remainingHoldSeconds == null
    ? "10:00"
    : `${pad(Math.floor(remainingHoldSeconds / 60))}:${pad(remainingHoldSeconds % 60)}`;

  function slotState(court: PublicCourt, startTime: string, source = availability): SlotState {
    const hour = minutes(startTime);
    if (hour < minutes(court.opensAt) || hour + 60 > closingMinutes(court)) return "closed";
    if (!source) return "checking";
    const slotStart = `${date}T${startTime}:00`;
    const endHour = hour + 60;
    const followingDate = isoDate(addDays(new Date(`${date}T12:00:00`), 1));
    const slotEnd = endHour === 24 * 60
      ? `${followingDate}T00:00:00`
      : `${date}T${pad(Math.floor(endHour / 60))}:00:00`;
    const blockedDate = source.blockedDates?.find((entry) =>
      (!entry.courtId || entry.courtId === court.id) &&
      (!entry.startsAt || !entry.endsAt || (entry.startsAt < slotEnd && entry.endsAt > slotStart))
    );
    if (blockedDate) return blockedDate.state === "maintenance" || blockedDate.label?.toLowerCase().includes("maintenance") ? "maintenance" : "closed";
    const availabilityCourt = source.courts.find((item) => item.id === court.id);
    if (!availabilityCourt) return "closed";
    const occupancy = availabilityCourt.unavailable.find((entry) => entry.startsAt < slotEnd && entry.endsAt > slotStart);
    if (occupancy) return occupancy.state === "processing" || occupancy.state === "pending" ? occupancy.state : "booked";
    const minimumLeadMinutes = numberSetting(court.publicConfig?.minimumLeadMinutes, 0);
    const leadTime = new Date(slotStart).getTime() - bookingClock;
    if (leadTime < minimumLeadMinutes * 60_000) return "lead-time";
    if (rateFor(court, startTime) == null) return "not-offered";
    return "available";
  }

  function slotIsAvailable(court: PublicCourt, startTime: string, source = availability) {
    return slotState(court, startTime, source) === "available";
  }

  function toggleSlot(court: PublicCourt, startTime: string) {
    if (!slotIsAvailable(court, startTime)) return;
    const key = slotKey(court.id, startTime);
    if (!selectedSet.has(key) && selectedSlotKeys.length >= 18) {
      setMessage("A booking can contain at most 18 court-hours.");
      return;
    }
    setSelectedSlotKeys((current) => current.includes(key)
      ? current.filter((item) => item !== key)
      : multiSessionEnabled ? [...current, key] : [key]);
    bookingAttemptId.current = null;
    setMessage("");
  }

  const resetSelection = () => { setStep("select"); setConfirmation(null); setHoldEndsAt(null); setRemainingHoldSeconds(null); setSelectedSlotKeys([]); setPaymentPolicyAccepted(false); setPaymentMethodCode(""); setPaymentReference(""); setReceipt(null); setReceiptOutcome(null); setMessage(""); bookingAttemptId.current = null; };

  async function holdSelection() {
    if (!selectedSlots.length || !live || !policy?.version) return;
    setBusy(true); setMessage("");
    try {
      bookingAttemptId.current ||= crypto.randomUUID();
      const result = await createBooking({
        sessions: selectedSlots.map((selection) => ({ ...selection, bookingDate: date, durationHours: 1 })),
        customer: {
          name: "Booking details pending",
          email: `booking-${bookingAttemptId.current}@pending.pickpoint-pickleclub.invalid`,
          phone: "0000000000",
        },
        guestCount: 1,
        notes: "__details_pending_v1__",
        policyAccepted: true,
        policyVersion: policy.version,
        clientRequestId: bookingAttemptId.current,
      });
      const serverExpiry = result.expiresAt ? new Date(result.expiresAt).getTime() : Number.POSITIVE_INFINITY;
      const customerDeadline = Math.min(serverExpiry, Date.now() + HOLD_SECONDS * 1000);
      setConfirmation(result);
      setHoldEndsAt(customerDeadline);
      setRemainingHoldSeconds(Math.max(0, Math.ceil((customerDeadline - Date.now()) / 1000)));
      try { window.localStorage.setItem(`pickpoint-booking:${result.reference.toUpperCase()}`, result.bookingToken); } catch { /* Private browsing may deny storage. */ }
      setHoldIntro(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      setStep("details");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "We could not protect that time. Please choose another.");
      getAvailability(date).then((result) => {
        setAvailability(result);
        setSelectedSlotKeys((current) => current.filter((key) => {
          const selection = splitSlotKey(key);
          const selectedCourt = courts.find((item) => item.id === selection.courtId);
          return selectedCourt ? slotIsAvailable(selectedCourt, selection.startTime, result) : false;
        }));
      }).catch(() => undefined);
    }
    finally { setBusy(false); }
  }

  async function saveDetails(event: React.FormEvent) {
    event.preventDefault();
    if (!confirmation) return;
    setBusy(true); setMessage("");
    try {
      await completeBookingDetails({ reference: confirmation.reference, token: confirmation.bookingToken, customer });
      setStep(paymentMethods.length ? "method" : "done");
    } catch (reason) {
      const text = reason instanceof Error ? reason.message : "Your player details could not be saved.";
      if (/expired|no longer active/i.test(text)) {
        setConfirmation(null);
        setHoldEndsAt(null);
        setRemainingHoldSeconds(null);
        setSelectedSlotKeys([]);
        bookingAttemptId.current = null;
        setStep("select");
        getAvailability(date).then(setAvailability).catch(() => undefined);
        setMessage("Your booking window ended. Please choose the court times again.");
      } else {
        setMessage(text);
      }
    } finally { setBusy(false); }
  }

  async function releaseHoldAndReturn() {
    if (!confirmation) { setStep("select"); return; }
    setBusy(true); setMessage("");
    try {
      await cancelUnpaidBooking(confirmation.reference, confirmation.bookingToken);
      setConfirmation(null);
      setHoldEndsAt(null);
      setRemainingHoldSeconds(null);
      setSelectedSlotKeys([]);
      bookingAttemptId.current = null;
      setStep("select");
      setAvailability(await getAvailability(date));
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "The current selection could not be released.");
    } finally { setBusy(false); }
  }

  function continueToPayment(event: React.FormEvent) {
    event.preventDefault();
    if (!paymentMethod) return;
    setPaymentPolicyAccepted(false);
    setMessage("");
    setStep("payment");
  }

  async function copyPaymentAccount() {
    const accountNumber = paymentMethod?.accountNumber || paymentMethod?.accountReference || "";
    if (!accountNumber) return;
    try {
      await navigator.clipboard.writeText(accountNumber);
      setAccountCopied(true);
      window.setTimeout(() => setAccountCopied(false), 1800);
    } catch {
      setMessage("The account number could not be copied. Please press and hold the number to copy it.");
    }
  }

  async function sendReceipt(event: React.FormEvent) {
    event.preventDefault();
    if (!confirmation || !paymentMethod || !receipt || !paymentPolicyAccepted) return;
    const reference = paymentReference.trim().toUpperCase();
    if (!reference) {
      setMessage("Enter the transaction reference exactly as shown on your receipt.");
      return;
    }
    if (isGcash(paymentMethod) && !/^\d{13}$/.test(reference.replace(/\D/g, ""))) {
      setMessage("Enter the 13-digit GCash transaction reference shown on your receipt.");
      return;
    }
    if (receipt.size > 2 * 1024 * 1024) {
      setMessage("The receipt image must be 2 MB or smaller.");
      return;
    }
    setBusy(true); setMessage("");
    try {
      const outcome = await submitPaymentReceipt({ reference: confirmation.reference, token: confirmation.bookingToken, method: paymentCode(paymentMethod), paymentReference: isGcash(paymentMethod) ? reference.replace(/\D/g, "") : reference, file: receipt });
      setReceiptOutcome(outcome);
      setHoldEndsAt(null);
      setRemainingHoldSeconds(null);
      setStep("done");
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "The receipt could not be submitted."); }
    finally { setBusy(false); }
  }

  async function findBooking(event: React.FormEvent) {
    event.preventDefault();
    const reference = lookupReference.trim().toUpperCase();
    const token = storedToken(reference);
    if (!token) { setMessage("This browser does not have the secure key for that reference. Contact the venue for assistance."); setLookupResult(null); return; }
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
    <GuestShell current="book" checkout={step === "details" || step === "method" || step === "payment"}>
      {step !== "done" && <section className="pp-book-head"><p className="pp-kicker">Book a court</p><h1>{step === "select" ? "Choose when to play" : step === "details" ? "Player details" : step === "method" ? "Choose payment method" : "Complete payment"}</h1><p>{step === "select" ? "Pick a date and one or more court times." : step === "details" ? "Add the player’s contact information." : step === "method" ? "Choose where you’ll send the payment." : "Send the exact total and upload your receipt."}</p></section>}
      <div id="booking-times" className={`pp-book-layout${holdIntro ? " is-hold-intro" : ""}`}>
        <ol className="pp-steps" aria-label="Booking progress">{["Time", "Details", "Method", "Payment", "Done"].map((label, index) => { const activeIndex = ["select", "details", "method", "payment", "done"].indexOf(step); return <li key={label} aria-current={index === activeIndex ? "step" : undefined} className={index <= activeIndex ? "is-active" : ""}><i>{index < activeIndex ? <Check aria-hidden="true" /> : index + 1}</i><b>{label}</b></li>; })}</ol>

        {holdIntro && <div className="pp-hold-intro" role="status"><Clock3 aria-hidden="true" /><span>Complete your booking within</span><strong>{holdCountdown}</strong><small>Your selected court times are protected.</small></div>}
        {confirmation && (step === "details" || step === "method" || step === "payment") && <aside className="pp-hold-timer" aria-label={`Booking countdown: ${holdCountdown} remaining`}><Clock3 aria-hidden="true" /><span><small>Complete your booking within</small><strong>{holdCountdown}</strong></span><em>In progress</em></aside>}
        {resumeNotice && <aside className="pp-resume-notice" role="status"><span>{resumeNotice}</span><button type="button" onClick={() => setResumeNotice("")}>Dismiss</button></aside>}

        {(loading || tenantError) && <div className="pp-state">{loading ? "Checking venue setup…" : tenantError}</div>}
        {data && !live && <div className="pp-setup"><span>Reservations are not open yet</span><h2>PickPoint is completing its court setup.</h2><p>Online booking will open after the venue confirms its courts, prices, payment details, and booking rules.</p><Link className="pp-button pp-button-outline" href="/">Return home</Link></div>}

        {data && live && step === "select" && (
          <section className="pp-book-card">
            <div className="pp-date-field" ref={dateFieldRef}>
              <span className="pp-field-label">Date</span>
              <div className="pp-date-picker">
                <button type="button" aria-label="Previous day" disabled={date <= minimumDate} onClick={() => moveDate(-1)}><ChevronLeft aria-hidden="true" /></button>
                <button type="button" className="pp-date-trigger" aria-haspopup="dialog" aria-expanded={calendarOpen} onClick={() => setCalendarOpen((current) => !current)}>
                  <CalendarDays aria-hidden="true" />
                  <span><small>Playing on</small><strong>{selectedDateLabel}</strong></span>
                  <ChevronDown className="pp-date-chevron" aria-hidden="true" />
                </button>
                <button type="button" aria-label="Next day" disabled={date >= maximumDate} onClick={() => moveDate(1)}><ChevronRight aria-hidden="true" /></button>
              </div>
              {calendarOpen && <section className="pp-calendar" role="dialog" aria-modal="false" aria-label="Choose a playing date">
                <header><button type="button" aria-label="Previous month" disabled={previousCalendarMonth < minimumDate.slice(0, 7)} onClick={() => setCalendarMonth(previousCalendarMonth)}><ChevronLeft aria-hidden="true" /></button><strong>{calendarMonthLabel}</strong><button type="button" aria-label="Next month" disabled={nextCalendarMonth > maximumDate.slice(0, 7)} onClick={() => setCalendarMonth(nextCalendarMonth)}><ChevronRight aria-hidden="true" /></button></header>
                <div className="pp-calendar-week" aria-hidden="true">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span key={day}>{day}</span>)}</div>
                <div className="pp-calendar-grid">{calendarCells.map((day) => { const outsideMonth = day.slice(0, 7) !== calendarMonth; const disabled = day < minimumDate || day > maximumDate; const selected = day === date; return <button type="button" key={day} disabled={disabled} className={`${outsideMonth ? "is-outside " : ""}${selected ? "is-selected" : ""}`} aria-pressed={selected} aria-label={new Intl.DateTimeFormat("en-PH", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${day}T12:00:00`))} onClick={() => chooseDate(day)}>{Number(day.slice(-2))}</button>; })}</div>
                <footer><button type="button" onClick={() => chooseDate(minimumDate)}>Today</button><span>Up to {maximumAdvanceDays} days ahead</span></footer>
              </section>}
            </div>
            <div className="pp-schedule-heading"><div><strong>Choose court times</strong></div>{selectedSlots.length > 0 && <button type="button" onClick={() => setSelectedSlotKeys([])}>Clear</button>}</div>
            <ul className="pp-slot-legend" aria-label="Court time status colors"><li className="is-available">Available</li><li className="is-processing">Processing</li><li className="is-pending">Pending</li><li className="is-booked">Booked</li><li className="is-maintenance">Maintenance</li></ul>
            <div className="pp-schedule-scroll" aria-busy={!availability}>
              {visibleScheduleTimes.length > 0 ? <table className="pp-schedule">
                <thead><tr><th scope="col">Time</th>{courts.map((item) => <th scope="col" key={item.id}><strong>{item.name}</strong><small>{timeLabel(item.opensAt)}–{timeLabel(item.closesAt)}</small></th>)}</tr></thead>
                <tbody>{visibleScheduleTimes.map((time) => <tr key={time}><th scope="row">{timeRangeLabel(time)}</th>{courts.map((item) => { const key = slotKey(item.id, time); const selected = selectedSet.has(key); const state = slotState(item, time); const available = state === "available"; const rate = customerRateFor(item, time, data?.bookingFee); const leadMinutes = numberSetting(item.publicConfig?.minimumLeadMinutes, 0); const leadLabel = leadMinutes % 60 === 0 ? `${leadMinutes / 60}h notice` : `${leadMinutes}m notice`; return <td key={item.id}><button type="button" aria-pressed={selected} disabled={!available} className={`${selected ? "is-selected " : ""}slot-${state}`} onClick={() => toggleSlot(item, time)}><span>{selected ? <><Check aria-hidden="true" /> Selected</> : slotStateLabel[state]}</span>{available && rate != null && <small>{money(rate, item.currency)}</small>}{state === "lead-time" && leadMinutes > 0 && <small>{leadLabel}</small>}</button></td>; })}</tr>)}</tbody>
              </table> : <div className="pp-no-times"><strong>Today’s court times are finished.</strong><span>Choose another date to see available slots.</span></div>}
              {!availability && <div className="pp-schedule-loading">Checking availability…</div>}
            </div>
            <p className="pp-grid-note">Past times are hidden. All selected slots will be reserved together under one booking reference.</p>
            {message && <p className="pp-form-message" role="alert">{message}</p>}
            <div className="pp-card-action"><span>{selectedSlots.length ? <><small>{selectedSlots.length} court-hour{selectedSlots.length === 1 ? "" : "s"} · booking fee FREE</small><strong>{money(estimatedGrandTotal, primaryCourt?.currency)}</strong></> : "Choose at least one court time"}</span><button className="pp-button pp-button-blue" disabled={busy || !selectedSlots.length || !policy?.version} onClick={holdSelection}>{busy ? "Securing your times…" : "Continue"} <ArrowRight /></button></div>
          </section>
        )}

        {step === "details" && selectedSlots.length > 0 && confirmation && (
          <form className="pp-book-card pp-details" onSubmit={saveDetails}>
            <button type="button" className="pp-back" disabled={busy} onClick={releaseHoldAndReturn}><ArrowLeft /> Change time</button>
            <div className="pp-hold-notice"><span className="pp-pulse" /><div><strong>Booking in progress.</strong><span>{holdExpiryLabel ? `Finish your details before ${holdExpiryLabel} to keep these times.` : "Finish your details before the booking timer ends."}</span></div></div>
            <div className="pp-fields-row"><label>Full name<input value={customer.name} onChange={(event) => setCustomer({ ...customer, name: event.target.value })} autoComplete="name" required /></label><label>Mobile number<input value={customer.phone} onChange={(event) => setCustomer({ ...customer, phone: event.target.value })} autoComplete="tel" inputMode="tel" required /></label></div>
            <label>Email address<input type="email" value={customer.email} onChange={(event) => setCustomer({ ...customer, email: event.target.value })} autoComplete="email" required /></label>
            <CompleteBookingSummary confirmation={confirmation} bookingDate={date} />
            {message && <p className="pp-form-message" role="alert">{message}</p>}
            <div className="pp-card-action pp-card-action-only"><button className="pp-button pp-button-blue" disabled={busy}>{busy ? "Saving details…" : "Continue to payment method"} <ArrowRight /></button></div>
          </form>
        )}

        {step === "method" && confirmation && paymentMethods.length > 0 && (
          <form className="pp-book-card pp-payment pp-payment-method-step" onSubmit={continueToPayment}>
            <button type="button" className="pp-back" onClick={() => setStep("details")}><ArrowLeft /> Back to details</button>
            <div className="pp-payment-title"><span>Total due</span><strong>{money(confirmation.totalAmount, confirmation.currency)}</strong></div>
            <CompleteBookingSummary confirmation={confirmation} bookingDate={date} defaultExpanded={false} />
            <fieldset className="pp-payment-methods"><legend>Select a payment method</legend>{paymentMethods.map((method) => { const code = paymentCode(method); return <label key={code} className={paymentMethodCode === code ? "is-selected" : ""}><input type="radio" name="paymentMethod" value={code} checked={paymentMethodCode === code} onChange={() => { setPaymentMethodCode(code); setPaymentPolicyAccepted(false); setReceipt(null); setPaymentReference(""); setMessage(""); }} required /><span><strong>{method.displayName}</strong><small>{paymentMethodCode === code ? "Selected" : "Tap to select"}</small></span><Check aria-hidden="true" /></label>; })}</fieldset>
            {paymentMethod && <section className="pp-method-preview"><span>Selected destination</span><strong>{paymentMethod.displayName}</strong><small>{paymentMethod.accountName || "Venue payment account"} · {paymentMethod.accountNumber || paymentMethod.accountReference || "Details shown next"}</small></section>}
            {message && <p className="pp-form-message" role="alert">{message}</p>}
            <button className="pp-button pp-button-blue pp-full" disabled={!paymentMethod}>Continue to payment <ArrowRight /></button>
          </form>
        )}

        {step === "payment" && confirmation && paymentMethods.length > 0 && (
          <form className="pp-book-card pp-payment" onSubmit={sendReceipt}>
            <button type="button" className="pp-back" disabled={busy} onClick={() => setStep("method")}><ArrowLeft /> Change payment method</button>
            <div className="pp-payment-title"><span>Total due</span><strong>{money(confirmation.totalAmount, confirmation.currency)}</strong></div>
            <CompleteBookingSummary confirmation={confirmation} bookingDate={date} defaultExpanded={false} />
            {paymentMethod ? <section className="pp-payment-destination"><h3>{paymentMethod.displayName} details</h3><dl><div><dt>Account name</dt><dd>{paymentMethod.accountName || "Provided by the venue"}</dd></div><div><dt>Account number</dt><dd className="pp-copy-value"><span>{paymentMethod.accountNumber || paymentMethod.accountReference || "See venue instructions"}</span>{(paymentMethod.accountNumber || paymentMethod.accountReference) && <button type="button" onClick={copyPaymentAccount} aria-label={`Copy ${paymentMethod.displayName} account number`}>{accountCopied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{accountCopied ? "Copied" : "Copy"}</button>}</dd></div></dl>{paymentMethod.instructions && <p className="pp-instructions">{paymentMethod.instructions}</p>}<div className="pp-receipt-heading"><strong>Upload your payment receipt</strong><span>Enter the transaction reference and attach the original receipt image.</span></div><label>{isGcash(paymentMethod) ? "13-digit GCash transaction reference" : "Payment transaction reference"}<input value={paymentReference} inputMode={isGcash(paymentMethod) ? "numeric" : "text"} maxLength={isGcash(paymentMethod) ? 13 : 64} autoComplete="off" placeholder={isGcash(paymentMethod) ? "0000000000000" : "Enter the reference from your receipt"} onChange={(event) => setPaymentReference(isGcash(paymentMethod) ? event.target.value.replace(/\D/g, "").slice(0, 13) : event.target.value)} required /><small>Enter it exactly as shown. A reference can be used only once.</small></label><label className="pp-upload"><Upload /><span><strong>{receipt?.name || "Choose payment receipt"}</strong><small>Original PNG, JPG or WebP · maximum 2 MB</small></span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0] || null; setReceipt(file); setMessage(file && file.size > 2 * 1024 * 1024 ? "The receipt image must be 2 MB or smaller." : ""); }} required /></label></section> : <p className="pp-payment-prompt">Return to Payment method and choose how you will pay.</p>}
            {policy ? <section className="pp-payment-policy"><details className="pp-policy" open><summary>Court Rules &amp; Policies</summary><div><span>{policy.intro}</span><p>{policy.content}</p></div></details><label className="pp-check"><input type="checkbox" checked={paymentPolicyAccepted} onChange={(event) => setPaymentPolicyAccepted(event.target.checked)} required /><span><strong>I have reviewed and agree to the court rules and booking policies.</strong><small>This agreement applies to every player included in this reservation.</small></span></label></section> : <p className="pp-form-message" role="alert">The current court rules and policies could not be loaded. Please refresh before paying.</p>}
            {message && <p className="pp-form-message" role="alert">{message}</p>}
            <button className="pp-button pp-button-blue pp-full" disabled={busy || !paymentMethod || !receipt || !paymentReference.trim() || !paymentPolicyAccepted || !policy?.version}>{busy ? "Submitting receipt…" : "Submit payment receipt"} <ArrowRight /></button>
          </form>
        )}
        {step === "done" && confirmation && (
          <section className="pp-book-card pp-confirmed is-submitted"><div className="pp-checkmark"><Check /></div><p className="pp-kicker">Receipt submitted</p><h2>{confirmation.reference}</h2><p>Your payment receipt was submitted successfully. Keep this reference to check your booking status.</p><dl><div><dt>Court</dt><dd>{confirmation.courtName}</dd></div><div><dt>Total</dt><dd>{money(confirmation.totalAmount, confirmation.currency)}</dd></div><div><dt>Payment</dt><dd>Receipt submitted</dd></div><div><dt>Booking</dt><dd>{receiptOutcome?.booking.status?.replaceAll("_", " ") || "Payment review"}</dd></div></dl><div className="pp-actions"><button className="pp-button pp-button-outline" onClick={resetSelection}>Book another time</button><Link className="pp-button pp-button-blue" href="/book?mode=manage">View this booking</Link></div></section>
        )}
      </div>
    </GuestShell>
  );
}
