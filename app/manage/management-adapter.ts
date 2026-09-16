import { activeTenant } from "../tenants/registry";
import { normalizeTwoBandSchedule } from "../lib/operating-hours";
import {
  PlatformRequestError,
  activateTenantInitially,
  applySharedCourtSchedule,
  cancelTenantBooking,
  checkInTenantBooking,
  createTenantPromotion,
  createManualBooking,
  currentOwnerSession,
  deleteTenantPaymentQr,
  getActivationSettings,
  getBlockedDateAccess,
  getBookingFeeRemittanceDashboard,
  getBookingFeeRemittanceHistory,
  getManagerCourts,
  getManagerPromotions,
  getManagerRegularBookingReport,
  getManagerSession,
  getPaymentReceiptView,
  getRemittanceDestination,
  getTenantPolicy,
  listManagerBlocks,
  listManagerBookings,
  manageBlockedDates,
  manageTenantCourt,
  platformMode,
  previewBookingReschedule,
  reviewPaymentReceipt,
  rescheduleBooking,
  saveRemittanceDestination,
  saveTenantPolicy,
  updateActivationSettings,
  updateBusinessSettings,
  uploadTenantPaymentQr,
  type BookingReschedulePreview,
} from "../lib/platform/client";

export type TenantRole = "owner" | "admin" | "staff" | "host";

export type ManagementCapability =
  | "booking:create"
  | "booking:update"
  | "booking:cancel"
  | "booking:check-in"
  | "payment:review"
  | "payment:asset"
  | "schedule:block"
  | "customer:view"
  | "report:view"
  | "finance:view"
  | "settings:update"
  | "tenant:publish";

export type ManagementContext = {
  tenantSlug: string;
  role: TenantRole;
  capabilities: ManagementCapability[];
};

export type BookingStatus =
  | "confirmed"
  | "awaiting_receipt"
  | "receipt_processing"
  | "payment_review"
  | "payment_attention"
  | "checked_in"
  | "completed"
  | "cancelled"
  | "expired";

export type BookingPaymentStatus =
  | "unpaid"
  | "pending"
  | "partial"
  | "paid"
  | "refunded"
  | "rejected"
  | "unknown";

export type Booking = {
  bookingId: string;
  bookingType: "regular" | "event";
  reference: string;
  id: string;
  customer: string;
  initials: string;
  phone: string;
  court: string;
  date: string;
  time: string;
  duration: string;
  amount: number;
  status: BookingStatus;
  payment: BookingPaymentStatus;
  courtId: string;
  bookingDate: string | null;
  startTime: string | null;
  paymentEvidence?: PaymentEvidence | null;
};

export type PaymentEvidenceStatus =
  | "pending"
  | "manual_review"
  | "auto_approved"
  | "approved"
  | "short_payment"
  | "rejected";

export type PaymentEvidence = {
  verificationId: string;
  status: PaymentEvidenceStatus;
  submittedReference: string | null;
  detectedReference: string | null;
  paymentMethod: string | null;
  paymentAttemptedAt: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  expectedAmount: number | null;
  detectedAmounts: number[];
  receiptIssuedAt: string | null;
  confidence: number | null;
  flags: string[];
  reviewable: boolean;
};

export type PaymentReceiptView = {
  signedUrl: string;
  expiresAt: string;
  verificationId: string;
  status: PaymentEvidenceStatus;
};

export type TenantPolicyConfiguration = {
  permissions: { canManagePolicy: boolean; canPublishPolicy: boolean };
  draft: { title: string; intro: string; content: string } | null;
  publishedPolicy: {
    version: string;
    title: string;
    intro: string;
    content: string;
    ownerApproved: true;
  } | null;
  revision: string | null;
  publishedRevision: string | null;
  policyConfigured: boolean;
};

export type RemittanceDestination = {
  method: "gcash" | "maya" | "bank_transfer" | "other";
  accountName: string;
  accountReference: string;
  dueDay: number;
  instructions: string | null;
  qrUrl: string | null;
};

export type ReportLifecycleCounts = {
  pendingPayment: number;
  paymentReview: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  expired: number;
};

export type ReportPaymentCounts = {
  unpaid: number;
  pending: number;
  partial: number;
  paid: number;
  refunded: number;
  rejected: number;
};

export type RegularBookingReport = {
  contractVersion: 1;
  tenantSlug: string;
  asOf: string;
  timezone: string;
  range: {
    dateFrom: string;
    dateTo: string;
    dayCount: number;
    inclusive: true;
    basis: "local_booking_date";
  };
  courtId: string | null;
  currency: string;
  complete: boolean;
  completeness: {
    allMatchingRowsAggregated: true;
    aggregationComplete: boolean;
    anomalyCount: number;
    currentStateSnapshot: true;
    fullPaymentEventLedgerIncluded: false;
    fullRefundEventLedgerIncluded: false;
  };
  boundary: {
    bookingType: "regular";
    dateBasis: "local_booking_date";
    overnightHoursSplitAcrossDays: false;
    financialBasis: string;
    paidGrossDefinition: string;
    venueSalesDefinition: string;
    platformBookingFeeDefinition: string;
    recordedRefundDefinition: string;
    netRevenueIncluded: false;
    remittanceDueIncluded: false;
    remittanceContract: "get_booking_fee_remittance_dashboard";
  };
  summary: {
    totalBookingCount: number;
    recordedBookingHours: number;
    bookedHours: number;
    paidBookingCount: number;
    venueSalesPaid: number;
    platformBookingFeesPaid: number;
    grossPaid: number;
    recordedRefundedBookingCount: number;
    recordedRefunds: number;
    averagePaidBookingValue: number;
    lifecycleCounts: ReportLifecycleCounts;
    paymentCounts: ReportPaymentCounts;
  };
  breakdowns: {
    daily: Array<{
      date: string;
      totalBookingCount: number;
      recordedBookingHours: number;
      bookedHours: number;
      paidBookingCount: number;
      venueSalesPaid: number;
      platformBookingFeesPaid: number;
      grossPaid: number;
      recordedRefunds: number;
      lifecycleCounts: ReportLifecycleCounts;
    }>;
    courts: Array<{
      courtId: string;
      courtName: string;
      courtStatus: string;
      totalBookingCount: number;
      recordedBookingHours: number;
      bookedHours: number;
      paidBookingCount: number;
      venueSalesPaid: number;
      platformBookingFeesPaid: number;
      grossPaid: number;
      recordedRefunds: number;
    }>;
    paymentStatuses: Array<{
      status: keyof ReportPaymentCounts;
      bookingCount: number;
      customerTotalSnapshot: number;
      grossPaid: number;
      recordedRefunds: number;
    }>;
    lifecycleStatuses: Array<{
      status: "pending_payment" | "payment_review" | "confirmed" | "completed" | "cancelled" | "expired";
      bookingCount: number;
      recordedBookingHours: number;
      bookedHours: number;
      grossPaid: number;
      recordedRefunds: number;
    }>;
  };
};

export type RemittanceStatus =
  | "draft"
  | "due"
  | "submitted"
  | "under_review"
  | "settled"
  | "rejected"
  | "void";

export type RemittanceSummary = {
  id: string;
  reference: string;
  venueName: string;
  status: RemittanceStatus;
  cycleDueOn: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  preparedAt: string;
  submittedAt: string | null;
  settledAt: string | null;
  cancelledAt: string | null;
  amountDue: number;
  amountSettled: number;
  remainingBalance: number;
  currency: string;
  bookingsCount: number;
  billableHours: number;
};

export type RemittanceDashboard = {
  serverNow: string;
  timezone: string;
  role: "system_owner" | "court_owner";
  nextDueOn: string;
  canPrepare: { allowed: boolean; reason: string };
  accumulated: {
    bookingsCount: number;
    billableHours: number;
    flatFeeBookingCount: number;
    amountDue: number;
  };
  openRemittances: RemittanceSummary[];
  settledTotal: number;
  paymentDestination: {
    method: "gcash" | "maya" | "bank_transfer" | "other";
    accountName: string | null;
    accountReference: string | null;
    instructions: string | null;
    configured: boolean;
  } | null;
};

export type ManagementInsights = {
  mode: "preview" | "live";
  report: RegularBookingReport | null;
  finance: {
    dashboard: RemittanceDashboard;
    history: RemittanceSummary[];
  } | null;
  promotions: TenantPromotionState;
  loadedAt: string;
};

export type TenantPromotion = {
  id: string;
  name: string;
  status: "active" | "paused" | "ended";
  discountType: "percentage" | "fixed_amount";
  discountValue: number;
  weekdays: number[];
  startsAt: string;
  endsAt: string;
  validFrom: string;
  validUntil: string;
  courtIds: string[];
  maxRedemptions: number | null;
  redemptionCount: number;
};

export type TenantPromotionState = {
  available: boolean;
  canCreate: boolean;
  items: TenantPromotion[];
};

export type PromotionCreateInput = {
  name: string;
  discountType: "percentage" | "fixed_amount";
  discountValue: number;
  weekdays: number[];
  startsAt: string;
  endsAt: string;
  validFrom: string;
  validUntil: string;
  courtIds: string[];
  maxRedemptions?: number | null;
};

export type ManagementInsightFilters = {
  dateFrom: string;
  dateTo: string;
  courtId?: string | null;
};

export type Customer = {
  id: string;
  name: string;
  initials: string;
  contact: string;
  visits: number;
  lifetimeValue: number;
  lastVisit: string;
  note?: string;
  phone?: string | null;
  email?: string | null;
  totalBookings?: number;
  completedVisits?: number;
  upcomingBookings?: number;
  cancelledBookings?: number;
  nextBooking?: string | null;
  identityStatus?: "resolved" | "needs_details" | "review";
  bookingHistory?: Array<{
    bookingId: string;
    reference: string;
    date: string;
    time: string;
    court: string;
    amount: number;
    status: BookingStatus;
    payment: BookingPaymentStatus;
  }>;
};

export type Court = {
  id: string;
  slug: string;
  name: string;
  description: string;
  surface: string;
  status: "active" | "inactive" | "maintenance";
  sortOrder: number;
  opensAt: string | null;
  closesAt: string | null;
  rateDay: number | null;
  ratePeak: number | null;
  photoUrl: string | null;
};

export type SharedPriceBand = {
  start: string;
  end: string;
  hourlyRate: number;
};

export type ManagementSession = {
  role: TenantRole;
  serverRole: string;
  membershipRole: TenantRole | null;
  isSystemOwner: boolean;
  displayName: string;
  email: string;
  capabilities: ManagementCapability[];
};

export type PaymentMethodConfiguration = {
  methodCode: string;
  displayName: string;
  accountName: string;
  accountNumber: string;
  instructions: string | null;
  qrUrl: string | null;
  isActive: boolean;
  sortOrder: number;
};

export type BusinessPaymentConfiguration = {
  revision: string;
  business: {
    displayName: string;
    contactPhone: string | null;
    facebookUrl: string | null;
    tagline: string | null;
    eventBookingEnabled: boolean;
  };
  venue: {
    replyToEmail: string | null;
    emailEnabled: boolean;
    publicBookingEnabled: boolean;
  };
  paymentMethods: PaymentMethodConfiguration[];
  platformBilling: {
    feeMode: "fixed_per_booking" | "fixed_per_hour" | "percentage";
    feeAmount: number;
    isConfigured: boolean;
  } | null;
};

export type LiveConfiguration = {
  sharedSchedule: {
    opensAt: string;
    closesAt: string;
    bands: SharedPriceBand[];
  } | null;
  scheduleIsUniform: boolean;
  blockAccessExpiresAt: string | null;
  blockAccessStatus: "available" | "unavailable";
  businessPayments: BusinessPaymentConfiguration | null;
  businessPaymentsStatus: "editable" | "incomplete" | "unavailable";
  activationPermissions: {
    canManageVenueSettings: boolean;
    canManagePlatformBilling: boolean;
    canActivatePublicBooking: boolean;
  };
  toolAvailability: Partial<Record<ManagementCapability, boolean>>;
  policy: TenantPolicyConfiguration | null;
  policyStatus: "available" | "unavailable";
  remittanceDestination: RemittanceDestination | null;
  remittanceStatus: "available" | "missing" | "unavailable";
  launchRequirementsV2Required: boolean;
};

export type ScheduleSlot = {
  id: string;
  courtId: string;
  start: string;
  end: string;
  label: string;
  detail: string;
  kind: "booking" | "hold" | "block";
};

export type CourtBlock = {
  id: string;
  court: string;
  date: string;
  dateValue: string | null;
  time: string;
  reason: string;
  publicLabel: string;
  internalReason: string | null;
  createdBy: string | null;
};

export type CalendarDaySnapshot = {
  bookings: Booking[];
  blocks: CourtBlock[];
};

export type SetupItem = {
  id: string;
  label: string;
  detail: string;
  complete: boolean;
};

export type ManagementSnapshot = {
  tenant: {
    slug: string;
    name: string;
    venueLabel: string;
    timezone: string;
    currency: "PHP";
    mode: "preview" | "live";
    lastSynced: string;
  };
  bookings: Booking[];
  customers: Customer[];
  courts: Court[];
  schedule: ScheduleSlot[];
  blocks: CourtBlock[];
  setup: SetupItem[];
  session: ManagementSession;
  configuration: LiveConfiguration;
};

export type ManagementActionResult = {
  ok: true;
  message: string;
  tenantRevision?: string;
};

export type ManagementBookingReschedulePreview = BookingReschedulePreview;

/**
 * The management route consumes this interface only. The production adapter can
 * map the shared tenant/auth/API response to this shape without changing the UI.
 * Capabilities must come from the authenticated server session; the client never
 * treats the preview role selector as authority.
 */
export interface ManagementAdapter {
  load(context: ManagementContext): Promise<ManagementSnapshot>;
  loadCalendarDay(
    context: ManagementContext,
    current: ManagementSnapshot,
    date: string,
  ): Promise<CalendarDaySnapshot>;
  loadReschedulePreview(
    context: ManagementContext,
    bookingReference: string,
    date: string,
  ): Promise<ManagementBookingReschedulePreview>;
  loadInsights(
    context: ManagementContext,
    filters: ManagementInsightFilters,
  ): Promise<ManagementInsights>;
  refreshOperations(
    context: ManagementContext,
    current: ManagementSnapshot,
  ): Promise<ManagementSnapshot>;
  loadPaymentReceipt(
    context: ManagementContext,
    verificationId: string,
  ): Promise<PaymentReceiptView>;
  createPromotion(
    context: ManagementContext,
    input: PromotionCreateInput,
  ): Promise<TenantPromotion>;
  uploadPaymentQr(
    context: ManagementContext,
    methodCode: string,
    file: File,
  ): Promise<{ url: string; contentType: string; tenantRevision: string }>;
  perform(
    context: ManagementContext,
    action: { type: string; resourceId?: string; payload?: unknown },
  ): Promise<ManagementActionResult>;
}

export const previewRoleSessions: Record<TenantRole, ManagementCapability[]> = {
  owner: [
    "booking:create",
    "booking:update",
    "booking:cancel",
    "payment:review",
    "payment:asset",
    "customer:view",
    "report:view",
    "finance:view",
    "settings:update",
  ],
  admin: [
    "booking:create",
    "booking:update",
    "booking:cancel",
    "payment:review",
    "customer:view",
    "report:view",
    "finance:view",
    "settings:update",
  ],
  staff: [
    "booking:create",
    "payment:review",
    "customer:view",
  ],
  host: [],
};

