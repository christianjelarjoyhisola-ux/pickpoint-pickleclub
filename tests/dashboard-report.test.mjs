import assert from "node:assert/strict";
import test from "node:test";
import { chunkReportRange, dashboardChartPoints, dashboardRange, mergeRegularBookingReports } from "../app/pickpoint-v2/admin/dashboard-report.ts";

function counts(overrides = {}) {
  return { pendingPayment: 0, paymentReview: 0, confirmed: 0, completed: 0, cancelled: 0, expired: 0, ...overrides };
}

function paymentCounts(overrides = {}) {
  return { unpaid: 0, pending: 0, partial: 0, paid: 0, refunded: 0, rejected: 0, ...overrides };
}

function report(dateFrom, dateTo, values = {}) {
  const daily = values.daily ?? [{ date: dateFrom, totalBookingCount: 2, recordedBookingHours: 3, bookedHours: 2, paidBookingCount: 1, venueSalesPaid: 300, platformBookingFeesPaid: 15, grossPaid: 315, recordedRefunds: 0, lifecycleCounts: counts({ completed: 1, cancelled: 1 }) }];
  const total = values.totalBookingCount ?? 2;
  const paid = values.paidBookingCount ?? 1;
  const gross = values.grossPaid ?? 315;
  return {
    contractVersion: 1, tenantSlug: "pickpoint-pickleclub", asOf: `${dateTo}T12:00:00Z`, timezone: "Asia/Manila",
    range: { dateFrom, dateTo, dayCount: daily.length, inclusive: true, basis: "local_booking_date" }, courtId: null, currency: "PHP", complete: true,
    completeness: { allMatchingRowsAggregated: true, aggregationComplete: true, anomalyCount: 0, currentStateSnapshot: true, fullPaymentEventLedgerIncluded: false, fullRefundEventLedgerIncluded: false },
    boundary: { bookingType: "regular", dateBasis: "local_booking_date", overnightHoursSplitAcrossDays: false, financialBasis: "snapshot", paidGrossDefinition: "paid", venueSalesDefinition: "venue", platformBookingFeeDefinition: "fee", recordedRefundDefinition: "refund", netRevenueIncluded: false, remittanceDueIncluded: false, remittanceContract: "get_booking_fee_remittance_dashboard" },
    summary: { totalBookingCount: total, recordedBookingHours: 3, bookedHours: 2, paidBookingCount: paid, venueSalesPaid: gross - 15, platformBookingFeesPaid: 15, grossPaid: gross, recordedRefundedBookingCount: values.refunded ?? 0, recordedRefunds: values.recordedRefunds ?? 0, averagePaidBookingValue: paid ? gross / paid : 0, lifecycleCounts: counts({ completed: 1, cancelled: 1 }), paymentCounts: paymentCounts({ paid, refunded: values.refunded ?? 0 }) },
    breakdowns: {
      daily,
      courts: [{ courtId: "11111111-1111-4111-8111-111111111111", courtName: "Court 1", courtStatus: "active", totalBookingCount: total, recordedBookingHours: 3, bookedHours: 2, paidBookingCount: paid, venueSalesPaid: gross - 15, platformBookingFeesPaid: 15, grossPaid: gross, recordedRefunds: values.recordedRefunds ?? 0 }],
      paymentStatuses: ["unpaid", "pending", "partial", "paid", "refunded", "rejected"].map(status => ({ status, bookingCount: status === "paid" ? paid : status === "refunded" ? values.refunded ?? 0 : 0, customerTotalSnapshot: 0, grossPaid: status === "paid" ? gross : 0, recordedRefunds: status === "refunded" ? values.recordedRefunds ?? 0 : 0 })),
      lifecycleStatuses: ["pending_payment", "payment_review", "confirmed", "completed", "cancelled", "expired"].map(status => ({ status, bookingCount: status === "completed" || status === "cancelled" ? 1 : 0, recordedBookingHours: 0, bookedHours: status === "completed" ? 2 : 0, grossPaid: status === "completed" ? gross : 0, recordedRefunds: 0 })),
    },
  };
}

