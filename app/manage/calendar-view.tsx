"use client";

import {
  Ban,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LayoutGrid,
  List,
  RefreshCw,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Booking, Court, CourtBlock } from "./management-adapter";
import styles from "./calendar-view.module.css";

export type CalendarDayData = {
  bookings: Booking[];
  blocks: CourtBlock[];
};

export type CalendarViewProps = {
  courts: Court[];
  initialBookings: Booking[];
  initialBlocks: CourtBlock[];
  loadDay: (date: string) => Promise<CalendarDayData>;
  canBlock: boolean;
  onOpenBlocks: () => void;
  timezone?: string;
  currency?: string;
};

type LoadPhase = "loading" | "ready" | "error";

type AgendaEntry =
  | { kind: "booking"; booking: Booking; startMinutes: number }
  | { kind: "block"; block: CourtBlock; startMinutes: number };

type CourtGroup = {
  key: string;
  name: string;
  detail: string;
  status: Court["status"] | "all" | "unassigned";
  entries: AgendaEntry[];
  global?: boolean;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_PATTERN = /^(\d{1,2}):(\d{2})/;
const TERMINAL_HIDDEN_STATUSES = new Set<Booking["status"]>([
  "cancelled",
  "expired",
]);
const HOLD_STATUSES = new Set<Booking["status"]>([
  "awaiting_receipt",
  "receipt_processing",
  "payment_review",
  "payment_attention",
]);

const STATUS_LABEL: Record<Booking["status"], string> = {
  confirmed: "Confirmed",
  awaiting_receipt: "Awaiting receipt",
  receipt_processing: "Receipt processing",
  payment_review: "Payment review",
  payment_attention: "Payment needs attention",
  checked_in: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  expired: "Expired",
};

const PAYMENT_LABEL: Record<Booking["payment"], string> = {
  unpaid: "Unpaid",
  pending: "Pending",
  partial: "Partially paid",
  paid: "Paid",
  refunded: "Refunded",
  rejected: "Rejected",
  unknown: "Not returned",
};

function calendarDateIn(timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: timezone,
    }).formatToParts(new Date());
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? "";
    return `${value("year")}-${value("month")}-${value("day")}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function shiftCalendarDate(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return value;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function readableDate(value: string, options: Intl.DateTimeFormatOptions): string {
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-PH", {
    ...options,
    timeZone: "UTC",
  }).format(date);
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase("en");
}

function isAllCourtBlock(block: CourtBlock): boolean {
  return normalized(block.court) === "all courts";
}

function minutesFromClock(value: string | null): number {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const match = CLOCK_PATTERN.exec(value.trim());
  if (!match) return Number.MAX_SAFE_INTEGER;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59
    ? hour * 60 + minute
    : Number.MAX_SAFE_INTEGER;
}

function minutesFromDisplayTime(value: string): number {
  if (value === "All day") return -1;
  const match = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(value);
  if (!match) return Number.MAX_SAFE_INTEGER;
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hour += 12;
  return hour * 60 + Number(match[2]);
}

function durationMinutes(value: string): number {
  const hours = Number(/(\d+(?:\.\d+)?)\s*(?:h|hr|hour)/i.exec(value)?.[1] ?? 0);
  const minutes = Number(/(\d+)\s*(?:m|min|minute)/i.exec(value)?.[1] ?? 0);
  const total = Math.round(hours * 60 + minutes);
  return total > 0 ? total : 60;
}

function displayTimeRange(value: string): { start: number; end: number } | null {
  if (value === "All day") return null;
  const matches = [...value.matchAll(/(\d{1,2}):(\d{2})\s*(AM|PM)/gi)];
  if (!matches.length) return null;
  const toMinutes = (match: RegExpMatchArray) => {
    let hour = Number(match[1]) % 12;
    if (match[3].toUpperCase() === "PM") hour += 12;
    return hour * 60 + Number(match[2]);
  };
  const start = toMinutes(matches[0]);
  return { start, end: matches[1] ? toMinutes(matches[1]) : start + 60 };
}

function shortTime(minutes: number): string {
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  const labelHour = hour % 12 || 12;
  return `${labelHour}${minute ? `:${String(minute).padStart(2, "0")}` : ""} ${hour < 12 ? "AM" : "PM"}`;
}

function amountLabel(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("en-PH")}`;
  }
}