export const previewSnapshot: ManagementSnapshot = {
  tenant: {
    slug: activeTenant.identity.slug,
    name: activeTenant.identity.shortName,
    venueLabel: `${activeTenant.identity.shortName} · Preview venue`,
    timezone: activeTenant.identity.timezone,
    currency: activeTenant.identity.currency,
    mode: "preview",
    lastSynced: "Today, 2:18 PM",
  },
  courts: activeTenant.previewCourts.map((court) => ({
    id: court.id,
    slug: court.slug,
    name: court.name,
    description: court.description,
    surface: court.surface,
    status: "active",
    sortOrder: activeTenant.previewCourts.findIndex((item) => item.id === court.id),
    opensAt: activeTenant.venue.opensAt,
    closesAt: activeTenant.venue.closesAt,
    rateDay: activeTenant.booking.offPeakHourlyRate,
    ratePeak: activeTenant.booking.peakHourlyRate,
    photoUrl: null,
  })),
  bookings: [
    {
      bookingId: "11111111-1111-4111-8111-111111111111",
      bookingType: "regular",
      reference: "DT-2848",
      id: "DT-2848",
      customer: "Arielle Santos",
      initials: "AS",
      phone: "+63 917 204 1188",
      court: "Court 01",
      date: "Aug 8",
      time: "6:00–7:00 PM",
      duration: "1 hr",
      amount: 400,
      status: "confirmed",
      payment: "paid",
      courtId: activeTenant.previewCourts[0].id,
      bookingDate: "2026-08-08",
      startTime: "18:00",
    },
    {
      bookingId: "22222222-2222-4222-8222-222222222222",
      bookingType: "regular",
      reference: "DT-2849",
      id: "DT-2849",
      customer: "Miguel Tan",
      initials: "MT",
      phone: "+63 945 808 2104",
      court: "Court 02",
      date: "Aug 8",
      time: "7:00–9:00 PM",
      duration: "2 hrs",
      amount: 800,
      status: "awaiting_receipt",
      payment: "unpaid",
      courtId: activeTenant.previewCourts[1].id,
      bookingDate: "2026-08-08",
      startTime: "19:00",
    },
    {
      bookingId: "33333333-3333-4333-8333-333333333333",
      bookingType: "regular",
      reference: "DT-2850",
      id: "DT-2850",
      customer: "Bea Cruz",
      initials: "BC",
      phone: "+63 998 312 7710",
      court: "Court 01",
      date: "Aug 8",
      time: "8:00–9:00 PM",
      duration: "1 hr",
      amount: 400,
      status: "checked_in",
      payment: "paid",
      courtId: activeTenant.previewCourts[0].id,
      bookingDate: "2026-08-08",
      startTime: "20:00",
    },
    {
      bookingId: "44444444-4444-4444-8444-444444444444",
      bookingType: "regular",
      reference: "DT-2841",
      id: "DT-2841",
      customer: "Nico de Leon",
      initials: "ND",
      phone: "+63 917 511 6024",
      court: "Court 02",
      date: "Aug 8",
      time: "3:00–5:00 PM",
      duration: "2 hrs",
      amount: 600,
      status: "completed",
      payment: "paid",
      courtId: activeTenant.previewCourts[1].id,
      bookingDate: "2026-08-08",
      startTime: "15:00",
    },
    {
      bookingId: "55555555-5555-4555-8555-555555555555",
      bookingType: "regular",
      reference: "DT-2854",
      id: "DT-2854",
      customer: "Thea Lim",
      initials: "TL",
      phone: "+63 905 440 0389",
      court: "Court 02",
      date: "Aug 9",
      time: "9:00–10:00 AM",
      duration: "1 hr",
      amount: 300,
      status: "confirmed",
      payment: "paid",
      courtId: activeTenant.previewCourts[1].id,
      bookingDate: "2026-08-09",
      startTime: "09:00",
    },
  ],
  schedule: [
    {
      id: "slot-01",
      courtId: activeTenant.previewCourts[0].id,
      start: "09:00",
      end: "10:00",
      label: "Lara V.",
      detail: "Paid · 1 hr",
      kind: "booking",
    },
    {
      id: "slot-02",
      courtId: activeTenant.previewCourts[1].id,
      start: "10:00",
      end: "12:00",
      label: "Team North",
      detail: "Paid · 2 hrs",
      kind: "booking",
    },
    {
      id: "slot-03",
      courtId: activeTenant.previewCourts[0].id,
      start: "13:00",
      end: "14:00",
      label: "Payment hold",
      detail: "Expires 2:32 PM",
      kind: "hold",
    },
    {
      id: "slot-04",
      courtId: activeTenant.previewCourts[1].id,
      start: "14:00",
      end: "15:00",
      label: "Maintenance",
      detail: "Net adjustment",
      kind: "block",
    },
    {
      id: "slot-05",
      courtId: activeTenant.previewCourts[0].id,
      start: "18:00",
      end: "19:00",
      label: "Arielle S.",
      detail: "Paid · 1 hr",
      kind: "booking",
    },
    {
      id: "slot-06",
      courtId: activeTenant.previewCourts[1].id,
      start: "19:00",
      end: "21:00",
      label: "Miguel T.",
      detail: "Payment due",
      kind: "hold",
    },
  ],
  blocks: [
    {
      id: "BLK-040",
      court: "Court 02",
      date: "Aug 8, 2026",
      dateValue: "2026-08-08",
      time: "2:00–3:00 PM",
      reason: "Maintenance",
      publicLabel: "Maintenance",
      internalReason: "Net adjustment",
      createdBy: "Mara · admin",
    },
    {
      id: "BLK-039",
      court: "All courts",
      date: "Aug 12, 2026",
      dateValue: "2026-08-12",
      time: "6:00–8:00 AM",
      reason: "Closed",
      publicLabel: "Closed",
      internalReason: "Monthly deep clean",
      createdBy: "Alex · owner",
    },
  ],
  customers: [
    {
      id: "CUS-1091",
      name: "Arielle Santos",
      initials: "AS",
      contact: "+63 917 204 1188",
      visits: 14,
      lifetimeValue: 6200,
      lastVisit: "Today",
      note: "Prefers Court 01",
    },
    {
      id: "CUS-1034",
      name: "Miguel Tan",
      initials: "MT",
      contact: "+63 945 808 2104",
      visits: 9,
      lifetimeValue: 5100,
      lastVisit: "Today",
    },
    {
      id: "CUS-1170",
      name: "Bea Cruz",
      initials: "BC",
      contact: "+63 998 312 7710",
      visits: 6,
      lifetimeValue: 2700,
      lastVisit: "Today",
      note: "New league inquiry",
    },
    {
      id: "CUS-0988",
      name: "Nico de Leon",
      initials: "ND",
      contact: "+63 917 511 6024",
      visits: 21,
      lifetimeValue: 9400,
      lastVisit: "Today",
    },
  ],
  setup: [
    {
      id: "brand",
      label: "Tenant identity",
      detail: "PickPoint name, slug and brand palette",
      complete: true,
    },
    {
      id: "courts",
      label: "Court inventory",
      detail: `${activeTenant.previewCourts.length} preview courts configured`,
      complete: true,
    },
    {
      id: "hours",
      label: "Operating hours",
      detail: "Daily, 6:00 AM–10:00 PM",
      complete: true,
    },
    {
      id: "rates",
      label: "Preview rates",
      detail: "₱300 day / ₱400 peak per hour",
      complete: true,
    },
    {
      id: "venue",
      label: "Verify venue details",
      detail: "Confirm final address and court names",
      complete: false,
    },
    {
      id: "payment",
      label: "Connect payments",
      detail: "Add the verified GCash destination",
      complete: false,
    },
    {
      id: "policy",
      label: "Approve customer rules",
      detail: "Confirm cancellation and reschedule policy",
      complete: false,
    },
    {
      id: "owner",
      label: "Verify owner & domain",
      detail: "Activate owner account and booking URL",
      complete: false,
    },
  ],
  session: {
    role: "owner",
    serverRole: "preview",
    membershipRole: "owner",
    isSystemOwner: false,
    displayName: "Alex Rivera",
    email: "Preview session",
    capabilities: previewRoleSessions.owner,
  },
  configuration: {
    sharedSchedule: {
      opensAt: activeTenant.venue.opensAt,
      closesAt: activeTenant.venue.closesAt,
      bands: [
        {
          start: activeTenant.venue.opensAt,
          end: activeTenant.booking.offPeakEndsAt,
          hourlyRate: activeTenant.booking.offPeakHourlyRate,
        },
        {
          start: activeTenant.booking.offPeakEndsAt,
          end: activeTenant.venue.closesAt,
          hourlyRate: activeTenant.booking.peakHourlyRate,
        },
      ],
    },
    scheduleIsUniform: true,
    blockAccessExpiresAt: null,
    blockAccessStatus: "available",
    businessPayments: null,
    businessPaymentsStatus: "unavailable",
    activationPermissions: {
      canManageVenueSettings: true,
      canManagePlatformBilling: false,
      canActivatePublicBooking: false,
    },
    toolAvailability: {},
    policy: {
      permissions: { canManagePolicy: true, canPublishPolicy: true },
      draft: {
        title: "PickPoint booking rules",
        intro: "Please review these rules before booking.",
        content: "Bookings are subject to live availability. Paid changes require venue assistance.",
      },
      publishedPolicy: null,
      revision: null,
      publishedRevision: null,
      policyConfigured: false,
    },
    policyStatus: "available",
    remittanceDestination: null,
    remittanceStatus: "missing",
    launchRequirementsV2Required: false,
  },
};

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export const managementAdapter: ManagementAdapter = {
  async load(context) {
    if (platformMode() === "preview") {
      await delay(240);
      return previewSnapshot;
    }

    assertPickPointContext(context);

    const session = await currentOwnerSession();
    if (!session) {
      throw new Error("MANAGER_SIGN_IN_REQUIRED");
    }

    const serverSession = normalizeManagerSession(
      await getManagerSession(session.access_token),
    );
    const canReadManagerSettings = serverSession.isSystemOwner ||
      serverSession.membershipRole === "owner" ||
      serverSession.membershipRole === "admin";

    const [
      bookingResult,
      blockResult,
      activationResult,
      courtResult,
      blockAccessResult,
      policyResult,
      remittanceResult,
    ] = await Promise.all([
      listManagerBookings(session.access_token, { activeOnly: false, limit: 500 }),
      listManagerBlocks(session.access_token, { limit: 100 }),
      canReadManagerSettings
        ? getActivationSettings(session.access_token).catch(() => null)
        : Promise.resolve(null),
      canReadManagerSettings
        ? getManagerCourts(session.access_token).catch(() => null)
        : Promise.resolve(null),
      canReadManagerSettings
        ? getBlockedDateAccess(session.access_token).catch(() => null)
        : Promise.resolve(null),
      canReadManagerSettings
        ? getTenantPolicy(session.access_token).catch(() => null)
        : Promise.resolve(null),
      canReadManagerSettings
        ? getRemittanceDestination(session.access_token).catch(() => null)
        : Promise.resolve(null),
    ]);

    const bookingRows = bookingResult.bookings;
    const blockRows = blockResult.blockedDates;
    const settings = liveActivationSettings(activationResult);
    const courtRows = Array.isArray(courtResult) ? courtResult : [];
    const courts = courtRows.map(mapLiveCourt);
    const courtNames = new Map(courts.map((court) => [court.id, court.name]));
    const activationPermissions = activationPermissionState(settings);
    const businessPayments = businessPaymentConfiguration(settings);
    const blockAccess = record(blockAccessResult);
    const capabilities = authorityCapabilities(serverSession);
    const policy = tenantPolicyConfiguration(policyResult);
    const remittanceDestination = remittanceDestinationConfiguration(remittanceResult);
    const tenantSettings = record(settings?.tenant);
    const responseSlug = tenantSettings
      ? value(tenantSettings, ["slug"])
      : "";
    if (settings && responseSlug !== activeTenant.identity.slug) {
      throw new Error("LIVE_TENANT_SCOPE_MISMATCH");
    }

    const tenantName = tenantSettings
      ? value(
          tenantSettings,
          ["displayName", "name"],
          activeTenant.identity.name,
        )
      : activeTenant.identity.name;
    const bookings = bookingRows.map((row) => mapLiveBooking(row, courtNames));
    const blocks = blockRows.map((row) => mapLiveBlock(row, courtNames));

    return {
      tenant: {
        slug: activeTenant.identity.slug,
        name: tenantName,
        venueLabel: tenantName,
        timezone: activeTenant.identity.timezone,
        currency: activeTenant.identity.currency,
        mode: "live",
        lastSynced: formatManilaDateTime(new Date()),
      },
      bookings,
      customers: deriveLiveCustomers(bookingRows, courtNames),
      courts,
      schedule: deriveLiveSchedule(bookingRows, blockRows, courtNames),
      blocks,
      setup: liveSetup(settings),
      session: { ...serverSession, capabilities },
      configuration: {
        ...sharedLiveConfiguration(courtRows),
        blockAccessExpiresAt: value(blockAccess ?? {}, ["expiresAt"]) || null,
        blockAccessStatus: blockAccessResult === null ? "unavailable" : "available",
        businessPayments,
        businessPaymentsStatus: settings === null
          ? "unavailable"
          : businessPayments
            ? "editable"
            : "incomplete",
        activationPermissions,
        toolAvailability: {
          "booking:create": true,
          "booking:update": true,
          "booking:cancel": true,
          "booking:check-in": true,
          "payment:review": true,
          "payment:asset": serverSession.isSystemOwner ||
            serverSession.membershipRole === "owner",
          "schedule:block": blockAccess?.canManage === true,
          "customer:view": true,
          "report:view": true,
          "finance:view": canReadManagerSettings,
          "settings:update": courtResult !== null &&
            activationPermissions.canManageVenueSettings,
          "tenant:publish": activationPermissions.canActivatePublicBooking,
        },
        policy,
        policyStatus: policyResult === null ? "unavailable" : "available",
        remittanceDestination,
        remittanceStatus: remittanceResult === null
          ? "unavailable"
          : remittanceDestination
            ? "available"
            : "missing",
        launchRequirementsV2Required:
          record(settings?.readiness)?.launchRequirementsV2Required === true,
      },
    };
  },
  async loadCalendarDay(context, current, date) {
    if (!DATE_PATTERN.test(date)) {
      throw new Error("CALENDAR_DATE_INVALID");
    }
    if (platformMode() === "preview") {
      return {
        bookings: previewSnapshot.bookings.filter((booking) => booking.bookingDate === date),
        blocks: previewSnapshot.blocks.filter((block) => block.dateValue === date),
      };
    }

    assertPickPointContext(context);
    if (
      current.tenant.mode !== "live" ||
      current.tenant.slug !== activeTenant.identity.slug
    ) {
      throw new Error("LIVE_TENANT_SCOPE_MISMATCH");
    }
    const session = await currentOwnerSession();
    if (!session) throw new Error("MANAGER_SIGN_IN_REQUIRED");
    const [serverSessionResult, bookingResult, blockResult] = await Promise.all([
      getManagerSession(session.access_token),
      listManagerBookings(session.access_token, {
        date,
        activeOnly: true,
        limit: 500,
      }),
      listManagerBlocks(session.access_token, { date, limit: 500 }),
    ]);
    const serverSession = normalizeManagerSession(serverSessionResult);
    if (!authorityCapabilities(serverSession).length) {
      throw new Error("CALENDAR_VIEW_ACCESS_DENIED");
    }
    const courtNames = new Map(current.courts.map((court) => [court.id, court.name]));
    return {
      bookings: bookingResult.bookings.map((row) => mapLiveBooking(row, courtNames)),
      blocks: blockResult.blockedDates.map((row) => mapLiveBlock(row, courtNames)),
    };
  },
  async loadReschedulePreview(context, bookingReference, date) {
    if (platformMode() === "preview") throw new Error("PREVIEW_RESCHEDULE_UNAVAILABLE");
    assertPickPointContext(context);
    const session = await currentOwnerSession();
    if (!session) throw new Error("MANAGER_SIGN_IN_REQUIRED");
    const authority = normalizeManagerSession(
      await getManagerSession(session.access_token),
    );
    assertBookingManager(authority, "reschedule");
    const reference = safeActionText(
      bookingReference,
      6,
      40,
      "BOOKING_REFERENCE_INVALID",
    ).toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9-]{5,39}$/.test(reference)) {
      throw new Error("BOOKING_REFERENCE_INVALID");
    }
    return previewBookingReschedule(
      session.access_token,
      reference,
      validDate(date, "RESCHEDULE_DATE_INVALID"),
    );
  },
  async loadInsights(context, filters) {
    if (platformMode() === "preview") {
      return {
        mode: "preview",
        report: null,
        finance: null,
        promotions: { available: false, canCreate: false, items: [] },
        loadedAt: formatManilaDateTime(new Date()),
      };
    }

    assertPickPointContext(context);
    const normalizedFilters = insightFilters(filters);
    const session = await currentOwnerSession();
    if (!session) throw new Error("MANAGER_SIGN_IN_REQUIRED");
    const authority = normalizeManagerSession(
      await getManagerSession(session.access_token),
    );
    assertInsightsViewer(authority);

    const [reportResult, remittanceResult, historyResult, promotionResult] = await Promise.all([
      getManagerRegularBookingReport(session.access_token, normalizedFilters),
      getBookingFeeRemittanceDashboard(session.access_token),
      getBookingFeeRemittanceHistory(session.access_token, { limit: 50 }),
      getManagerPromotions(session.access_token).catch((error) => {
        if (error instanceof PlatformRequestError && error.code === "PGRST202") {
          return null;
        }
        throw error;
      }),
    ]);

    return {
      mode: "live",
      report: regularBookingReport(reportResult, normalizedFilters),
      finance: {
        dashboard: remittanceDashboard(remittanceResult),
        history: remittanceHistory(historyResult),
      },
      promotions: promotionResult === null
        ? { available: false, canCreate: false, items: [] }
        : tenantPromotionState(promotionResult),
      loadedAt: formatManilaDateTime(new Date()),
    };
  },
  async refreshOperations(context, current) {
    if (platformMode() === "preview") return previewSnapshot;
    assertPickPointContext(context);
    if (
      current.tenant.mode !== "live" ||
      current.tenant.slug !== activeTenant.identity.slug
    ) {
      throw new Error("LIVE_TENANT_SCOPE_MISMATCH");
    }

    const session = await currentOwnerSession();
    if (!session) throw new Error("MANAGER_SIGN_IN_REQUIRED");
    const [serverSessionResult, bookingResult] = await Promise.all([
      getManagerSession(session.access_token),
      listManagerBookings(session.access_token, { activeOnly: false, limit: 500 }),
    ]);
    const serverSession = normalizeManagerSession(serverSessionResult);
    const bookingRows = bookingResult.bookings;
    const courtNames = new Map(current.courts.map((court) => [court.id, court.name]));
    const bookings = bookingRows.map((row) => mapLiveBooking(row, courtNames));

    return {
      ...current,
      tenant: {
        ...current.tenant,
        lastSynced: formatManilaDateTime(new Date()),
      },
      bookings,
      customers: deriveLiveCustomers(bookingRows, courtNames),
      session: {
        ...serverSession,
        capabilities: authorityCapabilities(serverSession),
      },
    };
  },
  async loadPaymentReceipt(context, verificationId) {
    if (platformMode() === "preview") {
      throw new Error("PREVIEW_RECEIPT_UNAVAILABLE");
    }
    assertPickPointContext(context);
    const session = await currentOwnerSession();
    if (!session) throw new Error("MANAGER_SIGN_IN_REQUIRED");
    const authority = normalizeManagerSession(
      await getManagerSession(session.access_token),
    );
    assertPaymentReviewer(authority);
    const id = requiredUuid(verificationId, "RECEIPT_VERIFICATION_ID_INVALID");
    const result = await getPaymentReceiptView(session.access_token, id);
    const status = paymentEvidenceStatus(result.receipt?.status);
    if (
      result.receipt?.verificationId !== id || !status ||
      !Number.isSafeInteger(result.expiresIn) || result.expiresIn < 30 ||
      result.expiresIn > 600 || !isAllowedReceiptViewUrl(result.signedUrl)
    ) {
      throw new Error("RECEIPT_VIEW_RESPONSE_INVALID");
    }
    return {
      signedUrl: result.signedUrl,
      expiresAt: new Date(Date.now() + result.expiresIn * 1_000).toISOString(),
      verificationId: id,
      status,
    };
  },
  async createPromotion(context, input) {
    if (platformMode() === "preview") throw new Error("PREVIEW_PROMOTION_UNAVAILABLE");
    assertPickPointContext(context);
    const session = await currentOwnerSession();
    if (!session) throw new Error("MANAGER_SIGN_IN_REQUIRED");
    const authority = normalizeManagerSession(await getManagerSession(session.access_token));
    if (!authority.isSystemOwner && authority.membershipRole !== "owner") {
      throw new Error("PROMOTION_PUBLISH_ACCESS_DENIED");
    }
    const result = await createTenantPromotion(session.access_token, input);
    return tenantPromotion(result);
  },
  async uploadPaymentQr(context, methodCode, file) {
    if (platformMode() === "preview") {
      throw new Error("PREVIEW_PAYMENT_ASSET_UNAVAILABLE");
    }
    assertPickPointContext(context);
    const session = await currentOwnerSession();
    if (!session) throw new Error("MANAGER_SIGN_IN_REQUIRED");
    const authority = normalizeManagerSession(
      await getManagerSession(session.access_token),
    );
    assertPaymentAssetManager(authority);
    const result = await uploadTenantPaymentQr(
      session.access_token,
      paymentQrMethodCode(methodCode),
      file,
    );
    const asset = result.asset;
    if (
      !asset || !isAllowedCustomerQrUrl(asset.url) ||
      !["image/jpeg", "image/png", "image/webp"].includes(asset.contentType) ||
      !validIsoRevision(result.tenantRevision)
    ) {
      throw new Error("PAYMENT_ASSET_RESPONSE_INVALID");
    }
    return {
      url: asset.url,
      contentType: asset.contentType,
      tenantRevision: result.tenantRevision,
    };
  },
  async perform(context, action) {
    if (platformMode() === "preview") {
      await delay(320);
      return {
        ok: true,
        message:
          action.type === "tenant:publish"
            ? "Preview acknowledged. Live activation stays locked until setup is complete."
            : "Preview action completed. No production data was changed.",
      };
    }

    assertPickPointContext(context);
    const session = await currentOwnerSession();
    if (!session) throw new Error("MANAGER_SIGN_IN_REQUIRED");
    const authority = normalizeManagerSession(
      await getManagerSession(session.access_token),
    );

    if (action.type === "payment:approve" || action.type === "payment:reject") {
      assertPaymentReviewer(authority);
      const verificationId = requiredUuid(
        action.resourceId,
        "RECEIPT_VERIFICATION_ID_INVALID",
      );
      const note = paymentReviewNote(action.payload, action.type === "payment:reject");
      await reviewPaymentReceipt(session.access_token, {
        verificationId,
        decision: action.type === "payment:approve" ? "approve" : "reject",
        note,
      });
      return {
        ok: true,
        message: action.type === "payment:approve"
          ? "The receipt was approved and the booking is confirmed."
          : "The receipt was rejected. The server updated the booking or balance-payment state.",
      };
    }

    if (action.type === "payment:asset-remove") {
      assertPaymentAssetManager(authority);
      const payload = payloadObject(action.payload, "PAYMENT_QR_REMOVE_INPUT_INVALID");
      assertAllowedKeys(
        payload,
        new Set(["methodCode"]),
        "PAYMENT_QR_REMOVE_INPUT_INVALID",
      );
      const result = await deleteTenantPaymentQr(
        session.access_token,
        paymentQrMethodCode(payload.methodCode),
      );
      if (result.asset !== null || !validIsoRevision(result.tenantRevision)) {
        throw new Error("PAYMENT_ASSET_RESPONSE_INVALID");
      }
      return {
        ok: true,
        message: result.cleanupPending
          ? "The QR image was removed from customer checkout. Old-file cleanup will finish safely in the background."
          : "The QR image was removed from customer checkout.",
        tenantRevision: result.tenantRevision,
      };
    }

    if (
      action.type === "booking:create" || action.type === "booking:update" ||
      action.type === "booking:cancel" || action.type === "booking:check-in"
    ) {
      if (action.type === "booking:create") {
        assertBookingManager(authority, "create");
        await createManualBooking(
          session.access_token,
          manualBookingPayload(action.payload),
        );
        return { ok: true, message: "The paid manual booking was created." };
      }
      if (action.type === "booking:update") {
        assertBookingManager(authority, "reschedule");
        const payload = rescheduleBookingPayload(action.payload, action.resourceId);
        const preview = await previewBookingReschedule(
          session.access_token,
          payload.bookingReference,
          payload.newDate,
        );
        const selectedOption = validatedReschedulePreviewOption(preview, {
          bookingId: requiredUuid(action.resourceId, "BOOKING_ID_INVALID"),
          bookingReference: payload.bookingReference,
          startTime: payload.newStartTime,
        });
        if (!selectedOption.available) {
          throw new PlatformRequestError(
            409,
            "RESCHEDULE_TIME_UNAVAILABLE",
            "That time is no longer available. Refresh and choose another hour.",
          );
        }
        if (selectedOption.paymentRequired || selectedOption.additionalAmount > 0) {
          throw new PlatformRequestError(
            409,
            "RESCHEDULE_ADDITIONAL_PAYMENT_REQUIRED",
            "This move costs more. Cancel it and create a new paid booking, or choose a time at the same or lower rate.",
          );
        }
        await rescheduleBooking(session.access_token, payload);
        return { ok: true, message: "The booking was rescheduled and availability was rechecked." };
      }
      if (action.type === "booking:cancel") {
        assertBookingManager(authority, "cancel");
        const payload = cancelBookingPayload(action.payload);
        await cancelTenantBooking(
          session.access_token,
          requiredUuid(action.resourceId, "BOOKING_ID_INVALID"),
          payload.reason,
        );
        return { ok: true, message: "The booking was cancelled. Any required refund remains visible to the owner." };
      }
      assertBookingManager(authority, "check-in");
      assertNoPayload(action.payload);
      await checkInTenantBooking(
        session.access_token,
        requiredUuid(action.resourceId, "BOOKING_ID_INVALID"),
      );
      return { ok: true, message: "The player was checked in." };
    }

    if (action.type === "policy:update" || action.type === "policy:publish") {
      assertVenueManager(authority);
      const current = tenantPolicyConfiguration(
        await getTenantPolicy(session.access_token),
      );
      if (!current || !current.permissions.canManagePolicy) {
        throw new Error("POLICY_UPDATE_ACCESS_DENIED");
      }
      if (action.type === "policy:publish" && !current.permissions.canPublishPolicy) {
        throw new Error("POLICY_PUBLISH_ACCESS_DENIED");
      }
      const policy = policyActionPayload(action.payload);
      await saveTenantPolicy(session.access_token, {
        publish: action.type === "policy:publish",
        expectedRevision: policy.expectedRevision,
        policy: policy.policy,
      });
      return {
        ok: true,
        message: action.type === "policy:publish"
          ? "The customer booking rules are published."
          : "The customer booking rules were saved as a draft.",
      };
    }

    if (action.type === "remittance:update") {
      if (!authority.isSystemOwner) throw new Error("PLATFORM_OWNER_REQUIRED");
      await saveRemittanceDestination(
        session.access_token,
        remittanceDestinationPayload(action.payload),
      );
      return { ok: true, message: "The platform remittance destination was saved." };
    }

    if (
      action.type === "court:create" || action.type === "court:update" ||
      action.type === "court:delete" || action.type === "settings:schedule"
    ) {
      assertVenueManager(authority);
      if (action.type === "court:create") {
        await manageTenantCourt(session.access_token, {
          action: "save",
          patch: courtMutationPatch(action.payload, true),
        });
        return { ok: true, message: "The court was created for PickPoint." };
      }
      if (action.type === "court:update") {
        await manageTenantCourt(session.access_token, {
          action: "save",
          courtId: requiredUuid(action.resourceId, "COURT_ID_INVALID"),
          patch: courtMutationPatch(action.payload, false),
        });
        return { ok: true, message: "The court settings were saved." };
      }
      if (action.type === "court:delete") {
        assertNoPayload(action.payload);
        await manageTenantCourt(session.access_token, {
          action: "delete",
          courtId: requiredUuid(action.resourceId, "COURT_ID_INVALID"),
        });
        return { ok: true, message: "The court was permanently removed." };
      }
      await applySharedCourtSchedule(
        session.access_token,
        sharedSchedulePayload(action.payload),
      );
      return {
        ok: true,
        message: "Shared operating hours and rates were saved for every court.",
      };
    }

    if (action.type === "schedule:block" || action.type === "schedule:unblock") {
      const access = record(await getBlockedDateAccess(session.access_token));
      if (access?.canManage !== true) throw new Error("SCHEDULE_BLOCK_ACCESS_DENIED");
      if (action.type === "schedule:unblock") {
        assertNoPayload(action.payload);
        await manageBlockedDates(session.access_token, {
          action: "delete",
          blockId: requiredUuid(action.resourceId, "BLOCK_ID_INVALID"),
        });
        return { ok: true, message: "The court block was removed." };
      }
      const block = blockedDatePayload(action.payload);
      await manageBlockedDates(session.access_token, { action: "create", ...block });
      return { ok: true, message: "The court block was created." };
    }

    if (action.type === "business:update" || action.type === "activation:update") {
      assertVenueManager(authority);
      const activation = liveActivationSettings(
        await getActivationSettings(session.access_token),
      );
      const permissions = activationPermissionState(activation);
      if (!permissions.canManageVenueSettings) {
        throw new Error("SETTINGS_UPDATE_ACCESS_DENIED");
      }
      const businessAction = action.type === "business:update"
        ? businessActionPayload(action.payload)
        : null;
      const patch = businessAction?.patch ?? settingsPatch(
        action.payload,
        "activation:update",
      );
      if (
        action.type === "activation:update" &&
        ("platformBilling" in patch || "openPlayServiceFee" in patch) &&
        !permissions.canManagePlatformBilling
      ) {
        throw new Error("PLATFORM_BILLING_ACCESS_DENIED");
      }
      if (action.type === "business:update") {
        await updateBusinessSettings(
          session.access_token,
          businessAction!.expectedRevision,
          patch,
        );
      } else {
        await updateActivationSettings(session.access_token, patch);
      }
      return { ok: true, message: "The protected venue settings were saved." };
    }

    if (action.type === "tenant:publish") {
      assertNoPayload(action.payload);
      if (!authority.isSystemOwner) throw new Error("PLATFORM_OWNER_REQUIRED");
      const activation = liveActivationSettings(
        await getActivationSettings(session.access_token),
      );
      if (!activationPermissionState(activation).canActivatePublicBooking) {
        throw new Error("TENANT_ACTIVATION_ACCESS_DENIED");
      }
      await activateTenantInitially(session.access_token);
      return { ok: true, message: "PickPoint public booking was activated." };
    }

    throw new Error("LIVE_ACTION_UNSUPPORTED");
  },
};

