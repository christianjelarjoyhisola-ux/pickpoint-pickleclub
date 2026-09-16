"use client";

import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { activeTenant } from "../../tenants/registry";
import type {
  AvailabilityResponse,
  BookingCapabilities,
  BookingConfirmation,
  BookingConfirmationSession,
  BookingSessionInput,
  CreateBookingInput,
  PlatformErrorBody,
  PlatformMode,
  PublicPromotion,
  TenantBootstrap,
} from "./types";

const SHARED_SUPABASE_ORIGIN = "https://neqvrwtofiolcuxewdze.supabase.co";
// These are browser-public project coordinates, never privileged credentials.
// Keeping tenant-pinned fallbacks prevents a frontend-only rebuild from silently
// dropping into preview mode when the build shell omits its public environment.
const SHARED_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_UHMKYGsygjeMl79VRfPNVw_RyWiV5Yr";
const publicSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || SHARED_SUPABASE_ORIGIN;
const publicSupabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  SHARED_SUPABASE_PUBLISHABLE_KEY;

let browserClient: SupabaseClient | null = null;

export class PlatformRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PlatformRequestError";
  }
}

const BOOKING_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const WHOLE_HOUR_PATTERN = /^(?:[01]\d|2[0-3]):00$/;
const MAX_ATOMIC_BOOKING_HOURS = 18;

function bookingWallClockMilliseconds(
  bookingDate: string,
  startTime: string,
): number | null {
  if (
    !BOOKING_DATE_PATTERN.test(bookingDate) ||
    !WHOLE_HOUR_PATTERN.test(startTime)
  ) {
    return null;
  }
  const milliseconds = Date.parse(`${bookingDate}T${startTime}:00.000Z`);
  if (!Number.isFinite(milliseconds)) return null;
  const normalized = new Date(milliseconds).toISOString();
  return normalized.slice(0, 10) === bookingDate &&
      normalized.slice(11, 16) === startTime
    ? milliseconds
    : null;
}

function bookingSessionInputError(code: string, message: string): never {
  throw new PlatformRequestError(400, code, message);
}

/**
 * Produces the canonical set of requested court-hours without mutating input.
 * Exact or overlapping one-hour atoms are deduplicated, adjacent atoms on the
 * same court are merged, and the final sessions are ordered chronologically.
 */
export function normalizeBookingSessions(
  sessions: readonly BookingSessionInput[],
): BookingSessionInput[] {
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return bookingSessionInputError(
      "BOOKING_SESSIONS_REQUIRED",
      "Choose at least one court-hour before booking.",
    );
  }

  const atoms = new Map<string, { courtId: string; startsAt: number }>();
  for (const candidate of sessions) {
    const courtId = typeof candidate?.courtId === "string"
      ? candidate.courtId.trim()
      : "";
    const bookingDate = typeof candidate?.bookingDate === "string"
      ? candidate.bookingDate.trim()
      : "";
    const startTime = typeof candidate?.startTime === "string"
      ? candidate.startTime.trim()
      : "";
    const durationHours = candidate?.durationHours;
    const startsAt = bookingWallClockMilliseconds(bookingDate, startTime);
    if (
      !courtId || courtId.length > 128 || /[\u0000-\u001f]/.test(courtId) ||
      startsAt === null || !Number.isSafeInteger(durationHours) ||
      durationHours < 1 || durationHours > MAX_ATOMIC_BOOKING_HOURS
    ) {
      return bookingSessionInputError(
        "BOOKING_SESSION_INVALID",
        "Every booking session needs a valid court, date, whole-hour start, and duration.",
      );
    }

    for (let offset = 0; offset < durationHours; offset += 1) {
      const atomStartsAt = startsAt + offset * 60 * 60 * 1_000;
      const key = `${courtId}\u0000${atomStartsAt}`;
      if (!atoms.has(key)) atoms.set(key, { courtId, startsAt: atomStartsAt });
    }
    if (atoms.size > MAX_ATOMIC_BOOKING_HOURS) {
      return bookingSessionInputError(
        "BOOKING_SESSION_HOURS_EXCEEDED",
        `A booking can contain at most ${MAX_ATOMIC_BOOKING_HOURS} total court-hours.`,
      );
    }
  }

  const orderedAtoms = [...atoms.values()].sort(
    (left, right) =>
      left.courtId.localeCompare(right.courtId) || left.startsAt - right.startsAt,
  );
  const merged: Array<{ courtId: string; startsAt: number; durationHours: number }> = [];
  for (const atom of orderedAtoms) {
    const previous = merged.at(-1);
    if (
      previous?.courtId === atom.courtId &&
      previous.startsAt + previous.durationHours * 60 * 60 * 1_000 === atom.startsAt
    ) {
      previous.durationHours += 1;
    } else {
      merged.push({ ...atom, durationHours: 1 });
    }
  }

  return merged
    .sort(
      (left, right) =>
        left.startsAt - right.startsAt || left.courtId.localeCompare(right.courtId),
    )
    .map((session) => {
      const start = new Date(session.startsAt).toISOString();
      return {
        courtId: session.courtId,
        bookingDate: start.slice(0, 10),
        startTime: start.slice(11, 16),
        durationHours: session.durationHours,
      };
    });
}

