export type PlatformMode = "preview" | "live";

export type Money = {
  amount: number;
  currency: string;
};

export type PublicCourt = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  opensAt: string;
  closesAt: string;
  currency: string;
  pricingConfig?: Record<string, unknown>;
  publicConfig?: Record<string, unknown>;
};

export type PaymentMethod = {
  code?: string;
  methodCode?: string;
  displayName: string;
  accountName?: string;
  accountReference?: string;
  accountNumber?: string;
  instructions?: string;
  qrImageUrl?: string;
  qrUrl?: string;
};

export type BookingReadiness = {
  requestedPublicBookingEnabled?: boolean;
  publicBookingEnabled: boolean;
  setupActive?: boolean;
  domainConfigured?: boolean;
  courtPricingConfigured?: boolean;
  billingConfigured?: boolean;
  paymentConfigured?: boolean;
  remittanceConfigured?: boolean;
  emailConfigured?: boolean;
  blockingReasons: string[];
};

export type BookingCapabilities = {
  /** Enable only when the server explicitly returns true. */
  atomicMultiSessionBookingV1?: boolean;
};

export type PublicPromotion = {
  id: string;
  name: string;
  discountType: "percentage" | "fixed_amount";
  discountValue: number;
  weekdays: number[];
  startsAt: string;
  endsAt: string;
  validFrom: string;
  validUntil: string;
  courtIds: string[];
};

export type TenantBootstrap = {
  tenant: {
    slug: string;
    name: string;
    timezone: string;
    branding: Record<string, unknown>;
    publicConfig: Record<string, unknown>;
    contact?: { email?: string; phone?: string };
  };
  business?: Record<string, unknown>;
  domain?: string;
  courts: PublicCourt[];
  paymentMethods: PaymentMethod[];
  capabilities?: BookingCapabilities;
  settings?: Record<string, unknown>;
  readiness: BookingReadiness;
  bookingFee?: { feeMode?: string; feeAmount?: number };
  refundReschedulePolicy?: Record<string, unknown> | null;
  promotions?: PublicPromotion[];
};

export type AvailabilityCourt = {
  id: string;
  slug?: string;
  name: string;
  unavailable: Array<{ startsAt: string; endsAt: string; label?: string }>;
};

export type AvailabilityResponse = {
  date: string;
  timezone: string;
  courts: AvailabilityCourt[];
  blockedDates?: Array<Record<string, unknown>>;
};

export type BookingSessionInput = {
  courtId: string;
  bookingDate: string;
  startTime: string;
  durationHours: number;
};

type CreateBookingCommonInput = {
  bookingType?: "regular" | "event";
  customer: { name: string; email: string; phone: string };
  guestCount?: number;
  equipmentRental?: { extraPaddles: number; balls: number };
  notes?: string | null;
  policyAccepted?: boolean;
  policyVersion?: string | null;
  clientRequestId?: string;
};

/**
 * `sessions` is authoritative when present. The optional singular fields on
 * that branch are accepted only so an existing caller can add `sessions`
 * before removing its legacy primary-session projection.
 */
export type CreateBookingInput = CreateBookingCommonInput & (
  | (BookingSessionInput & { sessions?: undefined })
  | {
      sessions: readonly BookingSessionInput[];
      courtId?: string;
      bookingDate?: string;
      startTime?: string;
      durationHours?: number;
    }
);

export type BookingConfirmationSession = BookingSessionInput & {
  courtName: string;
  startsAt: string;
  endsAt: string;
  subtotalAmount: number;
};

export type BookingConfirmation = {
  reference: string;
  status: string;
  expiresAt?: string | null;
  courtName: string;
  bookingType: string;
  startsAt: string;
  endsAt: string;
  subtotalAmount: number;
  serviceFeeAmount: number;
  totalAmount: number;
  currency: string;
  fullPaymentOnly: boolean;
  bookingToken: string;
  /** Present for atomic-group-aware responses; omitted by legacy servers. */
  sessions?: BookingConfirmationSession[];
  preview?: boolean;
};

export type PlatformErrorBody = {
  code?: string;
  message?: string;
  error?: { code?: string; message?: string };
};