function rowsForDate(
  date: string,
  bookings: Booking[],
  blocks: CourtBlock[],
): CalendarDayData {
  return {
    bookings: bookings.filter(
      (booking) =>
        booking.bookingDate === date &&
        !TERMINAL_HIDDEN_STATUSES.has(booking.status),
    ),
    blocks: blocks.filter((block) => block.dateValue === date),
  };
}

function bookingEntry(booking: Booking): AgendaEntry {
  return {
    kind: "booking",
    booking,
    startMinutes:
      minutesFromClock(booking.startTime) === Number.MAX_SAFE_INTEGER
        ? minutesFromDisplayTime(booking.time)
        : minutesFromClock(booking.startTime),
  };
}

function blockEntry(block: CourtBlock): AgendaEntry {
  return {
    kind: "block",
    block,
    startMinutes: minutesFromDisplayTime(block.time),
  };
}

function sortEntries(entries: AgendaEntry[]): AgendaEntry[] {
  return [...entries].sort((left, right) => {
    if (left.startMinutes !== right.startMinutes) {
      return left.startMinutes - right.startMinutes;
    }
    const leftLabel = left.kind === "booking" ? left.booking.customer : left.block.publicLabel;
    const rightLabel = right.kind === "booking" ? right.booking.customer : right.block.publicLabel;
    return leftLabel.localeCompare(rightLabel);
  });
}

function courtGroups(
  courts: Court[],
  bookings: Booking[],
  blocks: CourtBlock[],
  courtFilter: string,
): CourtGroup[] {
  const selectedCourts = courtFilter === "all"
    ? [...courts].sort((left, right) => left.sortOrder - right.sortOrder)
    : courts.filter((court) => court.id === courtFilter);
  const allCourtBlocks = blocks.filter(isAllCourtBlock);
  const matchedBookingIds = new Set<string>();
  const matchedBlockIds = new Set<string>(allCourtBlocks.map((block) => block.id));
  const groups: CourtGroup[] = [];

  for (const court of selectedCourts) {
    const courtBookings = bookings.filter((booking) => booking.courtId === court.id);
    const courtBlocks = blocks.filter((block) => normalized(block.court) === normalized(court.name));
    courtBookings.forEach((booking) => matchedBookingIds.add(booking.bookingId));
    courtBlocks.forEach((block) => matchedBlockIds.add(block.id));
    groups.push({
      key: court.id,
      name: court.name,
      detail: court.surface || court.description || "Configured court",
      status: court.status,
      entries: sortEntries([
        ...courtBookings.map(bookingEntry),
        ...allCourtBlocks.map(blockEntry),
        ...courtBlocks.map(blockEntry),
      ]),
    });
  }

  if (courtFilter === "all") {
    const unmatchedBookings = bookings.filter(
      (booking) => !matchedBookingIds.has(booking.bookingId),
    );
    const unmatchedBlocks = blocks.filter((block) => !matchedBlockIds.has(block.id));
    const unmatchedLabels = new Set([
      ...unmatchedBookings.map((booking) => booking.court || "Unassigned court"),
      ...unmatchedBlocks.map((block) => block.court || "Unassigned court"),
    ]);

    for (const label of unmatchedLabels) {
      const entries = sortEntries([
        ...unmatchedBookings
          .filter((booking) => booking.court === label)
          .map(bookingEntry),
        ...unmatchedBlocks
          .filter((block) => block.court === label)
          .map(blockEntry),
      ]);
      if (!entries.length) continue;
      groups.push({
        key: `unassigned-${label}`,
        name: label,
        detail: "Court record not in the loaded inventory",
        status: "unassigned",
        entries,
      });
    }
  }

  return groups;
}

function courtStatusLabel(status: CourtGroup["status"]): string {
  switch (status) {
    case "active":
      return "Active";
    case "maintenance":
      return "Maintenance";
    case "inactive":
      return "Inactive";
    case "all":
      return "Venue-wide";
    case "unassigned":
      return "Unassigned";
  }
}

function bookingDateTime(booking: Booking, fallbackDate: string): string {
  const date = booking.bookingDate ?? fallbackDate;
  if (!booking.startTime) return date;
  const clock = booking.startTime.slice(0, 5);
  return `${date}T${clock}`;
}