function previewBookingSession(
  session: BookingSessionInput,
): BookingConfirmationSession {
  const startsAt = bookingWallClockMilliseconds(
    session.bookingDate,
    session.startTime,
  );
  if (startsAt === null) {
    return bookingSessionInputError(
      "BOOKING_SESSION_INVALID",
      "The preview booking session could not be prepared.",
    );
  }
  const offPeakEndHour = Number(activeTenant.booking.offPeakEndsAt.slice(0, 2));
  const subtotalAmount = Array.from(
    { length: session.durationHours },
    (_, offset) => new Date(startsAt + offset * 60 * 60 * 1_000).getUTCHours(),
  ).reduce(
    (total, hour) =>
      total + (hour < offPeakEndHour
        ? activeTenant.booking.offPeakHourlyRate
        : activeTenant.booking.peakHourlyRate),
    0,
  );
  const end = new Date(
    startsAt + session.durationHours * 60 * 60 * 1_000,
  ).toISOString();
  return {
    ...session,
    courtName:
      activeTenant.previewCourts.find((court) => court.id === session.courtId)?.name ||
      "PickPoint court",
    startsAt: `${session.bookingDate}T${session.startTime}:00+08:00`,
    endsAt: `${end.slice(0, 10)}T${end.slice(11, 16)}:00+08:00`,
    subtotalAmount,
  };
}

function jwtRole(value: string): string | null {
  const segments = value.split(".");
  if (segments.length !== 3 || !segments[1]) return null;
  try {
    const normalized = segments[1].replaceAll("-", "+").replaceAll("_", "/");
    const payload = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="))) as unknown;
    return payload && typeof payload === "object" && !Array.isArray(payload) &&
        typeof (payload as Record<string, unknown>).role === "string"
      ? (payload as Record<string, string>).role
      : null;
  } catch {
    return null;
  }
}

function validBrowserPlatformConfiguration(): boolean {
  let url: URL;
  try {
    url = new URL(publicSupabaseUrl);
  } catch {
    return false;
  }
  const publishableKey = /^sb_publishable_[A-Za-z0-9_-]+$/.test(publicSupabaseKey) ||
    jwtRole(publicSupabaseKey) === "anon";
  return Boolean(
    publishableKey && url.origin === SHARED_SUPABASE_ORIGIN &&
    url.protocol === "https:" && !url.username && !url.password &&
    (url.pathname === "/" || url.pathname === "") && !url.search && !url.hash,
  );
}

export function platformMode(): PlatformMode {
  return validBrowserPlatformConfiguration() ? "live" : "preview";
}

function currentHostname(): string {
  if (typeof window === "undefined") return "localhost";
  return window.location.hostname.toLowerCase();
}

function edgeUrl(functionName: string): string {
  return `${publicSupabaseUrl.replace(/\/$/, "")}/functions/v1/${functionName}?tenantSlug=${activeTenant.identity.slug}`;
}

function publicHeaders(accessToken?: string): HeadersInit {
  return {
    apikey: publicSupabaseKey,
    Authorization: `Bearer ${accessToken || publicSupabaseKey}`,
    "Content-Type": "application/json",
    "X-Tenant-Slug": activeTenant.identity.slug,
  };
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as PlatformErrorBody & T;
  if (!response.ok) {
    const nested = body.error;
    throw new PlatformRequestError(
      response.status,
      nested?.code || body.code || "PLATFORM_REQUEST_FAILED",
      nested?.message || body.message || "The platform request could not be completed.",
    );
  }
  return body as T;
}

async function rpc<T>(
  functionName: string,
  args: Record<string, unknown>,
  accessToken?: string,
) {
  const response = await fetch(
    `${publicSupabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/${functionName}`,
    {
      method: "POST",
      headers: publicHeaders(accessToken),
      body: JSON.stringify(args),
      cache: "no-store",
    },
  );
  return responseJson<T>(response);
}

const REGISTERED_MANAGEMENT_ORIGIN = "https://pickpoint-pickleclub.christianjelarjoyhisola.workers.dev";

function managementHostname(options: { mutation?: boolean } = {}): string {
  if (typeof window === "undefined") {
    throw new PlatformRequestError(
      403,
      "LIVE_TENANT_ORIGIN_MISMATCH",
      "Live tenant management requires the registered PickPoint origin.",
    );
  }
  const origin = window.location.origin.toLowerCase();
  if (options.mutation && origin !== REGISTERED_MANAGEMENT_ORIGIN) {
    throw new PlatformRequestError(
      403,
      "LIVE_TENANT_ORIGIN_MISMATCH",
      "Live changes are accepted only from the registered PickPoint origin.",
    );
  }
  return window.location.hostname.toLowerCase();
}