type JsonObject = Record<string, unknown>;

type VerifiedManagerSession = Omit<ManagementSession, "capabilities">;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLOCK_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const WHOLE_HOUR_PATTERN = /^(?:[01]\d|2[0-3]):00$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SHARED_SUPABASE_ORIGIN = "https://neqvrwtofiolcuxewdze.supabase.co";
const PUBLIC_PAYMENT_ASSET_PREFIX =
  "/storage/v1/object/public/tenant-public-assets/";
const PRIVATE_RECEIPT_VIEW_PREFIX =
  "/storage/v1/object/sign/tenant-private/";
const PAYMENT_QR_METHODS = new Set(["gcash", "maya", "bdo", "bpi", "gotyme", "pnb"]);
const PAYMENT_EVIDENCE_STATUSES = new Set<PaymentEvidenceStatus>([
  "pending",
  "manual_review",
  "auto_approved",
  "approved",
  "short_payment",
  "rejected",
]);
const BLOCK_LABELS = new Set([
  "Reserved",
  "Private Event",
  "Maintenance",
  "Closed",
] as const);

export function isAllowedCustomerQrUrl(candidate: string): boolean {
  const absolutePrefix = `${SHARED_SUPABASE_ORIGIN}${PUBLIC_PAYMENT_ASSET_PREFIX}`;
  if (
    !candidate || candidate.length > 500 || candidate.includes("\\") ||
    !candidate.startsWith(absolutePrefix) || candidate.length <= absolutePrefix.length
  ) {
    return false;
  }
  try {
    const url = new URL(candidate);
    if (
      url.protocol !== "https:" || url.username || url.password || url.port ||
      url.search || url.hash
    ) return false;
    return url.origin === SHARED_SUPABASE_ORIGIN &&
      url.pathname.startsWith(PUBLIC_PAYMENT_ASSET_PREFIX) &&
      url.pathname.length > PUBLIC_PAYMENT_ASSET_PREFIX.length;
  } catch {
    return false;
  }
}

function isAllowedReceiptViewUrl(candidate: string): boolean {
  if (!candidate || candidate.length > 4_096 || candidate.includes("\\")) return false;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      !url.hash && url.origin === SHARED_SUPABASE_ORIGIN &&
      url.pathname.startsWith(PRIVATE_RECEIPT_VIEW_PREFIX) &&
      url.pathname.length > PRIVATE_RECEIPT_VIEW_PREFIX.length &&
      Boolean(url.searchParams.get("token"));
  } catch {
    return false;
  }
}

function paymentEvidenceStatus(candidate: unknown): PaymentEvidenceStatus | null {
  return typeof candidate === "string" &&
      PAYMENT_EVIDENCE_STATUSES.has(candidate as PaymentEvidenceStatus)
    ? candidate as PaymentEvidenceStatus
    : null;
}

function paymentQrMethodCode(candidate: unknown): string {
  const code = typeof candidate === "string" ? candidate.trim().toLowerCase() : "";
  if (!PAYMENT_QR_METHODS.has(code)) throw new Error("PAYMENT_METHOD_QR_UNSUPPORTED");
  return code;
}

function assertPickPointContext(context: ManagementContext): void {
  if (
    context.tenantSlug !== activeTenant.identity.slug ||
    activeTenant.identity.slug !== "pickpoint-pickleclub"
  ) {
    throw new Error("LIVE_TENANT_SCOPE_MISMATCH");
  }
}

function normalizeMembershipRole(value: unknown): TenantRole | null {
  if (value === null) return null;
  if (value === "owner" || value === "admin" || value === "staff") return value;
  throw new Error("LIVE_SESSION_MEMBERSHIP_ROLE_INVALID");
}

function normalizeManagerSession(candidate: unknown): VerifiedManagerSession {
  const row = record(candidate);
  if (!row || !("membershipRole" in row)) {
    throw new Error("LIVE_MANAGER_SESSION_INVALID");
  }
  const tenantSlug = value(row, ["tenantSlug"]);
  const serverRole = value(row, ["role"]);
  const status = value(row, ["status"]);
  const email = value(row, ["email"]);
  const membershipRole = normalizeMembershipRole(row.membershipRole);
  const isSystemOwner = serverRole === "owner" && membershipRole === null;
  const isTenantManager = serverRole === "court_owner" &&
    (membershipRole === "owner" || membershipRole === "admin");
  const isTenantStaff = serverRole === "staff" && membershipRole === "staff";
  if (
    tenantSlug !== activeTenant.identity.slug || status !== "active" || !email ||
    (!isSystemOwner && !isTenantManager && !isTenantStaff)
  ) {
    throw new Error("LIVE_MANAGER_SESSION_INVALID");
  }
  return {
    role: isSystemOwner ? "owner" : membershipRole ?? "host",
    serverRole,
    membershipRole,
    isSystemOwner,
    displayName: value(row, ["fullName", "username"], email),
    email,
  };
}

function assertVenueManager(session: VerifiedManagerSession): void {
  if (
    !session.isSystemOwner && session.membershipRole !== "owner" &&
    session.membershipRole !== "admin"
  ) {
    throw new Error("SETTINGS_UPDATE_ACCESS_DENIED");
  }
}

function assertPaymentReviewer(session: VerifiedManagerSession): void {
  if (
    !session.isSystemOwner && session.membershipRole !== "owner" &&
    session.membershipRole !== "admin" && session.membershipRole !== "staff"
  ) {
    throw new Error("PAYMENT_REVIEW_ACCESS_DENIED");
  }
}