function BookingAgendaItem({
  booking,
  selectedDate,
  currency,
}: {
  booking: Booking;
  selectedDate: string;
  currency: string;
}) {
  const isHold = HOLD_STATUSES.has(booking.status);
  const statusTone = booking.status === "payment_attention" ? "attention" : isHold ? "pending" : "stable";
  const paymentTone = booking.payment === "paid"
    ? "paid"
    : booking.payment === "rejected" || booking.payment === "refunded"
      ? "attention"
      : "pending";

  return (
    <article className={`${styles.agendaItem} ${isHold ? styles.holdItem : styles.bookingItem}`}>
      <div className={styles.timeColumn}>
        <time dateTime={bookingDateTime(booking, selectedDate)}>{booking.time}</time>
        <span>{booking.duration}</span>
      </div>
      <div className={styles.entryBody}>
        <div className={styles.entryHeading}>
          <div>
            <span className={styles.kindLabel}>{isHold ? "Hold" : "Booking"}</span>
            {booking.bookingType === "event" ? <span className={styles.secondaryKind}>Event</span> : null}
            <h4>{booking.customer}</h4>
          </div>
          <strong className={styles.amount}>{amountLabel(booking.amount, currency)}</strong>
        </div>
        <p className={styles.reference}>Booking {booking.reference}</p>
        <div className={styles.semanticRow}>
          <span className={`${styles.semanticPill} ${styles[`tone_${statusTone}`]}`}>
            Status: {STATUS_LABEL[booking.status]}
          </span>
          <span className={`${styles.semanticPill} ${styles[`tone_${paymentTone}`]}`}>
            Payment: {PAYMENT_LABEL[booking.payment]}
          </span>
        </div>
      </div>
    </article>
  );
}

function BlockAgendaItem({ block, selectedDate }: { block: CourtBlock; selectedDate: string }) {
  return (
    <article className={`${styles.agendaItem} ${styles.blockItem}`}>
      <div className={styles.timeColumn}>
        <time dateTime={selectedDate}>{block.time}</time>
        <span>Court block</span>
      </div>
      <div className={styles.entryBody}>
        <div className={styles.entryHeading}>
          <div>
            <span className={styles.kindLabel}>Block</span>
            <h4>{block.publicLabel}</h4>
          </div>
          <Ban aria-hidden="true" size={19} strokeWidth={2.2} />
        </div>
        {block.internalReason ? (
          <p className={styles.blockNote}>Private note: {block.internalReason}</p>
        ) : (
          <p className={styles.blockNote}>No internal note</p>
        )}
      </div>
    </article>
  );
}