function previewBootstrap(): TenantBootstrap {
  const tenant = activeTenant;
  return {
    tenant: {
      slug: tenant.identity.slug,
      name: tenant.identity.name,
      timezone: tenant.identity.timezone,
      branding: { ...tenant.brand },
      publicConfig: {
        publicBookingEnabled: false,
        provisional: true,
        tagline: tenant.brand.tagline,
      },
    },
    courts: tenant.previewCourts.map((court) => ({
      ...court,
      opensAt: tenant.venue.opensAt,
      closesAt: tenant.venue.closesAt,
      currency: tenant.identity.currency,
      pricingConfig: {
        regular: {
          minimumHours: tenant.booking.minimumHours,
          maximumHours: tenant.booking.maximumHours,
          bands: [
            {
              start: tenant.venue.opensAt,
              end: tenant.booking.offPeakEndsAt,
              hourlyRate: tenant.booking.offPeakHourlyRate,
            },
            {
              start: tenant.booking.offPeakEndsAt,
              end: tenant.venue.closesAt,
              hourlyRate: tenant.booking.peakHourlyRate,
            },
          ],
        },
      },
      publicConfig: {
        minimumLeadMinutes: tenant.booking.minimumLeadMinutes,
        maximumAdvanceDays: tenant.booking.maximumAdvanceDays,
      },
    })),
    paymentMethods: [],
    settings: {},
    readiness: {
      publicBookingEnabled: false,
      setupActive: false,
      domainConfigured: false,
      courtPricingConfigured: false,
      billingConfigured: false,
      paymentConfigured: false,
      remittanceConfigured: false,
      emailConfigured: false,
      blockingReasons: [
        "TENANT_SETUP_REQUIRED",
        "ACTIVE_DOMAIN_MISSING",
        "PAYMENT_METHOD_MISSING",
      ],
    },
    refundReschedulePolicy: null,
  };
}

export async function getTenantBootstrap(): Promise<TenantBootstrap> {
  if (platformMode() === "preview") return previewBootstrap();
  const [result, promotions, pickPointPolicy] = await Promise.all([
    rpc<TenantBootstrap | null>("get_public_tenant_bootstrap", {
      p_tenant_slug: activeTenant.identity.slug,
      p_hostname: currentHostname(),
    }),
    rpc<PublicPromotion[]>("get_public_active_promotions", {
      p_tenant_slug: activeTenant.identity.slug,
      p_hostname: currentHostname(),
    }).catch((error) => {
      if (error instanceof PlatformRequestError && error.code === "PGRST202") return [];
      throw error;
    }),
    rpc<{
      publishedPolicy: Record<string, unknown>;
      capabilities?: BookingCapabilities;
    } | null>("get_pickpoint_public_booking_policy", {
      p_tenant_slug: activeTenant.identity.slug,
      p_hostname: currentHostname(),
    }),
  ]);
  if (!result) {
    throw new PlatformRequestError(
      404,
      "TENANT_ORIGIN_NOT_REGISTERED",
      "This PickPoint hostname is not registered with the booking platform.",
    );
  }
  return {
    ...result,
    promotions,
    refundReschedulePolicy: pickPointPolicy,
    capabilities: {
      ...result.capabilities,
      ...pickPointPolicy?.capabilities,
    },
  };
}

export async function getAvailability(date: string): Promise<AvailabilityResponse> {
  if (platformMode() === "preview") {
    return {
      date,
      timezone: activeTenant.identity.timezone,
      courts: activeTenant.previewCourts.map((court, index) => ({
        id: court.id,
        slug: court.slug,
        name: court.name,
        unavailable: index === 0
          ? [
              { startsAt: `${date}T09:00:00`, endsAt: `${date}T10:00:00` },
              { startsAt: `${date}T18:00:00`, endsAt: `${date}T20:00:00` },
            ]
          : [{ startsAt: `${date}T16:00:00`, endsAt: `${date}T17:00:00` }],
      })),
    };
  }
  const result = await rpc<AvailabilityResponse | null>("get_pickpoint_public_availability", {
    p_tenant_slug: activeTenant.identity.slug,
    p_hostname: currentHostname(),
    p_date: date,
  });
  if (!result) {
    throw new PlatformRequestError(404, "AVAILABILITY_NOT_FOUND", "Availability is unavailable.");
  }
  return result;
}