function assertPaymentAssetManager(session: VerifiedManagerSession): void {
  if (!session.isSystemOwner && session.membershipRole !== "owner") {
    throw new Error("PAYMENT_ASSET_ACCESS_DENIED");
  }
}

function assertInsightsViewer(session: VerifiedManagerSession): void {
  if (
    !session.isSystemOwner && session.membershipRole !== "owner" &&
    session.membershipRole !== "admin"
  ) {
    throw new Error("FINANCE_VIEW_ACCESS_DENIED");
  }
}

function assertBookingManager(
  session: VerifiedManagerSession,
  action: "create" | "reschedule" | "cancel" | "check-in",
): void {
  const manager = session.isSystemOwner || session.membershipRole === "owner" ||
    session.membershipRole === "admin";
  const staffWrite = action === "cancel" || action === "check-in";
  if (!manager && !(staffWrite && session.membershipRole === "staff")) {
    throw new Error("BOOKING_ACTION_ACCESS_DENIED");
  }
}

function activationPermissionState(settings: JsonObject | null) {
  const permissions = record(settings?.permissions);
  return {
    canManageVenueSettings: permissions?.canManageVenueSettings === true,
    canManagePlatformBilling: permissions?.canManagePlatformBilling === true,
    canActivatePublicBooking: permissions?.canActivatePublicBooking === true,
  };
}

function policyText(candidate: unknown, maximum: number): string | null {
  if (typeof candidate !== "string") return null;
  const result = candidate.trim();
  return result && result.length <= maximum && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result)
    ? result
    : null;
}

function tenantPolicyConfiguration(result: unknown): TenantPolicyConfiguration | null {
  const envelope = record(result);
  const policy = record(envelope?.policy);
  if (!policy) return null;
  const permissions = record(policy.permissions);
  const normalizeCopy = (candidate: unknown) => {
    if (candidate === null) return null;
    const row = record(candidate);
    const title = policyText(row?.title, 180);
    const intro = policyText(row?.intro, 1_200);
    const content = policyText(row?.content, 30_000);
    return title && intro && content ? { title, intro, content } : null;
  };
  const draft = normalizeCopy(policy.draft);
  const rawPublished = policy.publishedPolicy;
  const publishedCopy = normalizeCopy(rawPublished);
  const publishedRow = record(rawPublished);
  const version = value(publishedRow ?? {}, ["version"]);
  const ownerApproved = publishedRow?.ownerApproved === true;
  const publishedPolicy = publishedCopy && version && ownerApproved
    ? { ...publishedCopy, version, ownerApproved: true as const }
    : null;
  const nullableRevision = (candidate: unknown) => candidate === null
    ? null
    : typeof candidate === "string" && Number.isFinite(new Date(candidate).getTime())
      ? candidate
      : null;
  return {
    permissions: {
      canManagePolicy: permissions?.canManagePolicy === true,
      canPublishPolicy: permissions?.canPublishPolicy === true,
    },
    draft,
    publishedPolicy,
    revision: nullableRevision(policy.revision),
    publishedRevision: nullableRevision(policy.publishedRevision),
    policyConfigured: policy.policyConfigured === true,
  };
}

function remittanceDestinationConfiguration(result: unknown): RemittanceDestination | null {
  const envelope = record(result);
  const row = record(envelope?.destination);
  if (!row) return null;
  const method = value(row, ["method"]);
  const accountName = value(row, ["accountName", "account_name"]);
  const accountReference = value(row, ["accountReference", "account_reference"]);
  const dueDay = exactInteger(row, ["dueDay", "due_day"]);
  const instructions = nullableResponseText(row, "instructions");
  const qrUrl = nullableResponseText(row, "qrUrl");
  if (
    (method !== "gcash" && method !== "maya" && method !== "bank_transfer" &&
      method !== "other") || accountName.length < 2 || accountReference.length < 4 ||
    dueDay === null || dueDay < 1 || dueDay > 28 || !instructions.ok || !qrUrl.ok
  ) return null;
  return {
    method,
    accountName,
    accountReference,
    dueDay,
    instructions: instructions.value,
    qrUrl: qrUrl.value,
  };
}

function nullableResponseText(
  row: JsonObject,
  key: string,
): { ok: true; value: string | null } | { ok: false } {
  if (!(key in row)) return { ok: false };
  const candidate = row[key];
  if (candidate === null) return { ok: true, value: null };
  if (typeof candidate !== "string" || !candidate.trim()) return { ok: false };
  return { ok: true, value: candidate.trim() };
}

function businessPaymentConfiguration(
  settings: JsonObject | null,
): BusinessPaymentConfiguration | null {
  if (!settings) return null;
  const business = record(settings.business);
  const venue = record(settings.venue);
  const paymentMethods = settings.paymentMethods;
  if (!business || !venue || !Array.isArray(paymentMethods)) return null;
  const rootUpdatedAt = value(settings, ["updatedAt"]);
  if (!rootUpdatedAt || !Number.isFinite(new Date(rootUpdatedAt).getTime())) {
    return null;
  }

  const displayName = value(business, ["displayName"]);
  const contactPhone = nullableResponseText(business, "contactPhone");
  const facebookUrl = nullableResponseText(business, "facebookUrl");
  const tagline = nullableResponseText(business, "tagline");
  const replyToEmail = nullableResponseText(venue, "replyToEmail");
  if (
    displayName.length < 2 || displayName.length > 120 ||
    !contactPhone.ok || !facebookUrl.ok || !tagline.ok || !replyToEmail.ok ||
    typeof business.eventBookingEnabled !== "boolean" ||
    typeof venue.emailEnabled !== "boolean" ||
    typeof venue.publicBookingEnabled !== "boolean" ||
    paymentMethods.length > 10
  ) return null;

  const normalizedMethods: PaymentMethodConfiguration[] = [];
  const seenCodes = new Set<string>();
  for (const candidate of paymentMethods) {
    const method = record(candidate);
    if (!method) return null;
    const methodCode = value(method, ["methodCode"]);
    const methodDisplayName = value(method, ["displayName"]);
    const accountName = value(method, ["accountName"]);
    const accountNumber = value(method, ["accountNumber"]);
    const instructions = nullableResponseText(method, "instructions");
    const qrUrl = nullableResponseText(method, "qrUrl");
    const sortOrder = exactInteger(method, ["sortOrder"]);
    if (
      !/^[a-z][a-z0-9_-]{1,39}$/.test(methodCode) ||
      seenCodes.has(methodCode) || methodDisplayName.length < 2 ||
      accountName.length < 2 || accountNumber.length < 3 ||
      !instructions.ok || !qrUrl.ok ||
      (qrUrl.value !== null && !isAllowedCustomerQrUrl(qrUrl.value)) ||
      typeof method.isActive !== "boolean" ||
      sortOrder === null || sortOrder < 0 || sortOrder > 1_000
    ) return null;
    seenCodes.add(methodCode);
    normalizedMethods.push({
      methodCode,
      displayName: methodDisplayName,
      accountName,
      accountNumber,
      instructions: instructions.value,
      qrUrl: qrUrl.value,
      isActive: method.isActive,
      sortOrder,
    });
  }

  let platformBilling: BusinessPaymentConfiguration["platformBilling"] = null;
  if (settings.platformBilling !== null && settings.platformBilling !== undefined) {
    const billing = record(settings.platformBilling);
    const feeMode = billing ? value(billing, ["feeMode"]) : "";
    const feeAmount = billing ? numberValue(billing, ["feeAmount"]) : null;
    if (
      !billing ||
      (feeMode !== "fixed_per_booking" && feeMode !== "fixed_per_hour" &&
        feeMode !== "percentage") ||
      feeAmount === null || typeof billing.isConfigured !== "boolean"
    ) return null;
    platformBilling = { feeMode, feeAmount, isConfigured: billing.isConfigured };
  }

  const normalizedBusiness = {
      displayName,
      contactPhone: contactPhone.value,
      facebookUrl: facebookUrl.value,
      tagline: tagline.value,
      eventBookingEnabled: business.eventBookingEnabled,
  };
  const normalizedVenue = {
      replyToEmail: replyToEmail.value,
      emailEnabled: venue.emailEnabled,
      publicBookingEnabled: venue.publicBookingEnabled,
  };
  return {
    revision: rootUpdatedAt,
    business: normalizedBusiness,
    venue: normalizedVenue,
    paymentMethods: normalizedMethods,
    platformBilling,
  };
}

function authorityCapabilities(session: VerifiedManagerSession): ManagementCapability[] {
  if (session.isSystemOwner) {
    return [
      "booking:create",
      "booking:update",
      "booking:cancel",
      "booking:check-in",
      "payment:review",
      "payment:asset",
      "schedule:block",
      "customer:view",
      "report:view",
      "finance:view",
      "settings:update",
      "tenant:publish",
    ];
  }
  if (session.membershipRole === "owner") {
    return [
      "booking:create",
      "booking:update",
      "booking:cancel",
      "booking:check-in",
      "payment:review",
      "payment:asset",
      "schedule:block",
      "customer:view",
      "report:view",
      "finance:view",
      "settings:update",
    ];
  }
  if (session.membershipRole === "admin") {
    return [
      "booking:create",
      "booking:update",
      "booking:cancel",
      "booking:check-in",
      "payment:review",
      "schedule:block",
      "customer:view",
      "report:view",
      "finance:view",
      "settings:update",
    ];
  }
  if (session.membershipRole === "staff") {
    return ["booking:cancel", "booking:check-in", "payment:review", "customer:view"];
  }
  return [];
}

function exactInteger(row: JsonObject, keys: string[]): number | null {
  const result = numberValue(row, keys);
  return result !== null && Number.isSafeInteger(result) ? result : null;
}

function returnedTwoPriceBands(candidate: unknown): SharedPriceBand[] | null {
  if (!Array.isArray(candidate) || candidate.length !== 2) return null;
  const bands: SharedPriceBand[] = [];
  for (const candidateBand of candidate) {
    const band = record(candidateBand);
    const start = band ? value(band, ["start"]) : "";
    const end = band ? value(band, ["end"]) : "";
    const hourlyRate = band ? numberValue(band, ["hourlyRate"]) : null;
    if (!band || !start || !end || hourlyRate === null) return null;
    bands.push({ start, end, hourlyRate });
  }
  return bands;
}

function scheduleForCourt(row: JsonObject) {
  const opensAt = normalizedClock(value(row, ["opens_at", "opensAt"]));
  const closesAt = normalizedClock(value(row, ["closes_at", "closesAt"]));
  const pricing = record(row.pricing_config ?? row.pricingConfig);
  const regular = record(pricing?.regular);
  if (!opensAt || !closesAt) return null;
  return normalizeTwoBandSchedule({
    opensAt,
    closesAt,
    bands: returnedTwoPriceBands(regular?.bands),
  });
}

function mapLiveCourt(row: JsonObject): Court {
  const id = value(row, ["id"]);
  const slug = value(row, ["slug"]);
  const name = value(row, ["name"]);
  const description = value(row, ["description"]);
  const status = value(row, ["status"]);
  const sortOrder = exactInteger(row, ["sort_order", "sortOrder"]);
  const currency = value(row, ["currency"]);
  const schedule = scheduleForCourt(row);
  const publicConfig = record(row.public_config ?? row.publicConfig);
  const rawPhotoUrl = value(publicConfig ?? {}, ["photoUrl"]);
  const photoUrl = rawPhotoUrl.startsWith(
    `${SHARED_SUPABASE_ORIGIN}/storage/v1/object/public/tenant-public-assets/`,
  ) ? rawPhotoUrl : null;
  if (
    !UUID_PATTERN.test(id) || !slug || !name ||
    (status !== "active" && status !== "inactive" && status !== "maintenance") ||
    sortOrder === null || currency !== activeTenant.identity.currency
  ) {
    throw new Error("LIVE_COURT_ROW_INVALID");
  }
  return {
    id,
    slug,
    name,
    description,
    surface: description || "No description configured",
    status,
    sortOrder,
    opensAt: schedule?.opensAt ?? null,
    closesAt: schedule?.closesAt ?? null,
    rateDay: schedule?.bands.length === 2
      ? schedule.bands[0]?.hourlyRate ?? null
      : null,
    ratePeak: schedule?.bands.length === 2
      ? schedule.bands[1]?.hourlyRate ?? null
      : null,
    photoUrl,
  };
}

function sharedLiveConfiguration(courtRows: JsonObject[]): Pick<
  LiveConfiguration,
  "sharedSchedule" | "scheduleIsUniform"
> {
  if (!courtRows.length) return { sharedSchedule: null, scheduleIsUniform: true };
  const schedules = courtRows.map(scheduleForCourt);
  if (schedules.some((schedule) => schedule === null)) {
    return { sharedSchedule: null, scheduleIsUniform: false };
  }
  const [first, ...rest] = schedules as NonNullable<ReturnType<typeof scheduleForCourt>>[];
  const signature = JSON.stringify(first);
  if (rest.some((schedule) => JSON.stringify(schedule) !== signature)) {
    return { sharedSchedule: null, scheduleIsUniform: false };
  }
  return { sharedSchedule: first, scheduleIsUniform: true };
}

function requiredUuid(candidate: unknown, errorCode: string): string {
  const id = typeof candidate === "string" ? candidate.trim().toLowerCase() : "";
  if (!UUID_PATTERN.test(id)) throw new Error(errorCode);
  return id;
}

function requiredUuidV4(candidate: unknown, errorCode: string): string {
  const id = typeof candidate === "string" ? candidate.trim().toLowerCase() : "";
  if (!UUID_V4_PATTERN.test(id)) throw new Error(errorCode);
  return id;
}

function assertAllowedKeys(
  row: JsonObject,
  allowed: ReadonlySet<string>,
  errorCode: string,
): void {
  if (Object.keys(row).some((key) => !allowed.has(key))) throw new Error(errorCode);
}

function assertNoSensitiveIdentifiers(candidate: unknown): void {
  if (!candidate || typeof candidate !== "object") return;
  if (Array.isArray(candidate)) {
    candidate.forEach(assertNoSensitiveIdentifiers);
    return;
  }
  const row = candidate as JsonObject;
  for (const [key, nested] of Object.entries(row)) {
    const normalized = key.replaceAll("_", "").toLowerCase();
    if (
      normalized === "tenantid" || normalized === "ptenantid" ||
      normalized.includes("servicerole")
    ) {
      throw new Error("LIVE_PAYLOAD_FIELD_FORBIDDEN");
    }
    assertNoSensitiveIdentifiers(nested);
  }
}

function payloadObject(candidate: unknown, errorCode: string): JsonObject {
  assertNoSensitiveIdentifiers(candidate);
  assertJsonSafe(candidate, errorCode);
  const result = record(candidate);
  if (!result) throw new Error(errorCode);
  return result;
}

function assertJsonSafe(candidate: unknown, errorCode: string): void {
  if (
    candidate === null || typeof candidate === "string" ||
    typeof candidate === "boolean"
  ) return;
  if (typeof candidate === "number") {
    if (!Number.isFinite(candidate)) throw new Error(errorCode);
    return;
  }
  if (Array.isArray(candidate)) {
    candidate.forEach((entry) => assertJsonSafe(entry, errorCode));
    return;
  }
  if (!candidate || typeof candidate !== "object") throw new Error(errorCode);
  Object.values(candidate as JsonObject).forEach((entry) => {
    if (entry === undefined) throw new Error(errorCode);
    assertJsonSafe(entry, errorCode);
  });
}

const MANUAL_PAYMENT_METHODS = new Set([
  "cash", "gcash", "maya", "bank_transfer", "bdo", "bpi", "gotyme", "pnb", "other",
]);
const RESCHEDULE_REASONS = new Set([
  "customer_request", "weather", "court_maintenance", "schedule_conflict", "admin_correction", "other",
]);

function invalidReschedulePreview(): never {
  throw new PlatformRequestError(
    502,
    "RESCHEDULE_PREVIEW_INVALID",
    "The server returned an incomplete reschedule preview. Refresh before moving this booking.",
  );
}

function previewMoney(candidate: unknown): number {
  const raw = typeof candidate === "number" || typeof candidate === "string"
    ? String(candidate).trim()
    : "";
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(raw)) invalidReschedulePreview();
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) invalidReschedulePreview();
  return parsed;
}