export function CalendarView({
  courts,
  initialBookings,
  initialBlocks,
  loadDay,
  canBlock,
  onOpenBlocks,
  timezone = "Asia/Manila",
  currency = "PHP",
}: CalendarViewProps) {
  const today = calendarDateIn(timezone);
  const initialRows = rowsForDate(today, initialBookings, initialBlocks);
  const [selectedDate, setSelectedDate] = useState(today);
  const [courtFilter, setCourtFilter] = useState("all");
  const [dayData, setDayData] = useState<CalendarDayData>(initialRows);
  const [phase, setPhase] = useState<LoadPhase>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [viewMode, setViewMode] = useState<"courts" | "agenda">("courts");
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const loadDayRef = useRef(loadDay);
  const requestSequence = useRef(0);

  useEffect(() => {
    loadDayRef.current = loadDay;
  }, [loadDay]);

  useEffect(() => {
    if (!window.matchMedia("(max-width: 760px)").matches) return;
    const frame = window.requestAnimationFrame(() => setViewMode("agenda"));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const requestId = ++requestSequence.current;
    let active = true;

    void loadDayRef.current(selectedDate)
      .then((result) => {
        if (!active || requestSequence.current !== requestId) return;
        setDayData(rowsForDate(selectedDate, result.bookings, result.blocks));
        setPhase("ready");
      })
      .catch((error: unknown) => {
        if (!active || requestSequence.current !== requestId) return;
        setDayData({ bookings: [], blocks: [] });
        setErrorMessage(
          error instanceof Error && error.message
            ? error.message
            : "The schedule could not be loaded for this day.",
        );
        setPhase("error");
      });

    return () => {
      active = false;
    };
  }, [refreshKey, selectedDate]);

  const effectiveCourtFilter =
    courtFilter === "all" || courts.some((court) => court.id === courtFilter)
      ? courtFilter
      : "all";

  const visibleBookings = useMemo(() => {
    if (effectiveCourtFilter === "all") return dayData.bookings;
    return dayData.bookings.filter((booking) => booking.courtId === effectiveCourtFilter);
  }, [dayData.bookings, effectiveCourtFilter]);

  const selectedCourt = useMemo(
    () => courts.find((court) => court.id === effectiveCourtFilter),
    [courts, effectiveCourtFilter],
  );

  const visibleBlocks = useMemo(() => {
    if (effectiveCourtFilter === "all") return dayData.blocks;
    return dayData.blocks.filter((block) => {
      const courtName = normalized(block.court);
      return courtName === "all courts" || courtName === normalized(selectedCourt?.name ?? "");
    });
  }, [dayData.blocks, effectiveCourtFilter, selectedCourt]);

  const groups = useMemo(
    () => courtGroups(courts, visibleBookings, visibleBlocks, effectiveCourtFilter),
    [courts, effectiveCourtFilter, visibleBlocks, visibleBookings],
  );
  const holdCount = visibleBookings.filter((booking) => HOLD_STATUSES.has(booking.status)).length;
  const bookingCount = visibleBookings.length - holdCount;
  const visibleCourtCount = Math.max(
    effectiveCourtFilter === "all" ? courts.length : selectedCourt ? 1 : 0,
    1,
  );
  const projectedBlockCount = visibleBlocks.reduce(
    (count, block) => count + (isAllCourtBlock(block) ? visibleCourtCount : 1),
    0,
  );
  const blockCount = projectedBlockCount;
  const resultCount = bookingCount + holdCount + blockCount;
  const dateHeading = readableDate(selectedDate, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const compactDate = readableDate(selectedDate, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timeline = useMemo(() => {
    const courtOpenings = courts.map((court) => minutesFromClock(court.opensAt)).filter(Number.isFinite).filter((value) => value < Number.MAX_SAFE_INTEGER);
    const courtClosings = courts.map((court) => minutesFromClock(court.closesAt)).filter(Number.isFinite).filter((value) => value < Number.MAX_SAFE_INTEGER);
    const entryStarts = groups.flatMap((group) => group.entries.map((entry) => entry.startMinutes)).filter((value) => value >= 0 && value < Number.MAX_SAFE_INTEGER);
    const entryEnds = groups.flatMap((group) => group.entries.map((entry) => entry.kind === "booking"
      ? entry.startMinutes + durationMinutes(entry.booking.duration)
      : displayTimeRange(entry.block.time)?.end ?? entry.startMinutes + 60));
    const start = Math.floor(Math.min(8 * 60, ...courtOpenings, ...entryStarts) / 60) * 60;
    const end = Math.ceil(Math.max(22 * 60, ...courtClosings, ...entryEnds) / 60) * 60;
    const slotCount = Math.max(1, (end - start) / 60);
    const hours = Array.from({ length: slotCount }, (_, index) => start + index * 60);
    return { start, end, slotCount, hours };
  }, [courts, groups]);
  const bookedMinutes = visibleBookings.reduce((sum, booking) => sum + durationMinutes(booking.duration), 0);
  const blockedMinutes = visibleBlocks.reduce((sum, block) => {
    const range = displayTimeRange(block.time);
    const minutes = range ? Math.max(0, range.end - range.start) : Math.max(0, timeline.end - timeline.start);
    return sum + minutes * (isAllCourtBlock(block) ? visibleCourtCount : 1);
  }, 0);
  const paidRevenue = visibleBookings.filter((booking) => booking.payment === "paid").reduce((sum, booking) => sum + booking.amount, 0);
  const totalInventoryMinutes = Math.max(0, timeline.end - timeline.start) * Math.max(groups.filter((group) => !group.global).length, 1);
  const openCourtHours = Math.max(0, (totalInventoryMinutes - bookedMinutes - blockedMinutes) / 60);
  const blockedCourtHours = blockedMinutes / 60;

  const timelineEntryStyle = (entry: AgendaEntry): CSSProperties => {
    const rawStart = entry.kind === "block" ? displayTimeRange(entry.block.time)?.start ?? timeline.start : entry.startMinutes;
    const rawEnd = entry.kind === "block"
      ? displayTimeRange(entry.block.time)?.end ?? timeline.end
      : rawStart + durationMinutes(entry.booking.duration);
    const start = Math.max(timeline.start, Math.min(rawStart, timeline.end - 60));
    const end = Math.max(start + 60, Math.min(rawEnd, timeline.end));
    return {
      "--slot": Math.floor((start - timeline.start) / 60) + 2,
      "--span": Math.max(1, Math.ceil((end - start) / 60)),
    } as CSSProperties;
  };
  const timelineGridStyle: CSSProperties = {
    gridTemplateColumns: `112px repeat(${timeline.slotCount}, minmax(78px, 1fr))`,
    minWidth: `${112 + timeline.slotCount * 78}px`,
  };
  const selectedTimelineBooking = selectedBookingId
    ? visibleBookings.find((booking) => booking.bookingId === selectedBookingId) ?? null
    : null;
  const currentHour = selectedDate === today
    ? Number(new Intl.DateTimeFormat("en", { hour: "numeric", hourCycle: "h23", timeZone: timezone }).format(new Date())) * 60
    : null;

  const moveDate = (days: number) => {
    setPhase("loading");
    setErrorMessage("");
    setDayData({ bookings: [], blocks: [] });
    setSelectedDate((current) => shiftCalendarDate(current, days));
  };

  const goToToday = () => {
    const currentToday = calendarDateIn(timezone);
    setPhase("loading");
    setErrorMessage("");
    setDayData({ bookings: [], blocks: [] });
    if (currentToday === selectedDate) {
      setRefreshKey((key) => key + 1);
      return;
    }
    setSelectedDate(currentToday);
  };

  return (
    <section className={styles.calendar} aria-labelledby="calendar-view-title" aria-busy={phase === "loading"}>
      <header className={styles.calendarHeader}>
        <div className={styles.dateControl}>
          <button type="button" onClick={() => moveDate(-1)} aria-label="Previous day"><ChevronLeft aria-hidden="true" size={19} /></button>
          <label className={styles.dateLabel}>
            <span>{selectedDate === today ? "Today" : "Selected day"}</span>
            <strong id="calendar-view-title">{compactDate}</strong>
            <CalendarDays aria-hidden="true" size={17} />
            <input
              type="date"
              value={selectedDate}
              aria-label="Choose schedule date"
              title="Choose any schedule date"
              onClick={(event) => {
                try {
                  event.currentTarget.showPicker?.();
                } catch {
                  event.currentTarget.focus();
                }
              }}
              onChange={(event) => {
                if (!DATE_PATTERN.test(event.target.value)) return;
                setPhase("loading");
                setErrorMessage("");
                setDayData({ bookings: [], blocks: [] });
                setSelectedDate(event.target.value);
              }}
            />
          </label>
          <button type="button" onClick={() => moveDate(1)} aria-label="Next day"><ChevronRight aria-hidden="true" size={19} /></button>
          {selectedDate !== today ? <button type="button" className={styles.todayButton} onClick={goToToday}>Today</button> : null}
        </div>

        <div className={styles.toolbarActions}>
          <div className={styles.segmented} aria-label="Schedule view">
            <button type="button" className={viewMode === "courts" ? styles.active : undefined} onClick={() => setViewMode("courts")} aria-pressed={viewMode === "courts"}><LayoutGrid aria-hidden="true" size={15} /> Timeline</button>
            <button type="button" className={viewMode === "agenda" ? styles.active : undefined} onClick={() => setViewMode("agenda")} aria-pressed={viewMode === "agenda"}><List aria-hidden="true" size={15} /> Agenda</button>
          </div>
          <button
            type="button"
            className={styles.blockButton}
            onClick={onOpenBlocks}
            disabled={!canBlock}
            title={canBlock ? undefined : "Your account cannot block court time"}
          >
            <Ban aria-hidden="true" size={18} />
            Court block
          </button>
          <button
            type="button"
            className={styles.refreshButton}
            onClick={() => {
              setPhase("loading");
              setErrorMessage("");
              setDayData({ bookings: [], blocks: [] });
              setRefreshKey((key) => key + 1);
            }}
            disabled={phase === "loading"}
            aria-label={`Refresh schedule for ${compactDate}`}
          >
            <RefreshCw aria-hidden="true" size={18} className={phase === "loading" ? styles.spinning : undefined} />
            Refresh
          </button>
        </div>
      </header>

      <p className={styles.srOnly} aria-live="polite">
        {phase === "loading"
          ? `Loading schedule for ${dateHeading}.`
          : phase === "error"
            ? `Could not load schedule for ${dateHeading}.`
            : `${resultCount} schedule ${resultCount === 1 ? "entry" : "entries"} loaded for ${dateHeading}.`}
      </p>

      {phase === "loading" ? (
        <div className={styles.loadingState} role="presentation">
          <span />
          <span />
        </div>
      ) : phase === "error" ? (
        <div className={styles.errorState} role="alert">
          <strong>We could not load this day</strong>
          <p>{errorMessage}</p>
          <button
            type="button"
            onClick={() => {
              setPhase("loading");
              setErrorMessage("");
              setDayData({ bookings: [], blocks: [] });
              setRefreshKey((key) => key + 1);
            }}
          >
            Try again
          </button>
        </div>
      ) : viewMode === "courts" ? (
        <>
          <section className={styles.scheduleBoard} aria-label={`Court schedule for ${dateHeading}`}>
            <div className={styles.boardMeta}>
              <div><span className={styles.liveMark}><i /> Live coverage</span><strong>{shortTime(timeline.start)}–{shortTime(timeline.end)}</strong></div>
              <div className={styles.scheduleLegend}><span><i className={styles.playing} />Checked in</span><span><i className={styles.reserved} />Confirmed</span><span><i className={styles.review} />Payment review</span><span><i className={styles.blocked} />Court block</span></div>
              <label className={styles.courtFilter}><span>Show</span><select value={effectiveCourtFilter} onChange={(event) => setCourtFilter(event.target.value)}><option value="all">All courts</option>{[...courts].sort((left, right) => left.sortOrder - right.sortOrder).map((court) => <option key={court.id} value={court.id}>{court.name}</option>)}</select></label>
            </div>
            <div className={styles.boardScroll} tabIndex={0} aria-label="Scroll horizontally through court times">
              <div className={styles.timeHeader} style={timelineGridStyle}>
                <span className={styles.cornerLabel}>Court</span>
                {timeline.hours.map((hour, index) => <div className={`${styles.hourHeader} ${currentHour === hour ? styles.currentHour : ""}`} key={hour} style={{ gridColumn: index + 2 }}><time>{shortTime(hour)}</time><small>to {shortTime(hour + 60)}</small></div>)}
              </div>
              {groups.map((group, groupIndex) => (
                <div className={`${styles.scheduleRow} ${group.status === "maintenance" ? styles.maintenance : ""}`} style={timelineGridStyle} key={group.key}>
                  <div className={styles.rowCourt}><span>{group.global ? "ALL" : group.name.match(/\d+/)?.[0] ?? group.name.slice(0, 2).toUpperCase()}</span><div><strong>{group.name}</strong><small>{group.detail}</small></div></div>
                  {timeline.hours.map((hour, index) => <span className={`${styles.hourCell} ${currentHour === hour ? styles.currentHourCell : ""}`} style={{ gridColumn: index + 2 }} aria-hidden="true" key={`${group.key}-${hour}`} />)}
                  {group.entries.map((entry) => entry.kind === "booking" ? (
                    <button type="button" key={entry.booking.bookingId} className={`${styles.bookingBlock} ${selectedBookingId === entry.booking.bookingId ? styles.selectedBlock : ""} ${entry.booking.status === "checked_in" ? styles.playingBlock : HOLD_STATUSES.has(entry.booking.status) ? styles.reviewBlock : styles.reservedBlock}`} style={timelineEntryStyle(entry)} title={`${entry.booking.customer} · ${entry.booking.time}`} onClick={() => setSelectedBookingId(entry.booking.bookingId)}>
                      <strong>{entry.booking.customer}</strong><span>{entry.booking.time}</span><small>{entry.booking.payment === "paid" ? "Paid" : STATUS_LABEL[entry.booking.status]}</small>
                    </button>
                  ) : (
                    <div
                      key={entry.block.id}
                      className={`${styles.bookingBlock} ${styles.blockedBlock} ${isAllCourtBlock(entry.block) && effectiveCourtFilter === "all" && groups.length > 1 ? `${styles.venueWideBlock} ${groupIndex === 0 ? styles.venueWideFirst : groupIndex === groups.length - 1 ? styles.venueWideLast : styles.venueWideMiddle}` : ""}`}
                      style={timelineEntryStyle(entry)}
                      title={`${entry.block.publicLabel} · ${entry.block.time}`}
                      aria-label={`${entry.block.publicLabel}, all courts, ${entry.block.time}`}
                    >
                      {!isAllCourtBlock(entry.block) || effectiveCourtFilter !== "all" || groups.length === 1 || groupIndex === 0 ? (
                        <><strong>{isAllCourtBlock(entry.block) && effectiveCourtFilter === "all" ? `All courts · ${entry.block.publicLabel}` : entry.block.publicLabel}</strong><span>{entry.block.time}</span></>
                      ) : null}
                    </div>
                  ))}
                  {group.status === "maintenance" && !group.entries.length ? <div className={styles.maintenanceBand}><strong>Maintenance hold</strong><span>Court unavailable</span></div> : null}
                </div>
              ))}
            </div>
            {selectedTimelineBooking ? <aside className={styles.bookingPreview} aria-label="Selected booking details"><div><span>Selected booking</span><strong>{selectedTimelineBooking.customer}</strong><small>{selectedTimelineBooking.reference}</small></div><dl><div><dt>Court</dt><dd>{selectedTimelineBooking.court}</dd></div><div><dt>Time</dt><dd>{selectedTimelineBooking.time}</dd></div><div><dt>Payment</dt><dd>{PAYMENT_LABEL[selectedTimelineBooking.payment]}</dd></div><div><dt>Amount</dt><dd>{amountLabel(selectedTimelineBooking.amount, currency)}</dd></div></dl><button type="button" onClick={() => setSelectedBookingId(null)}>Close</button></aside> : null}
            <div className={styles.boardFooter}><span><Clock3 aria-hidden="true" size={14} /> {timezone}</span><p role="status" aria-live="polite">{resultCount} {resultCount === 1 ? "schedule entry" : "schedule entries"}</p></div>
          </section>
          <section className={styles.scheduleSummary} aria-label="Schedule totals">
            <article><span>Booked court hours</span><strong>{(bookedMinutes / 60).toLocaleString("en-PH", { maximumFractionDigits: 1 })}h</strong><small>{bookingCount} confirmed booking{bookingCount === 1 ? "" : "s"}</small></article>
            <article><span>Paid booking value</span><strong>{amountLabel(paidRevenue, currency)}</strong><small>Server-returned paid bookings</small></article>
            <article><span>Open inventory</span><strong>{openCourtHours.toLocaleString("en-PH", { maximumFractionDigits: 1 })}h</strong><small>{blockedCourtHours ? `After ${blockedCourtHours.toLocaleString("en-PH", { maximumFractionDigits: 1 })} blocked court-hours` : "No court blocks today"}</small></article>
            <button type="button" onClick={onOpenBlocks} disabled={!canBlock}><span><Ban aria-hidden="true" size={17} /></span><strong>Block court time</strong><small>Take a court out of inventory</small></button>
          </section>
        </>
      ) : groups.length ? (
        <div className={styles.courtBoard} aria-label={`Court agenda for ${dateHeading}`}>
          {groups.map((group) => <section className={`${styles.courtCard} ${group.global ? styles.globalCourtCard : ""}`} key={group.key}><header className={styles.courtHeader}><div><h3>{group.name}</h3><p>{group.detail}</p></div><div className={styles.courtMeta}><span className={`${styles.courtStatus} ${styles[`court_${group.status}`]}`}>{courtStatusLabel(group.status)}</span><strong>{group.entries.length} {group.entries.length === 1 ? "entry" : "entries"}</strong></div></header>{group.entries.length ? <div className={styles.agendaList}>{group.entries.map((entry) => entry.kind === "booking" ? <BookingAgendaItem key={`booking-${entry.booking.bookingId}`} booking={entry.booking} selectedDate={selectedDate} currency={currency} /> : <BlockAgendaItem key={`block-${entry.block.id}`} block={entry.block} selectedDate={selectedDate} />)}</div> : <p className={styles.courtEmpty}>No bookings or blocks returned for this court.</p>}</section>)}
        </div>
      ) : (
        <div className={styles.emptyState}><CalendarDays aria-hidden="true" size={28} /><strong>No courts returned</strong><p>The live court inventory is unavailable for this day.</p></div>
      )}
    </section>
  );
}

export default CalendarView;