export async function createBooking(
  input: CreateBookingInput,
): Promise<BookingConfirmation> {
  const clientRequestId = input.clientRequestId || crypto.randomUUID();
  const sessionsSupplied = input.sessions !== undefined;
  const normalizedSessions = normalizeBookingSessions(
    sessionsSupplied
      ? input.sessions
      : [{
          courtId: input.courtId,
          bookingDate: input.bookingDate,
          startTime: input.startTime,
          durationHours: input.durationHours,
        }],
  );
  const primarySession = normalizedSessions[0];
  if (platformMode() === "preview") {
    await new Promise((resolve) => setTimeout(resolve, 450));
    const sessions = normalizedSessions.map(previewBookingSession);
    const primary = sessions[0];
    const subtotal = sessions.reduce(
      (total, session) => total + session.subtotalAmount,
      0,
    );
    return {
      reference: `PICK-${clientRequestId.slice(0, 8).toUpperCase()}`,
      status: "preview_only",
      expiresAt: null,
      courtName: primary.courtName,
      bookingType: input.bookingType || "regular",
      startsAt: primary.startsAt,
      endsAt: primary.endsAt,
      subtotalAmount: subtotal,
      serviceFeeAmount: 0,
      totalAmount: subtotal,
      currency: activeTenant.identity.currency,
      fullPaymentOnly: true,
      bookingToken: clientRequestId,
      sessions,
      preview: true,
    };
  }
  const response = await fetch(edgeUrl("create-booking"), {
    method: "POST",
    headers: publicHeaders(),
    body: JSON.stringify({
      tenantSlug: activeTenant.identity.slug,
      ...(sessionsSupplied
        ? { sessions: normalizedSessions }
        : {
            courtId: primarySession.courtId,
            bookingDate: primarySession.bookingDate,
            startTime: primarySession.startTime,
            durationHours: primarySession.durationHours,
          }),
      bookingType: input.bookingType || "regular",
      customer: input.customer,
      guestCount: input.guestCount || 1,
      equipmentRental: input.equipmentRental || { extraPaddles: 0, balls: 0 },
      notes: input.notes || null,
      clientRequestId,
      policyAccepted: input.policyAccepted === true,
      policyVersion: input.policyVersion || null,
    }),
  });
  const result = await responseJson<{ ok: true; booking: BookingConfirmation }>(response);
  return result.booking;
}

export async function bookingStatus(reference: string, token: string) {
  if (platformMode() === "preview") {
    return { ok: true, booking: { reference, status: "preview_only", paymentStatus: "unpaid" } };
  }
  const response = await fetch(edgeUrl("booking-status"), {
    method: "POST",
    headers: publicHeaders(),
    body: JSON.stringify({
      tenantSlug: activeTenant.identity.slug,
      bookingReference: reference,
      bookingToken: token,
    }),
  });
  return responseJson<Record<string, unknown>>(response);
}

export async function cancelUnpaidBooking(reference: string, token: string) {
  if (platformMode() === "preview") {
    return { ok: true, booking: { reference, status: "cancelled", preview: true } };
  }
  const response = await fetch(edgeUrl("cancel-booking"), {
    method: "POST",
    headers: publicHeaders(),
    body: JSON.stringify({
      tenantSlug: activeTenant.identity.slug,
      bookingReference: reference,
      bookingToken: token,
    }),
  });
  return responseJson<Record<string, unknown>>(response);
}

export async function completeBookingDetails(options: {
  reference: string;
  token: string;
  customer: { name: string; email: string; phone: string };
}) {
  if (platformMode() === "preview") {
    return {
      reference: options.reference,
      status: "preview_only",
      expiresAt: null,
      detailsComplete: true,
    };
  }
  return rpc<{
    reference: string;
    status: string;
    expiresAt?: string | null;
    detailsComplete: true;
  }>("complete_public_booking_details", {
    p_tenant_slug: activeTenant.identity.slug,
    p_hostname: currentHostname(),
    p_booking_reference: options.reference,
    p_booking_token: options.token,
    p_customer_name: options.customer.name,
    p_customer_email: options.customer.email,
    p_customer_phone: options.customer.phone,
  });
}

export async function submitPaymentReceipt(options: {
  reference: string;
  token: string;
  method: string;
  paymentReference: string;
  file: File;
}): Promise<PaymentReceiptSubmission> {
  if (platformMode() === "preview") {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return {
      ok: true,
      status: "manual_review",
      publicReason: "Receipt received for review.",
      booking: { status: "payment_review", paymentStatus: "pending" },
      preview: true,
    };
  }
  const form = new FormData();
  form.append("receiptFile", options.file);
  const response = await fetch(edgeUrl("submit-payment-receipt"), {
    method: "POST",
    headers: {
      apikey: publicSupabaseKey,
      Authorization: `Bearer ${publicSupabaseKey}`,
      "X-Tenant-Slug": activeTenant.identity.slug,
      "X-Booking-Reference": options.reference,
      "X-Booking-Token": options.token,
      "X-Payment-Method": options.method,
      "X-Payment-Reference": options.paymentReference,
    },
    body: form,
  });
  return responseJson<PaymentReceiptSubmission>(response);
}

export type PaymentReceiptSubmission = {
  ok: true;
  status: "auto_approved" | "manual_review" | "approved";
  publicReason?: string;
  booking: { status: string; paymentStatus: string };
  confirmationEmail?: "disabled" | "sent" | "failed";
  preview?: true;
};

export function getSupabaseBrowserClient(): SupabaseClient {
  if (platformMode() !== "live") {
    throw new PlatformRequestError(
      503,
      "LIVE_CONFIGURATION_REQUIRED",
      "Connect the shared platform before signing in.",
    );
  }
  browserClient ??= createClient(publicSupabaseUrl, publicSupabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    global: { headers: { "X-Tenant-Slug": activeTenant.identity.slug } },
  });
  return browserClient;
}

export async function signInOwner(email: string, password: string): Promise<Session> {
  const { data, error } = await getSupabaseBrowserClient().auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) {
    throw new PlatformRequestError(401, "SIGN_IN_FAILED", "Email or password was not accepted.");
  }
  return data.session;
}