function validatedReschedulePreviewOption(
  candidate: unknown,
  expected: { bookingId: string; bookingReference: string; startTime: string },
) {
  const envelope = record(candidate);
  const booking = record(envelope?.booking);
  const policies = record(envelope?.policies);
  const reasonCodes = Array.isArray(policies?.reasonCodes)
    ? policies.reasonCodes.map((entry) => record(entry))
    : [];
  const returnedReasonValues = new Set(reasonCodes.map((entry) =>
    entry ? value(entry, ["value"]) : ""
  ));
  const durationHours = booking ? numberValue(booking, ["durationHours"]) : null;
  const bookingStartsAt = booking ? value(booking, ["startsAt"]) : "";
  const bookingEndsAt = booking ? value(booking, ["endsAt"]) : "";
  if (
    envelope?.ok !== true || !booking || !policies ||
    value(booking, ["id"]).toLowerCase() !== expected.bookingId ||
    value(booking, ["reference"]).toUpperCase() !== expected.bookingReference ||
    !UUID_PATTERN.test(value(booking, ["courtId"])) ||
    !value(booking, ["courtName"]) ||
    !Number.isFinite(new Date(bookingStartsAt).getTime()) ||
    !Number.isFinite(new Date(bookingEndsAt).getTime()) ||
    !DATE_PATTERN.test(value(booking, ["localBookingDate"])) ||
    !Number.isSafeInteger(durationHours) || durationHours! < 1 || durationHours! > 18 ||
    value(booking, ["status"]) !== "confirmed" ||
    value(booking, ["paymentStatus"]) !== "paid" ||
    !value(booking, ["customerName"]) ||
    (booking.customerEmail !== null && typeof booking.customerEmail !== "string") ||
    value(booking, ["currency"]) !== activeTenant.identity.currency ||
    policies.sameCourtOnly !== true || policies.sameDurationOnly !== true ||
    policies.amountPolicy !== "preserve_original" ||
    reasonCodes.length !== RESCHEDULE_REASONS.size ||
    [...RESCHEDULE_REASONS].some((reason) => !returnedReasonValues.has(reason)) ||
    reasonCodes.some((entry) => !entry || !value(entry, ["label"])) ||
    policies.notificationDefault !== true ||
    typeof policies.notificationAvailable !== "boolean" ||
    !Array.isArray(envelope.options)
  ) invalidReschedulePreview();
  previewMoney(booking.subtotalAmount);
  previewMoney(booking.serviceFeeAmount);
  previewMoney(booking.totalAmount);

  const option = envelope.options
    .map((entry) => record(entry))
    .find((entry) => entry && value(entry, ["startTime"]) === expected.startTime);
  if (!option) {
    throw new PlatformRequestError(
      409,
      "RESCHEDULE_TIME_UNAVAILABLE",
      "That time is not offered for this booking. Refresh and choose another hour.",
    );
  }
  const startTime = value(option, ["startTime"]);
  const endTime = value(option, ["endTime"]);
  const startsAt = value(option, ["startsAt"]);
  const endsAt = value(option, ["endsAt"]);
  const label = value(option, ["label"]);
  const unavailableReason = option.unavailableReason;
  if (
    !WHOLE_HOUR_PATTERN.test(startTime) || !WHOLE_HOUR_PATTERN.test(endTime) ||
    !Number.isFinite(new Date(startsAt).getTime()) ||
    !Number.isFinite(new Date(endsAt).getTime()) || !label ||
    typeof option.available !== "boolean" ||
    (unavailableReason !== null && typeof unavailableReason !== "string") ||
    typeof option.paymentRequired !== "boolean"
  ) invalidReschedulePreview();
  const amounts = {
    courtSubtotalAmount: previewMoney(option.courtSubtotalAmount),
    newSubtotalAmount: previewMoney(option.newSubtotalAmount),
    newTotalAmount: previewMoney(option.newTotalAmount),
    originalTotalAmount: previewMoney(option.originalTotalAmount),
    amountPaid: previewMoney(option.amountPaid),
    additionalAmount: previewMoney(option.additionalAmount),
  };
  if (option.paymentRequired !== (amounts.additionalAmount > 0)) {
    invalidReschedulePreview();
  }
  return {
    available: option.available,
    paymentRequired: option.paymentRequired,
    additionalAmount: amounts.additionalAmount,
  };
}

function safeActionText(
  candidate: unknown,
  minimum: number,
  maximum: number,
  errorCode: string,
): string {
  const text = typeof candidate === "string" ? candidate.trim() : "";
  if (
    text.length < minimum || text.length > maximum ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)
  ) throw new Error(errorCode);
  return text;
}

function validDate(candidate: unknown, errorCode: string): string {
  const date = safeActionText(candidate, 10, 10, errorCode);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(errorCode);
  const value = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(value.getTime()) || value.toISOString().slice(0, 10) !== date) {
    throw new Error(errorCode);
  }
  return date;
}

function manualBookingPayload(candidate: unknown) {
  const payload = payloadObject(candidate, "MANUAL_BOOKING_INPUT_INVALID");
  assertAllowedKeys(payload, new Set([
    "courtId", "bookingDate", "startTime", "durationHours", "customer", "payment", "clientRequestId",
  ]), "MANUAL_BOOKING_INPUT_INVALID");
  const customer = payloadObject(payload.customer, "MANUAL_BOOKING_INPUT_INVALID");
  const payment = payloadObject(payload.payment, "MANUAL_BOOKING_INPUT_INVALID");
  assertAllowedKeys(customer, new Set(["name", "email", "phone"]), "MANUAL_BOOKING_INPUT_INVALID");
  assertAllowedKeys(payment, new Set(["method", "reference"]), "MANUAL_BOOKING_INPUT_INVALID");
  const email = typeof customer.email === "string" ? customer.email.trim().toLowerCase() : "";
  if (email && (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || email.includes(".."))) {
    throw new Error("MANUAL_BOOKING_INPUT_INVALID");
  }
  const phone = safeActionText(customer.phone, 7, 30, "MANUAL_BOOKING_INPUT_INVALID");
  if (!/^[+0-9][0-9 ()+.-]{6,29}$/.test(phone)) throw new Error("MANUAL_BOOKING_INPUT_INVALID");
  const method = typeof payment.method === "string" ? payment.method.trim().toLowerCase() : "";
  if (!MANUAL_PAYMENT_METHODS.has(method)) throw new Error("MANUAL_PAYMENT_METHOD_INVALID");
  const reference = typeof payment.reference === "string" ? payment.reference.trim() : "";
  if (method !== "cash" && (reference.length < 4 || reference.length > 100)) {
    throw new Error("MANUAL_PAYMENT_REFERENCE_REQUIRED");
  }
  const durationHours = Number(payload.durationHours);
  if (!Number.isSafeInteger(durationHours) || durationHours < 1 || durationHours > 18) {
    throw new Error("MANUAL_BOOKING_INPUT_INVALID");
  }
  const startTime = safeActionText(payload.startTime, 5, 5, "MANUAL_BOOKING_INPUT_INVALID");
  if (!WHOLE_HOUR_PATTERN.test(startTime)) throw new Error("MANUAL_BOOKING_INPUT_INVALID");
  return {
    courtId: requiredUuid(payload.courtId, "COURT_ID_INVALID"),
    bookingDate: validDate(payload.bookingDate, "MANUAL_BOOKING_INPUT_INVALID"),
    startTime,
    durationHours,
    customer: {
      name: safeActionText(customer.name, 2, 100, "MANUAL_BOOKING_INPUT_INVALID"),
      email,
      phone,
    },
    payment: { method, reference: method === "cash" ? null : reference },
    clientRequestId: requiredUuidV4(payload.clientRequestId, "MANUAL_BOOKING_REQUEST_ID_INVALID"),
  };
}

function rescheduleBookingPayload(candidate: unknown, resourceId: unknown) {
  const payload = payloadObject(candidate, "RESCHEDULE_INPUT_INVALID");
  assertAllowedKeys(payload, new Set([
    "bookingId", "bookingReference", "newDate", "newStartTime", "reasonCode", "publicReason",
    "internalNote", "notifyCustomer", "idempotencyKey",
  ]), "RESCHEDULE_INPUT_INVALID");
  const bookingId = requiredUuid(payload.bookingId, "BOOKING_ID_INVALID");
  if (bookingId !== requiredUuid(resourceId, "BOOKING_ID_INVALID")) {
    throw new Error("BOOKING_IDENTIFIER_MISMATCH");
  }
  const bookingReference = safeActionText(payload.bookingReference, 6, 40, "BOOKING_REFERENCE_INVALID").toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{5,39}$/.test(bookingReference)) throw new Error("BOOKING_REFERENCE_INVALID");
  const newStartTime = safeActionText(payload.newStartTime, 5, 5, "RESCHEDULE_TIME_INVALID");
  if (!WHOLE_HOUR_PATTERN.test(newStartTime)) throw new Error("RESCHEDULE_TIME_INVALID");
  const reasonCode = typeof payload.reasonCode === "string" ? payload.reasonCode.trim() : "";
  if (!RESCHEDULE_REASONS.has(reasonCode)) throw new Error("RESCHEDULE_REASON_INVALID");
  const note = payload.internalNote === null || payload.internalNote === undefined || payload.internalNote === ""
    ? null
    : safeActionText(payload.internalNote, 3, 1_000, "RESCHEDULE_NOTE_INVALID");
  if (typeof payload.notifyCustomer !== "boolean") throw new Error("RESCHEDULE_INPUT_INVALID");
  return {
    bookingReference,
    newDate: validDate(payload.newDate, "RESCHEDULE_DATE_INVALID"),
    newStartTime,
    reasonCode,
    publicReason: safeActionText(payload.publicReason, 3, 500, "RESCHEDULE_REASON_INVALID"),
    internalNote: note,
    notifyCustomer: payload.notifyCustomer,
    idempotencyKey: requiredUuidV4(payload.idempotencyKey, "RESCHEDULE_IDEMPOTENCY_KEY_INVALID"),
  };
}

function cancelBookingPayload(candidate: unknown) {
  const payload = payloadObject(candidate, "CANCEL_BOOKING_INPUT_INVALID");
  assertAllowedKeys(payload, new Set(["reason"]), "CANCEL_BOOKING_INPUT_INVALID");
  return { reason: safeActionText(payload.reason, 3, 500, "CANCEL_BOOKING_REASON_INVALID") };
}

function policyActionPayload(candidate: unknown) {
  const payload = payloadObject(candidate, "POLICY_INPUT_INVALID");
  assertAllowedKeys(payload, new Set(["expectedRevision", "policy"]), "POLICY_INPUT_INVALID");
  const expectedRevision = payload.expectedRevision === null
    ? null
    : safeActionText(payload.expectedRevision, 20, 40, "POLICY_REVISION_INVALID");
  if (expectedRevision !== null && !Number.isFinite(new Date(expectedRevision).getTime())) {
    throw new Error("POLICY_REVISION_INVALID");
  }
  const policy = payloadObject(payload.policy, "POLICY_INPUT_INVALID");
  assertAllowedKeys(policy, new Set(["title", "intro", "content"]), "POLICY_INPUT_INVALID");
  const normalizedPolicyText = (
    value: unknown,
    minimum: number,
    maximum: number,
    code: string,
  ) => safeActionText(
    typeof value === "string" ? value.replaceAll("\r\n", "\n").replaceAll("\r", "\n") : value,
    minimum,
    maximum,
    code,
  );
  return {
    expectedRevision,
    policy: {
      title: normalizedPolicyText(policy.title, 3, 180, "POLICY_TITLE_INVALID"),
      intro: normalizedPolicyText(policy.intro, 10, 1_200, "POLICY_INTRO_INVALID"),
      content: normalizedPolicyText(policy.content, 20, 30_000, "POLICY_CONTENT_INVALID"),
    },
  };
}

function remittanceDestinationPayload(candidate: unknown) {
  const payload = payloadObject(candidate, "REMITTANCE_DESTINATION_INVALID");
  assertAllowedKeys(payload, new Set([
    "method", "accountName", "accountReference", "dueDay", "instructions", "removeQr",
  ]), "REMITTANCE_DESTINATION_INVALID");
  const method = typeof payload.method === "string" ? payload.method.trim() : "";
  if (method !== "gcash" && method !== "maya" && method !== "bank_transfer" && method !== "other") {
    throw new Error("REMITTANCE_DESTINATION_INVALID");
  }
  const dueDay = Number(payload.dueDay);
  if (!Number.isSafeInteger(dueDay) || dueDay < 1 || dueDay > 28) {
    throw new Error("REMITTANCE_DESTINATION_INVALID");
  }
  return {
    method,
    accountName: safeActionText(payload.accountName, 2, 160, "REMITTANCE_DESTINATION_INVALID"),
    accountReference: safeActionText(payload.accountReference, 4, 120, "REMITTANCE_DESTINATION_INVALID"),
    dueDay,
    instructions: payload.instructions === null || payload.instructions === undefined || payload.instructions === ""
      ? null
      : safeActionText(payload.instructions, 1, 2_000, "REMITTANCE_DESTINATION_INVALID"),
    removeQr: payload.removeQr === true,
  };
}

const COURT_PATCH_KEYS = new Set([
  "slug",
  "name",
  "description",
  "status",
  "sortOrder",
  "opensAt",
  "closesAt",
  "currency",
  "pricingConfig",
  "publicConfig",
]);

function courtMutationPatch(candidate: unknown, creating: boolean): JsonObject {
  const patch = payloadObject(candidate, "COURT_MUTATION_INVALID");
  assertAllowedKeys(patch, COURT_PATCH_KEYS, "COURT_MUTATION_INVALID");
  if (!Object.keys(patch).length) throw new Error("COURT_MUTATION_INVALID");
  const required = [
    "slug",
    "name",
    "status",
    "sortOrder",
    "opensAt",
    "closesAt",
    "currency",
    "pricingConfig",
    "publicConfig",
  ];
  if (creating && required.some((key) => !(key in patch))) {
    throw new Error("COURT_CONFIGURATION_INCOMPLETE");
  }
  if (
    "slug" in patch &&
    (typeof patch.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(patch.slug))
  ) throw new Error("COURT_CONFIGURATION_INVALID");
  if (
    "name" in patch &&
    (typeof patch.name !== "string" || patch.name.trim().length < 1 || patch.name.trim().length > 120)
  ) throw new Error("COURT_CONFIGURATION_INVALID");
  if (
    "description" in patch && patch.description !== null &&
    typeof patch.description !== "string"
  ) throw new Error("COURT_CONFIGURATION_INVALID");
  if (
    "status" in patch && patch.status !== "active" && patch.status !== "inactive" &&
    patch.status !== "maintenance"
  ) throw new Error("COURT_CONFIGURATION_INVALID");
  if (
    "sortOrder" in patch &&
    (!Number.isSafeInteger(patch.sortOrder) || (patch.sortOrder as number) < 0 || (patch.sortOrder as number) > 10_000)
  ) throw new Error("COURT_CONFIGURATION_INVALID");
  if ("opensAt" in patch && (typeof patch.opensAt !== "string" || !CLOCK_PATTERN.test(patch.opensAt))) {
    throw new Error("COURT_CONFIGURATION_INVALID");
  }
  if ("closesAt" in patch && (typeof patch.closesAt !== "string" || !CLOCK_PATTERN.test(patch.closesAt))) {
    throw new Error("COURT_CONFIGURATION_INVALID");
  }
  if ("currency" in patch && patch.currency !== activeTenant.identity.currency) {
    throw new Error("COURT_CURRENCY_INVALID");
  }
  if ("pricingConfig" in patch) {
    const schedule = validateCourtPricing(patch);
    const pricing = record(patch.pricingConfig)!;
    const regular = record(pricing.regular)!;
    patch.pricingConfig = {
      ...pricing,
      regular: { ...regular, bands: schedule.bands },
    };
  }
  if ("publicConfig" in patch) validateCourtPublicConfig(patch.publicConfig);
  return Object.fromEntries(Object.entries(patch).map(([key, entry]) => [
    key,
    typeof entry === "string" ? entry.trim() : entry,
  ]));
}

function validateCourtPricing(patch: JsonObject) {
  const pricing = record(patch.pricingConfig);
  const regular = record(pricing?.regular);
  const minimumHours = regular ? numberValue(regular, ["minimumHours"]) : null;
  const maximumHours = regular ? numberValue(regular, ["maximumHours"]) : null;
  const opensAt = typeof patch.opensAt === "string" ? patch.opensAt : "";
  const closesAt = typeof patch.closesAt === "string" ? patch.closesAt : "";
  const schedule = normalizeTwoBandSchedule({
    opensAt,
    closesAt,
    bands: returnedTwoPriceBands(regular?.bands),
  });
  if (
    !pricing || !regular || !schedule || minimumHours === null || maximumHours === null ||
    !Number.isInteger(minimumHours) || !Number.isInteger(maximumHours) ||
    minimumHours <= 0 || maximumHours < minimumHours ||
    !WHOLE_HOUR_PATTERN.test(opensAt) || !WHOLE_HOUR_PATTERN.test(closesAt)
  ) {
    throw new Error("COURT_PRICING_CONFIGURATION_INVALID");
  }
  return schedule;
}

function validateCourtPublicConfig(candidate: unknown): void {
  const publicConfig = record(candidate);
  const minimumLeadMinutes = publicConfig
    ? exactInteger(publicConfig, ["minimumLeadMinutes"])
    : null;
  const maximumAdvanceDays = publicConfig
    ? exactInteger(publicConfig, ["maximumAdvanceDays"])
    : null;
  if (
    !publicConfig || minimumLeadMinutes === null || minimumLeadMinutes < 0 ||
    maximumAdvanceDays === null || maximumAdvanceDays < 1
  ) {
    throw new Error("COURT_PUBLIC_CONFIGURATION_INVALID");
  }
}

const SHARED_SCHEDULE_KEYS = new Set(["opensAt", "closesAt", "bands"]);

function sharedSchedulePayload(candidate: unknown) {
  const payload = payloadObject(candidate, "SHARED_COURT_SCHEDULE_INVALID");
  assertAllowedKeys(payload, SHARED_SCHEDULE_KEYS, "SHARED_COURT_SCHEDULE_INVALID");
  const opensAt = typeof payload.opensAt === "string" ? payload.opensAt.trim() : "";
  const closesAt = typeof payload.closesAt === "string" ? payload.closesAt.trim() : "";
  const schedule = normalizeTwoBandSchedule({
    opensAt,
    closesAt,
    bands: returnedTwoPriceBands(payload.bands),
  });
  if (!schedule) {
    throw new Error("SHARED_COURT_SCHEDULE_INVALID");
  }
  return schedule;
}