test("calculates every dashboard period boundary", () => {
  assert.deepEqual(dashboardRange("today", "2026-09-17"), { dateFrom: "2026-09-17", dateTo: "2026-09-17" });
  assert.deepEqual(dashboardRange("last7", "2026-09-17"), { dateFrom: "2026-09-11", dateTo: "2026-09-17" });
  assert.deepEqual(dashboardRange("currentMonth", "2026-09-17"), { dateFrom: "2026-09-01", dateTo: "2026-09-17" });
  assert.deepEqual(dashboardRange("previousMonth", "2026-03-08"), { dateFrom: "2026-02-01", dateTo: "2026-02-28" });
  assert.deepEqual(dashboardRange("previousMonth", "2024-03-08"), { dateFrom: "2024-02-01", dateTo: "2024-02-29" });
  assert.deepEqual(dashboardRange("allTime", "2026-09-17", "2025-01-03"), { dateFrom: "2025-01-03", dateTo: "2026-09-17" });
});

test("chunks all-time reporting into at most 365 inclusive days", () => {
  const chunks = chunkReportRange("2024-01-01", "2026-09-17");
  assert.equal(chunks[0].dateFrom, "2024-01-01");
  assert.equal(chunks.at(-1).dateTo, "2026-09-17");
  for (const chunk of chunks) {
    const days = Math.round((Date.parse(`${chunk.dateTo}T00:00:00Z`) - Date.parse(`${chunk.dateFrom}T00:00:00Z`)) / 86_400_000) + 1;
    assert.ok(days <= 365);
  }
  for (let index = 1; index < chunks.length; index++) assert.equal(Date.parse(`${chunks[index].dateFrom}T00:00:00Z`) - Date.parse(`${chunks[index - 1].dateTo}T00:00:00Z`), 86_400_000);
});

test("merges yearly reports without mixing fees, refunds, or cancelled hours", () => {
  const merged = mergeRegularBookingReports([
    report("2025-01-01", "2025-12-31", { grossPaid: 315, recordedRefunds: 100, refunded: 1 }),
    report("2026-01-01", "2026-09-17", { grossPaid: 630, paidBookingCount: 2 }),
  ]);
  assert.equal(merged.summary.grossPaid, 945);
  assert.equal(merged.summary.platformBookingFeesPaid, 30);
  assert.equal(merged.summary.recordedRefunds, 100);
  assert.equal(merged.summary.paidBookingCount, 3);
  assert.equal(merged.summary.averagePaidBookingValue, 315);
  assert.equal(merged.summary.bookedHours, 4);
  assert.equal(merged.summary.lifecycleCounts.cancelled, 2);
  assert.equal(merged.breakdowns.courts[0].grossPaid, 945);
});

test("groups month and all-time charts without horizontal-only data", () => {
  const daily = [
    { date: "2026-01-03", totalBookingCount: 1, recordedBookingHours: 1, bookedHours: 1, paidBookingCount: 1, venueSalesPaid: 255, platformBookingFeesPaid: 15, grossPaid: 270, recordedRefunds: 0, lifecycleCounts: counts({ completed: 1 }) },
    { date: "2026-01-10", totalBookingCount: 1, recordedBookingHours: 1, bookedHours: 1, paidBookingCount: 1, venueSalesPaid: 305, platformBookingFeesPaid: 15, grossPaid: 320, recordedRefunds: 0, lifecycleCounts: counts({ completed: 1 }) },
    { date: "2026-02-02", totalBookingCount: 1, recordedBookingHours: 1, bookedHours: 1, paidBookingCount: 1, venueSalesPaid: 305, platformBookingFeesPaid: 15, grossPaid: 320, recordedRefunds: 0, lifecycleCounts: counts({ completed: 1 }) },
  ];
  const source = report("2026-01-03", "2026-02-02", { daily, grossPaid: 910, paidBookingCount: 3, totalBookingCount: 3 });
  const months = dashboardChartPoints("allTime", source, []);
  assert.deepEqual(months.map(item => [item.key, item.bookings, item.revenue]), [["2026-01", 2, 590], ["2026-02", 1, 320]]);
  assert.equal(dashboardChartPoints("previousMonth", source, []).length, 3);
});