export async function currentOwnerSession(): Promise<Session | null> {
  if (platformMode() !== "live") return null;
  const { data } = await getSupabaseBrowserClient().auth.getSession();
  return data.session;
}

export async function signOutOwner(): Promise<void> {
  if (platformMode() !== "live") return;
  await getSupabaseBrowserClient().auth.signOut();
}

async function authenticatedFunction<T>(
  functionName: string,
  accessToken: string,
  body: Record<string, unknown>,
) {
  const response = await fetch(edgeUrl(functionName), {
    method: "POST",
    headers: publicHeaders(accessToken),
    body: JSON.stringify({ ...body, tenantSlug: activeTenant.identity.slug }),
  });
  return responseJson<T>(response);
}

export async function listManagerBookings(
  accessToken: string,
  filters: Record<string, unknown> = {},
) {
  return authenticatedFunction<{ ok: true; bookings: Array<Record<string, unknown>> }>(
    "tenant-manager-data",
    accessToken,
    { action: "list-bookings", filters },
  );
}

export async function listManagerBlocks(
  accessToken: string,
  filters: Record<string, unknown> = {},
) {
  return authenticatedFunction<{ ok: true; blockedDates: Array<Record<string, unknown>> }>(
    "tenant-manager-data",
    accessToken,
    { action: "list-blocked-dates", filters },
  );
}

export type PaymentQrAsset = {
  url: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
};

export type PaymentQrMutation = {
  asset: PaymentQrAsset | null;
  tenantRevision: string;
  cleanupPending: boolean;
};

export type CourtPhotoAsset = {
  url: string;
  storagePath: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
};

export async function uploadTenantCourtPhoto(
  accessToken: string,
  courtId: string,
  file: File,
): Promise<CourtPhotoAsset> {
  managementHostname({ mutation: true });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(courtId)) {
    throw new PlatformRequestError(400, "COURT_ID_INVALID", "Choose a valid PickPoint court.");
  }
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size < 1 || file.size > 2 * 1024 * 1024
  ) {
    throw new PlatformRequestError(400, "COURT_PHOTO_FILE_INVALID", "Choose a JPG, PNG, or WebP court photo no larger than 2 MB.");
  }

  const bootstrap = await getTenantBootstrap();
  const tenantId = bootstrap.tenant.id?.trim() ?? "";
  const court = bootstrap.courts.find((item) => item.id === courtId);
  if (!/^[0-9a-f-]{36}$/i.test(tenantId) || !court) {
    throw new PlatformRequestError(403, "COURT_PHOTO_SCOPE_INVALID", "This court does not belong to PickPoint.");
  }
  const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
  const storagePath = `${tenantId}/courts/${courtId}/${crypto.randomUUID()}.${extension}`;
  const previousStoragePath = typeof court.publicConfig?.photoStoragePath === "string" &&
      court.publicConfig.photoStoragePath.startsWith(`${tenantId}/courts/${courtId}/`)
    ? court.publicConfig.photoStoragePath
    : null;
  const response = await fetch(`${SHARED_SUPABASE_ORIGIN}/storage/v1/object/tenant-public-assets/${storagePath}`, {
    method: "POST",
    headers: {
      apikey: publicSupabaseKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": file.type,
      "Cache-Control": "public, max-age=31536000, immutable",
      "x-upsert": "false",
    },
    body: file,
  });
  if (!response.ok) {
    throw new PlatformRequestError(response.status, "COURT_PHOTO_UPLOAD_FAILED", "The court photo could not be uploaded.");
  }
  const url = `${SHARED_SUPABASE_ORIGIN}/storage/v1/object/public/tenant-public-assets/${storagePath}`;
  try {
    await manageTenantCourt(accessToken, {
      action: "save",
      courtId,
      patch: {
        publicConfig: {
          ...(court.publicConfig ?? {}),
          photoUrl: url,
          photoStoragePath: storagePath,
        },
      },
    });
  } catch (error) {
    await fetch(`${SHARED_SUPABASE_ORIGIN}/storage/v1/object/tenant-public-assets`, {
      method: "DELETE",
      headers: { apikey: publicSupabaseKey, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: [storagePath] }),
    }).catch(() => undefined);
    throw error;
  }
  if (previousStoragePath && previousStoragePath !== storagePath) {
    await fetch(`${SHARED_SUPABASE_ORIGIN}/storage/v1/object/tenant-public-assets`, {
      method: "DELETE",
      headers: { apikey: publicSupabaseKey, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: [previousStoragePath] }),
    }).catch(() => undefined);
  }
  return { url, storagePath, contentType: file.type as CourtPhotoAsset["contentType"] };
}

const PAYMENT_QR_METHODS = new Set(["gcash", "maya", "bdo", "bpi", "gotyme", "pnb"]);