const BLOCK_PAYLOAD_KEYS = new Set([
  "courtId",
  "startDate",
  "endDate",
  "startsAt",
  "endsAt",
  "publicLabel",
  "internalReason",
]);

function blockedDatePayload(candidate: unknown) {
  const payload = payloadObject(candidate, "BLOCK_CONFIGURATION_INVALID");
  assertAllowedKeys(payload, BLOCK_PAYLOAD_KEYS, "BLOCK_CONFIGURATION_INVALID");
  const startDate = typeof payload.startDate === "string" ? payload.startDate.trim() : "";
  const endDate = typeof payload.endDate === "string" ? payload.endDate.trim() : startDate;
  const publicLabel = typeof payload.publicLabel === "string" ? payload.publicLabel.trim() : "";
  const internalReason = typeof payload.internalReason === "string"
    ? payload.internalReason.trim()
    : null;
  const startsAt = typeof payload.startsAt === "string" ? payload.startsAt.trim() : null;
  const endsAt = typeof payload.endsAt === "string" ? payload.endsAt.trim() : null;
  if (
    !DATE_PATTERN.test(startDate) || !DATE_PATTERN.test(endDate) ||
    !BLOCK_LABELS.has(publicLabel as "Reserved") ||
    (internalReason !== null && internalReason.length > 200) ||
    ((startsAt === null) !== (endsAt === null)) ||
    (startsAt !== null && (!WHOLE_HOUR_PATTERN.test(startsAt) || !WHOLE_HOUR_PATTERN.test(endsAt ?? "") || endsAt! <= startsAt))
  ) {
    throw new Error("BLOCK_CONFIGURATION_INVALID");
  }
  return {
    courtId: payload.courtId === null || payload.courtId === undefined
      ? null
      : requiredUuid(payload.courtId, "COURT_ID_INVALID"),
    startDate,
    endDate,
    startsAt,
    endsAt,
    publicLabel: publicLabel as "Reserved" | "Private Event" | "Maintenance" | "Closed",
    internalReason,
  };
}

const BUSINESS_PATCH_KEYS = new Set([
  "displayName",
  "contactPhone",
  "facebookUrl",
  "tagline",
  "eventBookingEnabled",
  "branding",
  "venue",
  "paymentMethods",
]);
const ACTIVATION_PATCH_KEYS = new Set([
  "platformBilling",
  "openPlayServiceFee",
  "venue",
  "paymentMethods",
]);
const BUSINESS_ACTION_KEYS = new Set([
  ...BUSINESS_PATCH_KEYS,
  "expectedRevision",
]);
const ISO_REVISION_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function validIsoRevision(candidate: unknown): candidate is string {
  return typeof candidate === "string" && ISO_REVISION_PATTERN.test(candidate) &&
    Number.isFinite(new Date(candidate).getTime());
}

function assertSafePaymentQrUrls(payload: JsonObject): void {
  if (!("paymentMethods" in payload)) return;
  if (!Array.isArray(payload.paymentMethods)) {
    throw new Error("PAYMENT_METHODS_INVALID");
  }
  for (const candidate of payload.paymentMethods) {
    const method = record(candidate);
    if (!method) throw new Error("PAYMENT_METHODS_INVALID");
    const qrUrl = method.qrUrl;
    if (qrUrl === undefined || qrUrl === null || qrUrl === "") continue;
    if (typeof qrUrl !== "string" || !isAllowedCustomerQrUrl(qrUrl.trim())) {
      throw new Error("PAYMENT_QR_URL_NOT_ALLOWED");
    }
  }
}

function settingsPatch(candidate: unknown, action: "business:update" | "activation:update") {
  const payload = payloadObject(candidate, "SETTINGS_PATCH_INVALID");
  assertAllowedKeys(
    payload,
    action === "business:update" ? BUSINESS_PATCH_KEYS : ACTIVATION_PATCH_KEYS,
    "SETTINGS_PATCH_INVALID",
  );
  if (!Object.keys(payload).length) throw new Error("SETTINGS_PATCH_INVALID");
  const venue = "venue" in payload ? record(payload.venue) : null;
  if (venue && "publicBookingEnabled" in venue) {
    throw new Error("USE_INITIAL_ACTIVATION_ACTION");
  }
  assertSafePaymentQrUrls(payload);
  return payload;
}

function businessActionPayload(candidate: unknown) {
  const payload = payloadObject(candidate, "SETTINGS_PATCH_INVALID");
  assertAllowedKeys(payload, BUSINESS_ACTION_KEYS, "SETTINGS_PATCH_INVALID");
  const expectedRevision = typeof payload.expectedRevision === "string"
    ? payload.expectedRevision.trim()
    : "";
  if (
    !ISO_REVISION_PATTERN.test(expectedRevision) ||
    !Number.isFinite(new Date(expectedRevision).getTime())
  ) throw new Error("SETTINGS_REVISION_REQUIRED");
  const patch = { ...payload };
  delete patch.expectedRevision;
  return {
    expectedRevision,
    patch: settingsPatch(patch, "business:update"),
  };
}

function paymentReviewNote(candidate: unknown, required: boolean): string | null {
  const payload = payloadObject(candidate, "PAYMENT_REVIEW_INPUT_INVALID");
  assertAllowedKeys(payload, new Set(["note"]), "PAYMENT_REVIEW_INPUT_INVALID");
  const note = typeof payload.note === "string" ? payload.note.trim() : "";
  if (
    (required && note.length < 3) || note.length > 1_000 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(note)
  ) {
    throw new Error("PAYMENT_REVIEW_NOTE_INVALID");
  }
  return note || null;
}

function assertNoPayload(candidate: unknown): void {
  if (candidate !== undefined) throw new Error("LIVE_ACTION_PAYLOAD_UNEXPECTED");
}

function insightFilters(
  candidate: ManagementInsightFilters,
): Required<Omit<ManagementInsightFilters, "courtId">> & { courtId: string | null } {
  const dateFrom = validDate(candidate.dateFrom, "REPORT_DATE_RANGE_INVALID");
  const dateTo = validDate(candidate.dateTo, "REPORT_DATE_RANGE_INVALID");
  const start = Date.parse(`${dateFrom}T00:00:00Z`);
  const end = Date.parse(`${dateTo}T00:00:00Z`);
  const elapsedDays = Math.round((end - start) / 86_400_000);
  if (elapsedDays < 0 || elapsedDays > 365) {
    throw new Error("REPORT_DATE_RANGE_INVALID");
  }
  return {
    dateFrom,
    dateTo,
    courtId: candidate.courtId
      ? requiredUuid(candidate.courtId, "REPORT_COURT_ID_INVALID")
      : null,
  };
}

function reportObject(candidate: unknown, errorCode: string): JsonObject {
  const result = record(candidate);
  if (!result) throw new Error(errorCode);
  return result;
}

function reportArray(candidate: unknown, errorCode: string): unknown[] {
  if (!Array.isArray(candidate)) throw new Error(errorCode);
  return candidate;
}

function reportText(
  candidate: unknown,
  errorCode: string,
  maximum = 500,
): string {
  const result = typeof candidate === "string" ? candidate.trim() : "";
  if (!result || result.length > maximum) throw new Error(errorCode);
  return result;
}

function reportNullableText(
  candidate: unknown,
  errorCode: string,
  maximum = 500,
): string | null {
  if (candidate === null || candidate === undefined) return null;
  return reportText(candidate, errorCode, maximum);
}

function reportNumber(candidate: unknown, errorCode: string): number {
  const result = typeof candidate === "number"
    ? candidate
    : typeof candidate === "string" && candidate.trim()
      ? Number(candidate)
      : Number.NaN;
  if (!Number.isFinite(result) || result < 0) throw new Error(errorCode);
  return result;
}

function reportInteger(candidate: unknown, errorCode: string): number {
  const result = reportNumber(candidate, errorCode);
  if (!Number.isSafeInteger(result)) throw new Error(errorCode);
  return result;
}

function reportBoolean(candidate: unknown, errorCode: string): boolean {
  if (typeof candidate !== "boolean") throw new Error(errorCode);
  return candidate;
}

function reportDate(candidate: unknown, errorCode: string): string {
  return validDate(reportText(candidate, errorCode, 10), errorCode);
}

function reportNullableDate(candidate: unknown, errorCode: string): string | null {
  if (candidate === null || candidate === undefined) return null;
  return reportDate(candidate, errorCode);
}

function reportInstant(candidate: unknown, errorCode: string): string {
  const result = reportText(candidate, errorCode, 80);
  if (!Number.isFinite(new Date(result).getTime())) throw new Error(errorCode);
  return result;
}

function reportNullableInstant(candidate: unknown, errorCode: string): string | null {
  if (candidate === null || candidate === undefined) return null;
  return reportInstant(candidate, errorCode);
}

function reportCurrency(candidate: unknown, errorCode: string): string {
  const result = reportText(candidate, errorCode, 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(result)) throw new Error(errorCode);
  return result;
}

function reportLifecycleCounts(
  candidate: unknown,
  errorCode: string,
): ReportLifecycleCounts {
  const row = reportObject(candidate, errorCode);
  return {
    pendingPayment: reportInteger(row.pendingPayment, errorCode),
    paymentReview: reportInteger(row.paymentReview, errorCode),
    confirmed: reportInteger(row.confirmed, errorCode),
    completed: reportInteger(row.completed, errorCode),
    cancelled: reportInteger(row.cancelled, errorCode),
    expired: reportInteger(row.expired, errorCode),
  };
}

function reportPaymentCounts(
  candidate: unknown,
  errorCode: string,
): ReportPaymentCounts {
  const row = reportObject(candidate, errorCode);
  return {
    unpaid: reportInteger(row.unpaid, errorCode),
    pending: reportInteger(row.pending, errorCode),
    partial: reportInteger(row.partial, errorCode),
    paid: reportInteger(row.paid, errorCode),
    refunded: reportInteger(row.refunded, errorCode),
    rejected: reportInteger(row.rejected, errorCode),
  };
}

function assertReportHasNoPii(candidate: unknown): void {
  if (!candidate || typeof candidate !== "object") return;
  if (Array.isArray(candidate)) {
    candidate.forEach(assertReportHasNoPii);
    return;
  }
  for (const [key, nested] of Object.entries(candidate as JsonObject)) {
    const normalized = key.replaceAll("_", "").toLowerCase();
    if (
      normalized === "customername" || normalized === "customeremail" ||
      normalized === "customerphone" || normalized === "bookingreference" ||
      normalized === "paymentreference" || normalized === "receipt" ||
      normalized === "receipturl"
    ) {
      throw new Error("REGULAR_BOOKING_REPORT_PII_REJECTED");
    }
    assertReportHasNoPii(nested);
  }
}

function sameAggregate(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.011;
}

function regularBookingReport(
  candidate: unknown,
  expected: { dateFrom: string; dateTo: string; courtId: string | null },
): RegularBookingReport {
  const errorCode = "REGULAR_BOOKING_REPORT_RESPONSE_INVALID";
  assertReportHasNoPii(candidate);
  const row = reportObject(candidate, errorCode);
  const server = reportObject(row.server, errorCode);
  const rangeRow = reportObject(row.range, errorCode);
  const completenessRow = reportObject(row.completeness, errorCode);
  const boundaryRow = reportObject(row.boundary, errorCode);
  const summaryRow = reportObject(row.summary, errorCode);
  const breakdownsRow = reportObject(row.breakdowns, errorCode);
  const asOf = reportInstant(row.asOf, errorCode);
  const timezone = reportText(row.timezone, errorCode, 80);
  const dateFrom = reportDate(rangeRow.dateFrom, errorCode);
  const dateTo = reportDate(rangeRow.dateTo, errorCode);
  const dayCount = reportInteger(rangeRow.dayCount, errorCode);
  const courtId = row.courtId === null
    ? null
    : requiredUuid(row.courtId, errorCode);
  const expectedDayCount = Math.round(
    (Date.parse(`${dateTo}T00:00:00Z`) - Date.parse(`${dateFrom}T00:00:00Z`)) /
      86_400_000,
  ) + 1;
  if (
    row.contractVersion !== 1 || row.tenantSlug !== activeTenant.identity.slug ||
    reportInstant(server.asOf, errorCode) !== asOf ||
    reportText(server.timezone, errorCode, 80) !== timezone ||
    dateFrom !== expected.dateFrom || dateTo !== expected.dateTo ||
    courtId !== expected.courtId || dayCount !== expectedDayCount ||
    dayCount < 1 || dayCount > 366 ||
    rangeRow.inclusive !== true || rangeRow.basis !== "local_booking_date"
  ) {
    throw new Error(errorCode);
  }

  const completeness = {
    allMatchingRowsAggregated: reportBoolean(
      completenessRow.allMatchingRowsAggregated,
      errorCode,
    ),
    aggregationComplete: reportBoolean(completenessRow.aggregationComplete, errorCode),
    anomalyCount: reportInteger(completenessRow.anomalyCount, errorCode),
    currentStateSnapshot: reportBoolean(completenessRow.currentStateSnapshot, errorCode),
    fullPaymentEventLedgerIncluded: reportBoolean(
      completenessRow.fullPaymentEventLedgerIncluded,
      errorCode,
    ),
    fullRefundEventLedgerIncluded: reportBoolean(
      completenessRow.fullRefundEventLedgerIncluded,
      errorCode,
    ),
  };
  const complete = reportBoolean(row.complete, errorCode);
  if (
    completeness.allMatchingRowsAggregated !== true ||
    completeness.currentStateSnapshot !== true ||
    completeness.fullPaymentEventLedgerIncluded !== false ||
    completeness.fullRefundEventLedgerIncluded !== false ||
    complete !== completeness.aggregationComplete ||
    complete !== (completeness.anomalyCount === 0)
  ) {
    throw new Error(errorCode);
  }

  if (
    boundaryRow.bookingType !== "regular" ||
    boundaryRow.dateBasis !== "local_booking_date" ||
    boundaryRow.overnightHoursSplitAcrossDays !== false ||
    boundaryRow.netRevenueIncluded !== false ||
    boundaryRow.remittanceDueIncluded !== false ||
    boundaryRow.remittanceContract !== "get_booking_fee_remittance_dashboard"
  ) {
    throw new Error(errorCode);
  }

  const summary = {
    totalBookingCount: reportInteger(summaryRow.totalBookingCount, errorCode),
    recordedBookingHours: reportNumber(summaryRow.recordedBookingHours, errorCode),
    bookedHours: reportNumber(summaryRow.bookedHours, errorCode),
    paidBookingCount: reportInteger(summaryRow.paidBookingCount, errorCode),
    venueSalesPaid: reportNumber(summaryRow.venueSalesPaid, errorCode),
    platformBookingFeesPaid: reportNumber(
      summaryRow.platformBookingFeesPaid,
      errorCode,
    ),
    grossPaid: reportNumber(summaryRow.grossPaid, errorCode),
    recordedRefundedBookingCount: reportInteger(
      summaryRow.recordedRefundedBookingCount,
      errorCode,
    ),
    recordedRefunds: reportNumber(summaryRow.recordedRefunds, errorCode),
    averagePaidBookingValue: reportNumber(
      summaryRow.averagePaidBookingValue,
      errorCode,
    ),
    lifecycleCounts: reportLifecycleCounts(summaryRow.lifecycleCounts, errorCode),
    paymentCounts: reportPaymentCounts(summaryRow.paymentCounts, errorCode),
  };

  const daily = reportArray(breakdownsRow.daily, errorCode).map((entry) => {
    const item = reportObject(entry, errorCode);
    return {
      date: reportDate(item.date, errorCode),
      totalBookingCount: reportInteger(item.totalBookingCount, errorCode),
      recordedBookingHours: reportNumber(item.recordedBookingHours, errorCode),
      bookedHours: reportNumber(item.bookedHours, errorCode),
      paidBookingCount: reportInteger(item.paidBookingCount, errorCode),
      venueSalesPaid: reportNumber(item.venueSalesPaid, errorCode),
      platformBookingFeesPaid: reportNumber(item.platformBookingFeesPaid, errorCode),
      grossPaid: reportNumber(item.grossPaid, errorCode),
      recordedRefunds: reportNumber(item.recordedRefunds, errorCode),
      lifecycleCounts: reportLifecycleCounts(item.lifecycleCounts, errorCode),
    };
  });
  if (daily.length !== dayCount) throw new Error(errorCode);
  const start = Date.parse(`${dateFrom}T00:00:00Z`);
  daily.forEach((entry, index) => {
    const expectedDate = new Date(start + index * 86_400_000)
      .toISOString()
      .slice(0, 10);
    if (entry.date !== expectedDate) throw new Error(errorCode);
  });

  const courts = reportArray(breakdownsRow.courts, errorCode).map((entry) => {
    const item = reportObject(entry, errorCode);
    return {
      courtId: requiredUuid(item.courtId, errorCode),
      courtName: reportText(item.courtName, errorCode, 160),
      courtStatus: reportText(item.courtStatus, errorCode, 40),
      totalBookingCount: reportInteger(item.totalBookingCount, errorCode),
      recordedBookingHours: reportNumber(item.recordedBookingHours, errorCode),
      bookedHours: reportNumber(item.bookedHours, errorCode),
      paidBookingCount: reportInteger(item.paidBookingCount, errorCode),
      venueSalesPaid: reportNumber(item.venueSalesPaid, errorCode),
      platformBookingFeesPaid: reportNumber(item.platformBookingFeesPaid, errorCode),
      grossPaid: reportNumber(item.grossPaid, errorCode),
      recordedRefunds: reportNumber(item.recordedRefunds, errorCode),
    };
  });

  const paymentStatusSet = new Set<keyof ReportPaymentCounts>();
  const paymentStatuses = reportArray(
    breakdownsRow.paymentStatuses,
    errorCode,
  ).map((entry) => {
    const item = reportObject(entry, errorCode);
    const status = reportText(item.status, errorCode, 30) as keyof ReportPaymentCounts;
    if (
      !["unpaid", "pending", "partial", "paid", "refunded", "rejected"].includes(status) ||
      paymentStatusSet.has(status)
    ) throw new Error(errorCode);
    paymentStatusSet.add(status);
    return {
      status,
      bookingCount: reportInteger(item.bookingCount, errorCode),
      customerTotalSnapshot: reportNumber(item.customerTotalSnapshot, errorCode),
      grossPaid: reportNumber(item.grossPaid, errorCode),
      recordedRefunds: reportNumber(item.recordedRefunds, errorCode),
    };
  });

  type LifecycleStatus = RegularBookingReport["breakdowns"]["lifecycleStatuses"][number]["status"];
  const lifecycleStatusSet = new Set<LifecycleStatus>();
  const lifecycleStatuses = reportArray(
    breakdownsRow.lifecycleStatuses,
    errorCode,
  ).map((entry) => {
    const item = reportObject(entry, errorCode);
    const status = reportText(item.status, errorCode, 30) as LifecycleStatus;
    if (
      !["pending_payment", "payment_review", "confirmed", "completed", "cancelled", "expired"].includes(status) ||
      lifecycleStatusSet.has(status)
    ) throw new Error(errorCode);
    lifecycleStatusSet.add(status);
    return {
      status,
      bookingCount: reportInteger(item.bookingCount, errorCode),
      recordedBookingHours: reportNumber(item.recordedBookingHours, errorCode),
      bookedHours: reportNumber(item.bookedHours, errorCode),
      grossPaid: reportNumber(item.grossPaid, errorCode),
      recordedRefunds: reportNumber(item.recordedRefunds, errorCode),
    };
  });

  if (
    paymentStatusSet.size !== 6 || lifecycleStatusSet.size !== 6 ||
    !sameAggregate(
      daily.reduce((sum, entry) => sum + entry.grossPaid, 0),
      summary.grossPaid,
    ) ||
    !sameAggregate(
      courts.reduce((sum, entry) => sum + entry.grossPaid, 0),
      summary.grossPaid,
    ) ||
    !sameAggregate(
      paymentStatuses.reduce((sum, entry) => sum + entry.grossPaid, 0),
      summary.grossPaid,
    ) ||
    !sameAggregate(
      lifecycleStatuses.reduce((sum, entry) => sum + entry.grossPaid, 0),
      summary.grossPaid,
    )
  ) {
    throw new Error(errorCode);
  }

  return {
    contractVersion: 1,
    tenantSlug: activeTenant.identity.slug,
    asOf,
    timezone,
    range: {
      dateFrom,
      dateTo,
      dayCount,
      inclusive: true,
      basis: "local_booking_date",
    },
    courtId,
    currency: reportCurrency(row.currency, errorCode),
    complete,
    completeness: {
      ...completeness,
      allMatchingRowsAggregated: true,
      currentStateSnapshot: true,
      fullPaymentEventLedgerIncluded: false,
      fullRefundEventLedgerIncluded: false,
    },
    boundary: {
      bookingType: "regular",
      dateBasis: "local_booking_date",
      overnightHoursSplitAcrossDays: false,
      financialBasis: reportText(boundaryRow.financialBasis, errorCode),
      paidGrossDefinition: reportText(boundaryRow.paidGrossDefinition, errorCode),
      venueSalesDefinition: reportText(boundaryRow.venueSalesDefinition, errorCode),
      platformBookingFeeDefinition: reportText(
        boundaryRow.platformBookingFeeDefinition,
        errorCode,
      ),
      recordedRefundDefinition: reportText(
        boundaryRow.recordedRefundDefinition,
        errorCode,
      ),
      netRevenueIncluded: false,
      remittanceDueIncluded: false,
      remittanceContract: "get_booking_fee_remittance_dashboard",
    },
    summary,
    breakdowns: { daily, courts, paymentStatuses, lifecycleStatuses },
  };
}

