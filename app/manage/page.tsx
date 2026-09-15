"use client";

import Image from "next/image";
import {
  ArrowRight,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  CircleCheck,
  CircleDollarSign,
  Clock3,
  LayoutDashboard,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  Settings2,
  Sparkles,
  SquareActivity,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";
import styles from "./manage.module.css";
import { CalendarView } from "./calendar-view";
import {
  AnalyticsView,
  FinanceView,
  type AnalyticsPeriod,
} from "./analytics-finance";
import {
  formatPeso,
  isAllowedCustomerQrUrl,
  managementAdapter,
  previewRoleSessions,
  type Booking,
  type BookingPaymentStatus,
  type BookingStatus,
  type BusinessPaymentConfiguration,
  type ManagementCapability,
  type ManagementActionResult,
  type ManagementBookingReschedulePreview,
  type ManagementContext,
  type ManagementInsights,
  type ManagementSnapshot,
  type PaymentReceiptView,
  type RemittanceDestination,
  type TenantRole,
} from "./management-adapter";
import {
  PlatformRequestError,
  platformMode,
  signInOwner,
  signOutOwner,
} from "../lib/platform/client";
import {
  boundaryOptionsFor,
  buildTwoBandSchedule,
  clockValueForHour,
  closeOptionsFor,
  formatClockLabel,
  isWholeHourClock,
  logicalBoundaryHour,
  logicalCloseHour,
  normalizeTwoBandSchedule,
  parseClockHour,
  type ClockOption,
  type TwoBandSchedule,
} from "../lib/operating-hours";
import { activeTenant } from "../tenants/registry";

type View =
  | "overview"
  | "bookings"
  | "schedule"
  | "setup"
  | "blocks"
  | "customers"
  | "reports"
  | "finance"
  | "settings"
  | "launch"
  | "access";

type PreviewState = "ready" | "loading" | "empty" | "error" | "restricted";
type BookingFilter =
  | "all"
  | "awaiting"
  | "pending"
  | "confirmed"
  | "completed"
  | "cancelled";

type ConfirmAction = {
  title: string;
  detail: string;
  confirmLabel: string;
  actionType: string;
  resourceId?: string;
  payload?: unknown;
  tone?: "default" | "danger";
  onSuccess?: (result: ManagementActionResult) => void;
};

type ToastState = {
  message: string;
  tone: "success" | "error" | "warning";
};

const NAV_ITEMS: { id: View; label: string; short: string }[] = [
  { id: "overview", label: "Today", short: "OV" },
  { id: "schedule", label: "Schedule", short: "CA" },
  { id: "bookings", label: "Bookings", short: "BK" },
  { id: "setup", label: "Setup", short: "ST" },
];

function NavIcon({ view }: { view: View }) {
  const Icon = view === "overview" ? LayoutDashboard
    : view === "schedule" ? CalendarDays
      : view === "bookings" ? SquareActivity
        : view === "blocks" ? MapPin
          : view === "customers" ? Users
            : view === "finance" ? CircleDollarSign
              : view === "reports" ? ChartNoAxesColumnIncreasing
                : view === "launch" ? Sparkles
                  : view === "access" ? Users
                    : Settings2;
  return <Icon aria-hidden="true" />;
}

const VIEW_CAPABILITY: Partial<Record<View, ManagementCapability>> = {
  customers: "customer:view",
  reports: "report:view",
  finance: "finance:view",
  settings: "settings:update",
  launch: "tenant:publish",
};

const VIEW_COPY: Record<View, { title: string; description: string }> = {
  overview: {
    title: "Today at PickPoint",
    description: "Bookings and court status for today.",
  },
  bookings: {
    title: "Bookings",
    description: "Find reservations and manage payments.",
  },
  schedule: {
    title: "Calendar",
    description: "Bookings, payment holds and court blocks by day.",
  },
  setup: {
    title: "Setup",
    description: "Courts, hours, rates, payments, rules and launch readiness.",
  },
  blocks: {
    title: "Court blocks",
    description: "Plan maintenance, events and private closures.",
  },
  customers: {
    title: "Customers",
    description: "Player activity and booking history.",
  },
  reports: {
    title: "Analytics",
    description: "Booking value and court performance.",
  },
  finance: {
    title: "Finance & remittance",
    description: "Platform fees and remittance cycles.",
  },
  settings: {
    title: "Venue settings",
    description: "Courts, rates, hours and booking rules.",
  },
  launch: {
    title: "Go live",
    description: "Complete the checks required for public booking.",
  },
  access: {
    title: "Team & roles",
    description: "Team roles and session capabilities.",
  },
};

const LIVE_VIEW_COPY: Record<View, { title: string; description: string }> = {
  overview: {
    title: "PickPoint workspace.",
    description: "Authenticated, server-scoped booking data and launch readiness.",
  },
  bookings: {
    title: "Bookings",
    description: "Review reservations and payments.",
  },
  schedule: {
    title: "Calendar",
    description: "Bookings, payment holds and court blocks by day.",
  },
  setup: {
    title: "Setup",
    description: "Keep the club details customers rely on in one place.",
  },
  blocks: {
    title: "Court blocks",
    description: "Create and remove court downtime.",
  },
  customers: {
    title: "Customers",
    description: "Player history from tenant bookings.",
  },
  reports: {
    title: "Analytics",
    description: "Paid booking value and court performance.",
  },
  finance: {
    title: "Finance & remittance",
    description: "Platform fees and remittance cycles.",
  },
  settings: {
    title: "Venue settings",
    description: "Courts, hours, rates and booking rules.",
  },
  launch: {
    title: "Launch PickPoint",
    description: "Complete the checks required for public booking.",
  },
  access: {
    title: "Team & access",
    description: "Membership and session capabilities.",
  },
};

const ROLE_LABEL: Record<TenantRole, string> = {
  owner: "Owner",
  admin: "Admin",
  staff: "Staff",
  host: "Host",
};

const STATUS_LABEL: Record<BookingStatus, string> = {
  confirmed: "Confirmed",
  awaiting_receipt: "Awaiting receipt",
  receipt_processing: "Receipt processing",
  payment_review: "Review required",
  payment_attention: "Payment needs attention",
  checked_in: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  expired: "Expired",
};

const BOOKING_FILTERS: ReadonlyArray<{ value: BookingFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "awaiting", label: "Awaiting" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

function bookingMatchesFilter(booking: Booking, filter: BookingFilter): boolean {
  if (filter === "all") return true;
  if (filter === "awaiting") return booking.status === "awaiting_receipt";
  if (filter === "pending") {
    return booking.status === "receipt_processing" ||
      booking.status === "payment_review" ||
      booking.status === "payment_attention";
  }
  if (filter === "confirmed") {
    return booking.status === "confirmed" || booking.status === "checked_in";
  }
  if (filter === "completed") return booking.status === "completed";
  return booking.status === "cancelled" || booking.status === "expired";
}

function bookingStatusDetail(booking: Booking): string | null {
  switch (booking.status) {
    case "awaiting_receipt":
      return "Waiting for the player to upload a payment receipt.";
    case "receipt_processing":
      return "Receipt uploaded. Secure verification is in progress.";
    case "payment_review":
      return "Receipt is ready for venue review.";
    case "payment_attention":
      if (booking.payment === "rejected" || booking.paymentEvidence?.status === "rejected") {
        return "Payment was rejected. Contact the player before confirming.";
      }
      if (booking.paymentEvidence?.status === "short_payment") {
        return "Payment is short. Review the remaining balance with the player.";
      }
      return "Payment needs venue attention before this booking can be confirmed.";
    case "confirmed":
    case "checked_in":
      return null;
    case "completed":
      return null;
    case "cancelled":
      return null;
    case "expired":
      return "The payment window expired and the court is no longer held.";
  }
}

const PAYMENT_LABEL: Record<BookingPaymentStatus, string> = {
  unpaid: "Unpaid",
  pending: "Pending",
  partial: "Partially paid",
  paid: "Paid",
  refunded: "Refunded",
  rejected: "Rejected",
  unknown: "Not returned",
};

function manilaCalendarDate(): string {
  const parts = new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: activeTenant.identity.timezone,
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function shiftIsoCalendarDate(value: string, days: number): string {
  const candidate = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(candidate.getTime())) return value;
  candidate.setUTCDate(candidate.getUTCDate() + days);
  return candidate.toISOString().slice(0, 10);
}

function analyticsDateRange(period: AnalyticsPeriod) {
  const dateTo = manilaCalendarDate();
  const dayCount = period === "today"
    ? 1
    : period === "7d"
      ? 7
      : period === "30d"
        ? 30
        : 90;
  return {
    dateFrom: shiftIsoCalendarDate(dateTo, -(dayCount - 1)),
    dateTo,
  };
}

function blockCalendarParts(dateValue: string | null, fallback: string) {
  const candidate = dateValue ? new Date(`${dateValue}T12:00:00Z`) : null;
  if (!candidate || !Number.isFinite(candidate.getTime())) {
    return { month: "DATE", day: "—", year: fallback };
  }
  return {
    month: new Intl.DateTimeFormat("en-PH", {
      month: "short",
      timeZone: activeTenant.identity.timezone,
    }).format(candidate).toUpperCase(),
    day: new Intl.DateTimeFormat("en-PH", {
      day: "2-digit",
      timeZone: activeTenant.identity.timezone,
    }).format(candidate),
    year: new Intl.DateTimeFormat("en-PH", {
      year: "numeric",
      timeZone: activeTenant.identity.timezone,
    }).format(candidate),
  };
}

const CAPABILITY_LABEL: Record<ManagementCapability, string> = {
  "booking:create": "Create bookings",
  "booking:update": "Edit bookings",
  "booking:cancel": "Cancel bookings",
  "booking:check-in": "Check in players",
  "payment:review": "Review payments",
  "payment:asset": "Manage payment QR images",
  "schedule:block": "Block court time",
  "customer:view": "View customers",
  "report:view": "View reports",
  "finance:view": "View finance & remittances",
  "settings:update": "Change venue settings",
  "tenant:publish": "Request live activation",
};

const cx = (...values: Array<string | false | null | undefined>) =>
  values.filter(Boolean).join(" ");

function ActionButton({
  children,
  variant = "primary",
  disabled,
  onClick,
  type = "button",
  className,
  ariaLabel,
  disabledDescriptionId,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "quiet" | "danger";
  disabled?: boolean;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  type?: "button" | "submit";
  className?: string;
  ariaLabel?: string;
  disabledDescriptionId?: string;
}) {
  return (
    <button
      type={type}
      className={cx(styles.button, styles[variant], className)}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-describedby={disabled ? disabledDescriptionId : undefined}
    >
      {children}
    </button>
  );
}

function StatusPill({ status }: { status: BookingStatus }) {
  return (
    <span className={cx(styles.statusPill, styles[`status_${status}`])}>
      <span className={styles.statusDot} aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}

function Avatar({ initials, tone = 0 }: { initials: string; tone?: number }) {
  return (
    <span className={cx(styles.avatar, styles[`avatarTone${tone % 4}`])} aria-hidden="true">
      {initials}
    </span>
  );
}

function MetricCard({
  label,
  value,
  note,
  accent,
}: {
  label: string;
  value: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <article className={cx(styles.metricCard, accent && styles.metricAccent)}>
      <div className={styles.metricTop}>
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      <p>{note}</p>
    </article>
  );
}

function DashboardSkeleton() {
  return (
    <div className={styles.skeleton} role="status" aria-live="polite">
      <span className={styles.srOnly}>Loading PickPoint management data</span>
      <div className={cx(styles.skeletonLine, styles.skeletonEyebrow)} />
      <div className={cx(styles.skeletonLine, styles.skeletonTitle)} />
      <div className={styles.skeletonMetrics}>
        {[0, 1, 2, 3].map((item) => (
          <div className={styles.skeletonCard} key={item} />
        ))}
      </div>
      <div className={styles.skeletonPanels}>
        <div className={styles.skeletonPanel} />
        <div className={styles.skeletonPanel} />
      </div>
    </div>
  );
}

function StatePanel({
  kind,
  onRestore,
  role,
  isPreview,
}: {
  kind: Exclude<PreviewState, "ready" | "loading">;
  onRestore: () => void;
  role: TenantRole;
  isPreview: boolean;
}) {
  const copy = {
    empty: {
      mark: "00",
      title: "Nothing here yet",
      body: "New tenant activity will appear here after PickPoint starts accepting bookings.",
      action: "Show preview data",
    },
    error: {
      mark: "!",
      title: "We couldn’t refresh this view",
      body: "Your last saved data is safe. Check the connection and try once more.",
      action: "Try again",
    },
    restricted: {
      mark: "—",
      title: "This view needs another permission",
      body: `The current ${ROLE_LABEL[role].toLowerCase()} session does not include access to this area. Ask a tenant owner or admin if your role needs to change.`,
      action: "Return to preview",
    },
  }[kind];

  return (
    <section className={styles.statePanel} aria-labelledby={`state-${kind}-title`}>
      <span className={styles.stateMark} aria-hidden="true">
        {copy.mark}
      </span>
      <p className={styles.eyebrow}>
        PickPoint · {isPreview ? ROLE_LABEL[role] : "Live workspace"}
      </p>
      <h2 id={`state-${kind}-title`}>{copy.title}</h2>
      <p>{copy.body}</p>
      <ActionButton onClick={onRestore}>{copy.action}</ActionButton>
    </section>
  );
}

function PermissionPanel({
  role,
  view,
  isPreview,
}: {
  role: TenantRole;
  view: View;
  isPreview: boolean;
}) {
  return (
    <section className={styles.permissionPanel} aria-labelledby="permission-title">
      <div className={styles.permissionBadge} aria-hidden="true">
        {isPreview ? ROLE_LABEL[role].slice(0, 2).toUpperCase() : "—"}
      </div>
      <div>
        <p className={styles.eyebrow}>{isPreview ? "Role-aware preview" : "Protected tenant area"}</p>
        <h2 id="permission-title">
          {isPreview
            ? `${ROLE_LABEL[role]} access stops here`
            : `${VIEW_COPY[view].title} is unavailable`}
        </h2>
        {isPreview ? (
          <>
            <p>
              This preview session was not given access to {VIEW_COPY[view].title.toLowerCase()}.
              Server-side tenant policy remains the source of truth.
            </p>
            <p className={styles.permissionHint}>
              Switch roles in Preview controls to inspect another server-shaped session.
            </p>
          </>
        ) : (
          <>
            <p>
              The authenticated tenant session did not return the capability required for this
              area. No preview data or assumed permissions are shown.
            </p>
            <p className={styles.permissionHint}>
              Sign in with a verified tenant account after access has been provisioned.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function RallyOverview({
  snapshot,
  can,
  goTo,
  openNeedsReview,
}: {
  snapshot: ManagementSnapshot;
  can: (capability: ManagementCapability) => boolean;
  goTo: (view: View) => void;
  openNeedsReview: () => void;
}) {
  const today = manilaCalendarDate();
  const nowParts = new Intl.DateTimeFormat("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: activeTenant.identity.timezone,
  }).formatToParts(new Date());
  const currentMinutes = Number(nowParts.find((part) => part.type === "hour")?.value ?? 0) * 60 +
    Number(nowParts.find((part) => part.type === "minute")?.value ?? 0);
  const clockMinutes = (value: string | null) => {
    const match = /^(\d{1,2}):(\d{2})/.exec(value ?? "");
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const activeBookings = snapshot.bookings.filter(
    (booking) => booking.status !== "cancelled" && booking.status !== "expired",
  );
  const todayBookings = activeBookings.filter((booking) => booking.bookingDate === today);
  const paymentReviews = snapshot.bookings.filter(
    (booking) => booking.paymentEvidence?.reviewable === true || booking.status === "payment_attention",
  );
  const paidSales = todayBookings
    .filter((booking) => booking.payment === "paid")
    .reduce((total, booking) => total + booking.amount, 0);
  const bookedMinutes = snapshot.schedule.filter((slot) => slot.kind !== "block").reduce((total, slot) => {
    const start = clockMinutes(slot.start);
    const end = clockMinutes(slot.end);
    return total + (start !== null && end !== null ? Math.max(0, end - start) : 0);
  }, 0);
  const availableMinutes = snapshot.courts.reduce((total, court) => {
    const start = clockMinutes(court.opensAt) ?? 6 * 60;
    const end = clockMinutes(court.closesAt) ?? 22 * 60;
    return total + Math.max(60, end - start);
  }, 0);
  const occupancy = availableMinutes ? Math.min(100, Math.round(bookedMinutes / availableMinutes * 100)) : 0;
  const upcoming = [...todayBookings]
    .map((booking) => ({ booking, minutes: clockMinutes(booking.startTime) }))
    .filter((entry) => entry.minutes === null || entry.minutes + 60 >= currentMinutes)
    .sort((left, right) => (left.minutes ?? 10_000) - (right.minutes ?? 10_000));
  const arrivals = (upcoming.length ? upcoming : activeBookings.map((booking) => ({ booking, minutes: clockMinutes(booking.startTime) }))).slice(0, 4);
  const courtStatus = snapshot.courts.map((court) => {
    const courtBookings = upcoming.filter((entry) => entry.booking.courtId === court.id);
    const next = courtBookings[0]?.booking ?? null;
    const inProgress = courtBookings.find((entry) => entry.minutes !== null && entry.minutes <= currentMinutes && entry.minutes + 60 > currentMinutes)?.booking ?? null;
    const isUnavailable = court.status !== "active";
    return {
      court,
      state: isUnavailable ? (court.status === "maintenance" ? "Maintenance" : "Closed") : inProgress ? "In play" : next ? "Ready" : "Available",
      tone: isUnavailable ? "danger" : inProgress ? "warning" : next ? "info" : "success",
      note: isUnavailable
        ? court.description || "Court is unavailable"
        : inProgress
          ? `${inProgress.customer} is on court now`
          : next
            ? `Next: ${next.customer} at ${next.time.split(/[–-]/)[0].trim()}`
            : "No upcoming reservation",
      hours: courtBookings.length ? `${courtBookings.length} booking${courtBookings.length === 1 ? "" : "s"} today` : "Open inventory",
    };
  });
  const dateLine = new Intl.DateTimeFormat("en-PH", {
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
    timeZone: activeTenant.identity.timezone,
  }).format(new Date());
  const checkedInCount = todayBookings.filter((booking) => booking.status === "checked_in").length;
  const attentionCourts = snapshot.courts.filter((court) => court.status !== "active");

  return (
    <div className={styles.rallyToday}>
      <section className={styles.rallyHero}>
        <div>
          <span>{dateLine} · {snapshot.tenant.venueLabel}</span>
          <h2>Today at PickPoint.</h2>
          <p>{paymentReviews.length || attentionCourts.length ? `${paymentReviews.length + attentionCourts.length} item${paymentReviews.length + attentionCourts.length === 1 ? "" : "s"} need a quick decision.` : "Today’s court operations are clear and up to date."}</p>
        </div>
        <div className={styles.rallyHeroActions}>
          <button type="button" onClick={() => goTo("blocks")} disabled={!can("schedule:block")}><Settings2 /> Court issue</button>
          <button type="button" className={styles.rallyPrimary} onClick={() => goTo("schedule")} disabled={!can("booking:create")}><Plus /> New booking</button>
        </div>
      </section>

      <section className={styles.rallyMetrics} aria-label="Today's key metrics">
        <article><div><span>Net sales</span><i className={styles.metricMint}><WalletCards /></i></div><strong>{formatPeso(paidSales)}</strong><p>Paid bookings recorded today</p></article>
        <article><div><span>Occupancy</span><i className={styles.metricViolet}><ChartNoAxesColumnIncreasing /></i></div><strong>{occupancy}%</strong><p>{bookedMinutes ? `${Math.round(bookedMinutes / 60)} booked court hours` : "No booked hours today"}</p><b><span style={{ width: `${occupancy}%` }} /></b></article>
        <article><div><span>Bookings</span><i className={styles.metricCoral}><CalendarDays /></i></div><strong>{todayBookings.length}</strong><p>{checkedInCount} arrival{checkedInCount === 1 ? "" : "s"} checked in</p></article>
        <article><div><span>Payment review</span><i className={styles.metricAmber}><CircleCheck /></i></div><strong>{paymentReviews.length}</strong><p>{paymentReviews.length ? `${formatPeso(paymentReviews.reduce((sum, item) => sum + item.amount, 0))} awaiting approval` : "Everything is reconciled"}</p></article>
      </section>

      <div className={styles.rallyDashboardGrid}>
        <section className={cx(styles.rallySurface, styles.rallyCourtsPanel)}>
          <div className={styles.rallySectionHeading}><div><h2>Live court status</h2><p>A fast read on every playing surface</p></div><button type="button" onClick={() => goTo("schedule")}>Open full schedule <ArrowRight /></button></div>
          <div className={styles.rallyCourtGrid}>
            {courtStatus.map(({ court, state, tone, note, hours }, index) => (
              <article className={cx(styles.rallyCourtCard, styles[`rallyTone_${tone}`])} key={court.id}>
                <div className={styles.rallyCourtVisual}><span>{index + 1}</span><i /><i /></div>
                <div className={styles.rallyCourtCopy}><span>{court.description || court.surface || "Court"}</span><h3>{court.name}</h3><p>{note}</p></div>
                <div className={styles.rallyCourtState}><span>{state}</span><small>{hours}</small></div>
              </article>
            ))}
          </div>
        </section>

        <aside className={cx(styles.rallySurface, styles.rallyArrivalsPanel)}>
          <div className={styles.rallySectionHeading}><div><h2>Next arrivals</h2><p>The next 150 minutes</p></div><span className={styles.rallyLive}><i /> Live</span></div>
          <div className={styles.rallyArrivalList}>
            {arrivals.length ? arrivals.map(({ booking }, index) => (
              <div className={styles.rallyArrival} key={booking.bookingId}>
                <div className={styles.rallyTimeRail}><strong>{booking.time.split(/[–-]/)[0].trim()}</strong><i className={index % 2 ? styles.railMint : styles.railBlue} />{index < arrivals.length - 1 && <span />}</div>
                <div><strong>{booking.customer}</strong><p>{booking.court}</p></div>
                <StatusPill status={booking.status} />
              </div>
            )) : <div className={styles.rallyEmpty}><Clock3 /><strong>No upcoming arrivals</strong><span>New bookings will appear here.</span></div>}
          </div>
          <button type="button" className={styles.rallyWideButton} onClick={() => goTo("schedule")}>Manage arrivals</button>
        </aside>
      </div>

      <div className={styles.rallyLowerGrid}>
        <section className={cx(styles.rallySurface, styles.rallyAttentionPanel)}>
          <div className={styles.rallySectionHeading}><div><h2>Needs attention</h2><p>Clear these before the next rush</p></div></div>
          <button type="button" onClick={() => paymentReviews.length ? openNeedsReview() : goTo("finance")}><i className={styles.attentionAmber}><WalletCards /></i><span><strong>{paymentReviews.length || "No"} payment{paymentReviews.length === 1 ? "" : "s"} to review</strong><small>{paymentReviews.length ? "Proof uploaded and ready for review" : "All uploaded proofs have been resolved"}</small></span><ArrowRight /></button>
          <button type="button" onClick={() => goTo("blocks")}><i className={styles.attentionBlue}><Settings2 /></i><span><strong>{attentionCourts.length || "No"} court issue{attentionCourts.length === 1 ? "" : "s"}</strong><small>{attentionCourts.length ? attentionCourts.map((court) => court.name).join(", ") : "Every active court is available"}</small></span><ArrowRight /></button>
        </section>

        <section className={styles.rallyQuickCard}>
          <div><span>Front desk shortcuts</span><h2>Keep the queue moving.</h2><p>Common actions stay synchronized across the team.</p></div>
          <div className={styles.rallyQuickActions}>
            <button type="button" onClick={() => goTo("schedule")} disabled={!can("booking:create")}><Plus /><span><strong>Add booking</strong><small>Walk-in or phone</small></span></button>
            <button type="button" onClick={() => goTo("customers")} disabled={!can("customer:view")}><Users /><span><strong>Find player</strong><small>Visits and notes</small></span></button>
            <button type="button" onClick={() => goTo("finance")} disabled={!can("finance:view")}><WalletCards /><span><strong>Review payments</strong><small>{paymentReviews.length} waiting</small></span></button>
          </div>
        </section>
      </div>
    </div>
  );
}

function PickPointToday({
  snapshot,
  can,
  goTo,
  openNeedsReview,
}: {
  snapshot: ManagementSnapshot;
  can: (capability: ManagementCapability) => boolean;
  goTo: (view: View) => void;
  openNeedsReview: () => void;
}) {
  const today = manilaCalendarDate();
  const bookings = snapshot.bookings
    .filter((booking) => booking.bookingDate === today && booking.status !== "cancelled" && booking.status !== "expired")
    .sort((left, right) => (left.startTime ?? "").localeCompare(right.startTime ?? ""));
  const reviews = snapshot.bookings.filter((booking) =>
    booking.paymentEvidence?.reviewable === true || booking.status === "payment_attention"
  );
  const unavailableCourts = snapshot.courts.filter((court) => court.status !== "active");
  const date = new Intl.DateTimeFormat("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: activeTenant.identity.timezone,
  }).format(new Date());

  return (
    <div className={styles.pointToday}>
      <section className={styles.pointWelcome}>
        <div>
          <p className={styles.eyebrow}>{date}</p>
          <h2>Ready for today.</h2>
          <p>{bookings.length ? `${bookings.length} booking${bookings.length === 1 ? "" : "s"} on the court list.` : "The schedule is clear. New bookings will appear here."}</p>
        </div>
        <ActionButton disabled={!can("booking:create")} onClick={() => goTo("schedule")}><Plus /> Add booking</ActionButton>
      </section>

      {(reviews.length > 0 || unavailableCourts.length > 0) && (
        <section className={styles.pointAttention} aria-labelledby="attention-title">
          <div><p className={styles.eyebrow}>Needs attention</p><h2 id="attention-title">A quick check before play</h2></div>
          {reviews.length > 0 && <button type="button" onClick={openNeedsReview}><span>{reviews.length}</span><strong>Payment review</strong><small>Open bookings</small><ArrowRight /></button>}
          {unavailableCourts.length > 0 && <button type="button" onClick={() => goTo("schedule")}><span>{unavailableCourts.length}</span><strong>Court unavailable</strong><small>Open schedule</small><ArrowRight /></button>}
        </section>
      )}

      <section className={styles.pointDay} aria-labelledby="today-list-title">
        <header><div><p className={styles.eyebrow}>Court list</p><h2 id="today-list-title">Today’s bookings</h2></div><button type="button" onClick={() => goTo("schedule")}>Full schedule <ArrowRight /></button></header>
        {bookings.length ? (
          <div className={styles.pointBookingList}>
            {bookings.map((booking) => (
              <button type="button" key={booking.bookingId} onClick={() => goTo("bookings")}>
                <time>{booking.time}</time>
                <span><strong>{booking.customer}</strong><small>{booking.court}</small></span>
                <StatusPill status={booking.status} />
                <ArrowRight aria-hidden="true" />
              </button>
            ))}
          </div>
        ) : (
          <div className={styles.pointEmpty}><CalendarDays /><strong>No bookings today</strong><p>Use Add booking for a walk-in or phone reservation.</p></div>
        )}
      </section>

      <section className={styles.pointCourts} aria-labelledby="court-status-title">
        <header><p className={styles.eyebrow}>At a glance</p><h2 id="court-status-title">Courts</h2></header>
        <div>{snapshot.courts.map((court, index) => <article key={court.id}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{court.name}</strong><small>{court.surface || court.description || "Pickleball court"}</small></div><b data-status={court.status}>{court.status === "active" ? "Open" : court.status === "maintenance" ? "Maintenance" : "Closed"}</b></article>)}</div>
      </section>
    </div>
  );
}

function SetupLanding({ snapshot, goTo, openSettings }: { snapshot: ManagementSnapshot; goTo: (view: View) => void; openSettings: (section: "courts" | "schedule" | "business" | "rules") => void }) {
  const complete = snapshot.setup.filter((item) => item.complete).length;
  const items: Array<{ title: string; detail: string; open: () => void; icon: ReactNode }> = [
    { title: "Courts", detail: "Names, availability and playing surfaces", open: () => openSettings("courts"), icon: <MapPin /> },
    { title: "Hours & rates", detail: "Opening times, duration and court prices", open: () => openSettings("schedule"), icon: <Clock3 /> },
    { title: "Payments", detail: "Customer payment methods and instructions", open: () => openSettings("business"), icon: <WalletCards /> },
    { title: "Booking rules", detail: "Notice, cancellations and customer policy", open: () => openSettings("rules"), icon: <CircleCheck /> },
    { title: "Team access", detail: "Your current role and permissions", open: () => goTo("access"), icon: <Users /> },
    { title: "Launch", detail: `${complete} of ${snapshot.setup.length} checks ready`, open: () => goTo("launch"), icon: <Sparkles /> },
  ];
  return (
    <section className={styles.pointSetup} aria-labelledby="setup-title">
      <header><p className={styles.eyebrow}>Club essentials</p><h2 id="setup-title">Set up PickPoint</h2><p>Everything the booking page needs, kept in one place.</p></header>
      <div>{items.map((item) => <button type="button" key={item.title} onClick={item.open}><i>{item.icon}</i><span><strong>{item.title}</strong><small>{item.detail}</small></span><ArrowRight /></button>)}</div>
    </section>
  );
}

function OverviewView({
  snapshot,
  can,
  goTo,
  openNeedsReview,
  request,
  loadPaymentReceipt,
}: {
  snapshot: ManagementSnapshot;
  can: (capability: ManagementCapability) => boolean;
  goTo: (view: View) => void;
  openNeedsReview: () => void;
  request: (action: ConfirmAction) => void;
  loadPaymentReceipt: (verificationId: string) => Promise<PaymentReceiptView>;
}) {
  return <PickPointToday snapshot={snapshot} can={can} goTo={goTo} openNeedsReview={openNeedsReview} />;
  /* Legacy dashboard markup is retained below temporarily while the remaining
     management views continue to share its payment-review workspace. */
  const [reviewingBookingId, setReviewingBookingId] = useState<string | null>(null);
  const reviewReturnRef = useRef<HTMLButtonElement | null>(null);
  const paymentInboxHeadingRef = useRef<HTMLHeadingElement>(null);
  const canReviewPayments = can("payment:review");
  const completed = snapshot.setup.filter((item) => item.complete).length;
  const progress = snapshot.setup.length
    ? Math.round((completed / snapshot.setup.length) * 100)
    : 0;
  const operationalBookings = snapshot.bookings.filter(
    (booking) => booking.status !== "cancelled" && booking.status !== "expired",
  );
  const loadedBookings = operationalBookings.slice(0, 3);
  const isPreview = snapshot.tenant.mode === "preview";
  const readinessItems = isPreview ? snapshot.setup.slice(4) : snapshot.setup;
  const paidRevenue = operationalBookings
    .filter((booking) => booking.payment === "paid")
    .reduce((total, booking) => total + booking.amount, 0);
  const reviewQueue = snapshot.bookings.filter((booking) =>
    booking.paymentEvidence?.reviewable === true
  );
  const processingQueue = snapshot.bookings.filter((booking) =>
    booking.status === "receipt_processing"
  );
  const awaitingReceiptQueue = snapshot.bookings.filter((booking) =>
    booking.status === "awaiting_receipt"
  );
  const paymentAttentionQueue = snapshot.bookings.filter((booking) =>
    booking.status === "payment_attention"
  );
  const inboxBooking = reviewQueue[0] ?? processingQueue[0] ??
    paymentAttentionQueue[0] ?? awaitingReceiptQueue[0] ?? null;
  const reviewing = reviewingBookingId
    ? snapshot.bookings.find((booking) =>
        booking.bookingId === reviewingBookingId && booking.paymentEvidence?.reviewable === true
      ) ?? null
    : null;
  const paidCount = operationalBookings.filter((booking) => booking.payment === "paid").length;

  const closePaymentReview = () => {
    const returnTarget = reviewReturnRef.current;
    setReviewingBookingId(null);
    window.requestAnimationFrame(() => {
      if (returnTarget?.isConnected) returnTarget.focus();
      else paymentInboxHeadingRef.current?.focus();
    });
  };

  useEffect(() => {
    if (!reviewingBookingId || (reviewing && canReviewPayments)) return;
    const timer = window.setTimeout(() => {
      setReviewingBookingId(null);
      paymentInboxHeadingRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [canReviewPayments, reviewing, reviewingBookingId]);

  return (
    <>
      <section
        className={styles.metricGrid}
        aria-label={isPreview ? "Preview key numbers" : "Loaded tenant result"}
      >
        <MetricCard label={isPreview ? "Loaded revenue" : "Paid revenue"} value={formatPeso(paidRevenue)} note={isPreview ? "Preview operations dataset" : "From paid bookings in this live view"} accent />
        {isPreview ? (
          <MetricCard label="Courts" value={String(snapshot.courts.length)} note="Provisional court inventory" />
        ) : (
          <MetricCard label="Needs review" value={String(reviewQueue.length)} note={reviewQueue.length ? "Submitted receipts waiting for a decision" : "Payment inbox is clear"} />
        )}
        <MetricCard label="Active bookings" value={String(operationalBookings.length)} note={`${paidCount} paid · ${operationalBookings.length - paidCount} other payment states`} />
        <MetricCard label="Players" value={String(snapshot.customers.length)} note={isPreview ? "Preview customer profiles" : "Derived from the loaded bookings"} />
      </section>

      {!isPreview && (
        <section
          className={cx(styles.paymentInbox, reviewQueue.length > 0 && styles.paymentInboxReady)}
          aria-labelledby="payment-inbox-title"
        >
          <header className={styles.paymentInboxHeader}>
            <div>
              <p className={styles.eyebrow}>Payment inbox</p>
              <h2 id="payment-inbox-title" ref={paymentInboxHeadingRef} tabIndex={-1}>
                {reviewQueue.length > 0
                  ? `${reviewQueue.length} ${reviewQueue.length === 1 ? "receipt" : "receipts"} ready for review`
                  : processingQueue.length > 0
                    ? "A receipt is being checked"
                    : paymentAttentionQueue.length > 0
                      ? "A payment needs attention"
                      : awaitingReceiptQueue.length > 0
                        ? "Waiting for player receipts"
                        : "Payments are up to date"}
              </h2>
              <p>
                {reviewQueue.length > 0
                  ? "Compare the private receipt with the booking and make the final decision here."
                  : processingQueue.length > 0
                    ? "The receipt is uploaded. It will become ready for review automatically when verification finishes."
                    : paymentAttentionQueue.length > 0
                      ? "The returned booking, payment, and receipt states need a fresh review."
                      : awaitingReceiptQueue.length > 0
                        ? "These holds are waiting for players to submit payment proof."
                        : "No submitted receipts need a decision right now."}
              </p>
            </div>
            <div className={styles.paymentInboxCounts} aria-label="Payment queue counts" aria-live="polite">
              <span><strong>{reviewQueue.length}</strong> To review</span>
              <span><strong>{processingQueue.length}</strong> Processing</span>
              <span><strong>{paymentAttentionQueue.length}</strong> Attention</span>
              <span><strong>{awaitingReceiptQueue.length}</strong> Awaiting receipt</span>
            </div>
          </header>

          {inboxBooking ? (
            <article className={styles.paymentInboxItem}>
              <div className={styles.paymentInboxIdentity}>
                <Avatar initials={inboxBooking.initials} tone={0} />
                <div>
                  <StatusPill status={inboxBooking.status} />
                  <h3>{inboxBooking.customer}</h3>
                  <p>{inboxBooking.reference}</p>
                </div>
              </div>
              <dl className={styles.paymentInboxFacts}>
                <div>
                  <dt>Expected total</dt>
                  <dd>{formatPeso(inboxBooking.paymentEvidence?.expectedAmount ?? inboxBooking.amount)}</dd>
                </div>
                <div>
                  <dt>Court & session</dt>
                  <dd>{inboxBooking.court} · {inboxBooking.date}, {inboxBooking.time}</dd>
                </div>
                <div>
                  <dt>Receipt submitted</dt>
                  <dd>
                    {inboxBooking.paymentEvidence?.submittedAt ? (
                      <time dateTime={inboxBooking.paymentEvidence?.submittedAt}>
                        {new Date(inboxBooking.paymentEvidence?.submittedAt ?? "").toLocaleString("en-PH", {
                          timeZone: activeTenant.identity.timezone,
                        })}
                      </time>
                    ) : "Not uploaded yet"}
                  </dd>
                </div>
              </dl>
              <div className={styles.paymentInboxAction}>
                {inboxBooking.paymentEvidence?.reviewable ? (
                  <ActionButton
                    disabled={!canReviewPayments}
                    onClick={(event) => {
                      reviewReturnRef.current = event.currentTarget;
                      setReviewingBookingId(inboxBooking.bookingId);
                    }}
                    ariaLabel={`Review payment receipt for ${inboxBooking.customer}, booking ${inboxBooking.reference}`}
                  >
                    Review payment
                  </ActionButton>
                ) : (
                  <span className={styles.paymentInboxWaiting}>{STATUS_LABEL[inboxBooking.status]}</span>
                )}
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={() => reviewQueue.length > 0 ? openNeedsReview() : goTo("bookings")}
                >
                  {reviewQueue.length > 0 ? "View all to review" : "View booking"} <span aria-hidden="true">→</span>
                </button>
              </div>
            </article>
          ) : (
            <div className={styles.paymentInboxClear} role="status">
              <span aria-hidden="true">✓</span>
              <div><strong>All caught up</strong><small>New receipt uploads will appear here automatically.</small></div>
              <button type="button" className={styles.textButton} onClick={() => goTo("bookings")}>View bookings</button>
            </div>
          )}

        </section>
      )}

      {!isPreview && canReviewPayments && reviewing?.paymentEvidence && (
        <PaymentReviewWorkspace
          key={reviewing!.paymentEvidence!.verificationId}
          booking={reviewing!}
          can={can}
          request={request}
          loadPaymentReceipt={loadPaymentReceipt}
          onClose={closePaymentReview}
          headingLevel="h2"
        />
      )}

      <section className={styles.overviewGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <p className={styles.eyebrow}>{isPreview ? "Preview court flow" : "Tenant booking result"}</p>
              <h2>{isPreview ? "Next on court" : "Recently loaded bookings"}</h2>
            </div>
            <button className={styles.textButton} type="button" onClick={() => goTo("schedule")}>
              Full schedule <span aria-hidden="true">→</span>
            </button>
          </div>
          <div className={styles.nextList}>
            {loadedBookings.map((booking, index) => (
              <article className={styles.nextBooking} key={booking.id}>
                <div className={styles.nextTime}>
                  <strong>{booking.time.split("–")[0]}</strong>
                  <span>{booking.date}</span>
                </div>
                <Avatar initials={booking.initials} tone={index} />
                <div className={styles.nextIdentity}>
                  <strong>{booking.customer}</strong>
                  <span>
                    {booking.court} · {booking.duration}
                  </span>
                </div>
                <StatusPill status={booking.status} />
              </article>
            ))}
            {loadedBookings.length === 0 && (
              <div className={styles.statePanel} role="status">
                <p className={styles.eyebrow}>{isPreview ? "No active bookings" : "No bookings returned"}</p>
                <h3>{isPreview ? "The next reservation will appear here." : "No booking rows were returned for this query."}</h3>
              </div>
            )}
          </div>
        </article>

        <article className={cx(styles.panel, styles.readinessPanel)}>
          <div className={styles.readinessHead}>
            <div>
              <p className={styles.eyebrow}>Launch readiness</p>
              <h2>{isPreview ? "Preview" : "Tenant"} is {progress}% ready</h2>
            </div>
            <strong className={styles.progressNumber}>{progress}%</strong>
          </div>
          <div
            className={styles.progressTrack}
            role="progressbar"
            aria-label="Tenant setup progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <span style={{ width: `${progress}%` }} />
          </div>
          <ul className={styles.readinessList}>
            {readinessItems.map((item) => (
              <li key={item.id}>
                <span className={styles.todoMark} aria-hidden="true">
                  {item.complete ? "✓" : ""}
                </span>
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </div>
              </li>
            ))}
          </ul>
          <ActionButton
            variant="secondary"
            className={styles.fullButton}
            onClick={() => goTo("settings")}
          >
            Review setup
          </ActionButton>
        </article>
      </section>

    </>
  );
}

function PaymentReviewWorkspace({
  booking,
  can,
  request,
  loadPaymentReceipt,
  onClose,
  headingLevel = "h3",
}: {
  booking: Booking;
  can: (capability: ManagementCapability) => boolean;
  request: (action: ConfirmAction) => void;
  loadPaymentReceipt: (verificationId: string) => Promise<PaymentReceiptView>;
  onClose: () => void;
  headingLevel?: "h2" | "h3";
}) {
  const [receiptView, setReceiptView] = useState<PaymentReceiptView | null>(null);
  const [receiptState, setReceiptState] = useState<"loading" | "ready" | "error">("loading");
  const [receiptReload, setReceiptReload] = useState(0);
  const [reviewNote, setReviewNote] = useState("");
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);
  const evidence = booking.paymentEvidence;
  const verificationId = evidence?.verificationId ?? null;
  const ReviewHeading = headingLevel;

  useEffect(() => {
    window.requestAnimationFrame(() => reviewHeadingRef.current?.focus());
  }, []);

  useEffect(() => {
    let active = true;
    if (!verificationId || !evidence?.reviewable) return;
    loadPaymentReceipt(verificationId).then((view) => {
      if (!active) return;
      setReceiptView(view);
      setReceiptState("ready");
    }).catch(() => {
      if (active) setReceiptState("error");
    });
    return () => { active = false; };
  }, [evidence?.reviewable, loadPaymentReceipt, receiptReload, verificationId]);

  if (!evidence) return null;

  return (
    <section className={styles.paymentReviewWorkspace} aria-labelledby="payment-review-title">
      <header className={styles.paymentReviewHeader}>
        <div>
          <p className={styles.eyebrow}>Private payment evidence</p>
          <ReviewHeading id="payment-review-title" ref={reviewHeadingRef} tabIndex={-1}>
            Review {booking.reference}
          </ReviewHeading>
          <p>Compare the submitted proof with the booking before making a final decision.</p>
        </div>
        <button type="button" className={styles.textButton} onClick={onClose}>
          Close review
        </button>
      </header>

      <div className={styles.paymentReviewLayout}>
        <div className={styles.receiptViewer}>
          {receiptState === "loading" && (
            <div className={styles.receiptState} role="status">
              <span className={styles.spinner} aria-hidden="true" />
              <strong>Opening the private receipt…</strong>
              <small>The signed image link expires automatically.</small>
            </div>
          )}
          {receiptState === "error" && (
            <div className={styles.receiptState} role="alert">
              <strong>Receipt image unavailable</strong>
              <small>Nothing was approved or rejected. Retry the protected image request.</small>
              <ActionButton
                variant="secondary"
                onClick={() => {
                  setReceiptView(null);
                  setReceiptState("loading");
                  setReceiptReload((value) => value + 1);
                }}
              >
                Retry image
              </ActionButton>
            </div>
          )}
          {receiptState === "ready" && receiptView && (
            <>
              {/* Signed receipt URLs are short-lived and must bypass the public image optimizer. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={receiptView.signedUrl}
                alt={`Payment receipt submitted for booking ${booking.reference}`}
                onError={() => setReceiptState("error")}
              />
              <a href={receiptView.signedUrl} target="_blank" rel="noreferrer">Open full image</a>
            </>
          )}
        </div>

        <div className={styles.paymentReviewDetails}>
          <div className={styles.reviewDecisionSummary}>
            <span>Expected total</span>
            <strong>{formatPeso(evidence.expectedAmount ?? booking.amount)}</strong>
            <small>Verify this against the receipt; detected values are hints, not proof of transfer.</small>
          </div>
          {receiptView && receiptView.status !== "manual_review" && (
            <p className={styles.inlineError} role="status">
              This receipt is already {receiptView.status.replaceAll("_", " ")}. Refresh bookings before taking another action.
            </p>
          )}
          <dl className={styles.paymentFacts}>
            <div><dt>Player</dt><dd>{booking.customer}</dd></div>
            <div><dt>Contact</dt><dd>{booking.phone}</dd></div>
            <div><dt>Court and time</dt><dd>{booking.court} · {booking.date}, {booking.time}</dd></div>
            <div><dt>Payment method</dt><dd>{evidence.paymentMethod?.toUpperCase() ?? "Not returned"}</dd></div>
            <div><dt>Player-entered reference</dt><dd>{evidence.submittedReference ?? "Not provided"}</dd></div>
            <div><dt>Receipt-detected reference</dt><dd>{evidence.detectedReference ?? "Not detected"}</dd></div>
            <div><dt>Receipt submitted</dt><dd>{new Date(evidence.submittedAt).toLocaleString("en-PH", { timeZone: activeTenant.identity.timezone })}</dd></div>
            <div><dt>Payment attempt opened</dt><dd>{evidence.paymentAttemptedAt ? new Date(evidence.paymentAttemptedAt).toLocaleString("en-PH", { timeZone: activeTenant.identity.timezone }) : "Not returned"}</dd></div>
            <div><dt>Receipt date detected</dt><dd>{evidence.receiptIssuedAt ? new Date(evidence.receiptIssuedAt).toLocaleString("en-PH", { timeZone: activeTenant.identity.timezone }) : "Not detected"}</dd></div>
            <div><dt>Amounts detected</dt><dd>{evidence.detectedAmounts.length === 0 ? "Not detected" : evidence.detectedAmounts.map(formatPeso).join(", ")}</dd></div>
            <div><dt>Automated confidence</dt><dd>{evidence.confidence === null ? "Not returned" : `${Math.round(evidence.confidence * 100)}%`}</dd></div>
            <div><dt>Evidence status</dt><dd>Manual review required</dd></div>
          </dl>
          {evidence.flags.length > 0 && (
            <div className={styles.reviewFlags} aria-label="Automated receipt checks">
              <strong>Checks to inspect</strong>
              <ul>{evidence.flags.map((flag) => <li key={flag}>{flag.replaceAll("_", " ")}</li>)}</ul>
            </div>
          )}
          <label className={styles.field}>
            <span>Review note <small>required when rejecting</small></span>
            <textarea
              rows={3}
              maxLength={1_000}
              value={reviewNote}
              onChange={(event) => setReviewNote(event.target.value)}
              placeholder="Add a clear reason for the decision"
            />
          </label>
        </div>
      </div>

      <footer className={styles.paymentReviewActions}>
        <span>The server applies each decision to the current booking or balance-payment state.</span>
        <div>
          <ActionButton
            variant="danger"
            disabled={!can("payment:review") || receiptState !== "ready" || receiptView?.status !== "manual_review" || reviewNote.trim().length < 3}
            onClick={() => request({
              title: `Reject payment for ${booking.reference}?`,
              detail: `${booking.customer}'s receipt will be rejected. The server will update the booking or balance request according to its current state.`,
              confirmLabel: "Reject receipt",
              actionType: "payment:reject",
              resourceId: evidence.verificationId,
              payload: { note: reviewNote },
              tone: "danger",
              onSuccess: onClose,
            })}
          >
            Reject receipt
          </ActionButton>
          <ActionButton
            disabled={!can("payment:review") || receiptState !== "ready" || receiptView?.status !== "manual_review"}
            onClick={() => request({
              title: `Approve ${formatPeso(evidence.expectedAmount ?? booking.amount)} for ${booking.reference}?`,
              detail: "Confirm only after the receipt reference, amount, player, court, and session all match. This marks the booking paid and confirmed.",
              confirmLabel: "Approve & confirm booking",
              actionType: "payment:approve",
              resourceId: evidence.verificationId,
              payload: { note: reviewNote },
              onSuccess: onClose,
            })}
          >
            Approve payment
          </ActionButton>
        </div>
      </footer>
    </section>
  );
}

function BookingsView({
  bookings,
  courts,
  can,
  request,
  goTo,
  isPreview,
  initialStatus,
  loadPaymentReceipt,
  loadReschedulePreview,
}: {
  bookings: Booking[];
  courts: ManagementSnapshot["courts"];
  can: (capability: ManagementCapability) => boolean;
  request: (action: ConfirmAction) => void;
  goTo: (view: View) => void;
  isPreview: boolean;
  initialStatus: BookingFilter;
  loadPaymentReceipt: (verificationId: string) => Promise<PaymentReceiptView>;
  loadReschedulePreview: (bookingReference: string, date: string) => Promise<ManagementBookingReschedulePreview>;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<BookingFilter>(initialStatus);
  const [creating, setCreating] = useState(false);
  const [rescheduling, setRescheduling] = useState<Booking | null>(null);
  const [reviewingBookingId, setReviewingBookingId] = useState<string | null>(null);
  const reviewReturnRef = useRef<HTMLButtonElement | null>(null);
  const bookingListHeadingRef = useRef<HTMLHeadingElement>(null);
  const rescheduleDialogRef = useRef<HTMLFormElement>(null);
  const canReviewPayments = can("payment:review");
  const [manual, setManual] = useState({
    courtId: courts[0]?.id ?? "",
    bookingDate: manilaCalendarDate(),
    startTime: "06:00",
    durationHours: "1",
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    paymentMethod: "gcash",
    paymentReference: "",
  });
  const [rescheduleDraft, setRescheduleDraft] = useState({
    newDate: manilaCalendarDate(),
    newStartTime: "",
    reasonCode: "customer_request",
    publicReason: "Requested by the customer",
    internalNote: "",
    notifyCustomer: true,
  });
  const [reschedulePreview, setReschedulePreview] = useState<ManagementBookingReschedulePreview | null>(null);
  const [reschedulePreviewState, setReschedulePreviewState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const filterCounts = BOOKING_FILTERS.reduce<Record<BookingFilter, number>>(
    (counts, filter) => ({
      ...counts,
      [filter.value]: bookings.filter((booking) => bookingMatchesFilter(booking, filter.value)).length,
    }),
    { all: 0, awaiting: 0, pending: 0, confirmed: 0, completed: 0, cancelled: 0 },
  );
  const filtered = bookings.filter((booking) => {
    const matchesQuery = `${booking.customer} ${booking.id} ${booking.court}`
      .toLowerCase()
      .includes(query.trim().toLowerCase());
    const matchesStatus = bookingMatchesFilter(booking, status);
    return matchesQuery && matchesStatus;
  });
  const reviewing = reviewingBookingId
    ? bookings.find((booking) =>
        booking.bookingId === reviewingBookingId && booking.paymentEvidence?.reviewable === true
      ) ?? null
    : null;
  const today = manilaCalendarDate();
  const todayCount = bookings.filter((booking) => booking.bookingDate === today).length;
  const activeCount = bookings.filter((booking) => !["cancelled", "expired", "completed"].includes(booking.status)).length;
  const reviewCount = bookings.filter((booking) => booking.paymentEvidence?.reviewable === true).length;

  const closePaymentReview = () => {
    const returnTarget = reviewReturnRef.current;
    setReviewingBookingId(null);
    window.requestAnimationFrame(() => {
      if (returnTarget?.isConnected) returnTarget.focus();
      else bookingListHeadingRef.current?.focus();
    });
  };

  useEffect(() => {
    if (!reviewingBookingId || (reviewing && canReviewPayments)) return;
    const timer = window.setTimeout(() => {
      setReviewingBookingId(null);
      bookingListHeadingRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [canReviewPayments, reviewing, reviewingBookingId]);

  useEffect(() => {
    if (!rescheduling || !rescheduleDraft.newDate || isPreview) return;
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      setReschedulePreviewState("loading");
      setReschedulePreview(null);
      try {
        const preview = await loadReschedulePreview(rescheduling.reference, rescheduleDraft.newDate);
        if (!active) return;
        setReschedulePreview(preview);
        setReschedulePreviewState("ready");
        setRescheduleDraft((current) => preview.options.some((option) =>
          option.startTime === current.newStartTime && option.available && !option.paymentRequired
        ) ? current : { ...current, newStartTime: "" });
      } catch {
        if (!active) return;
        setReschedulePreviewState("error");
      }
    });
    return () => {
      active = false;
    };
  }, [isPreview, loadReschedulePreview, rescheduleDraft.newDate, rescheduling]);

  const selectedRescheduleOption = reschedulePreview?.options.find((option) =>
    option.startTime === rescheduleDraft.newStartTime
  ) ?? null;
  const groupedRescheduleOptions = useMemo(() => {
    const groups = [
      { label: "Morning", range: "Before 12 PM", options: [] as NonNullable<typeof reschedulePreview>["options"] },
      { label: "Afternoon", range: "12 PM–5 PM", options: [] as NonNullable<typeof reschedulePreview>["options"] },
      { label: "Evening", range: "After 5 PM", options: [] as NonNullable<typeof reschedulePreview>["options"] },
    ];
    for (const option of reschedulePreview?.options ?? []) {
      const hour = Number(option.startTime.split(":")[0]);
      groups[hour < 12 ? 0 : hour < 17 ? 1 : 2].options.push(option);
    }
    return groups.filter((group) => group.options.length);
  }, [reschedulePreview]);

  useEffect(() => {
    if (!rescheduling) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => rescheduleDialogRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRescheduling(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [rescheduling]);

  const openPaymentReview = (booking: Booking, trigger: HTMLButtonElement) => {
    reviewReturnRef.current = trigger;
    setReviewingBookingId(booking.bookingId);
  };

  return (
    <section className={styles.bookingsWorkspace} aria-labelledby="booking-list-title">
      <header className={styles.bookingsHero}>
        <div>
          <p className={styles.eyebrow}>Reservation desk</p>
          <h2 id="booking-list-title" ref={bookingListHeadingRef} tabIndex={-1}>Keep every booking clear and moving.</h2>
          <p>Search reservations, review payment state, and handle changes from one organized workspace.</p>
        </div>
        <ActionButton
          disabled={!can("booking:create") || (!isPreview && !courts.length)}
          onClick={() => isPreview ? goTo("schedule") : setCreating((value) => !value)}
        >
          <span aria-hidden="true">＋</span> {creating ? "Close form" : "New booking"}
        </ActionButton>
      </header>

      <div className={styles.bookingOverview} aria-label="Booking overview">
        <article><span>Total bookings</span><strong>{bookings.length}</strong><small>Loaded tenant reservations</small></article>
        <article><span>Active queue</span><strong>{activeCount}</strong><small>Open booking workflows</small></article>
        <article><span>Today</span><strong>{todayCount}</strong><small>{todayCount === 1 ? "Reservation today" : "Reservations today"}</small></article>
        <article><span>Payment review</span><strong>{reviewCount}</strong><small>{reviewCount ? "Receipt action needed" : "Everything reconciled"}</small></article>
      </div>
      {!isPreview && creating && (
        <form className={styles.compactActionForm} onSubmit={(event) => {
          event.preventDefault();
          request({
            title: "Create this paid booking?",
            detail: `${manual.customerName.trim()} · ${manual.bookingDate} at ${wholeHourLabel(manual.startTime)} · ${manual.durationHours} ${manual.durationHours === "1" ? "hour" : "hours"}. Availability and the total are recalculated by the server.`,
            confirmLabel: "Create paid booking",
            actionType: "booking:create",
            payload: {
              courtId: manual.courtId,
              bookingDate: manual.bookingDate,
              startTime: manual.startTime,
              durationHours: Number(manual.durationHours),
              customer: {
                name: manual.customerName,
                email: manual.customerEmail,
                phone: manual.customerPhone,
              },
              payment: {
                method: manual.paymentMethod,
                reference: manual.paymentMethod === "cash" ? null : manual.paymentReference,
              },
              clientRequestId: crypto.randomUUID(),
            },
            onSuccess: () => setCreating(false),
          });
        }}>
          <div className={styles.compactFormHeading}>
            <div><p className={styles.eyebrow}>Owner-assisted</p><h3>New paid booking</h3></div>
            <span>Live quote at save</span>
          </div>
          <div className={styles.compactFields}>
            <label className={styles.field}><span>Court</span><select required value={manual.courtId} onChange={(event) => setManual({ ...manual, courtId: event.target.value })}>{courts.map((court) => <option key={court.id} value={court.id}>{court.name}</option>)}</select></label>
            <label className={styles.field}><span>Date</span><input required type="date" min={manilaCalendarDate()} value={manual.bookingDate} onChange={(event) => setManual({ ...manual, bookingDate: event.target.value })} /></label>
            <label className={styles.field}><span>Starts</span><select value={manual.startTime} onChange={(event) => setManual({ ...manual, startTime: event.target.value })}>{wholeHourOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label className={styles.field}><span>Hours</span><select value={manual.durationHours} onChange={(event) => setManual({ ...manual, durationHours: event.target.value })}>{Array.from({ length: 18 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></label>
            <label className={styles.field}><span>Player name</span><input required minLength={2} maxLength={100} value={manual.customerName} onChange={(event) => setManual({ ...manual, customerName: event.target.value })} /></label>
            <label className={styles.field}><span>Phone</span><input required minLength={7} maxLength={30} value={manual.customerPhone} onChange={(event) => setManual({ ...manual, customerPhone: event.target.value })} /></label>
            <label className={styles.field}><span>Email <small>optional</small></span><input type="email" maxLength={254} value={manual.customerEmail} onChange={(event) => setManual({ ...manual, customerEmail: event.target.value })} /></label>
            <label className={styles.field}><span>Paid through</span><select value={manual.paymentMethod} onChange={(event) => setManual({ ...manual, paymentMethod: event.target.value })}><option value="gcash">GCash</option><option value="maya">Maya</option><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="other">Other</option></select></label>
            {manual.paymentMethod !== "cash" && <label className={styles.field}><span>Payment reference</span><input required minLength={4} maxLength={100} value={manual.paymentReference} onChange={(event) => setManual({ ...manual, paymentReference: event.target.value })} /></label>}
          </div>
          <div className={styles.compactFormActions}><span>Only a server-authorized owner can complete this write.</span><ActionButton type="submit">Review booking</ActionButton></div>
        </form>
      )}
      {!isPreview && rescheduling && (
        <div className={styles.rescheduleBackdrop} onMouseDown={(event) => {
          if (event.target === event.currentTarget) setRescheduling(null);
        }}>
        <form
          ref={rescheduleDialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="reschedule-dialog-title"
          tabIndex={-1}
          className={styles.rescheduleWorkspace}
          onSubmit={(event) => {
          event.preventDefault();
          if (!selectedRescheduleOption || !selectedRescheduleOption.available || selectedRescheduleOption.paymentRequired) return;
          request({
            title: `Move ${rescheduling.reference}?`,
            detail: `Move ${rescheduling.customer} to ${rescheduleDraft.newDate}, ${wholeHourLabel(selectedRescheduleOption.startTime)}–${wholeHourLabel(selectedRescheduleOption.endTime)} on ${reschedulePreview?.booking.courtName ?? rescheduling.court}. Availability will be checked again before saving.`,
            confirmLabel: "Reschedule booking",
            actionType: "booking:update",
            resourceId: rescheduling.bookingId,
            payload: {
              bookingId: rescheduling.bookingId,
              bookingReference: rescheduling.reference,
              ...rescheduleDraft,
              internalNote: rescheduleDraft.internalNote || null,
              idempotencyKey: crypto.randomUUID(),
            },
            onSuccess: () => setRescheduling(null),
          });
        }}>
          <header className={styles.rescheduleHeader}>
            <div>
              <p className={styles.eyebrow}>Reschedule · {rescheduling.reference}</p>
              <h3 id="reschedule-dialog-title">Choose a better time</h3>
              <span>{rescheduling.customer} · {rescheduling.date} · {rescheduling.time}</span>
            </div>
            <button type="button" className={styles.rescheduleClose} onClick={() => setRescheduling(null)} aria-label="Close reschedule"><X aria-hidden="true" size={18} /></button>
          </header>

          <div className={styles.rescheduleBody}>
            <div className={styles.rescheduleStep}><span>1</span><div><strong>Choose a date</strong><small>We’ll show only valid times for this booking.</small></div></div>
            <div className={styles.rescheduleControls}>
              <label className={styles.field}><span>New date</span><input required type="date" min={manilaCalendarDate()} value={rescheduleDraft.newDate} onChange={(event) => setRescheduleDraft({ ...rescheduleDraft, newDate: event.target.value, newStartTime: "" })} /></label>
              <div><span>Court</span><strong>{reschedulePreview?.booking.courtName ?? rescheduling.court}</strong><small>Same court</small></div>
              <div><span>Duration</span><strong>{reschedulePreview ? `${reschedulePreview.booking.durationHours} ${reschedulePreview.booking.durationHours === 1 ? "hour" : "hours"}` : rescheduling.duration}</strong><small>Duration preserved</small></div>
            </div>

            <section className={styles.rescheduleAvailability} aria-labelledby="available-slot-title" aria-busy={reschedulePreviewState === "loading"}>
              <div className={styles.rescheduleAvailabilityHeader}>
                <div className={styles.rescheduleStep}><span>2</span><div><strong id="available-slot-title">Choose an available time</strong><small>Availability is checked live for {rescheduleDraft.newDate}.</small></div></div>
              </div>
            {reschedulePreviewState === "loading" ? (
              <div className={styles.rescheduleLoading} role="status"><span /><span /><span /><p>Checking available court-hours…</p></div>
            ) : reschedulePreviewState === "error" ? (
              <div className={styles.rescheduleError} role="alert"><strong>Availability could not be loaded.</strong><span>Choose the date again or refresh the workspace.</span></div>
            ) : reschedulePreview?.options.length ? (
              <div className={styles.rescheduleTimeGroups} role="listbox" aria-label={`Available times on ${rescheduleDraft.newDate}`}>
                {groupedRescheduleOptions.map((group) => <section className={styles.rescheduleTimeGroup} key={group.label}>
                  <header><strong>{group.label}</strong><span>{group.range} · {group.options.filter((option) => option.available && !option.paymentRequired).length} open</span></header>
                  <div className={styles.rescheduleSlotGrid}>
                  {group.options.map((option) => {
                  const selected = option.startTime === rescheduleDraft.newStartTime;
                  const disabled = !option.available || option.paymentRequired;
                  const stateLabel = !option.available
                    ? option.unavailableReason?.replaceAll("_", " ") || "Booked"
                    : option.paymentRequired
                      ? `Add ${formatPeso(option.additionalAmount)}`
                      : "Available";
                  return (
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      disabled={disabled}
                      key={option.startTime}
                      className={cx(styles.rescheduleSlot, selected && styles.rescheduleSlotSelected, disabled && styles.rescheduleSlotUnavailable, option.paymentRequired && styles.rescheduleSlotPayment)}
                      onClick={() => setRescheduleDraft({ ...rescheduleDraft, newStartTime: option.startTime })}
                    >
                      <span className={styles.rescheduleSlotCheck} aria-hidden="true">{selected ? "✓" : ""}</span>
                      <strong>{wholeHourLabel(option.startTime)}</strong>
                      <span>{wholeHourLabel(option.startTime)}–{wholeHourLabel(option.endTime)}</span>
                      <small>{selected ? "Selected" : stateLabel}</small>
                    </button>
                  );
                  })}
                  </div>
                </section>)}
              </div>
            ) : reschedulePreviewState === "ready" ? (
              <div className={styles.rescheduleError} role="status"><strong>No time slots were returned.</strong><span>Try another date.</span></div>
            ) : null}
            </section>

            <details className={styles.rescheduleDetailsDisclosure}>
              <summary>Change details <span>Reason, customer message, and notification</span></summary>
              <div className={styles.rescheduleDetails}>
                <label className={styles.field}><span>Reason</span><select value={rescheduleDraft.reasonCode} onChange={(event) => setRescheduleDraft({ ...rescheduleDraft, reasonCode: event.target.value })}><option value="customer_request">Customer request</option><option value="weather">Weather</option><option value="court_maintenance">Court maintenance</option><option value="schedule_conflict">Schedule conflict</option><option value="admin_correction">Admin correction</option><option value="other">Other</option></select></label>
                <label className={styles.field}><span>Customer-facing reason</span><input required minLength={3} maxLength={500} value={rescheduleDraft.publicReason} onChange={(event) => setRescheduleDraft({ ...rescheduleDraft, publicReason: event.target.value })} /></label>
                <label className={cx(styles.field, styles.fieldWide)}><span>Internal note <small>optional</small></span><input minLength={3} maxLength={1000} value={rescheduleDraft.internalNote} onChange={(event) => setRescheduleDraft({ ...rescheduleDraft, internalNote: event.target.value })} /></label>
                <label className={styles.switchLabel}><input type="checkbox" checked={rescheduleDraft.notifyCustomer} onChange={(event) => setRescheduleDraft({ ...rescheduleDraft, notifyCustomer: event.target.checked })} /><span aria-hidden="true" />Email customer</label>
              </div>
            </details>
          </div>

          <footer className={styles.rescheduleFooter}>
            {selectedRescheduleOption ? (
              <div className={styles.rescheduleSelection} role="status">
                <CircleCheck aria-hidden="true" size={20} />
                <div><span>Selected move</span><strong>{reschedulePreview?.booking.courtName ?? rescheduling.court} · {wholeHourLabel(selectedRescheduleOption.startTime)}–{wholeHourLabel(selectedRescheduleOption.endTime)}</strong></div>
                <div><span>New total</span><strong>{formatPeso(selectedRescheduleOption.newTotalAmount)}</strong></div>
              </div>
            ) : <div className={styles.rescheduleFooterHint}><span>Select an available time to continue</span><small>The slot is rechecked before it is moved.</small></div>}
            <ActionButton type="submit" disabled={!selectedRescheduleOption || !selectedRescheduleOption.available || selectedRescheduleOption.paymentRequired}>Review change <ArrowRight aria-hidden="true" size={16} /></ActionButton>
          </footer>
        </form>
        </div>
      )}
      {!isPreview && canReviewPayments && reviewing?.paymentEvidence && (
        <PaymentReviewWorkspace
          key={reviewing.paymentEvidence.verificationId}
          booking={reviewing}
          can={can}
          request={request}
          loadPaymentReceipt={loadPaymentReceipt}
          onClose={closePaymentReview}
        />
      )}
      <section className={styles.bookingRegisterPanel} aria-label="Reservation register">
        <div className={styles.bookingRegisterHeader}>
          <div><p className={styles.eyebrow}>Live register</p><h3>All bookings</h3></div>
          <span className={styles.bookingResultCount} aria-live="polite"><strong>{filtered.length}</strong> of {bookings.length} {bookings.length === 1 ? "booking" : "bookings"}</span>
        </div>

        <div className={styles.bookingToolbar}>
          <label className={styles.searchField}>
            <span className={styles.srOnly}>Search bookings</span>
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search player, reference or court"
            />
          </label>
        </div>

      <div className={styles.bookingFilterRail}>
        <div className={styles.bookingFilters} role="group" aria-label="Filter bookings by workflow status">
          {BOOKING_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className={cx(styles.bookingFilterButton, status === filter.value && styles.bookingFilterActive)}
              aria-pressed={status === filter.value}
              onClick={() => setStatus(filter.value)}
            >
              <span>{filter.label}</span>
              <strong>{filterCounts[filter.value]}</strong>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.bookingColumnsHeader} aria-hidden="true">
        <span>Player</span><span>Reservation</span><span>Payment</span><span>Status</span><span>Actions</span>
      </div>

      {filtered.length ? (
        <ol className={styles.bookingRecordList} aria-label="Booking results">
          {filtered.map((booking, index) => {
            const terminal = booking.status === "completed" ||
              booking.status === "cancelled" || booking.status === "expired";
            const canCancelBooking = !terminal && booking.status !== "checked_in";
            const canMoveBooking = !isPreview && booking.status === "confirmed" && booking.payment === "paid";
            const statusDetail = bookingStatusDetail(booking);
            return (
              <li key={booking.bookingId}>
                <article className={styles.bookingRecord} aria-labelledby={`booking-${booking.bookingId}`}>
                  <header className={styles.bookingRecordIdentity}>
                    <Avatar initials={booking.initials} tone={index} />
                    <div>
                      <h3 id={`booking-${booking.bookingId}`}>{booking.customer}</h3>
                      <span>{booking.reference}</span>
                    </div>
                  </header>

                  <div className={styles.bookingRecordSession}>
                    <span className={styles.bookingRecordLabel}>Session</span>
                    <strong>
                      {booking.bookingDate ? <time dateTime={booking.bookingDate}>{booking.date}</time> : booking.date}
                      <span aria-hidden="true"> · </span>{booking.time}
                    </strong>
                    <span>{booking.court} · {booking.duration}</span>
                  </div>

                  <div className={styles.bookingRecordPayment}>
                    <span className={styles.bookingRecordLabel}>Payment</span>
                    <strong>{formatPeso(booking.amount)}</strong>
                    <span className={cx(styles.paymentLabel, booking.payment === "paid" && styles.paid)}>
                      {PAYMENT_LABEL[booking.payment]}
                    </span>
                  </div>

                  <div className={styles.bookingRecordStatus}><StatusPill status={booking.status} /></div>

                  <footer className={styles.bookingRecordFooter}>
                    <div className={styles.bookingRecordActions}>
                      {booking.paymentEvidence?.reviewable && !terminal && (
                        <button
                          type="button"
                          className={styles.reviewPaymentButton}
                          disabled={!canReviewPayments}
                          onClick={(event) => openPaymentReview(booking, event.currentTarget)}
                        >
                          Review payment
                        </button>
                      )}
                      {canMoveBooking && (
                        <button
                          type="button"
                          className={styles.miniButton}
                          disabled={!can("booking:update") || !booking.bookingDate || !booking.startTime}
                          onClick={() => {
                            setRescheduling(booking);
                            setRescheduleDraft((current) => ({
                              ...current,
                              newDate: booking.bookingDate ?? current.newDate,
                              newStartTime: booking.startTime ?? current.newStartTime,
                            }));
                          }}
                        >
                          Move
                        </button>
                      )}
                      {canCancelBooking && (
                        <button
                          type="button"
                          className={styles.moreButton}
                          disabled={!can("booking:cancel")}
                          aria-label={`Cancel booking ${booking.id}`}
                          onClick={() =>
                            request({
                              title: `Cancel ${booking.id}?`,
                              detail: `${booking.customer} will lose ${booking.court} on ${booking.date}, ${booking.time}. Paid refunds remain owner-assisted.`,
                              confirmLabel: "Cancel booking",
                              actionType: "booking:cancel",
                              resourceId: booking.bookingId,
                              payload: { reason: "Cancelled by venue management" },
                              tone: "danger",
                            })
                          }
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </footer>
                  {statusDetail && <p className={styles.bookingRecordNotice}>{statusDetail}</p>}
                </article>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className={styles.inlineEmpty}>
          <span aria-hidden="true">00</span>
          <h3>No matching bookings</h3>
          <p>Clear the search or choose another workflow status.</p>
          <button type="button" className={styles.textButton} onClick={() => { setQuery(""); setStatus("all"); }}>
            Reset filters
          </button>
        </div>
      )}
      </section>
    </section>
  );
}

const dayOptions = [
  ["Sat", "08"],
  ["Sun", "09"],
  ["Mon", "10"],
  ["Tue", "11"],
  ["Wed", "12"],
  ["Thu", "13"],
  ["Fri", "14"],
];

function ScheduleView({
  snapshot,
  can,
  goTo,
}: {
  snapshot: ManagementSnapshot;
  can: (capability: ManagementCapability) => boolean;
  goTo: (view: View) => void;
}) {
  const [day, setDay] = useState("08");
  const hours = ["8 AM", "10 AM", "12 PM", "2 PM", "4 PM", "6 PM", "8 PM"];
  const slotStyle = (start: string, end: string) => {
    const parse = (value: string) => Number(value.split(":")[0]);
    return {
      "--slot-start": parse(start) - 7,
      "--slot-span": Math.max(1, parse(end) - parse(start)),
    } as CSSProperties;
  };

  if (snapshot.tenant.mode === "live") {
    const activeBookings = snapshot.bookings.filter((booking) =>
      booking.status !== "cancelled" && booking.status !== "expired"
    );
    const loadedEntries = activeBookings.length + snapshot.blocks.length;
    return (
      <section className={styles.panel} aria-labelledby="live-schedule-title">
        <div className={styles.panelHeading}>
          <div>
            <p className={styles.eyebrow}>Server-authorized tenant result</p>
            <h2 id="live-schedule-title">Loaded schedule entries</h2>
          </div>
          <span className={styles.countBadge}>{loadedEntries}</span>
        </div>
        {loadedEntries ? (
          <div className={styles.nextList}>
            {activeBookings.map((booking, index) => (
              <article className={styles.nextBooking} key={booking.id}>
                <div className={styles.nextTime}>
                  <strong>{booking.time}</strong>
                  <span>{booking.date}</span>
                </div>
                <Avatar initials={booking.initials} tone={index} />
                <div className={styles.nextIdentity}>
                  <strong>{booking.customer}</strong>
                  <span>{booking.court} · {booking.duration}</span>
                </div>
                <StatusPill status={booking.status} />
              </article>
            ))}
            {snapshot.blocks.map((block, index) => (
              <article className={styles.nextBooking} key={block.id}>
                <div className={styles.nextTime}>
                  <strong>{block.time}</strong>
                  <span>{block.date}</span>
                </div>
                <Avatar initials="BL" tone={activeBookings.length + index} />
                <div className={styles.nextIdentity}>
                  <strong>{block.publicLabel}</strong>
                  <span>{block.court} · {block.internalReason ? `Private note: ${block.internalReason}` : "No private note returned"}</span>
                </div>
                <span className={styles.previewTag}>Block</span>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.inlineEmpty} role="status">
            <span aria-hidden="true">00</span>
            <h3>No schedule rows were returned</h3>
            <p>The workspace does not substitute preview reservations or court blocks.</p>
          </div>
        )}
      </section>
    );
  }

  return (
    <>
      <section className={styles.scheduleToolbar} aria-label="Schedule dates and actions">
        <div className={styles.dateRail}>
          {dayOptions.map(([weekday, date]) => (
            <button
              type="button"
              key={date}
              className={cx(styles.dateButton, day === date && styles.dateActive)}
              aria-pressed={day === date}
              onClick={() => setDay(date)}
            >
              <span>{weekday}</span>
              <strong>{date}</strong>
            </button>
          ))}
        </div>
        <div className={styles.toolbarActions}>
          <ActionButton variant="secondary" disabled={!can("schedule:block")} onClick={() => goTo("blocks")}>
            Block time
          </ActionButton>
          <ActionButton disabled={!can("booking:create")}>
            <span aria-hidden="true">＋</span> Add booking
          </ActionButton>
        </div>
      </section>

      {day === "08" ? (
        <section className={cx(styles.panel, styles.timelinePanel)} aria-labelledby="timeline-title">
          <div className={styles.panelHeading}>
            <div>
              <p className={styles.eyebrow}>Asia/Manila · Today</p>
              <h2 id="timeline-title">Saturday, August 8</h2>
            </div>
            <div className={styles.legend} aria-label="Schedule legend">
              <span><i className={styles.legendBooking} /> Booking</span>
              <span><i className={styles.legendHold} /> Hold</span>
              <span><i className={styles.legendBlock} /> Block</span>
            </div>
          </div>
          <div className={styles.timelineScroll}>
            <div className={styles.timeline}>
              <div className={styles.timeHeader}>
                <span />
                {hours.map((hour) => <span key={hour}>{hour}</span>)}
              </div>
              {snapshot.courts.map((court) => (
                <div className={styles.courtLane} key={court.id}>
                  <div className={styles.courtLabel}>
                    <strong>{court.name}</strong>
                    <span>{court.surface}</span>
                  </div>
                  <div className={styles.slotGrid}>
                    {Array.from({ length: 14 }).map((_, index) => (
                      <span className={styles.hourCell} key={index} aria-hidden="true" />
                    ))}
                    {snapshot.schedule.filter((slot) => slot.courtId === court.id).map((slot) => (
                      <button
                        type="button"
                        key={slot.id}
                        style={slotStyle(slot.start, slot.end)}
                        className={cx(styles.scheduleSlot, styles[`slot_${slot.kind}`])}
                        aria-label={`${slot.label}, ${slot.start} to ${slot.end}, ${slot.detail}`}
                      >
                        <strong>{slot.label}</strong>
                        <span>{slot.start}–{slot.end}</span>
                        <small>{slot.detail}</small>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.availabilityFoot}>
            <div><strong>11</strong><span>open court-hours</span></div>
            <div><strong>74%</strong><span>expected utilization</span></div>
          </div>
        </section>
      ) : (
        <section className={styles.dayEmpty}>
          <span className={styles.stateMark} aria-hidden="true">{day}</span>
          <p className={styles.eyebrow}>No preview entries</p>
          <h2>This day is clear</h2>
          <p>Use this open schedule to add a reservation or plan court maintenance.</p>
          <ActionButton disabled={!can("booking:create")}>Add first booking</ActionButton>
        </section>
      )}
    </>
  );
}

function BlocksView({
  snapshot,
  can,
  request,
}: {
  snapshot: ManagementSnapshot;
  can: (capability: ManagementCapability) => boolean;
  request: (action: ConfirmAction) => void;
}) {
  const isLive = snapshot.tenant.mode === "live";
  const canManage = can("schedule:block");
  const minimumDate = isLive ? manilaCalendarDate() : "2026-08-08";
  const [scope, setScope] = useState<"" | "all" | "court">("");
  const [courtId, setCourtId] = useState("");
  const [date, setDate] = useState(isLive ? "" : "2026-08-10");
  const [from, setFrom] = useState(isLive ? "" : "12:00");
  const [to, setTo] = useState(isLive ? "" : "13:00");
  const [publicLabel, setPublicLabel] = useState(isLive ? "" : "Maintenance");
  const [reason, setReason] = useState(isLive ? "" : "Court maintenance");
  const selectedCourt = snapshot.courts.find((item) => item.id === courtId);
  const courtLabel = scope === "all" ? "all courts" : selectedCourt?.name ?? "one court";
  const fromHour = Number.parseInt(from.slice(0, 2), 10);
  const toHour = Number.parseInt(to.slice(0, 2), 10);
  const durationHours = Number.isFinite(fromHour) && Number.isFinite(toHour) && toHour > fromHour
    ? toHour - fromHour
    : 0;
  const formComplete = Boolean(
    scope && (scope === "all" || selectedCourt) && date && date >= minimumDate &&
    from && to && publicLabel && durationHours > 0,
  );
  const accessExpiry = snapshot.configuration.blockAccessExpiresAt
    ? new Date(snapshot.configuration.blockAccessExpiresAt)
    : null;
  const accessExpiryLabel = accessExpiry && Number.isFinite(accessExpiry.getTime())
    ? new Intl.DateTimeFormat("en-PH", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: activeTenant.identity.timezone,
      }).format(accessExpiry)
    : null;
  const accessMessage = snapshot.session.isSystemOwner
    ? "System Owner block access is permanent; this account has no tenant membership."
    : snapshot.configuration.blockAccessStatus === "unavailable"
      ? "Block-management access could not be verified for this load. Existing records remain readable."
      : accessExpiryLabel
        ? `${canManage ? "Temporary write access expires" : "The last returned grant expiry is"} ${accessExpiryLabel}.`
        : canManage
          ? "The server returned block-management access without an expiry."
          : "No current write grant was returned. Existing records remain readable.";

  const resetBlockForm = () => {
    setScope("");
    setCourtId("");
    setDate("");
    setFrom("");
    setTo("");
    setPublicLabel("");
    setReason("");
  };
  const blocksHero = (
    <header className={styles.courtBlocksHero}>
      <div>
        <p className={styles.eyebrow}>Court operations</p>
        <h2 id="court-blocks-title">Protect court availability with confidence.</h2>
        <p>Create clean whole-hour closures for maintenance, private events, and operational downtime.</p>
      </div>
      <span className={styles.oneHourBadge}><Clock3 aria-hidden="true" /> Whole hours only</span>
    </header>
  );

  const blockList = (
    <>
      <div className={styles.panelHeading}>
        <div>
          <p className={styles.eyebrow}>Loaded tenant result</p>
          <h2 id="loaded-blocks-title">Loaded block records</h2>
        </div>
        <span className={styles.countBadge}>{snapshot.blocks.length}</span>
      </div>
      <p className={styles.blockAccessMeta} role="status">{accessMessage}</p>
      {snapshot.blocks.length ? (
        <div className={styles.blockList}>
          {snapshot.blocks.map((block) => {
            const calendar = blockCalendarParts(block.dateValue, block.date);
            return (
              <article
                className={styles.blockItem}
                key={block.id}
                aria-label={`${block.publicLabel} block for ${block.court} on ${block.date}`}
              >
                <time className={styles.blockDate} dateTime={block.dateValue ?? undefined}>
                  <span>{calendar.month}</span>
                  <strong>{calendar.day}</strong>
                  <small>{calendar.year}</small>
                </time>
                <div className={styles.blockInfo}>
                  <strong>{block.publicLabel}</strong>
                  <span>{block.court} · {block.time}</span>
                  {block.internalReason && <small className={styles.blockMeta}>Private note: {block.internalReason}</small>}
                  {block.createdBy && <small className={styles.blockMeta}>{block.createdBy}</small>}
                </div>
                {canManage && (
                  <button
                    type="button"
                    className={styles.removeButton}
                    aria-label={`Remove ${block.publicLabel} block record for ${block.court} on ${block.date}`}
                    onClick={() => request({
                      title: "Remove this block record?",
                      detail: `${block.publicLabel} for ${block.court} on ${block.date}, ${block.time}, will be deleted. Other bookings or blocks may still affect availability.`,
                      confirmLabel: "Remove block record",
                      actionType: "schedule:unblock",
                      resourceId: block.id,
                      tone: "danger",
                    })}
                  >
                    Remove record
                  </button>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className={styles.inlineEmpty} role="status">
          <span aria-hidden="true">00</span>
          <h3>No block records were returned</h3>
          <p>The live workspace does not substitute preview closures.</p>
        </div>
      )}
    </>
  );

  if (isLive && !canManage) {
    return (
      <section className={styles.courtBlocksWorkspace} aria-labelledby="court-blocks-title">
        {blocksHero}
        <section className={styles.panel} aria-labelledby="loaded-blocks-title">
          {blockList}
          <div className={styles.noticeBox}>
            <span aria-hidden="true">i</span>
            <p>
              <strong>Read-only for this load.</strong> Creating or removing a block requires a
              server-issued block-management capability; viewing the loaded tenant result does not.
            </p>
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className={styles.courtBlocksWorkspace} aria-labelledby="court-blocks-title">
      {blocksHero}
      <div className={styles.splitLayout}>
      <form
        className={cx(styles.panel, styles.blockForm)}
        onSubmit={(event) => {
          event.preventDefault();
          if (!formComplete) {
            event.currentTarget.reportValidity();
            return;
          }
          request({
            title: `Block ${courtLabel}?`,
            detail: `${date}, ${from}-${to}, labelled "${publicLabel}". This ${durationHours}-hour block will be checked for conflicts before saving.`,
            confirmLabel: "Create block",
            actionType: "schedule:block",
            payload: {
              courtId: scope === "court" ? courtId : null,
              startDate: date,
              endDate: date,
              startsAt: from,
              endsAt: to,
              publicLabel,
              internalReason: reason || null,
            },
            onSuccess: resetBlockForm,
          });
        }}
      >
        <div className={styles.panelHeading}>
          <div>
            <p className={styles.eyebrow}>New availability block</p>
            <h2>Create a court block</h2>
          </div>
          <span className={styles.stepBadge}>Conflict-safe</span>
        </div>
        <div className={cx(styles.formGrid, styles.blockScopeGrid)}>
          <label className={styles.field}>
            <span>Block scope</span>
            <select
              value={scope}
              onChange={(event) => {
                const nextScope = event.target.value as typeof scope;
                setScope(nextScope);
                if (nextScope !== "court") setCourtId("");
              }}
              required
            >
              <option value="" disabled>Choose scope</option>
              <option value="all">All courts</option>
              <option value="court">One court</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>Court name</span>
            <select
              value={courtId}
              onChange={(event) => setCourtId(event.target.value)}
              disabled={scope !== "court"}
              required={scope === "court"}
            >
              <option value="" disabled>{scope === "court" ? "Choose a court" : "Choose one-court scope first"}</option>
              {snapshot.courts.filter((item) => item.status !== "inactive").map((item) => (
                <option value={item.id} key={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Date</span>
            <input type="date" value={date} min={minimumDate} onChange={(event) => setDate(event.target.value)} required />
          </label>
          <label className={styles.field}>
            <span>Start time</span>
            <select value={from} onChange={(event) => {
              const nextStart = event.target.value;
              const nextStartHour = Number.parseInt(nextStart.slice(0, 2), 10);
              setFrom(nextStart);
              if (!to || Number.parseInt(to.slice(0, 2), 10) <= nextStartHour) {
                setTo(`${String(nextStartHour + 1).padStart(2, "0")}:00`);
              }
            }} required>
              <option value="" disabled>Choose an hour</option>
              {wholeHourOptions.filter((option) => option.logicalHour < 23).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className={styles.field}>
            <span>End time</span>
            <select value={to} onChange={(event) => setTo(event.target.value)} disabled={!from} required>
              <option value="" disabled>{from ? "Choose an ending hour" : "Choose a start time first"}</option>
              {wholeHourOptions.filter((option) => option.logicalHour > fromHour).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <div className={styles.blockDurationField}>
            <span>Duration</span>
            <strong>{durationHours ? `${durationHours} ${durationHours === 1 ? "hour" : "hours"}` : "Select a time range"}</strong>
            <small>{durationHours ? `${wholeHourLabel(from)} to ${wholeHourLabel(to)}` : "Start and end must use whole hours"}</small>
          </div>
          <label className={cx(styles.field, styles.fieldWide)}>
            <span>Customer-facing label</span>
            <select value={publicLabel} onChange={(event) => setPublicLabel(event.target.value)} required>
              <option value="" disabled>Choose a label</option>
              <option>Reserved</option>
              <option>Private Event</option>
              <option>Maintenance</option>
              <option>Closed</option>
            </select>
          </label>
          <label className={cx(styles.field, styles.fieldWide)}>
            <span>Private operations note</span>
            <input value={reason} maxLength={200} onChange={(event) => setReason(event.target.value)} />
            <small>This note stays in the protected tenant workspace.</small>
          </label>
        </div>
        <div className={styles.noticeBox}>
          <span aria-hidden="true">i</span>
          <p><strong>Conflict-safe.</strong> A final availability check runs before the block is created. Existing paid bookings are never silently displaced.</p>
        </div>
        {!formComplete && (
          <p className={styles.inlineError}>Choose a scope, future date, valid whole-hour range, and public label before review.</p>
        )}
        <ActionButton type="submit" disabled={!canManage}>
          Review court block
        </ActionButton>
      </form>

      <aside className={styles.panel} aria-labelledby="loaded-blocks-title">{blockList}</aside>
      </div>
    </section>
  );
}

function CustomersView({ snapshot, goTo }: { snapshot: ManagementSnapshot; goTo: (view: View) => void }) {
  const [query, setQuery] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const customers = snapshot.customers.filter((customer) =>
    `${customer.name} ${customer.contact} ${customer.phone ?? ""} ${customer.email ?? ""}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const selectedCustomer = selectedCustomerId
    ? snapshot.customers.find((customer) => customer.id === selectedCustomerId) ?? null
    : null;
  const averageBookings = snapshot.customers.length
    ? snapshot.customers.reduce((total, customer) => total + (customer.totalBookings ?? customer.visits), 0) /
      snapshot.customers.length
    : 0;
  const returningPlayers = snapshot.customers.filter((customer) => (customer.totalBookings ?? customer.visits) > 1).length;
  const returnRate = snapshot.customers.length
    ? Math.round((returningPlayers / snapshot.customers.length) * 100)
    : 0;
  const needsDetails = snapshot.customers.filter((customer) => customer.identityStatus && customer.identityStatus !== "resolved").length;

  useEffect(() => {
    if (!selectedCustomer) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedCustomerId(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedCustomer]);

  return (
    <>
      <section className={styles.customerMetrics} aria-label="Customer summary">
        <div><span>Loaded players</span><strong>{snapshot.customers.length}</strong><small>Tenant-scoped identities</small></div>
        <div><span>Return rate</span><strong>{returnRate}%</strong><small>{returningPlayers} returning {returningPlayers === 1 ? "player" : "players"}</small></div>
        <div><span>Average bookings</span><strong>{averageBookings.toFixed(1)}</strong><small>{needsDetails ? `${needsDetails} ${needsDetails === 1 ? "profile needs" : "profiles need"} details` : "Every profile is linked"}</small></div>
      </section>
      <section className={`${styles.panel} ${styles.customerDirectory}`} aria-labelledby="customer-title">
        <div className={styles.panelHeading}>
          <div><p className={styles.eyebrow}>Tenant directory</p><h2 id="customer-title">Players</h2><span className={styles.customerDirectoryNote}>Matched by mobile number first, then email.</span></div>
          <label className={styles.searchField}>
            <span className={styles.srOnly}>Search customers</span>
            <span aria-hidden="true">⌕</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, mobile or email" />
          </label>
        </div>
        {customers.length ? (
          <div className={styles.customerList}>
            <div className={styles.customerTableHeader} aria-hidden="true">
              <span /><span>Player</span><span>Bookings</span><span>Upcoming</span><span>Paid value</span><span>Last visit</span><span />
            </div>
            {customers.map((customer, index) => (
              <article className={`${styles.customerRow} ${customer.identityStatus && customer.identityStatus !== "resolved" ? styles.customerNeedsDetails : ""}`} key={customer.id}>
                <Avatar initials={customer.initials} tone={index} />
                <div className={styles.customerName}>
                  <strong>{customer.name}</strong>
                  <span>{customer.contact}</span>
                  {customer.identityStatus && customer.identityStatus !== "resolved" ? <small>{customer.identityStatus === "review" ? "Identity review needed" : "Contact details needed"}</small> : null}
                </div>
                <div><span className={styles.mobileLabel}>Bookings</span><strong>{customer.totalBookings ?? customer.visits}</strong><small>{customer.completedVisits ?? 0} completed</small></div>
                <div><span className={styles.mobileLabel}>Upcoming</span><strong>{customer.upcomingBookings ?? 0}</strong><small>{customer.cancelledBookings ?? 0} cancelled</small></div>
                <div><span className={styles.mobileLabel}>Paid value</span><strong>{formatPeso(customer.lifetimeValue)}</strong></div>
                <div><span className={styles.mobileLabel}>Last visit</span><strong>{customer.lastVisit}</strong>{customer.note && <small>{customer.note}</small>}</div>
                <button type="button" className={styles.roundButton} aria-label={`Open ${customer.name}'s profile`} onClick={() => setSelectedCustomerId(customer.id)}>→</button>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.inlineEmpty}><span aria-hidden="true">00</span><h3>No players found</h3><p>Try a name, mobile number, or email.</p></div>
        )}
      </section>
      {selectedCustomer ? (
        <div className={styles.customerDrawerBackdrop} role="presentation" onMouseDown={() => setSelectedCustomerId(null)}>
          <aside className={styles.customerDrawer} role="dialog" aria-modal="true" aria-labelledby="customer-profile-title" onMouseDown={(event) => event.stopPropagation()}>
            <header className={styles.customerProfileHeader}>
              <div className={styles.customerProfileIdentity}>
                <Avatar initials={selectedCustomer.initials} tone={0} />
                <div>
                  <span className={styles.customerProfileEyebrow}>{selectedCustomer.identityStatus === "resolved" || !selectedCustomer.identityStatus ? "Linked player profile" : "Profile needs attention"}</span>
                  <h2 id="customer-profile-title">{selectedCustomer.name}</h2>
                  <p>{selectedCustomer.identityStatus === "review" ? "The contact identifiers conflict and were not merged automatically." : selectedCustomer.note}</p>
                </div>
              </div>
              <button type="button" className={styles.customerDrawerClose} onClick={() => setSelectedCustomerId(null)} aria-label="Close customer profile"><X aria-hidden="true" size={18} /></button>
            </header>
            <section className={styles.customerContactCard} aria-label="Customer contact details">
              <div><Phone aria-hidden="true" size={16} /><span>Mobile</span><strong>{selectedCustomer.phone ?? "Not provided"}</strong></div>
              <div><Mail aria-hidden="true" size={16} /><span>Email</span><strong>{selectedCustomer.email ?? "Not provided"}</strong></div>
            </section>
            <section className={styles.customerProfileMetrics} aria-label="Customer activity summary">
              <div><span>Bookings</span><strong>{selectedCustomer.totalBookings ?? selectedCustomer.visits}</strong></div>
              <div><span>Completed</span><strong>{selectedCustomer.completedVisits ?? 0}</strong></div>
              <div><span>Upcoming</span><strong>{selectedCustomer.upcomingBookings ?? 0}</strong></div>
              <div><span>Paid value</span><strong>{formatPeso(selectedCustomer.lifetimeValue)}</strong></div>
            </section>
            <section className={styles.customerNextBooking}>
              <div><CalendarDays aria-hidden="true" size={18} /><span>Next reservation</span></div>
              <strong>{selectedCustomer.nextBooking ?? "No upcoming reservation"}</strong>
            </section>
            <section className={styles.customerHistory} aria-labelledby="customer-history-title">
              <div className={styles.customerHistoryHeading}><div><p className={styles.eyebrow}>Booking timeline</p><h3 id="customer-history-title">Recent activity</h3></div><span>{selectedCustomer.bookingHistory?.length ?? 0} loaded</span></div>
              {selectedCustomer.bookingHistory?.length ? (
                <ol>
                  {selectedCustomer.bookingHistory.map((booking) => (
                    <li key={booking.bookingId}>
                      <div><strong>{booking.date}</strong><span>{booking.time} · {booking.court}</span></div>
                      <div><StatusPill status={booking.status} /><strong>{formatPeso(booking.amount)}</strong><span>{booking.reference}</span></div>
                    </li>
                  ))}
                </ol>
              ) : <p className={styles.customerHistoryEmpty}>No booking activity was returned for this player.</p>}
            </section>
            <footer className={styles.customerProfileFooter}>
              <span>Only bookings from {snapshot.tenant.name} are included.</span>
              <button type="button" onClick={() => { setSelectedCustomerId(null); goTo("bookings"); }}>Create booking <ArrowRight aria-hidden="true" size={15} /></button>
            </footer>
          </aside>
        </div>
      ) : null}
    </>
  );
}

type CourtDraft = {
  name: string;
  description: string;
  status: "active" | "inactive" | "maintenance";
};

type NewCourtDraft = {
  name: string;
  description: string;
  status: CourtDraft["status"];
  opensAt: string;
  peakStartsAt: string;
  closesAt: string;
  dayRate: string;
  peakRate: string;
};

type SharedScheduleDraft = {
  opensAt: string;
  boundaryAt: string;
  closesAt: string;
  firstHourlyRate: number;
  secondHourlyRate: number;
};

const emptyNewCourt: NewCourtDraft = {
  name: "",
  description: "",
  status: "active",
  opensAt: "06:00",
  peakStartsAt: "16:00",
  closesAt: "22:00",
  dayRate: "300",
  peakRate: "400",
};

const NEW_COURT_INTERNAL_DEFAULTS = {
  minimumHours: 1,
  maximumHours: 18,
  minimumLeadMinutes: 60,
  maximumAdvanceDays: 30,
} as const;

const wholeHourOptions: ClockOption[] = Array.from({ length: 24 }, (_, hour) => ({
  value: clockValueForHour(hour)!,
  label: formatClockLabel(hour),
  logicalHour: hour,
  dayOffset: 0,
}));

function newCourtDraftFor(snapshot: ManagementSnapshot): NewCourtDraft {
  const schedule = normalizeTwoBandSchedule(snapshot.configuration.sharedSchedule);
  if (!schedule) return { ...emptyNewCourt };
  return {
    ...emptyNewCourt,
    opensAt: schedule.opensAt,
    peakStartsAt: schedule.bands[0].end,
    closesAt: schedule.closesAt,
    dayRate: String(schedule.bands[0].hourlyRate),
    peakRate: String(schedule.bands[1].hourlyRate),
  };
}

function sharedScheduleDraftFor(
  candidate: ManagementSnapshot["configuration"]["sharedSchedule"],
): SharedScheduleDraft | null {
  const schedule = normalizeTwoBandSchedule(candidate);
  if (!schedule) return null;
  return {
    opensAt: schedule.opensAt,
    boundaryAt: schedule.bands[0].end,
    closesAt: schedule.closesAt,
    firstHourlyRate: schedule.bands[0].hourlyRate,
    secondHourlyRate: schedule.bands[1].hourlyRate,
  };
}

function generatedCourtSlug(name: string, snapshot: ManagementSnapshot): string {
  const normalized = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base = normalized.slice(0, 80).replace(/-+$/g, "") || "court";
  const used = new Set(snapshot.courts.map((court) => court.slug));
  if (!used.has(base)) return base;
  let suffix = 2;
  while (true) {
    const suffixText = `-${suffix}`;
    const stem = base
      .slice(0, 80 - suffixText.length)
      .replace(/-+$/g, "") || "court";
    const candidate = `${stem}${suffixText}`;
    if (!used.has(candidate)) return candidate;
    suffix += 1;
  }
}

function nextCourtSortOrder(snapshot: ManagementSnapshot): number {
  const highest = snapshot.courts.reduce(
    (current, court) => Number.isSafeInteger(court.sortOrder) && court.sortOrder >= 0
      ? Math.max(current, Math.min(court.sortOrder, 10_000))
      : current,
    -1,
  );
  return Math.min(highest + 1, 10_000);
}

function wholeHourLabel(value: string): string {
  return formatClockLabel(value) || value;
}

function boundaryValueForWindow(
  opensAt: string,
  closesAt: string,
  preferredBoundary: string,
): string {
  const options = boundaryOptionsFor(opensAt, closesAt);
  if (options.some((option) => option.value === preferredBoundary)) {
    return preferredBoundary;
  }
  return options[Math.min(options.length - 1, Math.floor(options.length * 2 / 3))]
    ?.value ?? "";
}

function shiftedOperatingWindow(
  current: { opensAt: string; closesAt: string; boundaryAt: string },
  opensAt: string,
): { opensAt: string; closesAt: string; boundaryAt: string } {
  const currentOpen = parseClockHour(current.opensAt);
  const currentClose = logicalCloseHour(current.opensAt, current.closesAt);
  const nextOpen = parseClockHour(opensAt);
  const closeOptions = closeOptionsFor(opensAt);
  const currentCloseIsAvailable = closeOptions.some((option) =>
    option.value === current.closesAt
  );
  const preservedDuration = currentOpen !== null && currentClose !== null &&
      nextOpen !== null
    ? currentClose - currentOpen
    : 16;
  const shiftedClose = nextOpen === null
    ? null
    : clockValueForHour(nextOpen + preservedDuration);
  const closesAt = currentCloseIsAvailable
    ? current.closesAt
    : closeOptions.find((option) => option.value === shiftedClose)?.value ??
      closeOptions[15]?.value ?? "";
  return {
    opensAt,
    closesAt,
    boundaryAt: boundaryValueForWindow(opensAt, closesAt, current.boundaryAt),
  };
}

function operatingWindowSummary(
  opensAt: string,
  closesAt: string,
  boundaryAt: string,
): string {
  const closeHour = logicalCloseHour(opensAt, closesAt);
  const boundaryHour = logicalBoundaryHour(opensAt, closesAt, boundaryAt);
  const openHour = parseClockHour(opensAt);
  const openLabel = wholeHourLabel(opensAt);
  if (closeHour === null) return `Hours: ${openLabel}; choose a different closing time.`;
  const closeLabel = formatClockLabel(closeHour);
  const duration = openHour === null ? null : closeHour - openHour;
  const durationLabel = duration === null
    ? ""
    : ` · ${duration} ${duration === 1 ? "hour" : "hours"}`;
  if (boundaryHour === null) {
    return `Open ${openLabel} · Close ${closeLabel}${durationLabel}; choose an interior peak boundary.`;
  }
  return `Open ${openLabel} · Close ${closeLabel} · Peak ${formatClockLabel(boundaryHour)}${durationLabel}.`;
}

function scheduleForNewCourt(draft: NewCourtDraft): TwoBandSchedule | null {
  return buildTwoBandSchedule({
    opensAt: draft.opensAt,
    closesAt: draft.closesAt,
    boundaryAt: draft.peakStartsAt,
    firstHourlyRate: Number(draft.dayRate),
    secondHourlyRate: Number(draft.peakRate),
  });
}

function courtDraftsFor(snapshot: ManagementSnapshot): Record<string, CourtDraft> {
  return Object.fromEntries(snapshot.courts.map((court) => [court.id, {
    name: court.name,
    description: court.description,
    status: court.status,
  }]));
}

function courtDraftError(draft: CourtDraft): string | null {
  if (!draft.name.trim() || draft.name.trim().length > 120) {
    return "Display name must contain 1 to 120 characters.";
  }
  return null;
}

function newCourtDraftError(draft: NewCourtDraft): string | null {
  const baseError = courtDraftError({
    name: draft.name,
    description: draft.description,
    status: draft.status,
  });
  if (baseError) return baseError;
  if (
    !isWholeHourClock(draft.opensAt) ||
    !isWholeHourClock(draft.closesAt) ||
    (draft.peakStartsAt !== "" && !isWholeHourClock(draft.peakStartsAt))
  ) return "Opening, rate boundary, and closing times must be whole hours.";
  if (logicalCloseHour(draft.opensAt, draft.closesAt) === null) {
    return "Opening and closing times must differ.";
  }
  if (logicalBoundaryHour(
    draft.opensAt,
    draft.closesAt,
    draft.peakStartsAt,
  ) === null) {
    return "Peak start must fall strictly inside the operating window.";
  }
  const dayRate = Number(draft.dayRate);
  const peakRate = Number(draft.peakRate);
  if (
    !Number.isFinite(dayRate) || dayRate <= 0 ||
    !Number.isFinite(peakRate) || peakRate <= 0
  ) return "Both hourly rates must be greater than zero.";
  if (!scheduleForNewCourt(draft)) {
    return "Both hourly rates must be valid amounts with at most two decimal places.";
  }
  return null;
}

type PaymentMethodDraft = Omit<
  BusinessPaymentConfiguration["paymentMethods"][number],
  "sortOrder"
> & { sortOrder: string; originalMethodCode: string | null };

const PAYMENT_QR_METHOD_CODES = new Set(["gcash", "maya", "bdo", "bpi", "gotyme", "pnb"]);

type BusinessDraft = {
  displayName: string;
  contactPhone: string;
  facebookUrl: string;
  tagline: string;
  eventBookingEnabled: boolean;
  replyToEmail: string;
  emailEnabled: boolean;
  paymentMethods: PaymentMethodDraft[];
};

type PolicyDraft = { title: string; intro: string; content: string };

function policyDraftFor(snapshot: ManagementSnapshot): PolicyDraft {
  const policy = snapshot.configuration.policy;
  const source = policy?.draft ?? policy?.publishedPolicy;
  return source
    ? { title: source.title, intro: source.intro, content: source.content }
    : { title: "PickPoint booking rules", intro: "Please review these rules before booking.", content: "" };
}

function policyDraftError(draft: PolicyDraft): string | null {
  if (draft.title.trim().length < 3 || draft.title.trim().length > 180) {
    return "Title must contain 3 to 180 characters.";
  }
  if (draft.intro.trim().length < 10 || draft.intro.trim().length > 1_200) {
    return "Introduction must contain 10 to 1,200 characters.";
  }
  if (draft.content.trim().length < 20 || draft.content.trim().length > 30_000) {
    return "Rules must contain 20 to 30,000 characters.";
  }
  return null;
}

function businessDraftFor(
  configuration: BusinessPaymentConfiguration | null,
): BusinessDraft | null {
  if (!configuration) return null;
  return {
    displayName: configuration.business.displayName,
    contactPhone: configuration.business.contactPhone ?? "",
    facebookUrl: configuration.business.facebookUrl ?? "",
    tagline: configuration.business.tagline ?? "",
    eventBookingEnabled: configuration.business.eventBookingEnabled,
    replyToEmail: configuration.venue.replyToEmail ?? "",
    emailEnabled: configuration.venue.emailEnabled,
    paymentMethods: configuration.paymentMethods.map((method) => ({
      ...method,
      sortOrder: String(method.sortOrder),
      originalMethodCode: method.methodCode,
    })),
  };
}

function businessDraftError(draft: BusinessDraft): string | null {
  if (draft.displayName.trim().length < 2 || draft.displayName.trim().length > 120) {
    return "Business display name must contain 2 to 120 characters.";
  }
  if (
    draft.contactPhone.trim() &&
    (draft.contactPhone.trim().length < 7 || draft.contactPhone.trim().length > 40 ||
      !/^[0-9+(). -]+$/.test(draft.contactPhone.trim()))
  ) return "Contact phone must contain 7 to 40 phone characters.";
  if (
    draft.facebookUrl.trim() &&
    !/^https:\/\/(?:www\.|web\.|m\.)?facebook\.com\/\S+$/i.test(draft.facebookUrl.trim())
  ) return "Facebook URL must be a complete facebook.com HTTPS address.";
  if (draft.tagline.length > 180 || /[\u0000-\u001f\u007f]/.test(draft.tagline)) {
    return "Tagline must be 180 characters or fewer and contain no control characters.";
  }
  if (
    draft.emailEnabled && !draft.replyToEmail.trim()
  ) return "Reply-To email is required when booking emails are enabled.";
  if (
    draft.replyToEmail.trim() &&
    (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.replyToEmail.trim()) ||
      draft.replyToEmail.includes(".."))
  ) return "Reply-To must be a valid email address.";
  if (draft.paymentMethods.length > 10) return "At most 10 payment methods can be saved.";
  const seenCodes = new Set<string>();
  for (const [index, method] of draft.paymentMethods.entries()) {
    const code = method.methodCode.trim().toLowerCase();
    const sortOrder = Number(method.sortOrder);
    if (!/^[a-z][a-z0-9_-]{1,39}$/.test(code)) {
      return `Payment method ${index + 1} needs a unique 2–40 character code.`;
    }
    if (seenCodes.has(code)) return "Payment method codes must be unique.";
    seenCodes.add(code);
    if (method.displayName.trim().length < 2 || method.displayName.trim().length > 80) {
      return `Payment method ${index + 1} needs a 2–80 character display name.`;
    }
    if (method.accountName.trim().length < 2 || method.accountName.trim().length > 120) {
      return `Payment method ${index + 1} needs a 2–120 character account name.`;
    }
    if (method.accountNumber.trim().length < 3 || method.accountNumber.trim().length > 120) {
      return `Payment method ${index + 1} needs a 3–120 character account number.`;
    }
    if (method.instructions && method.instructions.length > 1_000) {
      return `Payment method ${index + 1} instructions must be 1,000 characters or fewer.`;
    }
    if (method.qrUrl) {
      if (!isAllowedCustomerQrUrl(method.qrUrl.trim())) {
        return `Payment method ${index + 1} QR URL must be an approved shared-platform public-storage asset.`;
      }
    }
    if (
      method.sortOrder.trim() === "" || !Number.isSafeInteger(sortOrder) ||
      sortOrder < 0 || sortOrder > 1_000
    ) return `Payment method ${index + 1} sort order must be 0 to 1,000.`;
  }
  return null;
}

function LiveSettingsView({
  snapshot,
  can,
  request,
  uploadPaymentQr,
  onSectionChange,
  initialSection = "courts",
}: {
  snapshot: ManagementSnapshot;
  can: (capability: ManagementCapability) => boolean;
  request: (action: ConfirmAction) => void;
  uploadPaymentQr: (methodCode: string, file: File) => Promise<{ url: string; contentType: string; tenantRevision: string }>;
  onSectionChange: (section: "courts" | "schedule" | "business" | "rules") => void;
  initialSection?: "courts" | "schedule" | "business" | "rules";
}) {
  const [section, setSection] = useState<"courts" | "schedule" | "business" | "rules">(initialSection);
  const [courtDrafts, setCourtDrafts] = useState(() => courtDraftsFor(snapshot));
  const [newCourt, setNewCourt] = useState<NewCourtDraft>(() => newCourtDraftFor(snapshot));
  const [newCourtAttempted, setNewCourtAttempted] = useState(false);
  const [addingCourt, setAddingCourt] = useState(false);
  const addCourtButtonRef = useRef<HTMLButtonElement>(null);
  const newCourtNameRef = useRef<HTMLInputElement>(null);
  const [scheduleDraft, setScheduleDraft] = useState(() =>
    sharedScheduleDraftFor(snapshot.configuration.sharedSchedule)
  );
  const [businessDraft, setBusinessDraft] = useState(() =>
    businessDraftFor(snapshot.configuration.businessPayments)
  );
  const [businessRevision, setBusinessRevision] = useState(
    snapshot.configuration.businessPayments?.revision ?? "",
  );
  const [policyDraft, setPolicyDraft] = useState(() => policyDraftFor(snapshot));
  const [qrUploadState, setQrUploadState] = useState<{
    index: number;
    state: "uploading" | "ready" | "error";
    message: string;
  } | null>(null);
  const persistedPaymentMethodCodes = new Set(
    snapshot.configuration.businessPayments?.paymentMethods.map((method) =>
      method.methodCode.trim().toLowerCase()
    ) ?? [],
  );

  const setCourtField = <Key extends keyof CourtDraft>(
    courtId: string,
    key: Key,
    fieldValue: CourtDraft[Key],
  ) => setCourtDrafts((current) => ({
    ...current,
    [courtId]: { ...current[courtId], [key]: fieldValue },
  }));

  const setNewCourtField = <Key extends keyof NewCourtDraft>(
    key: Key,
    fieldValue: NewCourtDraft[Key],
  ) => setNewCourt((current) => ({ ...current, [key]: fieldValue }));

  const setNewCourtOpen = (opensAt: string) => setNewCourt((current) => {
    const shiftedWindow = shiftedOperatingWindow({
      opensAt: current.opensAt,
      closesAt: current.closesAt,
      boundaryAt: current.peakStartsAt,
    }, opensAt);
    return {
      ...current,
      opensAt: shiftedWindow.opensAt,
      closesAt: shiftedWindow.closesAt,
      peakStartsAt: shiftedWindow.boundaryAt,
    };
  });

  const setNewCourtClose = (closesAt: string) => setNewCourt((current) => ({
    ...current,
    closesAt,
    peakStartsAt: boundaryValueForWindow(
      current.opensAt,
      closesAt,
      current.peakStartsAt,
    ),
  }));

  const openNewCourtForm = () => {
    setNewCourt(newCourtDraftFor(snapshot));
    setNewCourtAttempted(false);
    setAddingCourt(true);
  };

  const cancelNewCourtForm = () => {
    setNewCourt(newCourtDraftFor(snapshot));
    setNewCourtAttempted(false);
    setAddingCourt(false);
    window.requestAnimationFrame(() => {
      addCourtButtonRef.current?.focus();
    });
  };

  useEffect(() => {
    if (addingCourt) newCourtNameRef.current?.focus();
  }, [addingCourt]);

  const setBusinessField = <Key extends keyof Omit<BusinessDraft, "paymentMethods">>(
    key: Key,
    fieldValue: BusinessDraft[Key],
  ) => setBusinessDraft((current) => current ? { ...current, [key]: fieldValue } : current);

  const setPaymentField = <Key extends keyof PaymentMethodDraft>(
    index: number,
    key: Key,
    fieldValue: PaymentMethodDraft[Key],
  ) => setBusinessDraft((current) => current ? {
    ...current,
    paymentMethods: current.paymentMethods.map((method, methodIndex) =>
      methodIndex === index ? { ...method, [key]: fieldValue } : method
    ),
  } : current);

  const uploadQrForMethod = async (index: number, file: File | null) => {
    const method = businessDraft?.paymentMethods[index];
    if (!method || !file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size < 1 || file.size > 2 * 1024 * 1024
    ) {
      setQrUploadState({
        index,
        state: "error",
        message: "Choose a JPG, PNG, or WebP image no larger than 2 MB.",
      });
      return;
    }
    const methodCode = (method.originalMethodCode ?? method.methodCode).trim().toLowerCase();
    if (!PAYMENT_QR_METHOD_CODES.has(methodCode)) {
      setQrUploadState({
        index,
        state: "error",
        message: "QR uploads support GCash, Maya, BDO, BPI, GoTyme, and PNB.",
      });
      return;
    }
    setQrUploadState({ index, state: "uploading", message: `Uploading ${file.name}…` });
    try {
      const asset = await uploadPaymentQr(methodCode, file);
      setPaymentField(index, "qrUrl", asset.url);
      setBusinessRevision(asset.tenantRevision);
      setQrUploadState({
        index,
        state: "ready",
        message: "QR image saved. It is now attached to this customer payment method.",
      });
    } catch (error) {
      setQrUploadState({
        index,
        state: "error",
        message: error instanceof PlatformRequestError
          ? error.message
          : "The QR image could not be uploaded. Refresh the authorized workspace and try again.",
      });
    }
  };

  const schedulePayload = scheduleDraft ? buildTwoBandSchedule({
    opensAt: scheduleDraft.opensAt,
    closesAt: scheduleDraft.closesAt,
    boundaryAt: scheduleDraft.boundaryAt,
    firstHourlyRate: scheduleDraft.firstHourlyRate,
    secondHourlyRate: scheduleDraft.secondHourlyRate,
  }) : null;
  const scheduleDraftIsValid = schedulePayload !== null;

  const setScheduleOpen = (opensAt: string) => setScheduleDraft((current) => {
    if (!current) return current;
    return {
      ...current,
      ...shiftedOperatingWindow(current, opensAt),
    };
  });

  const setScheduleClose = (closesAt: string) => setScheduleDraft((current) => {
    if (!current) return current;
    return {
      ...current,
      closesAt,
      boundaryAt: boundaryValueForWindow(
        current.opensAt,
        closesAt,
        current.boundaryAt,
      ),
    };
  });

  const saveSchedule = () => {
    if (!scheduleDraft || !schedulePayload) return;
    request({
      title: "Save the shared schedule?",
      detail: `${operatingWindowSummary(scheduleDraft.opensAt, scheduleDraft.closesAt, scheduleDraft.boundaryAt)} ${formatPeso(scheduleDraft.firstHourlyRate)}/hour before the peak boundary, then ${formatPeso(scheduleDraft.secondHourlyRate)}/hour. This replaces hours and rates on every PickPoint court atomically.`,
      confirmLabel: "Save shared schedule",
      actionType: "settings:schedule",
      payload: schedulePayload,
    });
  };

  const saveBusiness = () => {
    if (!businessDraft || businessDraftError(businessDraft)) return;
    request({
      title: "Save business and payment settings?",
      detail: `${businessDraft.displayName.trim()} with ${businessDraft.paymentMethods.length} payment ${businessDraft.paymentMethods.length === 1 ? "method" : "methods"}. The payment-method list is replaced in full; platform billing, remittance, and public activation are not changed.`,
      confirmLabel: "Save business & payments",
      actionType: "business:update",
      payload: {
        expectedRevision: businessRevision,
        displayName: businessDraft.displayName.trim(),
        contactPhone: businessDraft.contactPhone.trim() || null,
        facebookUrl: businessDraft.facebookUrl.trim() || null,
        tagline: businessDraft.tagline.trim() || null,
        eventBookingEnabled: businessDraft.eventBookingEnabled,
        venue: {
          replyToEmail: businessDraft.replyToEmail.trim() || null,
          emailEnabled: businessDraft.emailEnabled,
        },
        paymentMethods: businessDraft.paymentMethods.map((method) => ({
          methodCode: method.methodCode.trim().toLowerCase(),
          displayName: method.displayName.trim(),
          accountName: method.accountName.trim(),
          accountNumber: method.accountNumber.trim(),
          instructions: method.instructions?.trim() || null,
          qrUrl: method.qrUrl?.trim() || null,
          isActive: method.isActive,
          sortOrder: Number(method.sortOrder),
        })),
      },
    });
  };

  return (
    <section className={styles.settingsLayout}>
      <nav className={styles.settingsNav} aria-label="Venue settings sections">
        {(["courts", "schedule", "business", "rules"] as const).map((item, index) => (
          <button type="button" key={item} className={section === item ? styles.settingsActive : undefined} onClick={() => { setSection(item); onSectionChange(item); }} aria-current={section === item ? "page" : undefined}>
            <span>0{index + 1}</span>{item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
      </nav>
      <div className={styles.panel}>
        {section === "courts" && (
          <div className={styles.settingsSection}>
            <div className={cx(styles.panelHeading, styles.courtPanelHeading)}>
              <div><p className={styles.eyebrow}>Live inventory</p><h2>Courts</h2></div>
              <div className={styles.courtHeadingActions}>
                <span className={styles.previewTag}>Server records</span>
                <button
                  ref={addCourtButtonRef}
                  type="button"
                  className={cx(styles.button, styles.primary, styles.addCourtButton)}
                  disabled={!can("settings:update") || addingCourt}
                  aria-expanded={addingCourt}
                  aria-controls="new-court-form"
                  onClick={openNewCourtForm}
                >
                  <span aria-hidden="true">+</span> Add court
                </button>
              </div>
            </div>
            <p className={styles.sectionIntro}>Manage the court details customers see, or add another court with its daily hours and rates.</p>
            {addingCourt ? (
              <form
                id="new-court-form"
                className={styles.newCourtInlineForm}
                aria-labelledby="add-court-title"
                aria-describedby="add-court-description"
                onInvalid={() => setNewCourtAttempted(true)}
                onSubmit={(event) => {
                  event.preventDefault();
                  setNewCourtAttempted(true);
                  const error = newCourtDraftError(newCourt);
                  if (error) {
                    event.currentTarget.reportValidity();
                    return;
                  }
                  const courtSchedule = scheduleForNewCourt(newCourt);
                  if (!courtSchedule) return;
                  request({
                    title: `Create ${newCourt.name.trim()}?`,
                    detail: `${newCourt.status} · ${operatingWindowSummary(newCourt.opensAt, newCourt.closesAt, newCourt.peakStartsAt)} ${formatPeso(Number(newCourt.dayRate))}/${formatPeso(Number(newCourt.peakRate))} per hour.`,
                    confirmLabel: `Create ${newCourt.name.trim()}`,
                    actionType: "court:create",
                    payload: {
                      name: newCourt.name.trim(),
                      slug: generatedCourtSlug(newCourt.name, snapshot),
                      description: newCourt.description.trim() || null,
                      status: newCourt.status,
                      sortOrder: nextCourtSortOrder(snapshot),
                      opensAt: newCourt.opensAt,
                      closesAt: newCourt.closesAt,
                      currency: snapshot.tenant.currency,
                      pricingConfig: { regular: {
                        minimumHours: NEW_COURT_INTERNAL_DEFAULTS.minimumHours,
                        maximumHours: NEW_COURT_INTERNAL_DEFAULTS.maximumHours,
                        bands: courtSchedule.bands,
                      } },
                      publicConfig: {
                        minimumLeadMinutes: NEW_COURT_INTERNAL_DEFAULTS.minimumLeadMinutes,
                        maximumAdvanceDays: NEW_COURT_INTERNAL_DEFAULTS.maximumAdvanceDays,
                      },
                    },
                    onSuccess: cancelNewCourtForm,
                  });
                }}
              >
                <div className={styles.newCourtHeading}>
                  <p className={styles.eyebrow}>New court</p>
                  <h3 id="add-court-title">Court details</h3>
                  <p id="add-court-description">Set the customer-facing details, whole-hour schedule, and hourly rates.</p>
                </div>
                <div className={styles.newCourtBasics}>
                  <label className={styles.field}><span>Court name</span><input ref={newCourtNameRef} required maxLength={120} autoComplete="off" placeholder="e.g. Court Alpha" aria-invalid={newCourtAttempted && (!newCourt.name.trim() || newCourt.name.trim().length > 120)} value={newCourt.name} onChange={(event) => setNewCourtField("name", event.target.value)} /></label>
                  <label className={styles.field}><span>Initial status</span><select required value={newCourt.status} onChange={(event) => setNewCourtField("status", event.target.value as NewCourtDraft["status"])}><option value="active">Active</option><option value="maintenance">Maintenance</option><option value="inactive">Inactive</option></select></label>
                  <label className={cx(styles.field, styles.fieldWide)}><span>Description <small>Optional</small></span><textarea rows={2} maxLength={500} placeholder="e.g. Outdoor · standard flooring" value={newCourt.description} onChange={(event) => setNewCourtField("description", event.target.value)} /></label>
                </div>
                <fieldset className={styles.newCourtSchedule}>
                  <legend>Hours and pricing</legend>
                   <p>Choose whole hours only. The peak rate starts at the selected boundary.</p>
                   <div className={styles.newCourtTimes}>
                    <label className={styles.field}><span>Opens</span><select required value={newCourt.opensAt} onChange={(event) => setNewCourtOpen(event.target.value)}>{wholeHourOptions.map((option) => <option key={`open-${option.value}`} value={option.value}>{option.label}</option>)}</select></label>
                    <label className={styles.field}><span>Closes</span><select required value={newCourt.closesAt} onChange={(event) => setNewCourtClose(event.target.value)}>{closeOptionsFor(newCourt.opensAt).map((option) => <option key={`close-${option.value}`} value={option.value}>{option.label}</option>)}</select></label>
                    <label className={styles.field}><span>Peak starts</span><select required value={newCourt.peakStartsAt} onChange={(event) => setNewCourtField("peakStartsAt", event.target.value)}>{boundaryOptionsFor(newCourt.opensAt, newCourt.closesAt).length === 0 && <option value="">No interior hour</option>}{boundaryOptionsFor(newCourt.opensAt, newCourt.closesAt).map((option) => <option key={`peak-${option.value}`} value={option.value}>{option.label}</option>)}</select></label>
                   </div>
                  <p className={styles.operatingSummary} aria-live="polite">{operatingWindowSummary(newCourt.opensAt, newCourt.closesAt, newCourt.peakStartsAt)}</p>
                  <div className={styles.newCourtRates}>
                    <label className={styles.field}><span>Day rate / hour</span><div className={styles.moneyInput}><span aria-hidden="true">₱</span><input aria-label="Day rate per hour in Philippine pesos" required inputMode="decimal" type="number" min="0.01" step="0.01" value={newCourt.dayRate} onChange={(event) => setNewCourtField("dayRate", event.target.value)} /></div></label>
                    <label className={styles.field}><span>Peak rate / hour</span><div className={styles.moneyInput}><span aria-hidden="true">₱</span><input aria-label="Peak rate per hour in Philippine pesos" required inputMode="decimal" type="number" min="0.01" step="0.01" value={newCourt.peakRate} onChange={(event) => setNewCourtField("peakRate", event.target.value)} /></div></label>
                  </div>
                </fieldset>
                <p className={styles.systemDefaultsNote}>The court address, display order, and booking safeguards are set automatically.</p>
                {newCourtAttempted && newCourtDraftError(newCourt) && <p id="new-court-error" className={styles.inlineError} role="alert">{newCourtDraftError(newCourt)}</p>}
                <div className={styles.newCourtActions}>
                  <ActionButton variant="quiet" onClick={cancelNewCourtForm}>Cancel</ActionButton>
                  <ActionButton type="submit" disabled={!can("settings:update")}>Review court</ActionButton>
                </div>
              </form>
            ) : (
              <>
                <div className={styles.courtSettingList}>
                  {snapshot.courts.map((court, index) => {
                    const draft = courtDrafts[court.id];
                    if (!draft) return null;
                    const draftError = courtDraftError(draft);
                    const headingId = `court-${court.id}-title`;
                    const errorId = `court-${court.id}-error`;
                    return (
                      <form
                        key={court.id}
                        onSubmit={(event) => {
                          event.preventDefault();
                          if (draftError) {
                            event.currentTarget.reportValidity();
                            return;
                          }
                          request({
                            title: `Save ${court.name}?`,
                            detail: `${draft.name.trim()} · ${draft.status}. Its internal address, order, schedule, pricing, and booking rules remain untouched.`,
                            confirmLabel: `Save ${court.name}`,
                            actionType: "court:update",
                            resourceId: court.id,
                            payload: {
                              name: draft.name,
                              description: draft.description || null,
                              status: draft.status,
                            },
                          });
                        }}
                      >
                        <article className={styles.courtEditorCard} aria-labelledby={headingId}>
                          <span className={styles.courtMarker}>{String(index + 1).padStart(2, "0")}</span>
                          <div className={styles.courtCardHeading}>
                            <h3 id={headingId}>{court.name}</h3>
                            <p>Live court record</p>
                          </div>
                          <label className={cx(styles.field, styles.courtNameField)}><span>Display name</span><input required aria-invalid={!draft.name.trim() || draft.name.trim().length > 120} aria-describedby={draftError ? errorId : undefined} value={draft.name} maxLength={120} onChange={(event) => setCourtField(court.id, "name", event.target.value)} /></label>
                          <label className={cx(styles.field, styles.courtDescriptionField)}><span>Description</span><input value={draft.description} onChange={(event) => setCourtField(court.id, "description", event.target.value)} /></label>
                          <label className={cx(styles.field, styles.courtStatusField)}><span>Status</span><select value={draft.status} onChange={(event) => setCourtField(court.id, "status", event.target.value as CourtDraft["status"])}><option value="active">Active</option><option value="maintenance">Maintenance</option><option value="inactive">Inactive</option></select></label>
                          <div className={styles.courtCardActions}>
                            {draftError && <p id={errorId} className={styles.fieldError} role="alert">{draftError}</p>}
                            <ActionButton type="submit" disabled={!can("settings:update")} ariaLabel={`Save ${court.name} court settings`}>Save court</ActionButton>
                            <ActionButton variant="danger" disabled={!can("settings:update")} ariaLabel={`Delete ${court.name} court`} onClick={() => request({ title: `Permanently delete ${court.name}?`, detail: "If no protected booking or open-play dependency blocks deletion, the court and its associated block records will be deleted. This cannot be undone.", confirmLabel: `Delete ${court.name}`, actionType: "court:delete", resourceId: court.id, tone: "danger" })}>Delete court</ActionButton>
                          </div>
                        </article>
                      </form>
                    );
                  })}
                </div>
                {!snapshot.courts.length && <div className={styles.inlineEmpty} role="status"><span aria-hidden="true">00</span><h3>No live courts configured</h3><p>Add the first court with its name, whole-hour schedule, and rates. Internal setup values are handled automatically.</p></div>}
              </>
            )}
          </div>
        )}
        {section === "schedule" && (
          <div className={styles.settingsSection}>
            <div className={styles.panelHeading}><div><p className={styles.eyebrow}>PHP · Asia/Manila · Every court</p><h2>Shared schedule</h2></div><span className={styles.previewTag}>Atomic update</span></div>
            {scheduleDraft ? (
              <div className={styles.sharedScheduleEditor}>
                <div className={styles.sharedScheduleRow}>
                  <div className={styles.scheduleDayLabel}><strong>Every day</strong><span>One shared daily window</span></div>
                  <label className={styles.field}><span>Opens</span><select required value={scheduleDraft.opensAt} onChange={(event) => setScheduleOpen(event.target.value)}>{wholeHourOptions.map((option) => <option key={`schedule-open-${option.value}`} value={option.value}>{option.label}</option>)}</select></label>
                  <label className={styles.field}><span>Closes</span><select required value={scheduleDraft.closesAt} onChange={(event) => setScheduleClose(event.target.value)}>{closeOptionsFor(scheduleDraft.opensAt).map((option) => <option key={`schedule-close-${option.value}`} value={option.value}>{option.label}</option>)}</select></label>
                  <label className={styles.field}><span>Rate boundary</span><select required value={scheduleDraft.boundaryAt} onChange={(event) => setScheduleDraft({ ...scheduleDraft, boundaryAt: event.target.value })}>{boundaryOptionsFor(scheduleDraft.opensAt, scheduleDraft.closesAt).length === 0 && <option value="">No interior hour</option>}{boundaryOptionsFor(scheduleDraft.opensAt, scheduleDraft.closesAt).map((option) => <option key={`schedule-boundary-${option.value}`} value={option.value}>{option.label}</option>)}</select></label>
                  <label className={styles.field}><span>First rate / hour</span><div className={styles.moneyInput}><span>₱</span><input required type="number" min="0.01" step="0.01" value={scheduleDraft.firstHourlyRate} onChange={(event) => setScheduleDraft({ ...scheduleDraft, firstHourlyRate: Number(event.target.value) })} /></div></label>
                  <label className={styles.field}><span>Second rate / hour</span><div className={styles.moneyInput}><span>₱</span><input required type="number" min="0.01" step="0.01" value={scheduleDraft.secondHourlyRate} onChange={(event) => setScheduleDraft({ ...scheduleDraft, secondHourlyRate: Number(event.target.value) })} /></div></label>
                </div>
                <p className={styles.operatingSummary} aria-live="polite">{operatingWindowSummary(scheduleDraft.opensAt, scheduleDraft.closesAt, scheduleDraft.boundaryAt)}</p>
                <div className={styles.businessBoundary}><h3>Booking durations are unchanged</h3><p>This shared-schedule contract changes only whole-hour operating windows and rate bands.</p></div>
                {!scheduleDraftIsValid && <p className={styles.inlineError} role="alert">Opening and closing must differ, the boundary must be strictly inside that window, and both rates must be positive amounts.</p>}
                <div className={styles.scheduleSaveRow}><span>Applies to all {snapshot.courts.length} live courts</span><ActionButton disabled={!can("settings:update") || !scheduleDraftIsValid} onClick={saveSchedule}>Save shared schedule</ActionButton></div>
              </div>
            ) : <div className={styles.statePanel} role="status"><p className={styles.eyebrow}>Shared editor unavailable</p><h3>No uniform two-band live schedule was returned.</h3><p>Create the first court or use the platform workspace for schedules with more than two bands. No preview values are substituted.</p></div>}
          </div>
        )}
        {section === "business" && (
          <div className={styles.settingsSection}>
            <div className={styles.panelHeading}><div><p className={styles.eyebrow}>Customer-facing configuration</p><h2>Business & payments</h2></div><span className={styles.previewTag}>Authoritative list</span></div>
            {businessDraft ? (
              <form onSubmit={(event) => { event.preventDefault(); if (!businessDraftError(businessDraft)) saveBusiness(); }}>
                <div className={styles.businessGrid}>
                  <label className={styles.field}><span>Business display name</span><input required minLength={2} maxLength={120} value={businessDraft.displayName} onChange={(event) => setBusinessField("displayName", event.target.value)} /></label>
                  <label className={styles.field}><span>Contact phone</span><input minLength={7} maxLength={40} pattern="[0-9+(). -]+" value={businessDraft.contactPhone} onChange={(event) => setBusinessField("contactPhone", event.target.value)} /></label>
                  <label className={styles.field}><span>Facebook URL</span><input type="url" maxLength={500} value={businessDraft.facebookUrl} onChange={(event) => setBusinessField("facebookUrl", event.target.value)} /></label>
                  <label className={styles.field}><span>Reply-To email</span><input type="email" required={businessDraft.emailEnabled} maxLength={254} value={businessDraft.replyToEmail} onChange={(event) => setBusinessField("replyToEmail", event.target.value)} /></label>
                  <label className={cx(styles.field, styles.fieldWide)}><span>Tagline</span><input maxLength={180} value={businessDraft.tagline} onChange={(event) => setBusinessField("tagline", event.target.value)} /></label>
                  <label className={styles.switchLabel}><input type="checkbox" checked={businessDraft.eventBookingEnabled} onChange={(event) => setBusinessField("eventBookingEnabled", event.target.checked)} /><span aria-hidden="true" />Event booking shown</label>
                  <label className={styles.switchLabel}><input type="checkbox" checked={businessDraft.emailEnabled} onChange={(event) => setBusinessField("emailEnabled", event.target.checked)} /><span aria-hidden="true" />Booking emails enabled</label>
                </div>
                <div className={styles.businessBoundary}><h3>Public activation and remittance stay separate</h3><p>Saving here does not change public booking, global/platform billing, platform remittance, or policy text.</p></div>
                <div className={styles.paymentMethodHeading}><h3>Customer payment methods</h3><ActionButton variant="secondary" disabled={businessDraft.paymentMethods.length >= 10} onClick={() => setBusinessDraft((current) => current ? { ...current, paymentMethods: [...current.paymentMethods, { methodCode: "", originalMethodCode: null, displayName: "", accountName: "", accountNumber: "", instructions: null, qrUrl: null, isActive: true, sortOrder: String(current.paymentMethods.length) }] } : current)}>Add payment method</ActionButton></div>
                <div className={styles.paymentMethodList}>
                  {businessDraft.paymentMethods.map((method, index) => (
                    <article className={styles.paymentMethodCard} key={`payment-method-${index}`} aria-label={`Payment method ${index + 1}`}>
                      <div className={styles.paymentMethodFields}>
                        <label className={styles.field}><span>Method code</span><input required readOnly={method.originalMethodCode !== null} pattern="[a-z][a-z0-9_-]{1,39}" value={method.methodCode} onChange={(event) => setPaymentField(index, "methodCode", event.target.value)} />{method.originalMethodCode && <small>Locked after the payment method is saved.</small>}</label>
                        <label className={styles.field}><span>Public name</span><input required minLength={2} maxLength={80} value={method.displayName} onChange={(event) => setPaymentField(index, "displayName", event.target.value)} /></label>
                        <label className={styles.field}><span>Account name</span><input required minLength={2} maxLength={120} value={method.accountName} onChange={(event) => setPaymentField(index, "accountName", event.target.value)} /></label>
                        <label className={styles.field}><span>Account number</span><input required minLength={3} maxLength={120} value={method.accountNumber} onChange={(event) => setPaymentField(index, "accountNumber", event.target.value)} /></label>
                        <label className={styles.field}><span>Instructions</span><input maxLength={1000} value={method.instructions ?? ""} onChange={(event) => setPaymentField(index, "instructions", event.target.value || null)} /></label>
                        <div className={cx(styles.paymentQrEditor, styles.fieldWide)}>
                          <div className={styles.paymentQrPreview}>
                            {method.qrUrl ? (
                              // Customer-uploaded QR assets are already validated and should render directly.
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={method.qrUrl} alt={`${method.displayName || method.methodCode || `Payment method ${index + 1}`} QR preview`} />
                            ) : (
                              <span><b aria-hidden="true">QR</b><small>No image uploaded</small></span>
                            )}
                          </div>
                          <div className={styles.paymentQrControls}>
                            <strong>Customer QR image</strong>
                            <p>Upload the image here. Customers never see or enter a storage URL.</p>
                            <div className={styles.inlineActions}>
                              <label className={cx(styles.button, styles.secondary, styles.fileButton)}>
                                <input
                                  className={styles.srOnly}
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp"
                                  disabled={!can("payment:asset") || qrUploadState?.state === "uploading" || !PAYMENT_QR_METHOD_CODES.has((method.originalMethodCode ?? method.methodCode).trim().toLowerCase()) || !persistedPaymentMethodCodes.has((method.originalMethodCode ?? method.methodCode).trim().toLowerCase())}
                                  onChange={(event) => {
                                    const file = event.currentTarget.files?.[0] ?? null;
                                    void uploadQrForMethod(index, file);
                                    event.currentTarget.value = "";
                                  }}
                                />
                                {qrUploadState?.index === index && qrUploadState.state === "uploading"
                                  ? "Uploading…"
                                  : method.qrUrl ? "Replace image" : "Upload image"}
                              </label>
                              {method.qrUrl && (
                                <button
                                  type="button"
                                  className={styles.textButton}
                                  disabled={!can("payment:asset") || qrUploadState?.state === "uploading"}
                                  onClick={() => request({
                                    title: `Remove the ${method.displayName || method.methodCode} QR image?`,
                                    detail: "Customers will no longer see this QR at checkout. The account details and payment method stay active.",
                                    confirmLabel: "Remove QR image",
                                    actionType: "payment:asset-remove",
                                    payload: { methodCode: method.originalMethodCode ?? method.methodCode },
                                    tone: "danger",
                                    onSuccess: (result) => {
                                      setPaymentField(index, "qrUrl", null);
                                      if (result.tenantRevision) {
                                        setBusinessRevision(result.tenantRevision);
                                      }
                                      setQrUploadState({
                                        index,
                                        state: "ready",
                                        message: "QR image removed from customer checkout.",
                                      });
                                    },
                                  })}
                                >
                                  Remove from checkout
                                </button>
                              )}
                            </div>
                            <small>
                              {persistedPaymentMethodCodes.has((method.originalMethodCode ?? method.methodCode).trim().toLowerCase())
                                ? "JPG, PNG, or WebP · maximum 2 MB · owner access required"
                                : "Save this payment method first, then upload its QR image."}
                            </small>
                            {qrUploadState?.index === index && (
                              <span
                                className={qrUploadState.state === "error" ? styles.inlineError : styles.inlineSuccess}
                                role={qrUploadState.state === "error" ? "alert" : "status"}
                              >
                                {qrUploadState.message}
                              </span>
                            )}
                          </div>
                        </div>
                        <label className={styles.field}><span>Sort order</span><input required type="number" min="0" max="1000" step="1" value={method.sortOrder} onChange={(event) => setPaymentField(index, "sortOrder", event.target.value)} /></label>
                        <label className={styles.switchLabel}><input type="checkbox" checked={method.isActive} onChange={(event) => setPaymentField(index, "isActive", event.target.checked)} /><span aria-hidden="true" />Active for customers</label>
                      </div>
                      <div className={styles.paymentMethodActions}><ActionButton variant="danger" ariaLabel={`Remove payment method ${index + 1} from this draft`} onClick={() => setBusinessDraft((current) => current ? { ...current, paymentMethods: current.paymentMethods.filter((_, methodIndex) => methodIndex !== index) } : current)}>Remove from draft</ActionButton></div>
                    </article>
                  ))}
                  {!businessDraft.paymentMethods.length && <p className={styles.sectionIntro}>No payment methods are configured. Add a verified customer payment destination before activation.</p>}
                </div>
                {businessDraftError(businessDraft) && <p className={styles.inlineError} role="alert">{businessDraftError(businessDraft)}</p>}
                <div className={styles.billingBoundary}><h3>Platform billing</h3><p>{snapshot.configuration.businessPayments?.platformBilling ? `${snapshot.configuration.businessPayments.platformBilling.feeMode.replaceAll("_", " ")} · ${snapshot.configuration.businessPayments.platformBilling.feeAmount} · ${snapshot.configuration.businessPayments.platformBilling.isConfigured ? "configured" : "not configured"}. Read-only here.` : "Not returned to this role. It is not editable here."}</p></div>
                <div className={styles.settingsFooter}><span>Payment methods are saved as one complete replacement list.</span><ActionButton type="submit" disabled={!can("settings:update") || Boolean(businessDraftError(businessDraft))}>Save business & payments</ActionButton></div>
              </form>
            ) : <div className={styles.statePanel} role="status"><p className={styles.eyebrow}>Editing unavailable</p><h3>Business and payment settings were not complete for this load.</h3><p>{snapshot.configuration.businessPaymentsStatus === "unavailable" ? "Refresh the workspace before retrying; no permission conclusion is inferred from a failed read." : "The response was missing fields required to round-trip the full payment-method list safely. Nothing is editable here."}</p></div>}
          </div>
        )}
        {section === "rules" && (
          <div className={styles.settingsSection}>
            <div className={styles.panelHeading}>
              <div><p className={styles.eyebrow}>Customer policy</p><h2>Booking rules</h2></div>
              <span className={snapshot.configuration.policy?.policyConfigured ? styles.openTag : styles.needsTag}>
                {snapshot.configuration.policy?.policyConfigured ? "Published" : "Draft required"}
              </span>
            </div>
            {snapshot.configuration.policyStatus === "available" && snapshot.configuration.policy ? (
              <>
                <div className={styles.policyStatusLine}>
                  <span>Draft revision</span>
                  <strong>{snapshot.configuration.policy.revision ? new Date(snapshot.configuration.policy.revision).toLocaleString("en-PH") : "First draft"}</strong>
                  <span>Published version</span>
                  <strong>{snapshot.configuration.policy.publishedPolicy?.version ?? "Not published"}</strong>
                </div>
                <div className={styles.ruleList}>
                  <label className={styles.field}><span>Title</span><input required minLength={3} maxLength={180} value={policyDraft.title} onChange={(event) => setPolicyDraft({ ...policyDraft, title: event.target.value })} /></label>
                  <label className={cx(styles.field, styles.fieldWide)}><span>Short introduction</span><textarea required minLength={10} maxLength={1200} rows={2} value={policyDraft.intro} onChange={(event) => setPolicyDraft({ ...policyDraft, intro: event.target.value })} /></label>
                  <label className={cx(styles.field, styles.fieldWide)}><span>Full booking, cancellation and reschedule rules</span><textarea required minLength={20} maxLength={30000} rows={8} value={policyDraft.content} onChange={(event) => setPolicyDraft({ ...policyDraft, content: event.target.value })} /></label>
                </div>
                {policyDraftError(policyDraft) && <p className={styles.inlineError} role="alert">{policyDraftError(policyDraft)}</p>}
                <div className={styles.noticeBox}><span aria-hidden="true">i</span><p><strong>Safe concurrent editing.</strong> Saving uses the loaded revision. If another session changes these rules first, the server rejects this copy and asks you to refresh.</p></div>
                <div className={styles.settingsFooter}>
                  <span>Save a draft anytime. Publish only when this exact text is customer-ready.</span>
                  <div className={styles.inlineActions}>
                    <ActionButton variant="secondary" disabled={!can("settings:update") || !snapshot.configuration.policy.permissions.canManagePolicy || Boolean(policyDraftError(policyDraft))} onClick={() => request({ title: "Save these booking rules as a draft?", detail: "This does not change the rules customers currently see.", confirmLabel: "Save draft", actionType: "policy:update", payload: { expectedRevision: snapshot.configuration.policy!.revision, policy: policyDraft } })}>Save draft</ActionButton>
                    <ActionButton disabled={!can("settings:update") || !snapshot.configuration.policy.permissions.canPublishPolicy || Boolean(policyDraftError(policyDraft))} onClick={() => request({ title: "Publish these booking rules?", detail: "Customers will see this exact title, introduction and policy text. The server assigns the published version.", confirmLabel: "Publish rules", actionType: "policy:publish", payload: { expectedRevision: snapshot.configuration.policy!.revision, policy: policyDraft } })}>Publish rules</ActionButton>
                  </div>
                </div>
              </>
            ) : (
              <div className={styles.statePanel} role="status"><p className={styles.eyebrow}>Policy service unavailable</p><h3>Rules could not be loaded safely.</h3><p>Refresh before editing so the current revision and permissions can be verified.</p></div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function SettingsView({
  snapshot,
  can,
  request,
  initialLiveSection,
  uploadPaymentQr,
  onLiveSectionChange,
}: {
  snapshot: ManagementSnapshot;
  can: (capability: ManagementCapability) => boolean;
  request: (action: ConfirmAction) => void;
  initialLiveSection?: "courts" | "schedule" | "business" | "rules";
  uploadPaymentQr: (methodCode: string, file: File) => Promise<{ url: string; contentType: string; tenantRevision: string }>;
  onLiveSectionChange: (section: "courts" | "schedule" | "business" | "rules") => void;
}) {
  const [section, setSection] = useState<"courts" | "rates" | "hours" | "rules">(
    initialLiveSection === "schedule" ? "hours" : initialLiveSection === "rules" ? "rules" : initialLiveSection === "business" ? "rates" : "courts"
  );
  if (snapshot.tenant.mode === "live") {
    return (
      <LiveSettingsView
        key={JSON.stringify([
          snapshot.courts,
          snapshot.configuration.sharedSchedule,
          snapshot.configuration.businessPayments,
          snapshot.configuration.policy,
          initialLiveSection,
        ])}
        snapshot={snapshot}
        can={can}
        request={request}
        initialSection={initialLiveSection}
        uploadPaymentQr={uploadPaymentQr}
        onSectionChange={onLiveSectionChange}
      />
    );
  }
  const save = (label: string) => request({
    title: `Save ${label.toLowerCase()}?`,
    detail: "These values are still preview configuration. Production writes will require a fresh authorized tenant session.",
    confirmLabel: "Save preview settings",
    actionType: "settings:update",
  });

  return (
    <section className={styles.settingsLayout}>
      <nav className={styles.settingsNav} aria-label="Venue settings sections">
        {(["courts", "rates", "hours", "rules"] as const).map((item, index) => (
          <button type="button" key={item} className={section === item ? styles.settingsActive : undefined} onClick={() => setSection(item)} aria-current={section === item ? "page" : undefined}>
            <span>0{index + 1}</span>{item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
      </nav>
      <div className={styles.panel}>
        {section === "courts" && (
          <div className={styles.settingsSection}>
            <div className={styles.panelHeading}><div><p className={styles.eyebrow}>Inventory</p><h2>Courts</h2></div><span className={styles.previewTag}>Preview values</span></div>
            <p className={styles.sectionIntro}>Court names are customer-facing. Confirm the final venue inventory before activation.</p>
            <div className={styles.courtSettingList}>
              {snapshot.courts.map((court, index) => (
                <article key={court.id}>
                  <span className={styles.courtNumber}>0{index + 1}</span>
                  <label className={styles.field}><span>Display name</span><input defaultValue={court.name} /></label>
                  <label className={styles.field}><span>Surface</span><input defaultValue={court.surface} /></label>
                  <span className={styles.openTag}>Open</span>
                </article>
              ))}
            </div>
            <div className={styles.settingsFooter}><span>{snapshot.courts.length} preview courts</span><ActionButton disabled={!can("settings:update")} onClick={() => save("Courts")}>Save courts</ActionButton></div>
          </div>
        )}
        {section === "rates" && (
          <div className={styles.settingsSection}>
            <div className={styles.panelHeading}><div><p className={styles.eyebrow}>PHP · Per court</p><h2>Rates & durations</h2></div><span className={styles.previewTag}>Preview values</span></div>
            <div className={styles.rateGrid}>
              <label className={styles.field}><span>Day rate / hour</span><div className={styles.moneyInput}><span>₱</span><input type="number" defaultValue="300" /></div><small>6:00 AM–3:59 PM</small></label>
              <label className={styles.field}><span>Peak rate / hour</span><div className={styles.moneyInput}><span>₱</span><input type="number" defaultValue="400" /></div><small>4:00 PM–10:00 PM</small></label>
              <label className={styles.field}><span>Minimum duration</span><select defaultValue="1"><option value="1">1 hour</option><option value="2">2 hours</option></select></label>
              <label className={styles.field}><span>Maximum duration</span><select defaultValue="3"><option value="2">2 hours</option><option value="3">3 hours</option></select></label>
            </div>
            <div className={styles.settingsFooter}><span>Applies to all {snapshot.courts.length} preview courts</span><ActionButton disabled={!can("settings:update")} onClick={() => save("Rates")}>Save rates</ActionButton></div>
          </div>
        )}
        {section === "hours" && (
          <div className={styles.settingsSection}>
            <div className={styles.panelHeading}><div><p className={styles.eyebrow}>Asia/Manila</p><h2>Operating hours</h2></div><span className={styles.previewTag}>Daily schedule</span></div>
            <div className={styles.hoursList}>
              {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => (
                <div key={day}><label className={styles.switchLabel}><input type="checkbox" defaultChecked /><span aria-hidden="true" />{day}</label><input aria-label={`${day} opening time`} type="time" defaultValue="06:00" /><span>to</span><input aria-label={`${day} closing time`} type="time" defaultValue="22:00" /></div>
              ))}
            </div>
            <div className={styles.settingsFooter}><span>Customers see times in Manila time</span><ActionButton disabled={!can("settings:update")} onClick={() => save("Hours")}>Save hours</ActionButton></div>
          </div>
        )}
        {section === "rules" && (
          <div className={styles.settingsSection}>
            <div className={styles.panelHeading}><div><p className={styles.eyebrow}>Customer policy</p><h2>Booking rules</h2></div><span className={styles.needsTag}>Needs approval</span></div>
            <div className={styles.ruleList}>
              <label className={styles.field}><span>Advance notice</span><select defaultValue="60"><option value="60">At least 60 minutes</option><option value="120">At least 2 hours</option></select></label>
              <label className={styles.field}><span>Booking horizon</span><select defaultValue="30"><option value="14">14 days</option><option value="30">30 days</option><option value="60">60 days</option></select></label>
              <label className={styles.field}><span>Cancellation policy</span><textarea defaultValue="Customers may cancel unpaid holds. Paid cancellations require owner assistance." rows={3} /></label>
              <label className={styles.field}><span>Rescheduling policy</span><textarea defaultValue="Rescheduling is owner/admin-assisted and subject to live availability." rows={3} /></label>
            </div>
            <div className={styles.noticeBox}><span aria-hidden="true">!</span><p><strong>Approval required.</strong> These rules are draft language and should be reviewed before customer booking is enabled.</p></div>
            <div className={styles.settingsFooter}><span>Last edited in preview</span><ActionButton disabled={!can("settings:update")} onClick={() => save("Booking rules")}>Save rules</ActionButton></div>
          </div>
        )}
      </div>
    </section>
  );
}

function PickPointLaunch({ snapshot, request }: { snapshot: ManagementSnapshot; request: (action: ConfirmAction) => void }) {
  const checks = snapshot.setup.filter((item) => item.id !== "setup-status" && item.id !== "public-booking");
  const done = checks.filter((item) => item.complete).length;
  const ready = checks.length > 0 && done === checks.length;
  const isLive = snapshot.setup.find((item) => item.id === "public-booking")?.complete === true;
  return (
    <section className={styles.pointLaunch} aria-labelledby="launch-title">
      <header><p className={styles.eyebrow}>Launch</p><h2 id="launch-title">{isLive ? "PickPoint is accepting bookings" : ready ? "Ready to open" : "Finish the essentials"}</h2><p>{done} of {checks.length} checks complete. Nothing goes public until every item is ready.</p></header>
      <div className={styles.pointChecklist}>{checks.map((item) => <article key={item.id} data-complete={item.complete}><span>{item.complete ? "✓" : String(checks.indexOf(item) + 1).padStart(2, "0")}</span><div><strong>{item.label}</strong><p>{item.detail}</p></div></article>)}</div>
      <footer><p>{isLive ? "Customers can use the public booking page." : "Review the guest booking page once more before opening."}</p><ActionButton disabled={isLive || !ready || !snapshot.session.isSystemOwner} onClick={() => request({ title: "Open PickPoint for booking?", detail: "The club will become available on the public booking page after one final readiness check.", confirmLabel: "Open bookings", actionType: "tenant:publish" })}>{isLive ? "Bookings are open" : "Open bookings"}</ActionButton></footer>
    </section>
  );
}

function PickPointAccess({ role, capabilities, isPreview, session }: { role: TenantRole; capabilities: ManagementCapability[]; isPreview: boolean; session?: ManagementSnapshot["session"] }) {
  return (
    <section className={styles.pointAccess} aria-labelledby="access-title">
      <header><p className={styles.eyebrow}>Team access</p><h2 id="access-title">Current access</h2><p>Only verified PickPoint team members can manage club bookings and setup.</p></header>
      <article><Avatar initials={session?.isSystemOwner ? "SO" : "PP"} /><div><strong>{isPreview ? "PickPoint owner" : session?.displayName ?? "Club team member"}</strong><span>{session?.isSystemOwner ? "Owner access" : ROLE_LABEL[role]}</span></div><b>{capabilities.length} permissions</b></article>
      <p className={styles.pointAccessNote}>{isPreview ? "Team invitations will be available after the owner account is connected." : "Access is checked again whenever a change is saved."}</p>
    </section>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function LaunchView({
  snapshot,
  request,
  openSettings,
}: {
  snapshot: ManagementSnapshot;
  request: (action: ConfirmAction) => void;
  openSettings: (section: "business" | "rules") => void;
}) {
  const existingBilling = snapshot.configuration.businessPayments?.platformBilling;
  const [billing, setBilling] = useState({
    feeMode: existingBilling?.feeMode ?? "fixed_per_booking",
    feeAmount: existingBilling ? String(existingBilling.feeAmount) : "",
  });
  const existingDestination = snapshot.configuration.remittanceDestination;
  const [destination, setDestination] = useState({
    method: existingDestination?.method ?? "gcash",
    accountName: existingDestination?.accountName ?? "",
    accountReference: existingDestination?.accountReference ?? "",
    dueDay: existingDestination ? String(existingDestination.dueDay) : "",
    instructions: existingDestination?.instructions ?? "",
  });
  const launchChecks = snapshot.setup.filter((item) =>
    item.id !== "setup-status" && item.id !== "public-booking"
  );
  const ready = launchChecks.length > 0 && launchChecks.every((item) => item.complete);
  const publicBookingIsLive = snapshot.setup.find((item) => item.id === "public-booking")?.complete === true;
  const billingAmount = Number(billing.feeAmount);
  const billingValid = billing.feeAmount.trim() !== "" && Number.isFinite(billingAmount) &&
    billingAmount >= 0 && billingAmount <= (billing.feeMode === "percentage" ? 100 : 9_999_999_999.99);
  const dueDay = Number(destination.dueDay);
  const destinationValid = destination.accountName.trim().length >= 2 &&
    destination.accountReference.trim().length >= 4 && Number.isSafeInteger(dueDay) &&
    dueDay >= 1 && dueDay <= 28;

  if (!snapshot.session.isSystemOwner) {
    return <PermissionPanel role={snapshot.session.role} view="launch" isPreview={false} />;
  }

  return (
    <div className={styles.launchLayout}>
      <section className={styles.panel} aria-labelledby="launch-readiness-title">
        <div className={styles.panelHeading}>
          <div><p className={styles.eyebrow}>Authoritative readiness</p><h2 id="launch-readiness-title">{launchChecks.filter((item) => item.complete).length} of {launchChecks.length} ready</h2></div>
          <span className={publicBookingIsLive || ready ? styles.openTag : styles.needsTag}>{publicBookingIsLive ? "Live" : ready ? "Ready to launch" : "Setup required"}</span>
        </div>
        <div className={styles.launchChecklist}>
          {launchChecks.map((item) => (
            <article key={item.id} className={item.complete ? styles.launchCheckReady : styles.launchCheckMissing}>
              <span aria-hidden="true">{item.complete ? "✓" : "!"}</span>
              <div><strong>{item.label}</strong><p>{item.detail}</p></div>
              {!item.complete && item.id === "email" && <button type="button" className={styles.textButton} onClick={() => openSettings("business")}>Configure email</button>}
              {!item.complete && item.id === "policy" && <button type="button" className={styles.textButton} onClick={() => openSettings("rules")}>Write rules</button>}
            </article>
          ))}
        </div>
      </section>

      <div className={styles.launchEditorGrid}>
        <form className={styles.panel} onSubmit={(event) => {
          event.preventDefault();
          if (!billingValid) return;
          request({
            title: "Save the platform billing rule?",
            detail: "This fee is applied authoritatively by the booking platform. Existing bookings are not recalculated.",
            confirmLabel: "Save billing",
            actionType: "activation:update",
            payload: { platformBilling: { feeMode: billing.feeMode, feeAmount: billingAmount } },
          });
        }}>
          <div className={styles.panelHeading}><div><p className={styles.eyebrow}>Platform revenue</p><h2>Billing rule</h2></div><span className={existingBilling?.isConfigured ? styles.openTag : styles.needsTag}>{existingBilling?.isConfigured ? "Configured" : "Required"}</span></div>
          <div className={styles.compactFields}>
            <label className={styles.field}><span>Fee model</span><select value={billing.feeMode} onChange={(event) => setBilling({ ...billing, feeMode: event.target.value as typeof billing.feeMode })}><option value="fixed_per_booking">Fixed per booking</option><option value="fixed_per_hour">Fixed per hour</option><option value="percentage">Percentage</option></select></label>
            <label className={styles.field}><span>{billing.feeMode === "percentage" ? "Percentage" : "Amount (PHP)"}</span><input required type="number" min="0" max={billing.feeMode === "percentage" ? "100" : undefined} step="0.01" value={billing.feeAmount} onChange={(event) => setBilling({ ...billing, feeAmount: event.target.value })} /></label>
          </div>
          <div className={styles.settingsFooter}><span>System Owner only</span><ActionButton type="submit" disabled={!billingValid}>Save billing</ActionButton></div>
        </form>

        <form className={styles.panel} onSubmit={(event) => {
          event.preventDefault();
          if (!destinationValid) return;
          request({
            title: "Save the remittance destination?",
            detail: "Court owners will use this verified destination when remitting platform fees.",
            confirmLabel: "Save destination",
            actionType: "remittance:update",
            payload: {
              method: destination.method,
              accountName: destination.accountName,
              accountReference: destination.accountReference,
              dueDay,
              instructions: destination.instructions || null,
              removeQr: false,
            },
          });
        }}>
          <div className={styles.panelHeading}><div><p className={styles.eyebrow}>Platform remittance</p><h2>Destination</h2></div><span className={existingDestination ? styles.openTag : styles.needsTag}>{existingDestination ? "Configured" : "Required"}</span></div>
          <div className={styles.compactFields}>
            <label className={styles.field}><span>Method</span><select value={destination.method} onChange={(event) => setDestination({ ...destination, method: event.target.value as RemittanceDestination["method"] })}><option value="gcash">GCash</option><option value="maya">Maya</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></select></label>
            <label className={styles.field}><span>Monthly due day</span><input required type="number" min="1" max="28" step="1" value={destination.dueDay} onChange={(event) => setDestination({ ...destination, dueDay: event.target.value })} /></label>
            <label className={styles.field}><span>Account name</span><input required minLength={2} maxLength={160} value={destination.accountName} onChange={(event) => setDestination({ ...destination, accountName: event.target.value })} /></label>
            <label className={styles.field}><span>Account number / reference</span><input required minLength={4} maxLength={120} value={destination.accountReference} onChange={(event) => setDestination({ ...destination, accountReference: event.target.value })} /></label>
            <label className={cx(styles.field, styles.fieldWide)}><span>Instructions <small>optional</small></span><textarea rows={3} maxLength={2000} value={destination.instructions} onChange={(event) => setDestination({ ...destination, instructions: event.target.value })} /></label>
          </div>
          <div className={styles.settingsFooter}><span>No account value is guessed or prefilled.</span><ActionButton type="submit" disabled={!destinationValid}>Save destination</ActionButton></div>
        </form>
      </div>

      <section className={cx(styles.panel, styles.launchFinal)}>
        <div><p className={styles.eyebrow}>Final server gate</p><h2>{publicBookingIsLive ? "PickPoint is live" : ready ? "PickPoint is ready" : "Complete every missing item"}</h2><p>{publicBookingIsLive ? "Public booking is already enabled. Continue managing venue details without running initial activation again." : "The platform rechecks every requirement atomically. This browser cannot bypass a missing configuration."}</p></div>
        <ActionButton disabled={publicBookingIsLive || !ready} onClick={() => request({ title: "Open PickPoint public booking?", detail: "The platform will run one final authoritative readiness check and enable public booking only if every requirement still passes.", confirmLabel: "Go live", actionType: "tenant:publish" })}>{publicBookingIsLive ? "Already live" : "Go live"}</ActionButton>
      </section>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function AccessView({
  role,
  capabilities,
  isPreview,
  session,
  toolAvailability,
}: {
  role: TenantRole;
  capabilities: ManagementCapability[];
  isPreview: boolean;
  session?: ManagementSnapshot["session"];
  toolAvailability?: ManagementSnapshot["configuration"]["toolAvailability"];
}) {
  const visibleCapabilities: ManagementCapability[] = capabilities.filter(
    (capability) => capability !== "booking:check-in",
  );
  return (
    <section className={cx(styles.accessGrid, !isPreview && styles.accessGridLive)}>
      <article className={styles.panel}>
        <div className={styles.panelHeading}><div><p className={styles.eyebrow}>{isPreview ? "PickPoint team" : "Tenant memberships"}</p><h2>{isPreview ? "4 preview people" : "Membership details unavailable"}</h2></div><span className={styles.previewTag}>{isPreview ? "UI preview" : "Protected"}</span></div>
        <div className={styles.statePanel} role="status"><p className={styles.eyebrow}>Team directory</p><h3>No team list is available yet.</h3><p>Verified PickPoint members will appear here after owner access is connected.</p></div>
      </article>
      <aside className={cx(styles.panel, styles.capabilityPanel)}>
        <p className={styles.eyebrow}>{isPreview ? "Current preview session" : "Current authenticated session"}</p>
        <div className={styles.sessionRole}>
          <span>{ROLE_LABEL[role].slice(0, 2).toUpperCase()}</span>
          <div>
            <h2>{isPreview ? ROLE_LABEL[role] : session?.isSystemOwner ? "System Owner" : `Tenant ${ROLE_LABEL[role]}`}</h2>
            <p>{isPreview ? `${visibleCapabilities.length} preview capabilities` : session?.isSystemOwner ? "Full platform account authority · no tenant membership required" : `${visibleCapabilities.length} account permissions · ${session?.membershipRole ?? "no"} membership`}</p>
          </div>
        </div>
        <ul className={styles.capabilityList}>
          {(Object.keys(CAPABILITY_LABEL) as ManagementCapability[])
            .filter((capability) => visibleCapabilities.includes(capability))
            .map((capability) => <li key={capability} className={styles.granted}>
              <span aria-hidden="true">✓</span>
              {CAPABILITY_LABEL[capability]}
              {!isPreview && toolAvailability && (
                <small className={toolAvailability[capability] === false ? styles.capabilityUnavailable : styles.capabilityReady}>
                  {toolAvailability[capability] === false ? "Unavailable" : "Connected"}
                </small>
              )}
            </li>)}
        </ul>
        <details className={styles.authorityNote}>
          <summary>{isPreview ? "About preview access" : "About access enforcement"}</summary>
          <p>{isPreview ? "The production adapter uses capabilities from the authenticated tenant session. This UI does not grant access." : "A temporary read or setup gap does not remove System Owner authority. Every write is still re-authorized by the server."}</p>
        </details>
      </aside>
    </section>
  );
}

function SignInGate({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <main id="main-content" className={styles.signInShell} tabIndex={-1}>
      <section className={styles.signInCard} aria-labelledby="manager-sign-in-title">
        <div className={styles.signInBrand}>
          <span className={styles.logoPlate}>
            <Image
              className={styles.brandLogo}
              src="/pickpoint-pickleclub-logo.png"
              alt=""
              width={1254}
              height={1254}
              sizes="180px"
              unoptimized
              priority
            />
          </span>
          <span className={styles.srOnly}>PICKPOINT</span>
          <span className={styles.signInContext}>Secure tenant workspace</span>
        </div>
        <span className={styles.liveTag}>Live connection</span>
        <p className={styles.eyebrow}>Management access</p>
        <h1 id="manager-sign-in-title">Welcome back.</h1>
        <p className={styles.signInIntro}>Sign in with a System Owner account or an account authorized for PickPoint. Access is verified by the shared platform.</p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setPending(true);
            setError(null);
            try {
              await signInOwner(email, password);
              await onSignedIn();
            } catch {
              setError("The account could not be verified for this workspace.");
            } finally {
              setPending(false);
            }
          }}
        >
          <label className={styles.field}><span>Email</span><input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label className={styles.field}><span>Password</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          {error && <p className={styles.signInError} role="alert">{error}</p>}
          <ActionButton type="submit" disabled={pending} className={styles.fullButton}>{pending ? "Verifying…" : "Sign in securely"}</ActionButton>
        </form>
        <p className={styles.signInFoot}>The browser sends the fixed <strong>pickpoint-pickleclub</strong> slug only. Tenant scope and role permissions are enforced by the server.</p>
      </section>
    </main>
  );
}

export default function ManagePage() {
  const runtimeMode = platformMode();
  const isPreview = runtimeMode === "preview";
  const [view, setView] = useState<View>("overview");
  const [role] = useState<TenantRole>("owner");
  const [previewState, setPreviewState] = useState<PreviewState>("ready");
  const [snapshot, setSnapshot] = useState<ManagementSnapshot | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [confirmPending, setConfirmPending] = useState(false);
  const [refreshPending, setRefreshPending] = useState(false);
  const [syncPending, setSyncPending] = useState(false);
  const [accountPending, setAccountPending] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [settingsSection, setSettingsSection] = useState<"courts" | "schedule" | "business" | "rules">("courts");
  const [bookingFilter, setBookingFilter] = useState<BookingFilter>("all");
  const [analyticsPeriod, setAnalyticsPeriod] = useState<AnalyticsPeriod>("7d");
  const [analyticsCourtId, setAnalyticsCourtId] = useState<string | null>(null);
  const [insights, setInsights] = useState<ManagementInsights | null>(null);
  const [insightsPending, setInsightsPending] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [insightsRevision, setInsightsRevision] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const syncInFlightRef = useRef(false);
  const syncGenerationRef = useRef(0);

  const liveSessionRole = snapshot?.session.role ?? "host";
  const liveCapabilityKey = snapshot?.session.capabilities
    .slice()
    .sort()
    .join("|") ?? "";
  const context = useMemo<ManagementContext>(() => ({
    tenantSlug: activeTenant.identity.slug,
    role: isPreview ? role : liveSessionRole,
    capabilities: isPreview
      ? previewRoleSessions[role]
      : liveCapabilityKey
        ? liveCapabilityKey.split("|") as ManagementCapability[]
        : [],
  }), [isPreview, liveCapabilityKey, liveSessionRole, role]);
  const sessionRole = context.role;

  const can = (capability: ManagementCapability) => context.capabilities.includes(capability);
  const navigateTo = (nextView: View) => {
    if (nextView === "bookings") setBookingFilter("all");
    setView(nextView);
  };
  const openNeedsReview = () => {
    setBookingFilter("pending");
    setView("bookings");
  };
  const loadPaymentReceipt = useCallback(
    (verificationId: string) => managementAdapter.loadPaymentReceipt(context, verificationId),
    [context],
  );
  const loadReschedulePreview = useCallback(
    (bookingReference: string, date: string) =>
      managementAdapter.loadReschedulePreview(context, bookingReference, date),
    [context],
  );
  const loadCalendarDay = useCallback(
    (date: string) => {
      if (!snapshot) return Promise.reject(new Error("CALENDAR_SNAPSHOT_UNAVAILABLE"));
      return managementAdapter.loadCalendarDay(context, snapshot, date);
    },
    [context, snapshot],
  );
  const uploadPaymentQr = useCallback(async (methodCode: string, file: File) => {
    const asset = await managementAdapter.uploadPaymentQr(context, methodCode, file);
    const normalizedMethod = methodCode.trim().toLowerCase();
    setSnapshot((current) => {
      const businessPayments = current?.configuration.businessPayments;
      if (!current || !businessPayments) return current;
      return {
        ...current,
        configuration: {
          ...current.configuration,
          businessPayments: {
            ...businessPayments,
            revision: asset.tenantRevision,
            paymentMethods: businessPayments.paymentMethods.map((method) =>
              method.methodCode.toLowerCase() === normalizedMethod
                ? { ...method, qrUrl: asset.url }
                : method
            ),
          },
        },
      };
    });
    setToast({ message: "The QR image is saved and available in customer checkout.", tone: "success" });
    return asset;
  }, [context]);

  const retryInsights = useCallback(() => {
    setInsightsRevision((revision) => revision + 1);
  }, []);

  const publishRecommendedOffer = useCallback(async (
    input: Parameters<typeof managementAdapter.createPromotion>[1],
  ) => {
    const promotion = await managementAdapter.createPromotion(context, input);
    setToast({ message: `${promotion.name} is live for matching future slots.`, tone: "success" });
    setInsightsRevision((revision) => revision + 1);
  }, [context]);

  useEffect(() => {
    if (!snapshot || (view !== "reports" && view !== "finance")) return;
    if (isPreview) return;
    const capability = view === "finance" ? "finance:view" : "report:view";
    if (!context.capabilities.includes(capability)) return;

    let active = true;
    const range = analyticsDateRange(analyticsPeriod);
    const loadInsights = async () => {
      await Promise.resolve();
      if (!active) return;
      setInsightsPending(true);
      setInsightsError(null);
      try {
        const result = await managementAdapter.loadInsights(context, {
          ...range,
          courtId: analyticsCourtId,
        });
        if (active) setInsights(result);
      } catch (error: unknown) {
        if (!active) return;
        setInsightsError(
          error instanceof Error && error.message === "MANAGER_SIGN_IN_REQUIRED"
            ? "Sign in again to load protected analytics and remittance data."
            : "The authoritative reporting ledger could not be loaded. Try again without changing the current records.",
        );
      } finally {
        if (active) setInsightsPending(false);
      }
    };
    void loadInsights();

    return () => {
      active = false;
    };
  }, [
    analyticsCourtId,
    analyticsPeriod,
    context,
    insightsRevision,
    isPreview,
    snapshot,
    view,
  ]);

  const refreshWorkspace = useCallback(async (announce = false) => {
    if (isPreview || syncInFlightRef.current) return;
    const generation = ++syncGenerationRef.current;
    syncInFlightRef.current = true;
    setSyncPending(true);
    try {
      const refreshed = announce || !snapshot
        ? await managementAdapter.load(context)
        : await managementAdapter.refreshOperations(context, snapshot);
      if (generation !== syncGenerationRef.current) return;
      setSnapshot(refreshed);
      setLoadError(false);
      if (announce) {
        setToast({ message: "Live bookings and payments are up to date.", tone: "success" });
      }
    } catch (error) {
      if (error instanceof Error && error.message === "MANAGER_SIGN_IN_REQUIRED") {
        setAuthRequired(true);
      } else if (announce) {
        setToast({
          message: "We couldn't refresh live payments. The current view was left unchanged.",
          tone: "warning",
        });
      }
    } finally {
      syncInFlightRef.current = false;
      setSyncPending(false);
    }
  }, [context, isPreview, snapshot]);

  useEffect(() => {
    let active = true;
    managementAdapter.load(context).then((data) => {
      if (active) setSnapshot(data);
    }).catch((error: unknown) => {
      if (!active) return;
      if (error instanceof Error && error.message === "MANAGER_SIGN_IN_REQUIRED") {
        setAuthRequired(true);
      } else {
        setLoadError(true);
      }
    });
    return () => { active = false; };
    // Initial tenant load only; role changes swap the session-shaped capabilities.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (
      isPreview || !snapshot || authRequired || confirmAction || confirmPending || refreshPending ||
      (view !== "overview" && view !== "bookings")
    ) return;

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") void refreshWorkspace(false);
    };
    const interval = window.setInterval(refreshIfVisible, 20_000);
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [authRequired, confirmAction, confirmPending, isPreview, refreshPending, refreshWorkspace, snapshot, view]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (confirmAction && !dialog.open) dialog.showModal();
    if (!confirmAction && dialog.open) dialog.close();
  }, [confirmAction]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), toast.tone === "success" ? 5_000 : 9_000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const request = (action: ConfirmAction) => {
    // Freeze the confirmation against any silent refresh already in flight.
    syncGenerationRef.current += 1;
    setConfirmAction(action);
  };

  const switchAccount = async () => {
    if (isPreview || accountPending) return;
    setAccountPending(true);
    try {
      await signOutOwner();
      window.location.reload();
    } catch {
      setToast({ message: "The session could not be cleared. Refresh and try signing out again.", tone: "error" });
      setAccountPending(false);
    }
  };

  const performConfirmedAction = async () => {
    if (!confirmAction) return;
    const action = confirmAction;
    syncGenerationRef.current += 1;
    setConfirmPending(true);
    try {
      const result = await managementAdapter.perform(context, {
        type: action.actionType,
        resourceId: action.resourceId,
        payload: action.payload,
      });
      const isPaymentAssetRemove = action.actionType === "payment:asset-remove";
      if (isPaymentAssetRemove && result.tenantRevision) {
        const payload = action.payload && typeof action.payload === "object" &&
            !Array.isArray(action.payload)
          ? action.payload as Record<string, unknown>
          : null;
        const methodCode = typeof payload?.methodCode === "string"
          ? payload.methodCode.trim().toLowerCase()
          : "";
        setSnapshot((current) => {
          const businessPayments = current?.configuration.businessPayments;
          if (!current || !businessPayments || !methodCode) return current;
          return {
            ...current,
            configuration: {
              ...current.configuration,
              businessPayments: {
                ...businessPayments,
                revision: result.tenantRevision!,
                paymentMethods: businessPayments.paymentMethods.map((method) =>
                  method.methodCode.toLowerCase() === methodCode
                    ? { ...method, qrUrl: null }
                    : method
                ),
              },
            },
          };
        });
      }
      if (!isPreview && !isPaymentAssetRemove) {
        setRefreshPending(true);
        try {
          const refreshed = await managementAdapter.load(context);
          setSnapshot(refreshed);
        } catch {
          setToast({
            message: `${result.message} The follow-up refresh failed, so refresh the workspace before making another change.`,
            tone: "warning",
          });
          dialogRef.current?.close();
          setConfirmAction(null);
          window.requestAnimationFrame(() => action.onSuccess?.(result));
          return;
        } finally {
          setRefreshPending(false);
        }
      }
      setToast({ message: result.message, tone: "success" });
      dialogRef.current?.close();
      setConfirmAction(null);
      window.requestAnimationFrame(() => action.onSuccess?.(result));
    } catch (error) {
      if (error instanceof PlatformRequestError) {
        setToast({
          message: error.code === "SETTINGS_STALE_REFRESH_REQUIRED" || error.code === "POLICY_STALE_REFRESH_REQUIRED"
            ? error.message
            : `The server rejected this change: ${error.message}`,
          tone: error.code === "SETTINGS_STALE_REFRESH_REQUIRED" || error.code === "POLICY_STALE_REFRESH_REQUIRED"
            ? "warning"
            : "error",
        });
      } else if (error instanceof TypeError) {
        setToast({
          message: "We couldn't confirm the change because the connection ended. The server may have applied it; refresh before retrying.",
          tone: "warning",
        });
      } else {
        setToast({
          message: "The change was blocked before server confirmation. Refresh the authorized workspace and review the entered values.",
          tone: "error",
        });
      }
      dialogRef.current?.close();
      setConfirmAction(null);
    } finally {
      setConfirmPending(false);
    }
  };

  const selectedCopy = isPreview ? VIEW_COPY[view] : LIVE_VIEW_COPY[view];
  const requiredCapability = VIEW_CAPABILITY[view];
  const viewPermitted = !requiredCapability || can(requiredCapability);
  const completedSetup = snapshot?.setup.filter((item) => item.complete).length ?? 0;
  const visibleNavItems = NAV_ITEMS.filter((item) =>
    item.id !== "launch" || snapshot?.session.isSystemOwner === true
  );
  const navIsActive = (item: View) => item === view ||
    (item === "schedule" && view === "blocks") ||
    (item === "setup" && ["settings", "launch", "access"].includes(view));

  const renderView = () => {
    if (!snapshot) return <DashboardSkeleton />;
    if (previewState === "loading") return <DashboardSkeleton />;
    if (previewState === "empty" || previewState === "error" || previewState === "restricted") {
      return <StatePanel kind={previewState} role={role} isPreview onRestore={() => setPreviewState("ready")} />;
    }
    if (!viewPermitted) return <PermissionPanel role={sessionRole} view={view} isPreview={isPreview} />;
    switch (view) {
      case "overview": return <OverviewView snapshot={snapshot} can={can} goTo={navigateTo} openNeedsReview={openNeedsReview} request={request} loadPaymentReceipt={loadPaymentReceipt} />;
      case "setup": return <SetupLanding snapshot={snapshot} goTo={setView} openSettings={(section) => { setSettingsSection(section); setView("settings"); }} />;
      case "bookings": return <BookingsView key={`bookings-${bookingFilter}`} bookings={snapshot.bookings} courts={snapshot.courts} can={can} request={request} goTo={setView} isPreview={isPreview} initialStatus={bookingFilter} loadPaymentReceipt={loadPaymentReceipt} loadReschedulePreview={loadReschedulePreview} />;
      case "schedule": return snapshot.tenant.mode === "live" ? (
        <CalendarView
          courts={snapshot.courts}
          initialBookings={snapshot.bookings}
          initialBlocks={snapshot.blocks}
          loadDay={loadCalendarDay}
          canBlock={can("schedule:block")}
          onOpenBlocks={() => setView("blocks")}
          timezone={snapshot.tenant.timezone}
          currency={snapshot.tenant.currency}
        />
      ) : <ScheduleView snapshot={snapshot} can={can} goTo={setView} />;
      case "blocks": return <BlocksView snapshot={snapshot} can={can} request={request} />;
      case "customers": return <CustomersView snapshot={snapshot} goTo={setView} />;
      case "reports": return <AnalyticsView
        report={insights?.report ?? null}
        period={analyticsPeriod}
        onPeriodChange={setAnalyticsPeriod}
        courts={snapshot.courts.map((court) => ({ id: court.id, name: court.name }))}
        courtId={analyticsCourtId}
        onCourtChange={setAnalyticsCourtId}
        promotions={insights?.promotions ?? null}
        onCreatePromotion={publishRecommendedOffer}
        bookings={snapshot.bookings}
        loading={insightsPending}
        error={insightsError}
        onRetry={retryInsights}
      />;
      case "finance": return <FinanceView
        finance={insights?.finance ?? null}
        loading={insightsPending}
        error={insightsError}
        onRetry={retryInsights}
      />;
      case "settings": return <SettingsView snapshot={snapshot} can={can} request={request} initialLiveSection={settingsSection} uploadPaymentQr={uploadPaymentQr} onLiveSectionChange={setSettingsSection} />;
      case "launch": return <PickPointLaunch snapshot={snapshot} request={request} />;
      case "access": return <PickPointAccess role={sessionRole} capabilities={context.capabilities} isPreview={isPreview} session={snapshot.session} />;
    }
  };

  if (authRequired && !isPreview) {
    return (
      <SignInGate
        onSignedIn={async () => {
          const data = await managementAdapter.load(context);
          setSnapshot(data);
          setAuthRequired(false);
        }}
      />
    );
  }

  if (loadError) {
    return <main id="main-content" className={styles.fatalState} tabIndex={-1}><div><StatePanel kind="error" role={role} isPreview={isPreview} onRestore={() => window.location.reload()} />{!isPreview && <ActionButton variant="secondary" disabled={accountPending} onClick={switchAccount}>{accountPending ? "Signing out…" : "Sign out and use another account"}</ActionButton>}</div></main>;
  }

  return (
    <div className={styles.manageShell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.logoPlate}>
            <Image
              className={styles.brandLogo}
              src="/pickpoint-pickleclub-wordmark.png"
              alt=""
              width={1184}
              height={352}
              sizes="180px"
              unoptimized
              priority
            />
          </span>
          <span className={styles.srOnly}>PICKPOINT</span>
          <span className={styles.brandContext}>Court operations</span>
        </div>
        <div className={styles.tenantSwitcher}>
          <span>D</span><div><small>Current tenant</small><strong>PickPoint</strong></div>
          {isPreview && <b aria-hidden="true">⌄</b>}
        </div>
        <nav className={styles.desktopNav} aria-label="Management navigation">
          <p>Operations</p>
          {visibleNavItems.map((item) => (
            <button type="button" key={item.id} onClick={() => navigateTo(item.id)} className={navIsActive(item.id) ? styles.navActive : undefined} aria-current={navIsActive(item.id) ? "page" : undefined}>
              <span aria-hidden="true"><NavIcon view={item.id} /></span>{item.label}
              {VIEW_CAPABILITY[item.id] && !can(VIEW_CAPABILITY[item.id]!) && <i aria-label="Limited by role">•</i>}
            </button>
          ))}
        </nav>
        <div className={styles.sidebarBottom}>
          <div className={styles.modeCard}>
            <div><span className={styles.modeDot} aria-hidden="true" /><strong>{isPreview ? "Preview mode" : "Live connection"}</strong></div>
            {snapshot ? (
              <>
                <p>{completedSetup} of {snapshot.setup.length} setup checks ready</p>
                <span className={styles.miniProgress}><i style={{ width: `${snapshot.setup.length ? (completedSetup / snapshot.setup.length) * 100 : 0}%` }} /></span>
              </>
            ) : (
              <p>Setup checks loading</p>
            )}
          </div>
          <div className={styles.userCard}>
            <Avatar initials={snapshot?.session.isSystemOwner ? "SO" : "PP"} tone={0} />
            <div><strong>{isPreview ? "PickPoint owner" : snapshot?.session.displayName ?? "Club team"}</strong><span>{isPreview ? "Private setup preview" : ROLE_LABEL[sessionRole]}</span></div>
            <button
              type="button"
              disabled={isPreview || accountPending}
              onClick={switchAccount}
              aria-label={isPreview ? "Preview account control unavailable" : "Sign out and use another account"}
              title={isPreview ? "Preview account" : "Sign out and switch account"}
            >
              {accountPending ? "…" : isPreview ? "•••" : "↪"}
            </button>
          </div>
        </div>
      </aside>

      <div className={styles.workspace}>
        <header className={styles.mobileBrand}>
          <div className={styles.brand}>
            <span className={styles.logoPlate}>
              <Image
                className={styles.brandLogo}
                src="/pickpoint-pickleclub-mark.png"
                alt=""
                width={517}
                height={650}
                sizes="136px"
                unoptimized
                priority
              />
            </span>
            <span className={styles.srOnly}>PICKPOINT</span>
            <span className={styles.brandContext}>Manage</span>
          </div>
          <span className={styles.previewTag}>{isPreview ? "Preview" : "Live"}</span>
          <button
            type="button"
            className={styles.mobileAvatar}
            disabled={isPreview || accountPending}
            onClick={switchAccount}
            aria-label={isPreview ? "Preview account control unavailable" : "Sign out and use another account"}
          >
            {accountPending ? "…" : isPreview ? "PP" : "↪"}
          </button>
        </header>
        <nav className={styles.mobileNav} aria-label="Mobile management navigation">
          {visibleNavItems.map((item) => (
            <button type="button" key={item.id} onClick={() => navigateTo(item.id)} className={navIsActive(item.id) ? styles.navActive : undefined} aria-current={navIsActive(item.id) ? "page" : undefined}>
              <span aria-hidden="true"><NavIcon view={item.id} /></span>{item.label}
            </button>
          ))}
        </nav>

        <div className={styles.topbar}>
          <div className={styles.topbarTitle}>
            <span>PickPoint Pickle Club</span>
            <h1>{view === "overview" ? "Today" : ["settings", "launch", "access"].includes(view) ? "Setup" : selectedCopy.title}</h1>
          </div>
          <div className={styles.rallyTopActions}>
            <button type="button" className={styles.rallySearch} onClick={() => navigateTo("bookings")} aria-label="Search bookings"><Search /><span>Find a booking</span></button>
            {!isPreview && (
              <button
                type="button"
                className={styles.rallyTopIcon}
                aria-label="Refresh live tenant data"
                disabled={syncPending}
                onClick={() => void refreshWorkspace(true)}
              >
                <span aria-hidden="true">↻</span>
              </button>
            )}
            <div className={styles.rallyRoleCard}>
              <span>{snapshot?.session.isSystemOwner ? "SO" : "CO"}</span>
              <div><small>Viewing as</small><strong>{snapshot?.session.isSystemOwner ? "System owner" : "Court owner"}</strong></div>
            </div>
          </div>
        </div>

        <main id="main-content" className={styles.main} tabIndex={-1}>
          {view !== "overview" && view !== "reports" && view !== "bookings" && view !== "blocks" && <header className={styles.pageHeader}>
            <div>
              <h1>{selectedCopy.title}</h1>
              <p>{selectedCopy.description}</p>
            </div>
            <div className={styles.pageActions}>
              {view === "settings" && snapshot?.session.isSystemOwner && (
                <ActionButton
                  variant="secondary"
                  onClick={() => setView("launch")}
                >
                  Review launch
                </ActionButton>
              )}
            </div>
          </header>}

          {renderView()}
        </main>
      </div>

      <dialog
        ref={dialogRef}
        className={cx(styles.confirmDialog, confirmPending && styles.dialogBusy)}
        aria-labelledby="confirm-title"
        aria-describedby="confirm-description"
        aria-busy={confirmPending}
        onCancel={(event) => { event.preventDefault(); if (!confirmPending) setConfirmAction(null); }}
        onClose={() => { if (!confirmPending) setConfirmAction(null); }}
      >
        {confirmAction && (
          <div>
            <button type="button" className={styles.dialogClose} onClick={() => setConfirmAction(null)} disabled={confirmPending} aria-label="Close confirmation">×</button>
            <span className={cx(styles.dialogMark, confirmAction.tone === "danger" && styles.dialogDanger)} aria-hidden="true">{confirmAction.tone === "danger" ? "!" : "✓"}</span>
            <p className={styles.eyebrow}>Confirm before continuing</p>
            <h2 id="confirm-title">{confirmAction.title}</h2>
            <p id="confirm-description">{confirmAction.detail}</p>
            <div className={styles.dialogSummary}><span>Tenant</span><strong>PickPoint</strong><span>Mode</span><strong>{isPreview ? "Preview · no live write" : "Live · server-authorized write"}</strong></div>
            <div className={styles.dialogActions}>
              <ActionButton variant="quiet" disabled={confirmPending} onClick={() => setConfirmAction(null)}>Go back</ActionButton>
              <ActionButton variant={confirmAction.tone === "danger" ? "danger" : "primary"} disabled={confirmPending} onClick={performConfirmedAction}>{refreshPending ? "Refreshing workspace…" : confirmPending ? "Saving…" : confirmAction.confirmLabel}</ActionButton>
            </div>
          </div>
        )}
      </dialog>

      <div
        className={cx(
          styles.toast,
          toast && styles.toastVisible,
          toast?.tone === "success" && styles.toastSuccess,
          toast?.tone === "error" && styles.toastError,
          toast?.tone === "warning" && styles.toastWarning,
        )}
        role={toast ? (toast.tone === "success" ? "status" : "alert") : undefined}
        aria-live={toast ? (toast.tone === "success" ? "polite" : "assertive") : "off"}
      >
        <span className={styles.toastIcon} aria-hidden="true">{toast?.tone === "success" ? "✓" : toast?.tone === "warning" ? "!" : "×"}</span>
        <span className={styles.toastMessage}>{toast?.message}</span>
      </div>
    </div>
  );
}