export async function uploadTenantPaymentQr(
  accessToken: string,
  methodCode: string,
  file: File,
): Promise<PaymentQrMutation> {
  managementHostname({ mutation: true });
  const normalizedMethod = methodCode.trim().toLowerCase();
  if (!PAYMENT_QR_METHODS.has(normalizedMethod)) {
    throw new PlatformRequestError(
      400,
      "PAYMENT_METHOD_CODE_INVALID",
      "Enter a valid payment method code before uploading its QR image.",
    );
  }
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size < 1 || file.size > 2 * 1024 * 1024
  ) {
    throw new PlatformRequestError(
      400,
      "PAYMENT_QR_FILE_INVALID",
      "Choose a JPG, PNG, or WebP QR image no larger than 2 MB.",
    );
  }

  const form = new FormData();
  form.append("qrFile", file);
  const response = await fetch(edgeUrl("tenant-payment-asset"), {
    method: "POST",
    headers: {
      apikey: publicSupabaseKey,
      Authorization: `Bearer ${accessToken}`,
      "X-Tenant-Slug": activeTenant.identity.slug,
      "X-Asset-Action": "upload",
      "X-Payment-Method": normalizedMethod,
    },
    body: form,
  });
  const result = await responseJson<{
    ok: true;
    asset: PaymentQrAsset;
    tenantRevision: string;
    cleanupPending?: boolean;
  }>(response);
  return {
    asset: result.asset,
    tenantRevision: result.tenantRevision,
    cleanupPending: result.cleanupPending === true,
  };
}

export async function deleteTenantPaymentQr(
  accessToken: string,
  methodCode: string,
): Promise<PaymentQrMutation> {
  managementHostname({ mutation: true });
  const normalizedMethod = methodCode.trim().toLowerCase();
  if (!PAYMENT_QR_METHODS.has(normalizedMethod)) {
    throw new PlatformRequestError(
      400,
      "PAYMENT_METHOD_CODE_INVALID",
      "Choose a supported saved payment method before removing its QR image.",
    );
  }
  const response = await fetch(edgeUrl("tenant-payment-asset"), {
    method: "POST",
    headers: {
      apikey: publicSupabaseKey,
      Authorization: `Bearer ${accessToken}`,
      "X-Tenant-Slug": activeTenant.identity.slug,
      "X-Asset-Action": "delete",
      "X-Payment-Method": normalizedMethod,
    },
  });
  const result = await responseJson<{
    ok: true;
    asset: null;
    tenantRevision: string;
    cleanupPending?: boolean;
  }>(response);
  return {
    asset: null,
    tenantRevision: result.tenantRevision,
    cleanupPending: result.cleanupPending === true,
  };
}

export type ReceiptView = {
  signedUrl: string;
  expiresIn: number;
  receipt: { verificationId: string; status: string };
};

export async function getPaymentReceiptView(
  accessToken: string,
  verificationId: string,
): Promise<ReceiptView> {
  managementHostname();
  return authenticatedFunction<ReceiptView>(
    "get-receipt-view-url",
    accessToken,
    { verificationId },
  );
}

export async function reviewPaymentReceipt(
  accessToken: string,
  input: {
    verificationId: string;
    decision: "approve" | "reject";
    note?: string | null;
  },
) {
  managementHostname({ mutation: true });
  return authenticatedFunction<Record<string, unknown>>(
    "review-payment-receipt",
    accessToken,
    input,
  );
}

export type ManualBookingInput = {
  courtId: string;
  bookingDate: string;
  startTime: string;
  durationHours: number;
  customer: { name: string; email?: string; phone: string };
  payment: { method: string; reference?: string | null };
  clientRequestId: string;
};

export async function createManualBooking(
  accessToken: string,
  input: ManualBookingInput,
) {
  managementHostname({ mutation: true });
  return authenticatedFunction<Record<string, unknown>>(
    "create-manual-booking",
    accessToken,
    input,
  );
}

export type BookingReschedulePreview = {
  ok: true;
  booking: {
    id: string;
    reference: string;
    courtId: string;
    courtName: string;
    startsAt: string;
    endsAt: string;
    localBookingDate: string;
    durationHours: number;
    status: string;
    paymentStatus: string;
    customerName: string;
    customerEmail: string | null;
    subtotalAmount: number;
    serviceFeeAmount: number;
    totalAmount: number;
    currency: string;
  };
  options: Array<{
    startsAt: string;
    endsAt: string;
    startTime: string;
    endTime: string;
    label: string;
    available: boolean;
    unavailableReason: string | null;
    courtSubtotalAmount: number;
    newSubtotalAmount: number;
    newTotalAmount: number;
    originalTotalAmount: number;
    amountPaid: number;
    additionalAmount: number;
    paymentRequired: boolean;
  }>;
  policies: {
    sameCourtOnly: true;
    sameDurationOnly: true;
    amountPolicy: "preserve_original";
    reasonCodes: Array<{ value: string; label: string }>;
    notificationDefault: true;
    notificationAvailable: boolean;
  };
};

export async function previewBookingReschedule(
  accessToken: string,
  bookingReference: string,
  bookingDate: string,
) {
  return authenticatedFunction<BookingReschedulePreview>(
    "reschedule-booking",
    accessToken,
    { action: "preview", bookingReference, bookingDate },
  );
}