const REMITTANCE_STATUSES = new Set<RemittanceStatus>([
  "draft",
  "due",
  "submitted",
  "under_review",
  "settled",
  "rejected",
  "void",
]);

function remittanceSummary(candidate: unknown): RemittanceSummary {
  const errorCode = "REMITTANCE_SUMMARY_RESPONSE_INVALID";
  const row = reportObject(candidate, errorCode);
  const status = reportText(row.status, errorCode, 30) as RemittanceStatus;
  if (!REMITTANCE_STATUSES.has(status)) throw new Error(errorCode);
  const amountDue = reportNumber(row.amount_due, errorCode);
  const amountSettled = reportNumber(row.amount_settled, errorCode);
  const remainingBalance = reportNumber(row.remaining_balance, errorCode);
  if (
    amountSettled > amountDue + 0.01 ||
    !sameAggregate(Math.max(amountDue - amountSettled, 0), remainingBalance)
  ) throw new Error(errorCode);
  return {
    id: requiredUuid(row.id ?? row.remittance_id, errorCode),
    reference: reportText(row.reference ?? row.remittance_ref, errorCode, 120),
    venueName: reportText(row.venue_name, errorCode, 160),
    status,
    cycleDueOn: reportNullableDate(row.cycle_due_on, errorCode),
    periodStart: reportNullableDate(row.period_start, errorCode),
    periodEnd: reportNullableDate(row.period_end, errorCode),
    preparedAt: reportInstant(row.prepared_at, errorCode),
    submittedAt: reportNullableInstant(row.submitted_at, errorCode),
    settledAt: reportNullableInstant(row.settled_at, errorCode),
    cancelledAt: reportNullableInstant(row.cancelled_at, errorCode),
    amountDue,
    amountSettled,
    remainingBalance,
    currency: reportCurrency(row.currency, errorCode),
    bookingsCount: reportInteger(row.bookings_count, errorCode),
    billableHours: reportNumber(row.billable_hours, errorCode),
  };
}

function remittanceDashboard(candidate: unknown): RemittanceDashboard {
  const errorCode = "REMITTANCE_DASHBOARD_RESPONSE_INVALID";
  const row = reportObject(candidate, errorCode);
  const permission = reportObject(row.can_prepare, errorCode);
  const accumulatedRow = reportObject(row.accumulated, errorCode);
  const rawRole = reportText(row.role, errorCode, 30);
  if (rawRole !== "owner" && rawRole !== "court_owner") throw new Error(errorCode);
  const destinationRow = row.payment_destination === null
    ? null
    : reportObject(row.payment_destination, errorCode);
  const paymentDestination = destinationRow
    ? (() => {
        const method = reportText(destinationRow.method, errorCode, 30);
        if (!["gcash", "maya", "bank_transfer", "other"].includes(method)) {
          throw new Error(errorCode);
        }
        const accountName = reportNullableText(destinationRow.account_name, errorCode, 160);
        const accountReference = reportNullableText(
          destinationRow.account_reference,
          errorCode,
          120,
        );
        return {
          method: method as "gcash" | "maya" | "bank_transfer" | "other",
          accountName,
          accountReference,
          instructions: reportNullableText(destinationRow.instructions, errorCode, 2_000),
          configured: Boolean(accountName && accountReference),
        };
      })()
    : null;

  return {
    serverNow: reportInstant(row.server_now, errorCode),
    timezone: reportText(row.timezone, errorCode, 80),
    role: rawRole === "owner" ? "system_owner" : "court_owner",
    nextDueOn: reportDate(row.next_due_on, errorCode),
    canPrepare: {
      allowed: reportBoolean(permission.allowed, errorCode),
      reason: reportText(permission.reason, errorCode, 500),
    },
    accumulated: {
      bookingsCount: reportInteger(accumulatedRow.bookings_count, errorCode),
      billableHours: reportNumber(accumulatedRow.billable_hours, errorCode),
      flatFeeBookingCount: reportInteger(
        accumulatedRow.flat_fee_booking_count,
        errorCode,
      ),
      amountDue: reportNumber(accumulatedRow.amount_due, errorCode),
    },
    openRemittances: reportArray(row.open_remittances, errorCode).map(
      remittanceSummary,
    ),
    settledTotal: reportNumber(row.settled_total, errorCode),
    paymentDestination,
  };
}

function remittanceHistory(candidate: unknown): RemittanceSummary[] {
  return reportArray(candidate, "REMITTANCE_HISTORY_RESPONSE_INVALID").map(
    remittanceSummary,
  );
}

function record(candidate: unknown): JsonObject | null {
  return candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? (candidate as JsonObject)
    : null;
}

function tenantPromotion(candidate: unknown): TenantPromotion {
  const row = record(candidate);
  if (!row) throw new Error("PROMOTION_RESPONSE_INVALID");
  const status = value(row, ["status"]);
  const discountType = value(row, ["discountType", "discount_type"]);
  const weekdays = Array.isArray(row.weekdays)
    ? row.weekdays.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6)
    : [];
  const rawCourtIds = row.courtIds ?? row.court_ids;
  const courtIds = Array.isArray(rawCourtIds)
    ? rawCourtIds.filter(
        (id): id is string => typeof id === "string" && UUID_PATTERN.test(id),
      )
    : [];
  const maxRedemptions = numberValue(row, ["maxRedemptions", "max_redemptions"]);
  const redemptionCount = numberValue(row, ["redemptionCount", "redemption_count"]);
  const id = value(row, ["id"]);
  const name = value(row, ["name"]);
  const discountValue = numberValue(row, ["discountValue", "discount_value"]);
  const startsAt = value(row, ["startsAt", "starts_at"]);
  const endsAt = value(row, ["endsAt", "ends_at"]);
  const validFrom = value(row, ["validFrom", "valid_from"]);
  const validUntil = value(row, ["validUntil", "valid_until"]);
  if (
    !UUID_PATTERN.test(id) || !name ||
    !["active", "paused", "ended"].includes(status) ||
    !["percentage", "fixed_amount"].includes(discountType) ||
    discountValue === null || discountValue <= 0 || !weekdays.length ||
    !/^\d{2}:\d{2}/.test(startsAt) || !/^\d{2}:\d{2}/.test(endsAt) ||
    !DATE_PATTERN.test(validFrom) || !DATE_PATTERN.test(validUntil) ||
    !courtIds.length || redemptionCount === null
  ) throw new Error("PROMOTION_RESPONSE_INVALID");
  return {
    id,
    name,
    status: status as TenantPromotion["status"],
    discountType: discountType as TenantPromotion["discountType"],
    discountValue,
    weekdays,
    startsAt: startsAt.slice(0, 5),
    endsAt: endsAt.slice(0, 5),
    validFrom,
    validUntil,
    courtIds,
    maxRedemptions: maxRedemptions === null ? null : Math.trunc(maxRedemptions),
    redemptionCount: Math.trunc(redemptionCount),
  };
}

function tenantPromotionState(candidate: unknown): TenantPromotionState {
  const row = record(candidate);
  if (!row || typeof row.canCreate !== "boolean" || !Array.isArray(row.items)) {
    throw new Error("PROMOTION_RESPONSE_INVALID");
  }
  return { available: true, canCreate: row.canCreate, items: row.items.map(tenantPromotion) };
}

function value(row: Record<string, unknown>, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const candidate = row[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return fallback;
}

function numberValue(row: JsonObject, keys: string[]): number | null {
  let candidate: unknown;
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) {
      candidate = row[key];
      break;
    }
  }
  if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
  if (typeof candidate === "string") {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function bookingAmount(row: JsonObject): number {
  const total = numberValue(row, ["total_amount", "totalAmount", "amount"]);
  if (total !== null) return Math.max(0, total);
  const subtotal = numberValue(row, ["subtotal_amount", "subtotalAmount"]);
  const serviceFee = numberValue(row, [
    "service_fee_amount",
    "serviceFeeAmount",
  ]);
  return Math.max(0, (subtotal ?? 0) + (serviceFee ?? 0));
}

function liveStatus(
  row: JsonObject,
  payment: BookingPaymentStatus,
  paymentEvidence: PaymentEvidence | null,
): BookingStatus {
  const status = value(row, ["status"]).toLowerCase();
  if (status === "cancelled") return "cancelled";
  if (status === "expired") return "expired";
  if (status === "completed") return "completed";
  if (value(row, ["checked_in_at"])) return "checked_in";
  if (status === "confirmed") return "confirmed";

  if (status === "pending_payment" || status === "payment_review") {
    if (paymentEvidence?.status === "pending") {
      return payment === "unpaid" || payment === "pending"
        ? "receipt_processing"
        : "payment_attention";
    }

    if (status === "pending_payment" && !paymentEvidence) {
      if (payment === "unpaid") return "awaiting_receipt";
      if (payment === "pending") return "receipt_processing";
      return "payment_attention";
    }

    if (
      status === "payment_review" &&
      paymentEvidence?.status === "manual_review" &&
      payment === "pending"
    ) {
      return "payment_review";
    }

    // Includes reviewed short payments and any active booking whose booking,
    // payment, and receipt states disagree. Keep these visible without
    // presenting an unsafe review action for an inconsistent server state.
    return "payment_attention";
  }
  throw new Error("LIVE_BOOKING_STATUS_INVALID");
}

function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase() || "—";
}

function parsedInstant(row: JsonObject, keys: string[]): Date | null {
  const raw = value(row, keys);
  if (!raw) return null;
  const candidate = new Date(raw);
  return Number.isFinite(candidate.getTime()) ? candidate : null;
}

function formatManilaDate(candidate: Date): string {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: activeTenant.identity.timezone,
  }).format(candidate);
}

function formatManilaDateTime(candidate: Date): string {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: activeTenant.identity.timezone,
  }).format(candidate);
}

function formatManilaTime(candidate: Date): string {
  return new Intl.DateTimeFormat("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: activeTenant.identity.timezone,
  }).format(candidate);
}

function formatManilaClock(candidate: Date): string {
  return new Intl.DateTimeFormat("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: activeTenant.identity.timezone,
  }).format(candidate);
}

function localCalendarDate(raw: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const candidate = new Date(`${raw}T12:00:00Z`);
  return Number.isFinite(candidate.getTime()) ? candidate : null;
}

function bookingDateLabel(row: JsonObject, startsAt: Date | null): string {
  const localDate = value(row, ["local_booking_date"]);
  const calendarDate = localCalendarDate(localDate);
  if (calendarDate) return formatManilaDate(calendarDate);
  return startsAt ? formatManilaDate(startsAt) : "Date unavailable";
}

function bookingTimeLabel(startsAt: Date | null, endsAt: Date | null): string {
  if (!startsAt || !endsAt) return "Time unavailable";
  return `${formatManilaTime(startsAt)}–${formatManilaTime(endsAt)}`;
}

function durationLabel(startsAt: Date | null, endsAt: Date | null): string {
  if (!startsAt || !endsAt) return "—";
  const minutes = Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000);
  if (minutes <= 0) return "—";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  const parts = [
    hours ? `${hours} ${hours === 1 ? "hr" : "hrs"}` : "",
    remainder ? `${remainder} min` : "",
  ].filter(Boolean);
  return parts.join(" ");
}

function courtLabel(
  courtId: string,
  courtNames: ReadonlyMap<string, string>,
  allCourtsLabel = "Court unavailable",
): string {
  if (!courtId) return allCourtsLabel;
  return courtNames.get(courtId) ?? "Court unavailable";
}

function livePaymentStatus(candidate: string): BookingPaymentStatus {
  if (
    candidate === "unpaid" || candidate === "pending" ||
    candidate === "partial" || candidate === "paid" ||
    candidate === "refunded" || candidate === "rejected"
  ) return candidate;
  return "unknown";
}

function isoInstant(row: JsonObject, keys: string[]): string | null {
  const raw = value(row, keys);
  if (!raw) return null;
  const instant = new Date(raw);
  return Number.isFinite(instant.getTime()) ? instant.toISOString() : null;
}

