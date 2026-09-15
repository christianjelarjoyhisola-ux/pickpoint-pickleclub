"use client";

import { useState, type CSSProperties } from "react";

import type {
  Booking,
  ManagementInsights,
  PromotionCreateInput,
  RegularBookingReport,
  RemittanceSummary,
} from "./management-adapter";
import styles from "./analytics-finance.module.css";

export type AnalyticsPeriod = "today" | "7d" | "30d" | "90d";

type LoadingState = {
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
};

export type AnalyticsViewProps = LoadingState & {
  report: RegularBookingReport | null;
  period: AnalyticsPeriod;
  onPeriodChange: (period: AnalyticsPeriod) => void;
  courts?: Array<{ id: string; name: string }>;
  courtId?: string | null;
  onCourtChange?: (courtId: string | null) => void;
  promotions?: ManagementInsights["promotions"] | null;
  onCreatePromotion?: (input: PromotionCreateInput) => Promise<void>;
  bookings?: Booking[];
};

export type FinanceViewProps = LoadingState & {
  finance: ManagementInsights["finance"];
  onPrepare?: () => void;
  preparing?: boolean;
};

function money(value: number, currency: string): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function number(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat("en-PH", { maximumFractionDigits }).format(value);
}

function localDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function localInstant(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

function LoadingPanel({ label }: { label: string }) {
  return (
    <section className={styles.statePanel} aria-busy="true" aria-live="polite">
      <span className={styles.loader} aria-hidden="true" />
      <div>
        <strong>Loading {label}</strong>
        <p>Reading the authenticated tenant ledger.</p>
      </div>
    </section>
  );
}

function EmptyPanel({
  title,
  message,
  error,
  onRetry,
}: {
  title: string;
  message: string;
  error?: string | null;
  onRetry?: () => void;
}) {
  return (
    <section className={styles.statePanel} role={error ? "alert" : undefined}>
      <span className={styles.stateMark} aria-hidden="true">{error ? "!" : "00"}</span>
      <div>
        <strong>{error ? "This live result is unavailable" : title}</strong>
        <p>{error || message}</p>
        {error && onRetry && (
          <button type="button" className={styles.secondaryButton} onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    </section>
  );
}

export function DailyGrossChart({ report }: { report: RegularBookingReport }) {
  const data = report.breakdowns.daily;
  const maximum = Math.max(...data.map((item) => item.grossPaid), 0);
  const width = 720;
  const chartTop = 18;
  const chartBottom = 188;
  const plotHeight = chartBottom - chartTop;
  const cellWidth = width / Math.max(data.length, 1);
  const barWidth = Math.max(Math.min(cellWidth * 0.62, 24), data.length > 60 ? 2 : 4);
  const labelIndexes = new Set([
    0,
    Math.floor((data.length - 1) / 2),
    Math.max(data.length - 1, 0),
  ]);
  const description = maximum > 0
    ? `${number(report.summary.grossPaid)} ${report.currency} paid customer gross across ${report.range.dayCount} days.`
    : `No paid customer gross recorded across ${report.range.dayCount} days.`;

  return (
    <div className={styles.chartWrap}>
      <svg
        className={styles.chart}
        viewBox="0 0 720 230"
        role="img"
        aria-labelledby="daily-gross-chart-title daily-gross-chart-description"
        preserveAspectRatio="none"
      >
        <title id="daily-gross-chart-title">Paid customer gross by booking date</title>
        <desc id="daily-gross-chart-description">{description}</desc>
        {[0, 0.5, 1].map((ratio) => {
          const y = chartTop + plotHeight * ratio;
          return <line key={ratio} x1="0" x2={width} y1={y} y2={y} className={styles.gridLine} />;
        })}
        {data.map((item, index) => {
          const height = maximum > 0 ? (item.grossPaid / maximum) * plotHeight : 0;
          const x = index * cellWidth + (cellWidth - barWidth) / 2;
          const y = chartBottom - height;
          return (
            <g key={item.date}>
              <rect
                x={x}
                y={height > 0 ? y : chartBottom - 2}
                width={barWidth}
                height={Math.max(height, 2)}
                rx={Math.min(barWidth / 2, 4)}
                className={height > 0 ? styles.chartBar : styles.chartZero}
              >
                <title>{`${localDate(item.date)}: ${money(item.grossPaid, report.currency)}`}</title>
              </rect>
              {labelIndexes.has(index) && (
                <text
                  x={index * cellWidth + cellWidth / 2}
                  y="218"
                  textAnchor={index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"}
                  className={styles.axisLabel}
                >
                  {new Intl.DateTimeFormat("en-PH", {
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC",
                  }).format(new Date(`${item.date}T00:00:00Z`))}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const HEAT_WINDOWS = [
  ["6–9 AM", 6, 9],
  ["9 AM–12 PM", 9, 12],
  ["12–3 PM", 12, 15],
  ["3–6 PM", 15, 18],
  ["6–9 PM", 18, 21],
  ["9–10 PM", 21, 22],
] as const;

function weekdayIndex(date: string) {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

function bookingDurationHours(booking: Booking) {
  const parsed = Number.parseFloat(booking.duration);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function utilizationMatrix(
  report: RegularBookingReport,
  bookings: Booking[],
  courtCount: number,
  courtId: string | null,
) {
  const observations = Array.from({ length: 7 }, (_, day) =>
    report.breakdowns.daily.filter((entry) => weekdayIndex(entry.date) === day).length,
  );
  return HEAT_WINDOWS.map(([, windowStart, windowEnd]) =>
    Array.from({ length: 7 }, (_, day) => {
      const booked = bookings.filter((booking) =>
        booking.bookingDate && booking.startTime &&
        booking.bookingDate >= report.range.dateFrom && booking.bookingDate <= report.range.dateTo &&
        weekdayIndex(booking.bookingDate) === day &&
        (!courtId || booking.courtId === courtId) &&
        !["cancelled", "expired"].includes(booking.status)
      ).reduce((sum, booking) => {
        const starts = Number.parseInt(booking.startTime?.slice(0, 2) ?? "", 10);
        if (!Number.isFinite(starts)) return sum;
        const ends = starts + bookingDurationHours(booking);
        return sum + Math.max(0, Math.min(ends, windowEnd) - Math.max(starts, windowStart));
      }, 0);
      const available = Math.max(observations[day], 1) * Math.max(courtCount, 1) * (windowEnd - windowStart);
      return Math.min(100, Math.round(booked / available * 100));
    }),
  );
}

function DemandHeatmap({ values }: { values: number[][] }) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return (
    <div className={styles.heatmapWrap}>
      <table className={styles.heatmap}>
        <caption className={styles.srOnly}>Court utilization percentage by day and time window</caption>
        <thead><tr><th>Time</th>{days.map((day) => <th key={day}>{day}</th>)}</tr></thead>
        <tbody>{HEAT_WINDOWS.map(([label], row) => (
          <tr key={label}><th scope="row">{label}</th>{(values[row] ?? []).map((value, column) => (
            <td key={days[column]}><span className={value >= 62 ? styles.heatStrong : undefined} style={{ "--heat": 0.08 + value / 100 * 0.78 } as CSSProperties}><b>{value}%</b></span></td>
          ))}</tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function TrendChart({ report }: { report: RegularBookingReport }) {
  const rows = report.breakdowns.daily.slice(-7);
  const width = 720, height = 220, padX = 30, padTop = 18, chartHeight = 168;
  const series = (values: number[]) => {
    const min = Math.min(...values, 0), max = Math.max(...values, 1);
    return values.map((value, index) => ({
      x: padX + index * ((width - padX * 2) / Math.max(values.length - 1, 1)),
      y: padTop + ((max - value) / Math.max(max - min, 1)) * chartHeight,
    }));
  };
  const revenue = series(rows.map((row) => row.grossPaid));
  const bookingCounts = series(rows.map((row) => row.totalBookingCount));
  const points = (items: Array<{ x: number; y: number }>) => items.map((point) => `${point.x},${point.y}`).join(" ");
  return (
    <>
      <div className={styles.trendLegend}><span><i />Revenue</span><span className={styles.trendBookings}><i />Bookings</span></div>
      <svg className={styles.trendChart} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Recent revenue and booking trend">
        <g className={styles.trendGrid}>{[0, 1, 2, 3].map((index) => <line key={index} x1={padX} x2={width - padX} y1={padTop + index * chartHeight / 3} y2={padTop + index * chartHeight / 3} />)}</g>
        <polyline className={`${styles.trendLine} ${styles.trendRevenue}`} points={points(revenue)} />
        <polyline className={`${styles.trendLine} ${styles.trendBookingsLine}`} points={points(bookingCounts)} />
        {revenue.map((point, index) => <circle key={`r-${index}`} className={`${styles.trendPoint} ${styles.trendRevenuePoint}`} cx={point.x} cy={point.y} r="4" />)}
        {bookingCounts.map((point, index) => <circle key={`b-${index}`} className={`${styles.trendPoint} ${styles.trendBookingPoint}`} cx={point.x} cy={point.y} r="3.5" />)}
        <g className={styles.trendLabels}>{rows.map((row, index) => <text key={row.date} x={padX + index * ((width - padX * 2) / Math.max(rows.length - 1, 1))} y={height - 8} textAnchor="middle">{new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${row.date}T00:00:00Z`))}</text>)}</g>
      </svg>
    </>
  );
}

function BookingMix({ report }: { report: RegularBookingReport }) {
  const total = Math.max(report.summary.totalBookingCount, 1);
  const items = [
    ["Confirmed", report.summary.lifecycleCounts.confirmed, "#6558e8"],
    ["Completed", report.summary.lifecycleCounts.completed, "#5ed8b6"],
    ["Payment review", report.summary.lifecycleCounts.paymentReview, "#5694e6"],
    ["Needs payment", report.summary.lifecycleCounts.pendingPayment, "#ff8f75"],
    ["Closed", report.summary.lifecycleCounts.cancelled + report.summary.lifecycleCounts.expired, "#f5b94c"],
  ] as const;
  let cursor = 0;
  const gradient = items.map(([, value, color]) => {
    const from = cursor;
    cursor += value / total * 100;
    return `${color} ${from}% ${cursor}%`;
  }).join(", ");
  const confirmedShare = Math.round(report.summary.lifecycleCounts.confirmed / total * 100);
  return (
    <div className={styles.sourceChart}>
      <div className={styles.donut} style={{ background: `conic-gradient(${gradient || "#ebe9ff 0 100%"})` }} role="img" aria-label="Booking lifecycle mix"><div><strong>{confirmedShare}%</strong><span>confirmed share</span></div></div>
      <ul>{items.map(([label, value, color]) => <li key={label}><i style={{ background: color }} /><span>{label}</span><strong>{Math.round(value / total * 100)}%</strong></li>)}</ul>
    </div>
  );
}

export function AnalyticsView({
  report,
  courts = [],
  courtId = null,
  promotions = null,
  onCreatePromotion,
  bookings = [],
  loading = false,
  error = null,
  onRetry,
}: AnalyticsViewProps) {
  const [offerDraft, setOfferDraft] = useState<PromotionCreateInput | null>(null);
  const [offerPending, setOfferPending] = useState(false);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [roi, setRoi] = useState({
    courts: Math.max(courts.length, 1),
    rate: 560,
    hours: 16,
    days: 30,
    current: 50,
    target: 58,
  });
  if (loading && !report) return <LoadingPanel label="analytics" />;
  if (error || !report) {
    return (
      <EmptyPanel
        title="Live analytics are not loaded"
        message="No sample totals are shown. Connect an authorized manager session to read the complete regular-booking report."
        error={error}
        onRetry={onRetry}
      />
    );
  }

  const { summary } = report;
  const recommendationWindows = [
    { startsAt: "12:00", endsAt: "15:00", label: "Lunch rally offer" },
    { startsAt: "06:00", endsAt: "09:00", label: "Early-bird package" },
    { startsAt: "09:00", endsAt: "12:00", label: "Morning court saver" },
  ];
  const weekdayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weekdayPerformance = Array.from({ length: 7 }, (_, weekday) => {
    const days = report.breakdowns.daily.filter((entry) => {
      const date = new Date(`${entry.date}T00:00:00Z`);
      return (date.getUTCDay() + 6) % 7 === weekday;
    });
    return {
      weekday,
      bookedHours: days.reduce((sum, day) => sum + day.bookedHours, 0),
      observations: days.length,
    };
  }).filter((item) => item.observations > 0)
    .sort((left, right) => left.bookedHours / left.observations - right.bookedHours / right.observations)
    .slice(0, 3);
  const validFrom = new Date().toISOString().slice(0, 10);
  const validUntilDate = new Date();
  validUntilDate.setUTCDate(validUntilDate.getUTCDate() + 28);
  const validUntil = validUntilDate.toISOString().slice(0, 10);
  const recommendedActions = weekdayPerformance.map((item, index) => {
    const window = recommendationWindows[index];
    const availableHours = item.observations * Math.max(courts.length, 1) * 3;
    return {
      weekday: item.weekday,
      utilization: availableHours > 0
        ? Math.min(100, Math.round(item.bookedHours / availableHours * 100))
        : 0,
      ...window,
    };
  });

  const openOffer = (action: typeof recommendedActions[number]) => {
    setOfferError(null);
    setOfferDraft({
      name: action.label,
      discountType: "percentage",
      discountValue: 15,
      weekdays: [action.weekday],
      startsAt: action.startsAt,
      endsAt: action.endsAt,
      validFrom,
      validUntil,
      courtIds: courtId ? [courtId] : courts.map((court) => court.id),
      maxRedemptions: 40,
    });
  };

  const publishOffer = async () => {
    if (!offerDraft || !onCreatePromotion) return;
    setOfferPending(true);
    setOfferError(null);
    try {
      await onCreatePromotion(offerDraft);
      setOfferDraft(null);
    } catch (offerFailure) {
      setOfferError(offerFailure instanceof Error
        ? offerFailure.message
        : "The offer could not be published.");
    } finally {
      setOfferPending(false);
    }
  };
  const periodLabel = `${localDate(report.range.dateFrom)} – ${localDate(report.range.dateTo)}`;
  const selectedCourtCount = courtId ? 1 : Math.max(courts.length, 1);
  const bookableHours = selectedCourtCount * report.range.dayCount * 16;
  const utilization = bookableHours > 0
    ? Math.min(100, Math.round(summary.bookedHours / bookableHours * 100))
    : 0;
  const revenuePerHour = summary.bookedHours > 0
    ? summary.venueSalesPaid / summary.bookedHours
    : 0;
  const heatValues = utilizationMatrix(report, bookings, selectedCourtCount, courtId);
  const weakestCell = heatValues.flatMap((row, window) => row.map((value, day) => ({ value, day, window })))
    .sort((left, right) => left.value - right.value)[0];
  const recentRows = report.breakdowns.daily.slice(-7);
  const firstRecent = recentRows[0]?.grossPaid ?? 0;
  const latestRecent = recentRows.at(-1)?.grossPaid ?? 0;
  const trendLift = firstRecent > 0
    ? Math.round((latestRecent - firstRecent) / firstRecent * 1000) / 10
    : null;
  const roiLift = Math.max(0, roi.target - roi.current) / 100;
  const recoveredHours = roi.courts * roi.hours * roi.days * roiLift;
  const roiMonthly = recoveredHours * roi.rate;

  return (
    <section className={`${styles.workspace} ${styles.insightsView}`} aria-labelledby="analytics-title" aria-busy={loading}>
      <header className={styles.insightsHero}>
        <div>
          <p className={styles.eyebrow}>PickPoint intelligence / {periodLabel}</p>
          <h2 id="analytics-title">See where demand grows, and where court revenue still hides.</h2>
          <p>One clear view of utilization, booking momentum, performance, and the next best operating moves.</p>
        </div>
        <button type="button" className={styles.exportButton} onClick={() => window.print()}><span aria-hidden="true">↗</span>Export owner brief</button>
      </header>

      {!report.complete && <div className={styles.warning} role="status">This report contains {report.completeness.anomalyCount} source {report.completeness.anomalyCount === 1 ? "anomaly" : "anomalies"}.</div>}

      <div className={styles.insightMetrics} aria-label="Owner performance summary">
        <article><span>Gross bookings</span><strong>{money(summary.grossPaid, report.currency)}</strong><small className={styles.positive}>Paid customer total</small></article>
        <article><span>Court utilization</span><strong>{utilization}%</strong><small>{number(summary.bookedHours)} booked court-hours</small></article>
        <article><span>Completed bookings</span><strong>{summary.lifecycleCounts.completed}</strong><small>{number(summary.totalBookingCount / Math.max(report.range.dayCount, 1), 1)} daily average</small></article>
        <article><span>Revenue / court-hour</span><strong>{money(revenuePerHour, report.currency)}</strong><small className={styles.positive}>{summary.paidBookingCount} paid bookings</small></article>
      </div>

      <div className={styles.insightsGrid}>
        <section className={`${styles.panel} ${styles.insightPanel} ${styles.heatmapPanel}`} aria-labelledby="utilization-title">
          <div className={styles.insightPanelHeading}><div><p className={styles.eyebrow}>Demand map</p><h3 id="utilization-title">Utilization by time window</h3></div><div className={styles.heatLegend}><span>Lower</span><i /><i /><i /><i /><span>Higher</span></div></div>
          <DemandHeatmap values={heatValues} />
          <div className={styles.insightCallout}><span aria-hidden="true">✦</span><p><strong>Clearest growth pocket.</strong> {weakestCell ? `${weekdayNames[weakestCell.day]} ${HEAT_WINDOWS[weakestCell.window][0]} currently reads ${weakestCell.value}% utilized.` : "More booking history will reveal the next opportunity."}</p></div>
        </section>

        <section className={`${styles.panel} ${styles.insightPanel} ${styles.sourcePanel}`} aria-labelledby="source-title">
          <div className={styles.insightPanelHeading}><div><p className={styles.eyebrow}>Lifecycle</p><h3 id="source-title">Booking state mix</h3></div><span className={styles.periodChip}>{periodLabel}</span></div>
          <BookingMix report={report} />
        </section>

        <section className={`${styles.panel} ${styles.insightPanel} ${styles.trendPanel}`} aria-labelledby="trend-title">
          <div className={styles.insightPanelHeading}><div><p className={styles.eyebrow}>Momentum</p><h3 id="trend-title">Revenue and bookings</h3></div><div className={styles.trendSummary}><strong>{trendLift === null ? "Live" : `${trendLift >= 0 ? "+" : ""}${trendLift}%`}</strong><span>recent booking value</span></div></div>
          <TrendChart report={report} />
        </section>

        <section className={`${styles.panel} ${styles.insightPanel} ${styles.opportunityPanel}`} aria-labelledby="opportunities-title">
          <div className={styles.insightPanelHeading}><div><p className={styles.eyebrow}>Recommended actions</p><h3 id="opportunities-title">Underused slots</h3></div><span className={styles.periodChip}>{recommendedActions.length} opportunities</span></div>
          <div className={styles.opportunityList}>{recommendedActions.map((action) => {
            const openHours = Math.round(Math.max(0, 100 - action.utilization) / 100 * Math.max(selectedCourtCount, 1) * 3);
            const opportunityValue = openHours * revenuePerHour;
            return <article key={`${action.weekday}-${action.startsAt}`}><span className={styles.opportunityTime}>{weekdayNames[action.weekday]} / {action.startsAt}-{action.endsAt}</span><div><strong>{action.label}</strong><p>{action.utilization}% utilized / about {openHours} open court-hours</p></div><span className={styles.opportunityValue}>{money(opportunityValue, report.currency)}</span><button type="button" onClick={() => openOffer(action)} disabled={!promotions?.canCreate || !onCreatePromotion}>Create offer</button></article>;
          })}</div>
          {promotions && !promotions.available ? <p className={styles.opportunityNote}>Offer publishing will unlock after the PickPoint promotion migration is installed.</p> : !promotions?.canCreate ? <p className={styles.opportunityNote}>Publishing is reserved for the System Owner or this tenant&apos;s court owner.</p> : <p className={styles.opportunityNote}>Opportunity values use open hours and the current recorded revenue per booked court-hour; they are not guaranteed revenue.</p>}
          {promotions?.items.some((offer) => offer.status === "active") && <div className={styles.activeOffers}><span>Published offers</span>{promotions.items.filter((offer) => offer.status === "active").map((offer) => <strong key={offer.id}>{offer.name} · {offer.discountValue}{offer.discountType === "percentage" ? "%" : " PHP"} off · {offer.redemptionCount} used</strong>)}</div>}
        </section>
      </div>

      <section className={`${styles.panel} ${styles.roiCard}`} aria-labelledby="roi-title">
        <div className={styles.roiHeading}><div><p className={styles.eyebrow}>Editable scenario</p><h3 id="roi-title">What could stronger utilization mean?</h3><p>Change the assumptions to model an illustrative gross-booking opportunity for PickPoint.</p></div><span>Assumptions, not a forecast</span></div>
        <div className={styles.roiLayout}>
          <form className={styles.roiForm} onSubmit={(event) => event.preventDefault()}>
            {([[
              "Courts", "courts", 1, 30, 1], ["Average rate / court-hour", "rate", 0, 10000, 10], ["Bookable hours / day", "hours", 1, 24, 1], ["Operating days / month", "days", 1, 31, 1], ["Current utilization", "current", 0, 100, 1], ["Target utilization", "target", 0, 100, 1],
            ] as const).map(([label, key, min, max, step]) => <label key={key}><span>{label}</span><div className={key === "rate" ? styles.inputPrefix : key === "current" || key === "target" ? styles.inputSuffix : undefined}>{key === "rate" && <i>PHP</i>}<input type="number" min={min} max={max} step={step} value={roi[key]} onChange={(event) => setRoi({ ...roi, [key]: Number(event.target.value) })} />{(key === "current" || key === "target") && <i>%</i>}</div></label>)}
          </form>
          <div className={styles.roiOutput} aria-live="polite"><span>Illustrative monthly uplift</span><strong>{money(roiMonthly, report.currency)}</strong><p><b>{Math.round(recoveredHours)}</b> recovered court-hours at a <b>{Math.max(0, roi.target - roi.current)}</b>-point utilization lift.</p><div><span>Annualized gross bookings</span><strong>{money(roiMonthly * 12, report.currency)}</strong></div></div>
        </div>
        <p className={styles.roiDisclaimer}>Illustrative model only. It excludes discounts, cancellations, fees, taxes, operating costs, seasonality, and implementation effects.</p>
      </section>

      {offerDraft && (
        <div className={styles.offerBackdrop} role="presentation">
          <section className={styles.offerDialog} role="dialog" aria-modal="true" aria-labelledby="offer-title">
            <header>
              <div><span className={styles.eyebrow}>Owner approval</span><h3 id="offer-title">Publish a targeted offer</h3></div>
              <button type="button" aria-label="Close offer dialog" onClick={() => setOfferDraft(null)}>x</button>
            </header>
            <p>Only matching future slots for this tenant receive the discount. Existing bookings are never repriced.</p>
            <div className={styles.offerGrid}>
              <label><span>Offer name</span><input value={offerDraft.name} maxLength={120} onChange={(event) => setOfferDraft({ ...offerDraft, name: event.target.value })} /></label>
              <label><span>Discount</span><div className={styles.discountInput}><input type="number" min="1" max="50" value={offerDraft.discountValue} onChange={(event) => setOfferDraft({ ...offerDraft, discountValue: Number(event.target.value) })} /><b>%</b></div></label>
              <label><span>Starts</span><input type="date" value={offerDraft.validFrom} onChange={(event) => setOfferDraft({ ...offerDraft, validFrom: event.target.value })} /></label>
              <label><span>Ends</span><input type="date" value={offerDraft.validUntil} onChange={(event) => setOfferDraft({ ...offerDraft, validUntil: event.target.value })} /></label>
              <label><span>Maximum redemptions</span><input type="number" min="1" max="10000" value={offerDraft.maxRedemptions ?? ""} onChange={(event) => setOfferDraft({ ...offerDraft, maxRedemptions: Number(event.target.value) || null })} /></label>
              <div className={styles.offerScope}><span>Applies to</span><strong>{weekdayNames[offerDraft.weekdays[0]]} - {offerDraft.startsAt}-{offerDraft.endsAt} - {offerDraft.courtIds.length} {offerDraft.courtIds.length === 1 ? "court" : "courts"}</strong></div>
            </div>
            {offerError && <p className={styles.offerError} role="alert">{offerError}</p>}
            <footer>
              <button type="button" onClick={() => setOfferDraft(null)} disabled={offerPending}>Cancel</button>
              <button type="button" className={styles.publishOffer} onClick={() => void publishOffer()} disabled={offerPending || !offerDraft.name.trim() || offerDraft.discountValue <= 0 || offerDraft.discountValue > 50}>{offerPending ? "Publishing..." : "Publish offer"}</button>
            </footer>
          </section>
        </div>
      )}

      <details className={styles.boundaryNote}>
        <summary>About these totals</summary>
        <p>Values use each regular booking’s current payment status and stored amount snapshots. Recorded refunds reflect bookings currently marked refunded. This is not a payment-event or full refund ledger, so net revenue and occupancy are intentionally not estimated. Remittance due comes from the separate platform-fee ledger.</p>
      </details>
    </section>
  );
}

function remittanceStatusLabel(status: RemittanceSummary["status"]): string {
  return {
    draft: "Draft",
    due: "Due",
    submitted: "Submitted",
    under_review: "Under review",
    settled: "Settled",
    rejected: "Needs attention",
    void: "Void",
  }[status];
}

function maskReference(reference: string | null): string {
  if (!reference) return "Not configured";
  const visible = reference.slice(-4);
  return reference.length > 4 ? `•••• ${visible}` : visible;
}

function RemittanceCard({ item }: { item: RemittanceSummary }) {
  return (
    <article className={styles.remittanceCard}>
      <div className={styles.remittanceTitle}>
        <div>
          <span>{item.reference}</span>
          <strong>{money(item.remainingBalance, item.currency)} remaining</strong>
        </div>
        <span className={`${styles.statusBadge} ${styles[`remittance_${item.status}`]}`}>
          {remittanceStatusLabel(item.status)}
        </span>
      </div>
      <dl className={styles.remittanceFacts}>
        <div><dt>Amount due</dt><dd>{money(item.amountDue, item.currency)}</dd></div>
        <div><dt>Settled</dt><dd>{money(item.amountSettled, item.currency)}</dd></div>
        <div><dt>Bookings</dt><dd>{number(item.bookingsCount, 0)}</dd></div>
        <div><dt>Due date</dt><dd>{item.cycleDueOn ? localDate(item.cycleDueOn) : "Not set"}</dd></div>
      </dl>
    </article>
  );
}

export function FinanceView({
  finance,
  loading = false,
  error = null,
  onRetry,
  onPrepare,
  preparing = false,
}: FinanceViewProps) {
  if (loading && !finance) return <LoadingPanel label="finance" />;
  if (error || !finance) {
    return (
      <EmptyPanel
        title="Live finance is not loaded"
        message="No sample balances are shown. Finance is available to the System Owner and active venue owners or admins."
        error={error}
        onRetry={onRetry}
      />
    );
  }

  const { dashboard, history } = finance;
  const openRemaining = dashboard.openRemittances.reduce(
    (sum, item) => sum + item.remainingBalance,
    0,
  );
  const currency = dashboard.openRemittances[0]?.currency || history[0]?.currency || "PHP";
  const destination = dashboard.paymentDestination;

  return (
    <section className={styles.workspace} aria-labelledby="finance-title" aria-busy={loading}>
      <header className={styles.sectionHeader}>
        <div>
          <h2 id="finance-title">As of {localInstant(dashboard.serverNow, dashboard.timezone)}</h2>
          <p>{dashboard.timezone}</p>
        </div>
        <span className={dashboard.role === "system_owner" ? styles.monitorBadge : styles.ownerBadge}>
          {dashboard.role === "system_owner" ? "Monitor access" : "Venue remittance"}
        </span>
      </header>

      <div className={styles.kpiGrid} aria-label="Remittance summary">
        <article className={styles.kpiPrimary}>
          <span>Accrued platform fees</span>
          <strong>{money(dashboard.accumulated.amountDue, currency)}</strong>
          <small>{dashboard.accumulated.bookingsCount} eligible paid bookings not yet frozen</small>
        </article>
        <article className={styles.kpiCard}>
          <span>Open remaining</span>
          <strong>{money(openRemaining, currency)}</strong>
          <small>{dashboard.openRemittances.length} open remittance {dashboard.openRemittances.length === 1 ? "record" : "records"}</small>
        </article>
        <article className={styles.kpiCard}>
          <span>Settled total</span>
          <strong>{money(dashboard.settledTotal, currency)}</strong>
          <small>Accepted platform-fee remittances</small>
        </article>
        <article className={styles.kpiCard}>
          <span>Next due date</span>
          <strong className={styles.dateValue}>{localDate(dashboard.nextDueOn)}</strong>
          <small>Asia/Manila cycle date</small>
        </article>
      </div>

      <div className={styles.financeGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>Action status</span>
              <h3>{dashboard.canPrepare.allowed ? "Ready to prepare" : "Current cycle"}</h3>
            </div>
          </div>
          <p className={styles.actionReason}>{dashboard.canPrepare.reason}</p>
          {dashboard.role === "court_owner" && onPrepare ? (
            <button
              type="button"
              className={styles.primaryButton}
              disabled={!dashboard.canPrepare.allowed || preparing}
              onClick={onPrepare}
            >
              {preparing ? "Preparing…" : "Prepare remittance"}
            </button>
          ) : dashboard.role === "court_owner" ? (
            <div className={styles.monitorNote}>
              This page monitors the authoritative ledger. Remittance preparation remains in the protected submission workflow.
            </div>
          ) : (
            <div className={styles.monitorNote}>
              System Owner access is read-only here. The venue owner prepares and submits remittance from their authenticated account.
            </div>
          )}
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>Payment destination</span>
              <h3>{destination?.configured ? destination.method.replaceAll("_", " ") : "Setup incomplete"}</h3>
            </div>
          </div>
          {destination ? (
            <dl className={styles.destinationFacts}>
              <div><dt>Account</dt><dd>{destination.accountName || "Not configured"}</dd></div>
              <div><dt>Reference</dt><dd>{maskReference(destination.accountReference)}</dd></div>
            </dl>
          ) : (
            <p className={styles.emptyCopy}>No platform remittance destination is configured.</p>
          )}
        </article>
      </div>

      <div className={styles.ledgerGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>Open ledger</span>
              <h3>Remittances in progress</h3>
            </div>
            <span className={styles.summaryPill}>{dashboard.openRemittances.length} open</span>
          </div>
          {dashboard.openRemittances.length ? (
            <div className={styles.remittanceGrid}>
              {dashboard.openRemittances.map((item) => <RemittanceCard item={item} key={item.id} />)}
            </div>
          ) : (
            <p className={styles.emptyCopy}>There are no prepared, submitted, or unresolved remittances.</p>
          )}
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>Closed ledger</span>
              <h3>Settlement history</h3>
            </div>
            <span className={styles.summaryPill}>{history.length} records</span>
          </div>
          {history.length ? (
            <ol className={styles.historyList}>
              {history.map((item) => (
                <li key={item.id}>
                  <div><strong>{item.reference}</strong><span>{item.settledAt ? `Settled ${new Date(item.settledAt).toLocaleDateString("en-PH")}` : item.cancelledAt ? `Closed ${new Date(item.cancelledAt).toLocaleDateString("en-PH")}` : "Closed record"}</span></div>
                  <div><strong>{money(item.amountSettled, item.currency)}</strong><span className={`${styles.statusBadge} ${styles[`remittance_${item.status}`]}`}>{remittanceStatusLabel(item.status)}</span></div>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.emptyCopy}>No settled or void remittance history is recorded yet.</p>
          )}
        </article>
      </div>

      <details className={styles.boundaryNote}>
        <summary>About the ledger</summary>
        <p>Accrued fees are eligible paid booking fees not yet attached to a remittance. Open and settled values come from remittance records and accepted payments—not from the analytics chart or a browser-side fee estimate.</p>
      </details>
    </section>
  );
}