export async function rescheduleBooking(
  accessToken: string,
  input: {
    bookingReference: string;
    newDate: string;
    newStartTime: string;
    reasonCode: string;
    publicReason: string;
    internalNote?: string | null;
    notifyCustomer: boolean;
    idempotencyKey: string;
  },
) {
  managementHostname({ mutation: true });
  return authenticatedFunction<Record<string, unknown>>(
    "reschedule-booking",
    accessToken,
    { action: "reschedule", ...input },
  );
}

export async function cancelTenantBooking(
  accessToken: string,
  bookingId: string,
  reason: string,
) {
  managementHostname({ mutation: true });
  return rpc<Record<string, unknown>>(
    "cancel_tenant_booking",
    { p_booking_id: bookingId, p_reason: reason },
    accessToken,
  );
}

export async function checkInTenantBooking(
  accessToken: string,
  bookingId: string,
) {
  return rpc<Record<string, unknown>>(
    "check_in_tenant_booking",
    {
      p_tenant_slug: activeTenant.identity.slug,
      p_hostname: managementHostname({ mutation: true }),
      p_booking_id: bookingId,
    },
    accessToken,
  );
}

export async function getActivationSettings(accessToken: string) {
  return authenticatedFunction<Record<string, unknown>>(
    "tenant-activation-settings",
    accessToken,
    { action: "get" },
  );
}

export async function updateActivationSettings(
  accessToken: string,
  patch: Record<string, unknown>,
) {
  managementHostname({ mutation: true });
  return authenticatedFunction<Record<string, unknown>>(
    "tenant-activation-settings",
    accessToken,
    { action: "update", patch },
  );
}

export type TenantPolicyDraft = {
  title: string;
  intro: string;
  content: string;
};

export async function getTenantPolicy(accessToken: string) {
  return authenticatedFunction<Record<string, unknown>>(
    "tenant-activation-settings",
    accessToken,
    { action: "getPolicy" },
  );
}

export async function saveTenantPolicy(
  accessToken: string,
  options: {
    publish: boolean;
    expectedRevision: string | null;
    policy: TenantPolicyDraft;
  },
) {
  managementHostname({ mutation: true });
  try {
    return await authenticatedFunction<Record<string, unknown>>(
      "tenant-activation-settings",
      accessToken,
      {
        action: options.publish ? "publishPolicy" : "updatePolicy",
        expectedRevision: options.expectedRevision,
        policy: options.policy,
      },
    );
  } catch (error) {
    if (
      error instanceof PlatformRequestError &&
      (error.code === "POLICY_REVISION_STALE" || error.status === 409)
    ) {
      throw new PlatformRequestError(
        409,
        "POLICY_STALE_REFRESH_REQUIRED",
        "These rules changed in another session. Refresh before saving or publishing.",
      );
    }
    throw error;
  }
}

export async function getRemittanceDestination(accessToken: string) {
  return authenticatedFunction<Record<string, unknown>>(
    "tenant-remittance-asset",
    accessToken,
    { action: "get-destination" },
  );
}

export async function saveRemittanceDestination(
  accessToken: string,
  input: {
    method: string;
    accountName: string;
    accountReference: string;
    dueDay: number;
    instructions?: string | null;
    qrDataUrl?: string | null;
    removeQr?: boolean;
  },
) {
  managementHostname({ mutation: true });
  return authenticatedFunction<Record<string, unknown>>(
    "tenant-remittance-asset",
    accessToken,
    { action: "save-destination", ...input },
  );
}

export async function getManagerSession(accessToken: string) {
  return rpc<Record<string, unknown> | null>(
    "get_my_tenant_session",
    {
      p_tenant_slug: activeTenant.identity.slug,
      p_hostname: managementHostname(),
    },
    accessToken,
  );
}

export async function getManagerRegularBookingReport(
  accessToken: string,
  input: {
    dateFrom: string;
    dateTo: string;
    courtId?: string | null;
  },
): Promise<unknown> {
  return rpc<unknown>(
    "get_manager_regular_booking_report",
    {
      p_tenant_slug: activeTenant.identity.slug,
      p_hostname: managementHostname(),
      p_date_from: input.dateFrom,
      p_date_to: input.dateTo,
      p_court_id: input.courtId || null,
    },
    accessToken,
  );
}

export async function getManagerReportingBounds(accessToken: string): Promise<unknown> {
  return rpc<unknown>(
    "get_manager_regular_booking_reporting_bounds",
    {
      p_tenant_slug: activeTenant.identity.slug,
      p_hostname: managementHostname(),
    },
    accessToken,
  );
}

export async function getManagerPromotions(accessToken: string): Promise<unknown> {
  return rpc<unknown>(
    "get_manager_promotions",
    {
      p_tenant_slug: activeTenant.identity.slug,
      p_hostname: managementHostname(),
    },
    accessToken,
  );
}