function latestPaymentEvidence(
  row: JsonObject,
  bookingStatus: string,
  paymentStatus: string,
): PaymentEvidence | null {
  if (!Array.isArray(row.receipt_verifications)) return null;
  const evidence = row.receipt_verifications
    .map((candidate) => record(candidate))
    .filter((candidate): candidate is JsonObject => candidate !== null)
    .map((candidate) => {
      const verificationId = value(candidate, ["id"]);
      const status = paymentEvidenceStatus(candidate.status);
      const submittedAt = isoInstant(candidate, ["created_at", "createdAt"]);
      if (!UUID_PATTERN.test(verificationId) || !status || !submittedAt) return null;
      const reviewedAt = isoInstant(candidate, ["reviewed_at", "reviewedAt"]);
      const expectedAmount = numberValue(candidate, ["expected_amount", "expectedAmount"]);
      const extracted = record(candidate.extracted_data);
      const detected = extracted ? record(extracted.detected) : null;
      const timing = extracted ? record(extracted.timing) : null;
      const detectedAmounts = Array.isArray(detected?.amounts)
        ? detected.amounts
            .filter((amount): amount is number =>
              typeof amount === "number" && Number.isFinite(amount) && amount >= 0 && amount <= 10_000_000
            )
            .slice(0, 10)
        : [];
      const receiptIssuedAt = timing
        ? isoInstant(timing, ["receiptDateTime", "receipt_date_time"])
        : null;
      const rawConfidence = numberValue(candidate, ["confidence"]);
      const confidence = rawConfidence !== null && rawConfidence >= 0 && rawConfidence <= 1
        ? rawConfidence
        : null;
      const flags = Array.isArray(candidate.flags)
        ? candidate.flags
            .filter((flag): flag is string => typeof flag === "string")
            .map((flag) => flag.trim())
            .filter((flag) => /^[a-z0-9_:-]{1,80}$/i.test(flag))
            .slice(0, 12)
        : [];
      const detectedReference = value(candidate, ["payment_reference", "paymentReference"]);
      const paymentSessionId = value(candidate, ["payment_session_id", "paymentSessionId"]);
      const paymentSession = Array.isArray(row.payment_sessions)
        ? row.payment_sessions
            .map((session) => record(session))
            .find((session) => session && value(session, ["id"]) === paymentSessionId) ?? null
        : null;
      const providerPayload = paymentSession ? record(paymentSession.provider_payload) : null;
      const submittedReference = providerPayload
        ? value(providerPayload, ["submittedReference", "submitted_reference"])
        : "";
      const paymentMethod = providerPayload
        ? value(providerPayload, ["paymentMethod", "payment_method"]).toLowerCase()
        : "";
      return {
        verificationId,
        status,
        submittedReference: submittedReference && submittedReference.length <= 64
          ? submittedReference
          : null,
        detectedReference: detectedReference && detectedReference.length <= 64
          ? detectedReference
          : null,
        paymentMethod: /^[a-z][a-z0-9_-]{1,39}$/.test(paymentMethod) ? paymentMethod : null,
        paymentAttemptedAt: paymentSession
          ? isoInstant(paymentSession, ["created_at", "createdAt"])
          : null,
        submittedAt,
        reviewedAt,
        expectedAmount: expectedAmount !== null && expectedAmount >= 0 ? expectedAmount : null,
        detectedAmounts,
        receiptIssuedAt,
        confidence,
        flags,
        reviewable: status === "manual_review" && bookingStatus === "payment_review" &&
          paymentStatus === "pending",
      } satisfies PaymentEvidence;
    })
    .filter((candidate): candidate is PaymentEvidence => candidate !== null)
    .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));
  return evidence[0] ?? null;
}

function mapLiveBooking(
  row: JsonObject,
  courtNames: ReadonlyMap<string, string>,
): Booking {
  const bookingId = value(row, ["id"]);
  const reference = value(row, ["reference", "booking_reference"]);
  const customer = value(row, ["customer_name", "customerName", "name"]);
  const courtId = value(row, ["court_id"]);
  const bookingType = value(row, ["booking_type", "bookingType"]).toLowerCase();
  if (
    !UUID_PATTERN.test(bookingId) || !reference || !customer || !UUID_PATTERN.test(courtId) ||
    (bookingType !== "regular" && bookingType !== "event")
  ) {
    throw new Error("LIVE_BOOKING_ROW_INVALID");
  }
  const startsAt = parsedInstant(row, ["starts_at"]);
  const endsAt = parsedInstant(row, ["ends_at"]);
  const paymentStatus = value(row, ["payment_status", "paymentStatus"]).toLowerCase();
  const bookingStatus = value(row, ["status"]).toLowerCase();
  const payment = livePaymentStatus(paymentStatus);
  const paymentEvidence = latestPaymentEvidence(row, bookingStatus, paymentStatus);
  const phone = value(row, ["customer_phone", "phone", "mobile"]);
  const email = value(row, ["customer_email", "customerEmail"]);
  return {
    bookingId,
    bookingType,
    reference,
    id: reference,
    customer,
    initials: initialsFor(customer),
    phone: phone || email || "Contact unavailable",
    court: value(
      row,
      ["court_name", "courtName"],
      courtLabel(courtId, courtNames),
    ),
    date: bookingDateLabel(row, startsAt),
    time: bookingTimeLabel(startsAt, endsAt),
    duration: durationLabel(startsAt, endsAt),
    amount: bookingAmount(row),
    status: liveStatus(row, payment, paymentEvidence),
    payment,
    courtId,
    bookingDate: DATE_PATTERN.test(value(row, ["local_booking_date"]))
      ? value(row, ["local_booking_date"])
      : null,
    startTime: startsAt ? formatManilaClock(startsAt) : null,
    paymentEvidence,
  };
}

function normalizedClock(raw: string): string | null {
  const match = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(raw);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${match[1]}:${match[2]}`;
}

function localBlockInstant(date: string, clock: string): Date | null {
  const normalized = normalizedClock(clock);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !normalized) return null;
  const candidate = new Date(`${date}T${normalized}:00+08:00`);
  return Number.isFinite(candidate.getTime()) ? candidate : null;
}

function mapLiveBlock(
  row: JsonObject,
  courtNames: ReadonlyMap<string, string>,
): CourtBlock {
  const id = value(row, ["id"]);
  const blockedOn = value(row, ["blocked_on"]);
  if (!id || !blockedOn) throw new Error("LIVE_BLOCK_ROW_INVALID");
  const startRaw = value(row, ["starts_at"]);
  const endRaw = value(row, ["ends_at"]);
  const start = localBlockInstant(blockedOn, startRaw);
  const end = localBlockInstant(blockedOn, endRaw);
  const date = localCalendarDate(blockedOn);
  const courtId = value(row, ["court_id"]);
  const publicLabel = value(row, ["public_label", "reason"], "Court unavailable");
  const internalReason = value(row, ["internal_reason"]);
  return {
    id,
    court: courtLabel(courtId, courtNames, "All courts"),
    date: date ? formatManilaDate(date) : "Date unavailable",
    dateValue: DATE_PATTERN.test(blockedOn) ? blockedOn : null,
    time: start && end
      ? `${formatManilaTime(start)}–${formatManilaTime(end)}`
      : "All day",
    reason: publicLabel,
    publicLabel,
    internalReason: internalReason || null,
    createdBy: null,
  };
}

function liveActivationSettings(result: JsonObject | null): JsonObject | null {
  const envelope = record(result);
  return record(envelope?.settings);
}

function booleanValue(row: JsonObject | null, key: string): boolean {
  return row?.[key] === true;
}

function humanizeReason(reason: string): string {
  return reason.toLowerCase().replaceAll("_", " ");
}

function liveSetup(settings: JsonObject | null): SetupItem[] {
  if (!settings) {
    return [{
      id: "readiness-unavailable",
      label: "Launch readiness unavailable",
      detail: "Activation settings were not available for this load; refresh before drawing a permission conclusion.",
      complete: false,
    }];
  }

  const readiness = record(settings.readiness);
  const setupStatus = value(settings, ["setupStatus"], "setup_required");
  const reasons = Array.isArray(readiness?.blockingReasons)
    ? readiness.blockingReasons.filter(
        (reason): reason is string => typeof reason === "string" && Boolean(reason),
      )
    : [];
  const item = (
    id: string,
    label: string,
    key: string,
    readyDetail: string,
    missingDetail: string,
  ): SetupItem => ({
    id,
    label,
    detail: booleanValue(readiness, key) ? readyDetail : missingDetail,
    complete: booleanValue(readiness, key),
  });

  return [
    {
      id: "setup-status",
      label: "Tenant setup status",
      detail: `Platform status: ${humanizeReason(setupStatus)}`,
      complete: setupStatus === "active" && booleanValue(readiness, "setupActive"),
    },
    item(
      "domain",
      "Booking domain",
      "domainConfigured",
      "An active tenant domain is registered.",
      "Register and verify the production booking domain.",
    ),
    item(
      "court-pricing",
      "Court pricing",
      "courtPricingConfigured",
      "At least one active court has valid pricing.",
      "Publish valid pricing for an active court.",
    ),
    item(
      "billing",
      "Platform billing",
      "billingConfigured",
      "The platform billing rule is configured.",
      "Configure the platform billing rule.",
    ),
    item(
      "payment",
      "Customer payments",
      "paymentConfigured",
      "An active customer payment method is configured.",
      "Add and verify a customer payment destination.",
    ),
    item(
      "remittance",
      "Platform remittance",
      "remittanceConfigured",
      "The platform remittance destination is configured.",
      "Configure the platform remittance destination.",
    ),
    ...(booleanValue(readiness, "launchRequirementsV2Required")
      ? [
          item(
            "email",
            "Booking email",
            "emailConfigured",
            "The booking Reply-To address is configured.",
            "Configure the booking Reply-To address.",
          ),
          item(
            "policy",
            "Customer booking rules",
            "policyConfigured",
            "The customer cancellation and reschedule rules are published.",
            "Write and publish the customer booking rules.",
          ),
        ]
      : []),
    {
      id: "public-booking",
      label: "Public booking gate",
      detail: booleanValue(readiness, "publicBookingEnabled")
        ? "Public booking is enabled by the shared platform."
        : reasons.length
          ? `Blocked: ${reasons.map(humanizeReason).join(", ")}.`
          : "Public booking is disabled by tenant configuration.",
      complete: booleanValue(readiness, "publicBookingEnabled"),
    },
  ];
}

function deriveLiveSchedule(
  bookingRows: JsonObject[],
  blockRows: JsonObject[],
  courtNames: ReadonlyMap<string, string>,
): ScheduleSlot[] {
  const bookingSlots = bookingRows
    .filter((row) => {
      const status = value(row, ["status"]).toLowerCase();
      return status !== "cancelled" && status !== "expired";
    })
    .map((row) => {
      const booking = mapLiveBooking(row, courtNames);
      const startsAt = parsedInstant(row, ["starts_at"]);
      const endsAt = parsedInstant(row, ["ends_at"]);
      const rawStatus = value(row, ["status"]);
      return {
        id: booking.id,
        courtId: value(row, ["court_id"]),
        start: startsAt ? formatManilaClock(startsAt) : "00:00",
        end: endsAt ? formatManilaClock(endsAt) : "00:00",
        label: booking.customer,
        detail: `${humanizeReason(rawStatus)} · ${booking.duration}`,
        kind:
          rawStatus === "pending_payment" || rawStatus === "payment_review"
            ? "hold"
            : "booking",
      } satisfies ScheduleSlot;
    });

  const blockSlots = blockRows.map((row) => {
    const block = mapLiveBlock(row, courtNames);
    return {
      id: block.id,
      courtId: value(row, ["court_id"], "all-courts"),
      start: normalizedClock(value(row, ["starts_at"])) ?? "00:00",
      end: normalizedClock(value(row, ["ends_at"])) ?? "23:59",
      label: block.reason,
      detail: block.court,
      kind: "block",
    } satisfies ScheduleSlot;
  });

  return [...bookingSlots, ...blockSlots];
}

type CustomerAccumulator = {
  key: string;
  id: string;
  name: string;
  initials: string;
  contact: string;
  phone: string | null;
  email: string | null;
  totalBookings: number;
  completedVisits: number;
  upcomingBookings: number;
  cancelledBookings: number;
  lifetimeValue: number;
  lastVisit: string;
  nextBooking: string | null;
  note: string;
  identityStatus: "resolved" | "needs_details" | "review";
  bookingHistory: NonNullable<Customer["bookingHistory"]>;
  latestCompletedAt: number | null;
  nextBookingAt: number | null;
  latestNameAt: number;
};

function stableCustomerId(key: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `customer-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function normalizedCustomerPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("9")) return `63${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `63${digits.slice(1)}`;
  if (digits.length >= 7) return digits;
  return "";
}

function normalizedCustomerEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function isPendingCustomerName(name: string): boolean {
  return /^(booking details pending|details pending|customer details pending)$/i.test(name.trim());
}

function deriveLiveCustomers(
  bookingRows: JsonObject[],
  courtNames: ReadonlyMap<string, string>,
): Customer[] {
  const customers = new Map<string, CustomerAccumulator>();
  const phoneIndex = new Map<string, CustomerAccumulator>();
  const emailIndex = new Map<string, CustomerAccumulator>();
  const now = Date.now();

  for (const row of bookingRows) {
    const booking = mapLiveBooking(row, courtNames);
    const rawName = value(row, ["customer_name", "customerName"]);
    const phone = normalizedCustomerPhone(value(row, ["customer_phone", "phone", "mobile"]));
    const email = normalizedCustomerEmail(value(row, ["customer_email", "customerEmail"]));
    const phoneMatch = phone ? phoneIndex.get(phone) : undefined;
    const emailMatch = email ? emailIndex.get(email) : undefined;
    const identityConflict = Boolean(phoneMatch && emailMatch && phoneMatch !== emailMatch);
    const existingMatch = identityConflict ? undefined : phoneMatch ?? emailMatch;
    const key = existingMatch?.key ?? (identityConflict
      ? `review:${booking.bookingId}`
      : phone
        ? `phone:${phone}`
        : email
          ? `email:${email}`
          : `unresolved:${booking.bookingId}`);
    const startsAt = parsedInstant(row, ["starts_at"]);
    const endsAt = parsedInstant(row, ["ends_at"]);
    const name = !rawName || isPendingCustomerName(rawName) ? "Customer details needed" : rawName;
    const nameTimestamp = startsAt?.getTime() ?? 0;
    const existing = existingMatch ?? customers.get(key) ?? {
      key,
      id: stableCustomerId(key),
      name,
      initials: initialsFor(name),
      contact: phone ? `+${phone}` : email || "Contact unavailable",
      phone: phone ? `+${phone}` : null,
      email: email || null,
      totalBookings: 0,
      completedVisits: 0,
      upcomingBookings: 0,
      cancelledBookings: 0,
      lifetimeValue: 0,
      lastVisit: "No completed visit",
      nextBooking: null,
      note: phone || email ? "Identity linked from tenant bookings" : "Add a mobile number or email to link future bookings",
      identityStatus: identityConflict ? "review" : phone || email ? "resolved" : "needs_details",
      bookingHistory: [],
      latestCompletedAt: null,
      nextBookingAt: null,
      latestNameAt: nameTimestamp,
    };
    const status = value(row, ["status"]);
    const paymentStatus = value(row, ["payment_status"]);
    const terminalCancelled = status === "cancelled" || status === "expired";

    if (!isPendingCustomerName(rawName) && nameTimestamp >= existing.latestNameAt) {
      existing.name = rawName;
      existing.initials = initialsFor(rawName);
      existing.latestNameAt = nameTimestamp;
    }
    if (!existing.phone && phone) existing.phone = `+${phone}`;
    if (!existing.email && email) existing.email = email;
    existing.contact = existing.phone || existing.email || "Contact unavailable";
    if (identityConflict) existing.identityStatus = "review";
    if (!terminalCancelled) existing.totalBookings += 1;
    else existing.cancelledBookings += 1;
    if (status === "completed") {
      existing.completedVisits += 1;
      if (
        endsAt &&
        (existing.latestCompletedAt === null || endsAt.getTime() > existing.latestCompletedAt)
      ) {
        existing.latestCompletedAt = endsAt.getTime();
        existing.lastVisit = formatManilaDate(endsAt);
      }
    }
    if (paymentStatus === "paid" && !terminalCancelled) {
      existing.lifetimeValue += bookingAmount(row);
    }
    if (!terminalCancelled && startsAt && startsAt.getTime() > now) {
      existing.upcomingBookings += 1;
      if (existing.nextBookingAt === null || startsAt.getTime() < existing.nextBookingAt) {
        existing.nextBookingAt = startsAt.getTime();
        existing.nextBooking = `${booking.date} · ${booking.time} · ${booking.court}`;
      }
    }
    existing.bookingHistory.push({
      bookingId: booking.bookingId,
      reference: booking.reference,
      date: booking.date,
      time: booking.time,
      court: booking.court,
      amount: booking.amount,
      status: booking.status,
      payment: booking.payment,
    });
    customers.set(key, existing);
    if (!identityConflict) {
      if (phone) phoneIndex.set(phone, existing);
      if (email) emailIndex.set(email, existing);
    }
  }

  return [...customers.values()]
    .sort((left, right) => {
      if (left.identityStatus !== right.identityStatus) {
        return left.identityStatus === "resolved" ? 1 : -1;
      }
      return left.name.localeCompare(right.name, "en-PH");
    })
    .map((customer) => ({
      id: customer.id,
      name: customer.name,
      initials: customer.initials,
      contact: customer.contact,
      visits: customer.totalBookings,
      totalBookings: customer.totalBookings,
      completedVisits: customer.completedVisits,
      upcomingBookings: customer.upcomingBookings,
      cancelledBookings: customer.cancelledBookings,
      lifetimeValue: customer.lifetimeValue,
      lastVisit: customer.lastVisit,
      note: customer.note,
      phone: customer.phone,
      email: customer.email,
      nextBooking: customer.nextBooking,
      identityStatus: customer.identityStatus,
      bookingHistory: customer.bookingHistory.sort((left, right) =>
        `${right.date} ${right.time}`.localeCompare(`${left.date} ${left.time}`, "en-PH")
      ),
    }));
}

export const formatPeso = (amount: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount);
