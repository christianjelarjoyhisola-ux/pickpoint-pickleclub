import type { Booking, RegularBookingReport } from "../../manage/management-adapter";

export type DashboardPeriod = "today" | "last7" | "previousMonth" | "currentMonth" | "allTime";
export type DashboardChartMode = "bookings" | "revenue";

export const DASHBOARD_PERIODS: Array<{ value: DashboardPeriod; label: string }> = [
  { value: "today", label: "Today" },
  { value: "last7", label: "Last 7 days" },
  { value: "previousMonth", label: "Previous month" },
  { value: "currentMonth", label: "Current month" },
  { value: "allTime", label: "All time" },
];

const DAY_MS = 86_400_000;
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const dateAtNoon = (value: string) => new Date(`${value}T12:00:00Z`);

export function shiftDate(value: string, days: number): string {
  const date = dateAtNoon(value);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

export function dashboardRange(period: DashboardPeriod, today: string, earliest: string | null = null) {
  if (period === "today") return { dateFrom: today, dateTo: today };
  if (period === "last7") return { dateFrom: shiftDate(today, -6), dateTo: today };
  const current = dateAtNoon(today);
  const year = current.getUTCFullYear();
  const month = current.getUTCMonth();
  if (period === "currentMonth") {
    return { dateFrom: isoDate(new Date(Date.UTC(year, month, 1))), dateTo: today };
  }
  if (period === "previousMonth") {
    return {
      dateFrom: isoDate(new Date(Date.UTC(year, month - 1, 1))),
      dateTo: isoDate(new Date(Date.UTC(year, month, 0))),
    };
  }
  return { dateFrom: earliest && earliest <= today ? earliest : today, dateTo: today };
}

export function chunkReportRange(dateFrom: string, dateTo: string) {
  const chunks: Array<{ dateFrom: string; dateTo: string }> = [];
  let cursor = dateFrom;
  while (cursor <= dateTo) {
    const end = shiftDate(cursor, 364);
    const boundedEnd = end < dateTo ? end : dateTo;
    chunks.push({ dateFrom: cursor, dateTo: boundedEnd });
    cursor = shiftDate(boundedEnd, 1);
  }
  return chunks;
}

const lifecycleKeys = ["pendingPayment", "paymentReview", "confirmed", "completed", "cancelled", "expired"] as const;
const paymentKeys = ["unpaid", "pending", "partial", "paid", "refunded", "rejected"] as const;
const lifecycleStatuses = ["pending_payment", "payment_review", "confirmed", "completed", "cancelled", "expired"] as const;

export function mergeRegularBookingReports(reports: RegularBookingReport[]): RegularBookingReport {
  if (!reports.length) throw new Error("REPORT_RANGES_REQUIRED");
  if (reports.length === 1) return reports[0];
  const first = reports[0];
  const last = reports.at(-1)!;
  if (reports.some(report => report.tenantSlug !== first.tenantSlug || report.currency !== first.currency || report.courtId !== first.courtId)) {
    throw new Error("REPORT_RANGES_INCOMPATIBLE");
  }
  const sum = (pick: (report: RegularBookingReport) => number) => reports.reduce((total, report) => total + pick(report), 0);
  const lifecycleCounts = Object.fromEntries(lifecycleKeys.map(key => [key, sum(report => report.summary.lifecycleCounts[key])])) as RegularBookingReport["summary"]["lifecycleCounts"];
  const paymentCounts = Object.fromEntries(paymentKeys.map(key => [key, sum(report => report.summary.paymentCounts[key])])) as RegularBookingReport["summary"]["paymentCounts"];
  const paidBookingCount = sum(report => report.summary.paidBookingCount);
  const grossPaid = sum(report => report.summary.grossPaid);
  const courtMap = new Map<string, RegularBookingReport["breakdowns"]["courts"][number]>();
  for (const report of reports) for (const court of report.breakdowns.courts) {
    const current = courtMap.get(court.courtId);
    courtMap.set(court.courtId, current ? {
      ...court,
      totalBookingCount: current.totalBookingCount + court.totalBookingCount,
      recordedBookingHours: current.recordedBookingHours + court.recordedBookingHours,
      bookedHours: current.bookedHours + court.bookedHours,
      paidBookingCount: current.paidBookingCount + court.paidBookingCount,
      venueSalesPaid: current.venueSalesPaid + court.venueSalesPaid,
      platformBookingFeesPaid: current.platformBookingFeesPaid + court.platformBookingFeesPaid,
      grossPaid: current.grossPaid + court.grossPaid,
      recordedRefunds: current.recordedRefunds + court.recordedRefunds,
    } : { ...court });
  }
  const paymentStatuses = paymentKeys.map(status => ({
    status,
    bookingCount: sum(report => report.breakdowns.paymentStatuses.find(item => item.status === status)?.bookingCount ?? 0),
    customerTotalSnapshot: sum(report => report.breakdowns.paymentStatuses.find(item => item.status === status)?.customerTotalSnapshot ?? 0),
    grossPaid: sum(report => report.breakdowns.paymentStatuses.find(item => item.status === status)?.grossPaid ?? 0),
    recordedRefunds: sum(report => report.breakdowns.paymentStatuses.find(item => item.status === status)?.recordedRefunds ?? 0),
  }));
  const mergedLifecycleStatuses = lifecycleStatuses.map(status => ({
    status,
    bookingCount: sum(report => report.breakdowns.lifecycleStatuses.find(item => item.status === status)?.bookingCount ?? 0),
    recordedBookingHours: sum(report => report.breakdowns.lifecycleStatuses.find(item => item.status === status)?.recordedBookingHours ?? 0),
    bookedHours: sum(report => report.breakdowns.lifecycleStatuses.find(item => item.status === status)?.bookedHours ?? 0),
    grossPaid: sum(report => report.breakdowns.lifecycleStatuses.find(item => item.status === status)?.grossPaid ?? 0),
    recordedRefunds: sum(report => report.breakdowns.lifecycleStatuses.find(item => item.status === status)?.recordedRefunds ?? 0),
  }));
  return {
    ...first,
    asOf: last.asOf,
    range: {
      ...first.range,
      dateFrom: first.range.dateFrom,
      dateTo: last.range.dateTo,
      dayCount: Math.round((Date.parse(`${last.range.dateTo}T00:00:00Z`) - Date.parse(`${first.range.dateFrom}T00:00:00Z`)) / DAY_MS) + 1,
    },
    complete: reports.every(report => report.complete),
    completeness: {
      ...first.completeness,
      aggregationComplete: reports.every(report => report.completeness.aggregationComplete),
      anomalyCount: sum(report => report.completeness.anomalyCount),
    },
    summary: {
      totalBookingCount: sum(report => report.summary.totalBookingCount),
      recordedBookingHours: sum(report => report.summary.recordedBookingHours),
      bookedHours: sum(report => report.summary.bookedHours),
      paidBookingCount,
      venueSalesPaid: sum(report => report.summary.venueSalesPaid),
      platformBookingFeesPaid: sum(report => report.summary.platformBookingFeesPaid),
      grossPaid,
      recordedRefundedBookingCount: sum(report => report.summary.recordedRefundedBookingCount),
      recordedRefunds: sum(report => report.summary.recordedRefunds),
      averagePaidBookingValue: paidBookingCount ? grossPaid / paidBookingCount : 0,
      lifecycleCounts,
      paymentCounts,
    },
    breakdowns: {
      daily: reports.flatMap(report => report.breakdowns.daily),
      courts: [...courtMap.values()],
      paymentStatuses,
      lifecycleStatuses: mergedLifecycleStatuses,
    },
  };
}

export type DashboardChartPoint = { key: string; label: string; bookings: number; revenue: number };

export function dashboardChartPoints(period: DashboardPeriod, report: RegularBookingReport, bookings: Booking[]): DashboardChartPoint[] {
  if (period === "today") {
    const date = report.range.dateTo;
    return Array.from({ length: 19 }, (_, index) => {
      const hour = index + 5;
      const hourBookings = bookings.filter(booking => booking.bookingDate === date && Number.parseInt(booking.startTime?.slice(0, 2) ?? "-1") === hour);
      return {
        key: `${date}-${hour}`,
        label: `${hour % 12 || 12}${hour < 12 ? "a" : "p"}`,
        bookings: hourBookings.length,
        revenue: hourBookings.filter(booking => booking.payment === "paid").reduce((total, booking) => total + booking.amount, 0),
      };
    });
  }
  const buckets = new Map<string, DashboardChartPoint>();
  for (const item of report.breakdowns.daily) {
    const date = dateAtNoon(item.date);
    let key = item.date;
    let label = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
    if (period === "currentMonth" || period === "previousMonth") {
      const week = Math.floor((date.getUTCDate() - 1) / 7) + 1;
      key = `${date.getUTCFullYear()}-${date.getUTCMonth()}-w${week}`;
      label = `Week ${week}`;
    } else if (period === "allTime") {
      key = item.date.slice(0, 7);
      label = new Intl.DateTimeFormat("en-PH", { month: "short", year: "2-digit", timeZone: "UTC" }).format(date);
    }
    const current = buckets.get(key) ?? { key, label, bookings: 0, revenue: 0 };
    current.bookings += item.paidBookingCount;
    current.revenue += item.grossPaid;
    buckets.set(key, current);
  }
  return [...buckets.values()];
}