export async function createTenantPromotion(
  accessToken: string,
  input: {
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
  },
): Promise<unknown> {
  return rpc<unknown>(
    "create_tenant_promotion",
    {
      p_tenant_slug: activeTenant.identity.slug,
      p_hostname: managementHostname({ mutation: true }),
      p_name: input.name,
      p_discount_type: input.discountType,
      p_discount_value: input.discountValue,
      p_weekdays: input.weekdays,
      p_starts_at: input.startsAt,
      p_ends_at: input.endsAt,
      p_valid_from: input.validFrom,
      p_valid_until: input.validUntil,
      p_court_ids: input.courtIds,
      p_max_redemptions: input.maxRedemptions ?? null,
    },
    accessToken,
  );
}

export async function getBookingFeeRemittanceDashboard(
  accessToken: string,
): Promise<unknown> {
  return rpc<unknown>(
    "get_booking_fee_remittance_dashboard",
    {
      p_tenant_slug: activeTenant.identity.slug,
      p_hostname: managementHostname(),
    },
    accessToken,
  );
}

export async function getBookingFeeRemittanceHistory(
  accessToken: string,
  options: { limit?: number; before?: string | null } = {},
): Promise<unknown> {
  return rpc<unknown>(
    "get_booking_fee_remittance_history",
    {
      p_tenant_slug: activeTenant.identity.slug,
      p_hostname: managementHostname(),
      p_limit: options.limit ?? 50,
      p_before: options.before || null,
    },
    accessToken,
  );
}

export async function getManagerCourts(accessToken: string) {
  return rpc<Array<Record<string, unknown>>>(
    "get_tenant_courts_for_manager",
    {
      p_tenant_slug: activeTenant.identity.slug,
      p_hostname: managementHostname(),
    },
    accessToken,
  );
}

export async function getBlockedDateAccess(accessToken: string) {
  return rpc<Record<string, unknown>>(
    "get_blocked_date_access",
    { p_tenant_slug: activeTenant.identity.slug },
    accessToken,
  );
}

export async function manageTenantCourt(
  accessToken: string,
  options: {
    action: "save" | "delete";
    courtId?: string | null;
    patch?: Record<string, unknown>;
  },
) {
  return rpc<Record<string, unknown>>(
    "manage_tenant_court",
    {
      p_tenant_slug: activeTenant.identity.slug,
      p_hostname: managementHostname({ mutation: true }),
      p_action: options.action,
      p_court_id: options.courtId ?? null,
      p_patch: options.patch ?? {},
    },
    accessToken,
  );
}

export async function applySharedCourtSchedule(
  accessToken: string,
  schedule: {
    opensAt: string;
    closesAt: string;
    bands: Array<{ start: string; end: string; hourlyRate: number }>;
  },
) {
  return rpc<Record<string, unknown>>(
    "apply_shared_tenant_court_schedule",
    {
      p_tenant_slug: activeTenant.identity.slug,
      p_hostname: managementHostname({ mutation: true }),
      p_opens_at: schedule.opensAt,
      p_closes_at: schedule.closesAt,
      p_bands: schedule.bands,
    },
    accessToken,
  );
}

export async function manageBlockedDates(
  accessToken: string,
  options: {
    action: "create" | "delete";
    blockId?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    courtId?: string | null;
    startsAt?: string | null;
    endsAt?: string | null;
    publicLabel?: "Reserved" | "Private Event" | "Maintenance" | "Closed";
    internalReason?: string | null;
  },
) {
  managementHostname({ mutation: true });
  return rpc<Record<string, unknown>>(
    "manage_blocked_dates",
    {
      p_tenant_slug: activeTenant.identity.slug,
      p_action: options.action,
      p_block_id: options.blockId ?? null,
      p_start_date: options.startDate ?? null,
      p_end_date: options.endDate ?? null,
      p_court_id: options.courtId ?? null,
      p_starts_at: options.startsAt ?? null,
      p_ends_at: options.endsAt ?? null,
      p_public_label: options.publicLabel ?? "Reserved",
      p_internal_reason: options.internalReason ?? null,
    },
    accessToken,
  );
}

export async function updateBusinessSettings(
  accessToken: string,
  expectedRevision: string,
  patch: Record<string, unknown>,
) {
  try {
    return await rpc<Record<string, unknown>>(
      "update_tenant_business_settings_if_current",
      {
        p_tenant_slug: activeTenant.identity.slug,
        p_hostname: managementHostname({ mutation: true }),
        p_expected_revision: expectedRevision,
        p_patch: patch,
      },
      accessToken,
    );
  } catch (error) {
    if (
      error instanceof PlatformRequestError &&
      (error.code === "40001" || error.message.includes("BUSINESS_SETTINGS_STALE"))
    ) {
      throw new PlatformRequestError(
        409,
        "SETTINGS_STALE_REFRESH_REQUIRED",
        "Business or payment settings changed in another session. Refresh before saving again.",
      );
    }
    throw error;
  }
}

export async function activateTenantInitially(accessToken: string) {
  return rpc<Record<string, unknown>>(
    "activate_tenant_initially",
    {
      p_tenant_slug: activeTenant.identity.slug,
      p_hostname: managementHostname({ mutation: true }),
    },
    accessToken,
  );
}
