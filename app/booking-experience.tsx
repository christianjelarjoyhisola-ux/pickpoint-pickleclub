"use client";

import Image from "next/image";
import {
  CalendarDays,
  Check,
  Clock3,
  Grid2X2,
  Share2,
  TriangleAlert,
  WalletCards,
} from "lucide-react";
import {
  CSSProperties,
  FormEvent,
  Fragment,
  useEffect,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { TransitionLink as Link } from "./transition-link";
import { activeTenant } from "./tenants/registry";
import {
  formatClockLabel,
  logicalBandForHour,
  logicalCloseHour,
  nextIsoDate,
  parseClockHour,
} from "./lib/operating-hours";
import {
  bookingStatus,
  cancelUnpaidBooking,
  completeBookingDetails as completePlatformBookingDetails,
  createBooking as createPlatformBooking,
  getAvailability as getPlatformAvailability,
  getTenantBootstrap,
  platformMode,
  submitPaymentReceipt,
} from "./lib/platform/client";
import type {
  BookingConfirmation,
  BookingSessionInput,
  PaymentMethod,
  PublicCourt,
  PublicPromotion,
  TenantBootstrap,
} from "./lib/platform/types";

type Court = {
  id: string;
  slug: string;
  number: string;
  name: string;
  descriptor: string;
  mood: string;
  color: "blue" | "coral";
};

type GalleryPhoto = {
  id: string;
  src: string;
  alt: string;
  caption: string;
};

type SlotStatus = "available" | "limited" | "unavailable";

export type AvailabilitySlot = {
  hour: number;
  startsAt: string;
  endsAt: string;
  price: number;
  originalPrice?: number;
  promotionId?: string;
  promotionName?: string;
  status: SlotStatus;
};

export type CourtSchedule = {
  courtId: string;
  slots: AvailabilitySlot[];
};

export type BookingSelection = {
  courtId: string;
  startHour: number;
  durationHours: 1;
  amount: number;
};

type SelectionDetail = {
  selection: BookingSelection;
  court: Court;
  slot: AvailabilitySlot;
};

export type AvailabilityRequest = {
  tenantSlug: "pickpoint-pickleclub";
  date: string;
};

export type CustomerDetails = {
  fullName: string;
  email: string;
  phone: string;
  updates: boolean;
};

export type BookingRecord = {
  reference: string;
  status: "pending_payment" | "payment_review" | "confirmed" | "cancelled";
  expiresAt?: string | null;
  date: string;
  courtId: string;
  startHour: number;
  durationHours: number;
  amount: number;
  subtotalAmount?: number;
  serviceFeeAmount?: number;
  items?: BookingSelection[];
  customer: CustomerDetails;
  detailsComplete?: boolean;
  paymentReviewState?: "auto_approved" | "manual_review" | "pending" | "short_payment" | "rejected";
};

export type BookingHoldRequest = {
  tenantSlug: "pickpoint-pickleclub";
  date: string;
  courtId: string;
  startHour: number;
  durationHours: number;
  amount: number;
  items: BookingSelection[];
  customer: CustomerDetails;
  policyAccepted: boolean;
  policyVersion: string | null;
  clientRequestId: string;
  atomicMultiSessionBooking?: boolean;
  detailsPending?: boolean;
};

export type BookingDetailsRequest = {
  booking: BookingRecord;
  customer: CustomerDetails;
};

export type BookingPaymentRequest = {
  booking: BookingRecord;
  paymentReference: string;
  receiptFileName: string;
  receiptFile: File;
  paymentMethod: string;
  clientRequestId: string;
};

export type BookingAdapter = {
  getAvailability: (
    request: AvailabilityRequest,
  ) => Promise<CourtSchedule[]>;
  createHold: (request: BookingHoldRequest) => Promise<BookingRecord>;
  completeDetails: (request: BookingDetailsRequest) => Promise<BookingRecord>;
  submitPayment: (request: BookingPaymentRequest) => Promise<BookingRecord>;
  findBooking: (reference: string, email: string) => Promise<BookingRecord | null>;
  cancelBooking: (reference: string, reason: string) => Promise<BookingRecord>;
};

export type BookingExperienceProps = {
  adapter?: BookingAdapter;
  surface?: "home" | "courts" | "booking";
  initialCourtSlug?: string;
  initialMode?: "book" | "manage";
};

const previewCourts: Court[] = activeTenant.previewCourts.map((court, index) => ({
  id: court.id,
  slug: court.slug,
  number: String(index + 1).padStart(2, "0"),
  name: court.name,
  descriptor: court.surface,
  mood: court.description,
  color: index % 2 === 0 ? "blue" : "coral",
}));

const tickerPhrases = ["PLAY MORE", "RALLY OFTEN", "STAY FOCUSED", "NEW HABIT"] as const;

function displayCourtsFromPlatform(publicCourts: PublicCourt[]): Court[] {
  return publicCourts.map((court, index) => ({
    id: court.id,
    slug: court.slug,
    number: String(index + 1).padStart(2, "0"),
    name: court.name,
    descriptor: court.description || "Pickleball court",
    mood: court.description || "Configured for PickPoint play",
    color: index % 2 === 0 ? "blue" : "coral",
  }));
}

function compactCourtSurface(court: Court) {
  const descriptor = court.descriptor.toLowerCase();
  if (descriptor.includes("covered")) return "Covered";
  if (descriptor.includes("outdoor")) return "Outdoor";
  if (descriptor.includes("indoor")) return "Indoor";
  return "Court";
}

function trustedGallerySource(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const source = value.trim();
  try {
    const localOrigin = "https://pickpoint-pickleclub.invalid";
    const localUrl = new URL(source, localOrigin);
    if (
      source.startsWith("/") &&
      !source.startsWith("//") &&
      !source.includes("\\") &&
      localUrl.origin === localOrigin
    ) {
      return `${localUrl.pathname}${localUrl.search}${localUrl.hash}`;
    }
    if (!/^https:\/\//i.test(source) || source.includes("\\")) return null;
    const url = new URL(source);
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.hostname.endsWith(".supabase.co") &&
      url.pathname.includes("/storage/v1/object/")
    ) {
      return url.href;
    }
  } catch {
    return null;
  }
  return null;
}

function galleryText(value: unknown, fallback: string, maxLength: number) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, maxLength) : fallback;
}

function galleryPhotosFromPlatform(tenantBootstrap: TenantBootstrap | null) {
  if (!tenantBootstrap) return [];
  return tenantBootstrap.courts
    .flatMap<GalleryPhoto>((court) => {
      const config = (court.publicConfig ?? {}) as {
        photoUrl?: unknown;
        photoAlt?: unknown;
        photoCaption?: unknown;
      };
      const src = trustedGallerySource(config.photoUrl);
      if (!src) return [];
      return [{
        id: court.id,
        src,
        alt: galleryText(
          config.photoAlt,
          `${court.name} at ${tenantBootstrap.tenant.name}`,
          180,
        ),
        caption: galleryText(config.photoCaption, court.name, 80),
      }];
    })
    .slice(0, 5);
}

const seededCustomer: CustomerDetails = {
  fullName: "Mika Santos",
  email: "mika@example.com",
  phone: "+63 917 555 0142",
  updates: true,
};

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

function formatHour(hour: number) {
  const normalizedHour = ((hour % 24) + 24) % 24;
  const period = normalizedHour >= 12 ? "PM" : "AM";
  const value = normalizedHour % 12 || 12;
  return `${value}:00 ${period}`;
}

function formatHourWithDay(hour: number) {
  return hour >= 24 ? `${formatHour(hour)} (next day)` : formatHour(hour);
}

function formatHourRange(startHour: number, endHour: number) {
  return `${formatHour(startHour)}–${formatHour(endHour)}${
    endHour >= 24 ? " (next day)" : ""
  }`;
}

function selectionIncludesNextDay(
  items: Array<{ startHour: number; durationHours: number }>,
) {
  return items.some((item) => item.startHour + item.durationHours >= 24);
}

function longDateLabel(date: string) {
  return new Intl.DateTimeFormat("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function bookingDateLabel(
  dateLabel: string,
  date: string,
  items: Array<{ startHour: number; durationHours: number }>,
) {
  if (!selectionIncludesNextDay(items)) return dateLabel;
  const followingDate = nextIsoDate(date);
  return followingDate
    ? `${dateLabel} into ${longDateLabel(followingDate)} (next day)`
    : `${dateLabel} into the next day`;
}

function selectionKey(courtId: string, startHour: number) {
  return `${courtId}:${startHour}`;
}

type SelectionState = {
  items: BookingSelection[];
  announcement: string;
};

type SelectionAction =
  | {
      type: "toggle";
      item: BookingSelection;
      courtName: string;
      startsAt: string;
      endsAt: string;
      restrictToSingleRun: boolean;
      maximumTotalHours?: number;
      singleRunMaximumHours?: number;
    }
  | { type: "replace"; items: BookingSelection[] }
  | { type: "retain-open"; openKeys: Set<string> }
  | { type: "clear"; announcement?: string };

function uniqueSelections(items: BookingSelection[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = selectionKey(item.courtId, item.startHour);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function selectionReducer(state: SelectionState, action: SelectionAction): SelectionState {
  if (action.type === "replace") {
    return { ...state, items: uniqueSelections(action.items) };
  }

  if (action.type === "retain-open") {
    const items = uniqueSelections(state.items).filter((item) =>
      action.openKeys.has(selectionKey(item.courtId, item.startHour)),
    );
    if (items.length === state.items.length) return state;
    return {
      items,
      announcement: "The schedule changed, so unavailable court-hours were removed.",
    };
  }

  if (action.type === "clear") {
    return {
      items: [],
      announcement: action.announcement ?? "Court-hour selection cleared.",
    };
  }

  const items = uniqueSelections(state.items);
  const key = selectionKey(action.item.courtId, action.item.startHour);
  const isSelected = items.some(
    (item) => selectionKey(item.courtId, item.startHour) === key,
  );

  if (
    !isSelected &&
    action.maximumTotalHours !== undefined &&
    items.length >= action.maximumTotalHours
  ) {
    return {
      ...state,
      items,
      announcement: `A booking can include up to ${action.maximumTotalHours} total court-hours.`,
    };
  }

  if (
    action.restrictToSingleRun &&
    !isSelected &&
    action.singleRunMaximumHours !== undefined &&
    items.length >= action.singleRunMaximumHours
  ) {
    return {
      ...state,
      items,
      announcement: `This court allows up to ${action.singleRunMaximumHours} consecutive hours per booking.`,
    };
  }

  if (action.restrictToSingleRun && items.length > 0) {
    const orderedHours = items
      .filter((item) => item.courtId === action.item.courtId)
      .map((item) => item.startHour)
      .sort((left, right) => left - right);
    const sameCourt = orderedHours.length === items.length;
    const extendsRun = sameCourt && (
      action.item.startHour === orderedHours[0] - 1 ||
      action.item.startHour === orderedHours.at(-1)! + 1
    );
    const removesEdge = sameCourt && isSelected && (
      action.item.startHour === orderedHours[0] ||
      action.item.startHour === orderedHours.at(-1)
    );
    if ((!isSelected && !extendsRun) || (isSelected && !removesEdge)) {
      return {
        ...state,
        items,
        announcement: isSelected
          ? "For live checkout, remove the first or last hour in the run."
          : "Live checkout accepts consecutive hours on one court. Choose the next hour beside your current selection.",
      };
    }
  }

  const nextItems = isSelected
    ? items.filter((item) => selectionKey(item.courtId, item.startHour) !== key)
    : [...items, action.item];
  const nextCount = nextItems.length;
  const nextCourtCount = new Set(nextItems.map((item) => item.courtId)).size;
  return {
    items: nextItems,
    announcement: `${action.courtName}, ${action.startsAt} to ${action.endsAt} ${isSelected ? "removed" : "added"}. ${nextCount} court-hour${nextCount === 1 ? "" : "s"} across ${nextCourtCount} court${nextCourtCount === 1 ? "" : "s"} selected.`,
  };
}

function canonicalizeSelection(items: BookingSelection[]) {
  if (!items.length) return null;
  const ordered = [...items].sort((left, right) => left.startHour - right.startHour);
  const courtId = ordered[0].courtId;
  const isOneConsecutiveCourt = ordered.every(
    (item, index) =>
      item.courtId === courtId &&
      item.durationHours === 1 &&
      (index === 0 || item.startHour === ordered[index - 1].startHour + 1),
  );
  if (!isOneConsecutiveCourt) return null;
  return {
    courtId,
    startHour: ordered[0].startHour,
    durationHours: ordered.length,
  };
}

function bookingSessionsFromSelections(
  date: string,
  items: BookingSelection[],
): BookingSessionInput[] | null {
  if (!items.length) return null;
  const ordered = uniqueSelections(items).sort(
    (left, right) =>
      left.courtId.localeCompare(right.courtId) ||
      left.startHour - right.startHour,
  );
  const groups = ordered.reduce<Array<{
    courtId: string;
    startHour: number;
    durationHours: number;
  }>>((sessions, item) => {
    const previous = sessions.at(-1);
    if (
      previous?.courtId === item.courtId &&
      previous.startHour + previous.durationHours === item.startHour
    ) {
      previous.durationHours += 1;
      return sessions;
    }
    sessions.push({
      courtId: item.courtId,
      startHour: item.startHour,
      durationHours: 1,
    });
    return sessions;
  }, []);

  const followingDate = nextIsoDate(date);
  const sessions = groups.map((group) => {
    const bookingDate = group.startHour >= 24 ? followingDate : date;
    if (!bookingDate) return null;
    const startHour = ((group.startHour % 24) + 24) % 24;
    return {
      courtId: group.courtId,
      bookingDate,
      startTime: `${String(startHour).padStart(2, "0")}:00`,
      durationHours: group.durationHours,
    };
  });
  if (sessions.some((session) => session === null)) return null;
  return sessions
    .filter((session): session is BookingSessionInput => session !== null)
    .sort(
      (left, right) =>
        left.bookingDate.localeCompare(right.bookingDate) ||
        left.startTime.localeCompare(right.startTime) ||
        left.courtId.localeCompare(right.courtId),
    );
}

function groupSelectionDetails(items: SelectionDetail[]) {
  const ordered = [...items].sort(
    (left, right) =>
      left.court.number.localeCompare(right.court.number) ||
      left.selection.startHour - right.selection.startHour,
  );
  return ordered.reduce<Array<{
    court: Court;
    startHour: number;
    endHour: number;
    courtHours: number;
    subtotal: number;
  }>>((groups, item) => {
    const previous = groups.at(-1);
    if (
      previous &&
      previous.court.id === item.court.id &&
      previous.endHour === item.selection.startHour
    ) {
      previous.endHour += 1;
      previous.courtHours += 1;
      previous.subtotal += item.selection.amount;
      return groups;
    }
    groups.push({
      court: item.court,
      startHour: item.selection.startHour,
      endHour: item.selection.startHour + 1,
      courtHours: 1,
      subtotal: item.selection.amount,
    });
    return groups;
  }, []);
}

function getPrice(startHour: number, durationHours: number) {
  return Array.from({ length: durationHours }, (_, index) => startHour + index)
    .map((hour) => {
      const clockHour = ((hour % 24) + 24) % 24;
      return clockHour >= Number(activeTenant.booking.offPeakEndsAt.slice(0, 2))
        ? activeTenant.booking.peakHourlyRate
        : activeTenant.booking.offPeakHourlyRate;
    })
    .reduce((total, price) => total + price, 0);
}

function getConfiguredPrice(
  court: PublicCourt | undefined,
  startHour: number,
  durationHours: number,
) {
  const pricingConfig = court?.pricingConfig as
    | { regular?: { bands?: Array<{ start?: string; end?: string; hourlyRate?: number }> } }
    | undefined;
  const bands = pricingConfig?.regular?.bands;
  if (!bands?.length) {
    if (platformMode() === "live") {
      throw new Error("Court pricing is not available yet.");
    }
    return getPrice(startHour, durationHours);
  }

  if (!court) {
    throw new Error("Court pricing is not available yet.");
  }
  const configuredBands = bands.map((band) => {
    if (
      typeof band.start !== "string" ||
      typeof band.end !== "string" ||
      typeof band.hourlyRate !== "number" ||
      !Number.isFinite(band.hourlyRate)
    ) {
      throw new Error("Court pricing is incomplete for this time.");
    }
    return {
      start: band.start,
      end: band.end,
      hourlyRate: band.hourlyRate,
    };
  });

  return Array.from({ length: durationHours }, (_, index) => startHour + index).reduce(
    (total, hour) => {
      const band = logicalBandForHour(
        {
          opensAt: court.opensAt,
          closesAt: court.closesAt,
          bands: configuredBands,
        },
        hour,
      );
      if (typeof band?.hourlyRate !== "number") {
        throw new Error("Court pricing is incomplete for this time.");
      }
      return total + band.hourlyRate;
    },
    0,
  );
}

function promotionClockMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return Number.isInteger(hours) && hours >= 0 && hours <= 23 &&
      Number.isInteger(minutes) && minutes >= 0 && minutes <= 59
    ? hours * 60 + minutes
    : null;
}

function promotedHourlyPrice(
  promotions: PublicPromotion[] | undefined,
  courtId: string,
  date: string,
  logicalHour: number,
  basePrice: number,
) {
  const day = new Date(`${date}T00:00:00Z`);
  const weekday = (day.getUTCDay() + 6) % 7;
  const minute = (((logicalHour % 24) + 24) % 24) * 60;
  const matches = (promotions ?? []).filter((promotion) => {
    const startsAt = promotionClockMinutes(promotion.startsAt);
    const endsAt = promotionClockMinutes(promotion.endsAt);
    const inWindow = startsAt !== null && endsAt !== null && (
      endsAt > startsAt
        ? minute >= startsAt && minute < endsAt
        : minute >= startsAt || minute < endsAt
    );
    return promotion.courtIds.includes(courtId) &&
      promotion.weekdays.includes(weekday) &&
      date >= promotion.validFrom && date <= promotion.validUntil &&
      inWindow;
  });
  const ranked = matches.map((promotion) => {
    const discount = promotion.discountType === "percentage"
      ? basePrice * promotion.discountValue / 100
      : promotion.discountValue;
    return { promotion, discount: Math.min(basePrice, Math.max(0, discount)) };
  }).sort((left, right) => right.discount - left.discount);
  const winner = ranked[0];
  if (!winner || winner.discount <= 0) return { price: basePrice };
  return {
    price: Math.round((basePrice - winner.discount) * 100) / 100,
    originalPrice: basePrice,
    promotionId: winner.promotion.id,
    promotionName: winner.promotion.name,
  };
}

function getMinimumConfiguredHourlyRate(courts: PublicCourt[]) {
  const rates = courts.flatMap((court) => {
    const pricingConfig = court.pricingConfig as
      | { regular?: { bands?: Array<{ hourlyRate?: number }> } }
      | undefined;
    return (pricingConfig?.regular?.bands ?? [])
      .map((band) => band.hourlyRate)
      .filter(
        (rate): rate is number =>
          typeof rate === "number" && Number.isFinite(rate) && rate > 0,
      );
  });
  return rates.length ? Math.min(...rates) : null;
}

function blockedPeriodOverlaps(
  blockedDates: Array<Record<string, unknown>> | undefined,
  courtId: string,
  startHour: number,
  durationHours: number,
  baseDate: string,
  responseDate: string,
  timezone: string,
) {
  return (blockedDates ?? []).some((block) => {
    const blockCourtId = block.courtId ?? block.court_id;
    const appliesToCourt = !blockCourtId || blockCourtId === courtId;
    if (!appliesToCourt) return false;
    const startsAt = block.startsAt ?? block.starts_at;
    const endsAt = block.endsAt ?? block.ends_at;
    const slotDate = startHour >= 24 ? nextIsoDate(baseDate) : baseDate;
    if (startsAt == null && endsAt == null) return slotDate === responseDate;
    if (typeof startsAt !== "string" || typeof endsAt !== "string") {
      return slotDate === responseDate;
    }
    return timestampPeriodOverlaps(
      startsAt,
      endsAt,
      startHour,
      durationHours,
      baseDate,
      responseDate,
      timezone,
    );
  });
}

function isoDayDifference(baseDate: string, date: string) {
  const base = Date.parse(`${baseDate}T00:00:00Z`);
  const target = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(base) || !Number.isFinite(target)) return null;
  return Math.round((target - base) / 86_400_000);
}

function timestampMinuteFromBase(
  value: string,
  baseDate: string,
  fallbackDate: string,
  timezone: string,
) {
  let date = fallbackDate;
  let hour: number | null = null;
  let minute: number | null = null;
  const hasExplicitOffset = /(?:z|[+-]\d{2}:?\d{2})$/i.test(value);
  const timestamp = hasExplicitOffset ? new Date(value) : null;

  if (timestamp && Number.isFinite(timestamp.getTime())) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).formatToParts(timestamp);
      const part = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((candidate) => candidate.type === type)?.value;
      const year = part("year");
      const month = part("month");
      const day = part("day");
      if (year && month && day) date = `${year}-${month}-${day}`;
      hour = Number(part("hour"));
      minute = Number(part("minute"));
    } catch {
      // Fall through to the literal wall-clock representation below.
    }
  }

  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    const match = value.match(
      /^(?:(\d{4}-\d{2}-\d{2})[T\s])?(\d{2}):(\d{2})/,
    );
    if (!match) return null;
    date = match[1] ?? fallbackDate;
    hour = Number(match[2]);
    minute = Number(match[3]);
  }

  const dayDifference = isoDayDifference(baseDate, date);
  if (
    dayDifference === null ||
    hour === null ||
    minute === null ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  return dayDifference * 24 * 60 + hour * 60 + minute;
}

function timestampPeriodOverlaps(
  startsAt: string,
  endsAt: string,
  startHour: number,
  durationHours: number,
  baseDate: string,
  fallbackDate: string,
  timezone: string,
) {
  const periodStart = timestampMinuteFromBase(
    startsAt,
    baseDate,
    fallbackDate,
    timezone,
  );
  let periodEnd = timestampMinuteFromBase(
    endsAt,
    baseDate,
    fallbackDate,
    timezone,
  );
  if (periodStart === null || periodEnd === null) {
    const slotDate = startHour >= 24 ? nextIsoDate(baseDate) : baseDate;
    return slotDate === fallbackDate;
  }
  if (periodEnd <= periodStart) periodEnd += 24 * 60;
  const slotStart = startHour * 60;
  const slotEnd = (startHour + durationHours) * 60;
  return slotStart < periodEnd && slotEnd > periodStart;
}

function mappedBookingStatus(
  value: unknown,
  fallback: BookingRecord["status"],
): BookingRecord["status"] {
  if (value === "confirmed") return "confirmed";
  if (value === "payment_review" || value === "under_review") return "payment_review";
  if (value === "pending_payment" || value === "pending") return "pending_payment";
  if (value === "cancelled" || value === "expired") return "cancelled";
  return fallback;
}

function isStoredBookingRecord(value: unknown): value is BookingRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<BookingRecord>;
  const customer = record.customer as Partial<CustomerDetails> | undefined;
  return (
    typeof record.reference === "string" &&
    record.reference.length > 0 &&
    ["pending_payment", "payment_review", "confirmed", "cancelled"].includes(
      record.status ?? "",
    ) &&
    typeof record.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(record.date) &&
    typeof record.courtId === "string" &&
    Number.isInteger(record.startHour) &&
    (record.startHour ?? -1) >= 0 &&
    (record.startHour ?? 48) < 48 &&
    Number.isInteger(record.durationHours) &&
    (record.durationHours ?? 0) > 0 &&
    (record.startHour ?? 48) + (record.durationHours ?? 48) <= 48 &&
    Number.isFinite(record.amount) &&
    (record.amount ?? -1) >= 0 &&
    (record.subtotalAmount === undefined ||
      Number.isFinite(record.subtotalAmount)) &&
    (record.serviceFeeAmount === undefined ||
      Number.isFinite(record.serviceFeeAmount)) &&
    (record.items === undefined ||
      (Array.isArray(record.items) &&
        record.items.length > 0 &&
        record.items.every(
          (item) =>
            typeof item.courtId === "string" &&
            Number.isInteger(item.startHour) &&
            item.startHour >= 0 &&
            item.startHour < 48 &&
            item.durationHours === 1 &&
            Number.isFinite(item.amount) &&
            item.amount >= 0,
        ))) &&
    (record.detailsComplete === undefined ||
      typeof record.detailsComplete === "boolean") &&
    (!record.expiresAt ||
      (typeof record.expiresAt === "string" &&
        Number.isFinite(Date.parse(record.expiresAt)))) &&
    typeof customer?.fullName === "string" &&
    typeof customer.email === "string" &&
    typeof customer.phone === "string" &&
    typeof customer.updates === "boolean"
  );
}

function formatHoldCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function readStoredBooking(reference: string): {
  record: BookingRecord;
  token: string;
} | null {
  try {
    const stored = sessionStorage.getItem(`pickpoint-pickleclub:booking:${reference}`);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as { record?: unknown; token?: unknown };
    if (
      !isStoredBookingRecord(parsed.record) ||
      parsed.record.reference !== reference ||
      typeof parsed.token !== "string" ||
      !parsed.token
    ) {
      return null;
    }
    return { record: parsed.record, token: parsed.token };
  } catch {
    return null;
  }
}

const platformAdapter: BookingAdapter = {
  async getAvailability(request) {
    const [response, tenantBootstrap] = await Promise.all([
      getPlatformAvailability(request.date),
      getTenantBootstrap(),
    ]);
    const followingDate = nextIsoDate(request.date);
    const hasAfterMidnightSlots = tenantBootstrap.courts.some((court) => {
      const closeHour = logicalCloseHour(court.opensAt, court.closesAt);
      return closeHour !== null && closeHour > 24;
    });
    const nextResponse = hasAfterMidnightSlots && followingDate
      ? await getPlatformAvailability(followingDate)
      : null;
    const availabilityDays = [
      { date: request.date, response },
      ...(followingDate && nextResponse
        ? [{ date: followingDate, response: nextResponse }]
        : []),
    ];

    return tenantBootstrap.courts.map((publicCourt) => {
      const availabilityCourt = response.courts.find((item) => item.id === publicCourt.id);
      if (!availabilityCourt) {
        throw new Error("The court schedule is incomplete. Refresh before selecting a time.");
      }
      const openingHour = parseClockHour(publicCourt.opensAt);
      const closingHour = logicalCloseHour(publicCourt.opensAt, publicCourt.closesAt);
      if (openingHour === null || closingHour === null) {
        throw new Error("The court hours are incomplete. Refresh before selecting a time.");
      }
      const publicConfig = publicCourt.publicConfig as
        | { minimumLeadMinutes?: number }
        | undefined;
      const minimumLeadMinutes =
        publicConfig?.minimumLeadMinutes ?? activeTenant.booking.minimumLeadMinutes;
      const slots = Array.from(
        { length: Math.max(0, closingHour - openingHour) },
        (_, index) => index + openingHour,
      ).map((hour): AvailabilitySlot => {
        const slotDate = hour >= 24 ? followingDate : request.date;
        if (!slotDate) {
          throw new Error("The next-day schedule could not be calculated. Refresh and try again.");
        }
        const overlapsBooking = availabilityDays.some((day) => {
          const dayCourt = day.response.courts.find(
            (candidate) => candidate.id === publicCourt.id,
          );
          if (!dayCourt) {
            if (day.date === slotDate) {
              throw new Error(
                "The court schedule is incomplete. Refresh before selecting a time.",
              );
            }
            return false;
          }
          return dayCourt.unavailable.some((blocked) =>
            timestampPeriodOverlaps(
              blocked.startsAt,
              blocked.endsAt,
              hour,
              1,
              request.date,
              day.date,
              day.response.timezone || activeTenant.identity.timezone,
            ),
          );
        });
        const overlapsBlock = availabilityDays.some((day) =>
          blockedPeriodOverlaps(
            day.response.blockedDates,
            publicCourt.id,
            hour,
            1,
            request.date,
            day.date,
            day.response.timezone || activeTenant.identity.timezone,
          ),
        );
        const candidateStartsAt = new Date(
          `${slotDate}T${String(hour % 24).padStart(2, "0")}:00:00+08:00`,
        ).getTime();
        const tooSoon =
          candidateStartsAt < Date.now() + minimumLeadMinutes * 60 * 1000;
        const basePrice = getConfiguredPrice(publicCourt, hour, 1);
        const promoted = promotedHourlyPrice(
          tenantBootstrap.promotions,
          publicCourt.id,
          slotDate,
          hour,
          basePrice,
        );
        return {
          hour,
          startsAt: formatClockLabel(hour),
          endsAt: formatClockLabel(hour + 1),
          ...promoted,
          status: tooSoon || overlapsBlock || overlapsBooking ? "unavailable" : "available",
        };
      });
      return { courtId: publicCourt.id, slots };
    });
  },
  async createHold(request) {
    if (!request.policyAccepted) {
      throw new Error("Accept the booking and cancellation rules before we hold your slot.");
    }
    const canonicalSelection = canonicalizeSelection(request.items);
    const groupSessions = bookingSessionsFromSelections(request.date, request.items);
    if (
      platformMode() === "live" &&
      !canonicalSelection &&
      !request.atomicMultiSessionBooking
    ) {
      throw new Error(
        "This selection spans separate court sessions. Live checkout will open after the venue enables one atomic group hold; no partial reservations were created.",
      );
    }
    if (request.atomicMultiSessionBooking && !groupSessions) {
      throw new Error("The selected court sessions could not be prepared for checkout.");
    }
    const canonical = canonicalSelection ?? {
      courtId: request.items[0]?.courtId ?? request.courtId,
      startHour: request.items[0]?.startHour ?? request.startHour,
      durationHours: 1,
    };
    const serializedDate = canonical.startHour >= 24
      ? nextIsoDate(request.date)
      : request.date;
    const serializedStartHour = ((canonical.startHour % 24) + 24) % 24;
    if (!serializedDate || !Number.isInteger(serializedStartHour)) {
      throw new Error("The selected start time could not be prepared for checkout.");
    }
    const pendingKey = `pickpoint-pickleclub:pending:${request.clientRequestId}`;
    const probeKey = `pickpoint-pickleclub:storage-probe:${request.clientRequestId}`;
    try {
      sessionStorage.setItem(probeKey, "available");
      sessionStorage.removeItem(probeKey);
    } catch {
      throw new Error(
        "Secure booking recovery is unavailable in this browser. Enable session storage before reserving a court.",
      );
    }

    // The server owns idempotency. Replaying this UUID is safer than trusting a
    // cached browser response after an ambiguous network failure.
    const bookingCustomer = request.detailsPending
      ? {
          name: "Booking details pending",
          email: `booking-${request.clientRequestId}@pending.pickpoint-pickleclub.invalid`,
          phone: "0000000000",
        }
      : {
          name: request.customer.fullName,
          email: request.customer.email,
          phone: request.customer.phone,
        };
    const confirmation: BookingConfirmation = request.atomicMultiSessionBooking
      ? await createPlatformBooking({
          sessions: groupSessions!,
          bookingType: "regular",
          customer: bookingCustomer,
          policyAccepted: request.policyAccepted,
          policyVersion: request.policyVersion,
          clientRequestId: request.clientRequestId,
          notes: request.detailsPending ? "__details_pending_v1__" : null,
        })
      : await createPlatformBooking({
          courtId: canonical.courtId,
          bookingDate: serializedDate,
          startTime: `${String(serializedStartHour).padStart(2, "0")}:00`,
          durationHours: canonical.durationHours,
          bookingType: "regular",
          customer: bookingCustomer,
          policyAccepted: request.policyAccepted,
          policyVersion: request.policyVersion,
          clientRequestId: request.clientRequestId,
          notes: request.detailsPending ? "__details_pending_v1__" : null,
        });

    if (
      !confirmation.reference ||
      !confirmation.bookingToken ||
      !Number.isFinite(confirmation.subtotalAmount) ||
      !Number.isFinite(confirmation.serviceFeeAmount) ||
      !Number.isFinite(confirmation.totalAmount) ||
      confirmation.subtotalAmount < 0 ||
      confirmation.serviceFeeAmount < 0 ||
      confirmation.totalAmount < 0
    ) {
      throw new Error(
        "The booking server returned an incomplete hold. Payment remains disabled.",
      );
    }
    const confirmationExpiry = confirmation.expiresAt
      ? Date.parse(confirmation.expiresAt)
      : Number.NaN;
    const confirmationStatus = mappedBookingStatus(
      confirmation.status,
      "cancelled",
    );
    if (
      platformMode() === "live" &&
      confirmationStatus !== "pending_payment"
    ) {
      throw new Error(
        "The server says this booking is no longer awaiting payment. Payment remains disabled.",
      );
    }
    if (
      platformMode() === "live" &&
      (!Number.isFinite(confirmationExpiry) || confirmationExpiry <= Date.now())
    ) {
      try {
        await cancelUnpaidBooking(
          confirmation.reference,
          confirmation.bookingToken,
        );
      } catch {
        // A malformed or expired server hold must never unlock payment controls.
      }
      throw new Error(
        "The booking server did not provide an active expiry window. Payment remains disabled.",
      );
    }

    const record: BookingRecord = {
      reference: confirmation.reference,
      status: "pending_payment",
      expiresAt: confirmation.expiresAt ?? null,
      date: request.date,
      courtId: canonical.courtId,
      startHour: canonical.startHour,
      durationHours: canonical.durationHours,
      amount: platformMode() === "preview" ? request.amount : confirmation.totalAmount,
      subtotalAmount: platformMode() === "preview"
        ? request.items.reduce((sum, item) => sum + item.amount, 0)
        : confirmation.subtotalAmount,
      serviceFeeAmount: platformMode() === "preview"
        ? Math.max(0, request.amount - request.items.reduce((sum, item) => sum + item.amount, 0))
        : confirmation.serviceFeeAmount,
      items: request.items,
      customer: request.customer,
      detailsComplete: !request.detailsPending,
    };

    const bookingKey = `pickpoint-pickleclub:booking:${record.reference}`;
    try {
      sessionStorage.setItem(pendingKey, JSON.stringify(confirmation));
      sessionStorage.setItem(
        bookingKey,
        JSON.stringify({ record, token: confirmation.bookingToken }),
      );
      sessionStorage.setItem(
        "pickpoint-pickleclub:active-hold",
        JSON.stringify({
          reference: record.reference,
          clientRequestId: request.clientRequestId,
        }),
      );
    } catch {
      try {
        sessionStorage.removeItem(pendingKey);
        sessionStorage.removeItem(bookingKey);
        sessionStorage.removeItem("pickpoint-pickleclub:active-hold");
      } catch {
        // Continue to the best-effort server release below.
      }
      try {
        await cancelUnpaidBooking(record.reference, confirmation.bookingToken);
      } catch {
        // The server-controlled expiry still prevents an indefinite hold.
      }
      throw new Error(
        "The hold could not be saved safely and payment remains disabled. Refresh before trying again.",
      );
    }
    return record;
  },
  async completeDetails(request) {
    const parsed = readStoredBooking(request.booking.reference);
    if (!parsed) {
      throw new Error("This court hold is no longer available. Choose your slots again.");
    }
    if (parsed.record.status !== "pending_payment") {
      throw new Error("This booking is no longer awaiting player details.");
    }
    const result = await completePlatformBookingDetails({
      reference: parsed.record.reference,
      token: parsed.token,
      customer: {
        name: request.customer.fullName.trim(),
        email: request.customer.email.trim().toLowerCase(),
        phone: request.customer.phone.trim(),
      },
    });
    const status = mappedBookingStatus(result.status, parsed.record.status);
    if (platformMode() === "live" && status !== "pending_payment") {
      throw new Error("This court hold is no longer active.");
    }
    const record: BookingRecord = {
      ...parsed.record,
      status,
      expiresAt: result.expiresAt ?? parsed.record.expiresAt,
      customer: request.customer,
      detailsComplete: true,
    };
    try {
      sessionStorage.setItem(
        `pickpoint-pickleclub:booking:${record.reference}`,
        JSON.stringify({ ...parsed, record }),
      );
    } catch {
      throw new Error("Your player details were saved, but booking recovery is unavailable in this browser.");
    }
    return record;
  },
  async submitPayment(request) {
    if (
      platformMode() === "preview" &&
      request.paymentReference.replace(/\s/g, "").endsWith("000000")
    ) {
      throw new Error(
        "Preview validation could not match that sample reference. No payment was attempted.",
      );
    }
    const storageKey = `pickpoint-pickleclub:booking:${request.booking.reference}`;
    const parsed = readStoredBooking(request.booking.reference);
    if (!parsed) {
      throw new Error("This payment hold is no longer available. Start a new booking.");
    }
    if (parsed.record.status !== "pending_payment") {
      throw new Error("This booking is no longer awaiting payment.");
    }
    const current = await bookingStatus(parsed.record.reference, parsed.token);
    const currentBooking = current.booking as
      | { status?: string; expiresAt?: string | null; expires_at?: string | null }
      | undefined;
    if (platformMode() === "live") {
      const currentStatus = mappedBookingStatus(currentBooking?.status, parsed.record.status);
      const expiresAt = currentBooking?.expiresAt ?? currentBooking?.expires_at ?? parsed.record.expiresAt;
      const expiresAtTime = expiresAt ? Date.parse(expiresAt) : null;
      if (
        currentStatus !== "pending_payment" ||
        expiresAtTime === null ||
        !Number.isFinite(expiresAtTime) ||
        expiresAtTime <= Date.now()
      ) {
        throw new Error("This payment hold has expired or is no longer awaiting payment. Choose a new time.");
      }
    }
    const receipt = await submitPaymentReceipt({
      reference: parsed.record.reference,
      token: parsed.token,
      method: request.paymentMethod,
      paymentReference: request.paymentReference,
      file: request.receiptFile,
    });
    const receiptBooking = receipt.booking as { status?: string } | undefined;
    const verificationStatus = typeof receipt.status === "string"
      ? receipt.status
      : typeof receipt.outcome === "string"
        ? receipt.outcome
        : "manual_review";
    const paymentReviewState = (
      ["auto_approved", "manual_review", "pending", "short_payment", "rejected"] as const
    ).find((status) => status === verificationStatus) ?? "manual_review";
    const record = {
      ...parsed.record,
      status: verificationStatus === "auto_approved"
        ? "confirmed" as const
        : mappedBookingStatus(receiptBooking?.status, "payment_review"),
      paymentReviewState,
    };
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ ...parsed, record }));
      sessionStorage.removeItem(`pickpoint-pickleclub:pending:${request.clientRequestId}`);
      sessionStorage.removeItem("pickpoint-pickleclub:active-hold");
    } catch {
      // The server response is authoritative; returning it prevents duplicate uploads.
    }
    return record;
  },
  async findBooking(reference, email) {
    const normalizedReference = reference.trim().toUpperCase();
    const parsed = readStoredBooking(normalizedReference);
    if (parsed) {
      if (parsed.record.customer.email.toLowerCase() !== email.trim().toLowerCase()) {
        return null;
      }
      const current = await bookingStatus(normalizedReference, parsed.token);
      const currentBooking = current.booking as
        | { status?: string; expiresAt?: string | null; expires_at?: string | null }
        | undefined;
      const record = {
        ...parsed.record,
        expiresAt: currentBooking?.expiresAt ?? currentBooking?.expires_at ?? parsed.record.expiresAt,
        status: mappedBookingStatus(currentBooking?.status, parsed.record.status),
      };
      try {
        sessionStorage.setItem(
          `pickpoint-pickleclub:booking:${normalizedReference}`,
          JSON.stringify({ ...parsed, record }),
        );
      } catch {
        // The verified server status can still be shown for this session.
      }
      return record;
    }

    await delay(450);
    if (
      platformMode() !== "preview" ||
      normalizedReference !== "DT-260808-018" ||
      email.trim().toLowerCase() !== "mika@example.com"
    ) return null;
    return {
      reference: "DT-260808-018",
      status: "pending_payment",
      date: "2026-08-16",
      courtId: previewCourts[0].id,
      startHour: 18,
      durationHours: 2,
      amount: 800,
      customer: seededCustomer,
    };
  },
  async cancelBooking(reference) {
    const parsed = readStoredBooking(reference);
    if (parsed) {
      await cancelUnpaidBooking(reference, parsed.token);
      const cancelled = { ...parsed.record, status: "cancelled" as const };
      try {
        sessionStorage.setItem(
          `pickpoint-pickleclub:booking:${reference}`,
          JSON.stringify({ ...parsed, record: cancelled }),
        );
        const activeHold = sessionStorage.getItem("pickpoint-pickleclub:active-hold");
        if (activeHold) {
          const pointer = JSON.parse(activeHold) as { reference?: unknown };
          if (pointer.reference === reference) {
            sessionStorage.removeItem("pickpoint-pickleclub:active-hold");
          }
        }
      } catch {
        // The authoritative cancellation already succeeded server-side.
      }
      return cancelled;
    }
    if (platformMode() !== "preview") {
      throw new Error("This booking can no longer be cancelled online.");
    }
    await delay(450);
    return {
      reference,
      status: "cancelled",
      date: "2026-08-16",
      courtId: previewCourts[0].id,
      startHour: 18,
      durationHours: 2,
      amount: 800,
      customer: seededCustomer,
    };
  },
};

function getManilaToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const getPart = (type: "year" | "month" | "day") =>
    Number(parts.find((part) => part.type === type)?.value);

  return new Date(Date.UTC(getPart("year"), getPart("month") - 1, getPart("day"), 12));
}

function getDateOptions(count = 14) {
  const today = getManilaToday();

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() + index);
    const iso = date.toISOString().slice(0, 10);

    return {
      iso,
      day: new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        timeZone: "UTC",
      }).format(date),
      date: new Intl.DateTimeFormat("en-US", {
        day: "numeric",
        timeZone: "UTC",
      }).format(date),
      month: new Intl.DateTimeFormat("en-US", {
        month: "short",
        timeZone: "UTC",
      }).format(date),
      long: new Intl.DateTimeFormat("en-PH", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(date),
      isToday: index === 0,
    };
  });
}

function peso(amount: number) {
  const hasCentavos = Math.abs(amount - Math.round(amount)) > 0.0001;
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: hasCentavos ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function calculateBookingFee(
  bookingFee: TenantBootstrap["bookingFee"],
  subtotal: number,
  durationHours: number,
) {
  const amount = bookingFee?.feeAmount ?? 0;
  if (!amount) return 0;
  switch (bookingFee?.feeMode) {
    case "fixed_per_booking":
      return amount;
    case "fixed_per_hour":
      return amount * durationHours;
    case "percentage":
      return Math.round(subtotal * amount) / 100;
    default:
      return null;
  }
}

const fieldErrorId = (id: string, field: string) => `${id}-${field}-error`;

type WebMcpContext = {
  registerTool(
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: Record<string, unknown>;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute(input: unknown): unknown | Promise<unknown>;
    },
    options?: { signal?: AbortSignal },
  ): void | Promise<void>;
};

function usePickPointWebMcp() {
  useEffect(() => {
    const modelContext = (document as Document & { modelContext?: WebMcpContext }).modelContext;
    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    const dateSchema = {
      type: "object",
      properties: {
        date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Local date in YYYY-MM-DD format." },
      },
      required: ["date"],
      additionalProperties: false,
    };

    void Promise.resolve(modelContext.registerTool({
      name: "check_pickpoint_availability",
      title: "Check PickPoint availability",
      description: "Read PickPoint court availability for one local calendar date without creating a booking.",
      inputSchema: dateSchema,
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      async execute(input) {
        const date = typeof input === "object" && input !== null && "date" in input
          ? String((input as { date: unknown }).date)
          : "";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("A valid YYYY-MM-DD date is required.");
        const result = await getPlatformAvailability(date);
        return { date: result.date, timezone: result.timezone, courts: result.courts };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);

    void Promise.resolve(modelContext.registerTool({
      name: "start_pickpoint_booking",
      title: "Start a PickPoint booking",
      description: "Open the visible PickPoint booking flow. This stages a booking and does not reserve a court.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute() {
        window.location.assign("/book");
        return { status: "booking_flow_opened" };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);

    return () => lifecycle.abort();
  }, []);
}

export function BookingExperience({
  adapter = platformAdapter,
  surface = "home",
  initialCourtSlug,
  initialMode = "book",
}: BookingExperienceProps) {
  usePickPointWebMcp();
  const isLive = platformMode() === "live";
  const isHome = surface === "home";
  const isCourtsPage = surface === "courts";
  const isBookingPage = surface === "booking";
  const [dateHorizon, setDateHorizon] = useState<number>(activeTenant.booking.maximumAdvanceDays);
  const dates = useMemo(() => getDateOptions(Math.min(Math.max(dateHorizon + 1, 2), 31)), [dateHorizon]);
  const formId = useId();
  const bookingSectionRef = useRef<HTMLElement>(null);
  const paymentHeadingRef = useRef<HTMLHeadingElement>(null);
  const bookingAttemptIdRef = useRef("");
  const bookingOwnsSelectionRef = useRef(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mode, setMode] = useState<"book" | "manage">(initialMode);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedDate, setSelectedDate] = useState(dates[1]?.iso ?? "");
  const [, setSelectedCourtId] = useState(() => {
    if (isLive) return previewCourts[0].id;
    return previewCourts.find((court) => court.slug === initialCourtSlug)?.id ?? previewCourts[0].id;
  });
  const [selectionState, dispatchSelection] = useReducer(selectionReducer, {
    items: [],
    announcement: "",
  });
  const selectedSlots = selectionState.items;
  const [schedule, setSchedule] = useState<CourtSchedule[]>([]);
  const [scheduleDate, setScheduleDate] = useState("");
  const [availabilityState, setAvailabilityState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [availabilityRetry, setAvailabilityRetry] = useState(0);
  const [customer, setCustomer] = useState<CustomerDetails>({
    fullName: "",
    email: "",
    phone: "",
    updates: true,
  });
  const [acceptedPolicy, setAcceptedPolicy] = useState(false);
  const [detailErrors, setDetailErrors] = useState<Partial<Record<keyof CustomerDetails, string>>>({});
  const [paymentReference, setPaymentReference] = useState("");
  const [receiptFileName, setReceiptFileName] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [paymentError, setPaymentError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingBooking, setPendingBooking] = useState<BookingRecord | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<BookingRecord | null>(null);
  const [holdNow, setHoldNow] = useState(() => Date.now());
  const [liveMessage, setLiveMessage] = useState("");
  const [bootstrap, setBootstrap] = useState<TenantBootstrap | null>(null);
  const [bootstrapState, setBootstrapState] = useState<"loading" | "ready" | "error">("loading");

  const [lookupReference, setLookupReference] = useState("");
  const [lookupEmail, setLookupEmail] = useState("");
  const [lookupState, setLookupState] = useState<
    "idle" | "loading" | "found" | "empty" | "error"
  >("idle");
  const [managedBooking, setManagedBooking] = useState<BookingRecord | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [showRescheduleHelp, setShowRescheduleHelp] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelState, setCancelState] = useState<"idle" | "loading" | "success" | "error">("idle");

  const displayCourts = useMemo(
    () =>
      isLive
        ? displayCourtsFromPlatform(bootstrap?.courts ?? [])
        : previewCourts,
    [bootstrap, isLive],
  );
  const courtDirectoryCourts = useMemo(() => {
    if (!isLive) return previewCourts;
    if (bootstrapState !== "ready") return [];
    return displayCourtsFromPlatform(bootstrap?.courts ?? []);
  }, [bootstrap, bootstrapState, isLive]);
  const galleryPhotos = useMemo(() => galleryPhotosFromPlatform(bootstrap), [bootstrap]);
  const startingHourlyRate = useMemo(
    () =>
      isLive
        ? getMinimumConfiguredHourlyRate(bootstrap?.courts ?? [])
        : Math.min(
            activeTenant.booking.offPeakHourlyRate,
            activeTenant.booking.peakHourlyRate,
          ),
    [bootstrap, isLive],
  );
  const selectedSlotDetails = useMemo(
    () => selectedSlots
      .map((selection) => {
        const court = displayCourts.find((candidate) => candidate.id === selection.courtId);
        const slot = schedule
          .find((candidate) => candidate.courtId === selection.courtId)
          ?.slots.find((candidate) => candidate.hour === selection.startHour);
        return court && slot ? { selection, court, slot } : null;
      })
      .filter((item): item is SelectionDetail => Boolean(item))
      .sort((left, right) => left.selection.startHour - right.selection.startHour || left.court.number.localeCompare(right.court.number)),
    [displayCourts, schedule, selectedSlots],
  );
  const selectedSlot = selectedSlotDetails[0]?.slot ?? null;
  const selectedDateDetails = dates.find((date) => date.iso === selectedDate);
  const selectedBaseDateLabel = selectedDateDetails?.long ?? selectedDate;
  const selectedFollowingDate = nextIsoDate(selectedDate);
  const selectedNextDayDateSuffix = selectionIncludesNextDay(selectedSlots)
    ? selectedFollowingDate
      ? ` into ${longDateLabel(selectedFollowingDate)} (next day)`
      : " into the next day"
    : "";
  const selectedBookingDateLabel = `${selectedBaseDateLabel}${selectedNextDayDateSuffix}`;
  const availableCount = schedule.reduce(
    (count, court) => count + court.slots.filter((slot) => slot.status !== "unavailable").length,
    0,
  );
  const courtSubtotal = selectedSlots.reduce((sum, item) => sum + item.amount, 0);
  const selectedCourtCount = new Set(selectedSlots.map((item) => item.courtId)).size;
  const canonicalSelection = canonicalizeSelection(selectedSlots);
  const atomicMultiSessionBooking =
    !isLive || bootstrap?.capabilities?.atomicMultiSessionBookingV1 !== false;
  const canonicalCourt = bootstrap?.courts.find(
    (court) => court.id === canonicalSelection?.courtId,
  );
  const canonicalPricing = canonicalCourt?.pricingConfig as
    | { regular?: { minimumHours?: number; maximumHours?: number } }
    | undefined;
  // Atomic group checkout is limited by total court-hours, not by the old
  // single-court session maximum. The server validates all sessions together.
  const atomicSelectionWithinLimits =
    selectedSlots.length > 0 && selectedSlots.length <= 18;
  const liveSelectionSupported =
    !isLive ||
    (atomicMultiSessionBooking
      ? atomicSelectionWithinLimits
      : Boolean(
          canonicalSelection &&
            canonicalSelection.durationHours >=
              (canonicalPricing?.regular?.minimumHours ?? 1) &&
            canonicalSelection.durationHours <=
              (canonicalPricing?.regular?.maximumHours ?? 18),
        ));
  const selectedKeys = new Set(
    selectedSlots.map((item) => selectionKey(item.courtId, item.startHour)),
  );
  const scheduleHours = Array.from(
    new Set(schedule.flatMap((court) => court.slots.map((slot) => slot.hour))),
  ).sort((left, right) => left - right);
  const paymentMethod: PaymentMethod | null = bootstrap?.paymentMethods.find(
    (method) => (method.methodCode ?? method.code ?? "").toLowerCase() === "gcash",
  ) ?? null;
  const paymentMethodCode = paymentMethod?.methodCode ?? paymentMethod?.code ?? "gcash";
  const paymentLabel = paymentMethod?.displayName ?? "GCash";
  const paymentAccountName = paymentMethod?.accountName?.trim() ?? "";
  const paymentAccountNumber = (
    paymentMethod?.accountNumber ?? paymentMethod?.accountReference ?? ""
  ).trim();
  const paymentAccountDigits = paymentAccountNumber.replace(/\D/g, "");
  const isGcashPayment = paymentMethodCode.toLowerCase() === "gcash";
  const gcashLocalDigits = isGcashPayment
    ? paymentAccountDigits.startsWith("63")
      ? paymentAccountDigits.slice(2)
      : paymentAccountDigits.startsWith("0")
        ? paymentAccountDigits.slice(1)
        : paymentAccountDigits
    : paymentAccountDigits;
  const paymentAccountDisplay = isGcashPayment && /^9\d{9}$/.test(gcashLocalDigits)
    ? gcashLocalDigits.replace(/^(\d{3})(\d{3})(\d{4})$/, "$1 $2 $3")
    : paymentAccountNumber;
  const paymentAccountReady = Boolean(paymentAccountName && paymentAccountNumber);
  const rawPolicy = (bootstrap?.settings?.refund_reschedule_policy ??
    bootstrap?.refundReschedulePolicy ??
    null) as Record<string, unknown> | null;
  const policyVersion = typeof rawPolicy?.version === "string" ? rawPolicy.version : null;
  const policyTitle =
    typeof rawPolicy?.title === "string" ? rawPolicy.title : "Booking and cancellation rules";
  const policyIntro =
    typeof rawPolicy?.intro === "string"
      ? rawPolicy.intro
      : activeTenant.booking.cancellation;
  const policyContent =
    typeof rawPolicy?.content === "string" ? rawPolicy.content : activeTenant.booking.rescheduling;
  const bookingFee = calculateBookingFee(bootstrap?.bookingFee, courtSubtotal, selectedSlots.length);
  const total = courtSubtotal + (bookingFee ?? 0);
  const checkoutSlot: AvailabilitySlot | null =
    selectedSlot ??
    (pendingBooking
      ? {
          hour: pendingBooking.startHour,
          startsAt: formatHour(pendingBooking.startHour),
          endsAt: formatHour(
            pendingBooking.startHour + pendingBooking.durationHours,
          ),
          price:
            pendingBooking.subtotalAmount ??
            Math.max(
              0,
              pendingBooking.amount - (pendingBooking.serviceFeeAmount ?? 0),
            ),
          status: "available",
        }
      : null);
  const checkoutSubtotal =
    pendingBooking?.subtotalAmount ?? checkoutSlot?.price ?? courtSubtotal;
  const checkoutFee =
    pendingBooking?.serviceFeeAmount ??
    (pendingBooking ? Math.max(0, pendingBooking.amount - checkoutSubtotal) : bookingFee ?? 0);
  const checkoutTotal = pendingBooking?.amount ?? total;
  const holdExpiryTimestamp = pendingBooking?.expiresAt
    ? Date.parse(pendingBooking.expiresAt)
    : Number.NaN;
  const holdExpired = Boolean(
    pendingBooking &&
      (pendingBooking.status !== "pending_payment" ||
        (Number.isFinite(holdExpiryTimestamp) && holdExpiryTimestamp <= holdNow)),
  );
  const holdRemainingSeconds =
    pendingBooking && Number.isFinite(holdExpiryTimestamp) && !holdExpired
      ? Math.max(0, Math.ceil((holdExpiryTimestamp - holdNow) / 1000))
      : null;
  const liveBookingReady =
    !isLive ||
    (bootstrapState === "ready" &&
      bootstrap?.readiness.publicBookingEnabled === true &&
      paymentAccountReady &&
      Boolean(policyVersion) &&
      bookingFee !== null);
  const availabilityBootstrapState = isLive ? bootstrapState : "ready";
  const visibleAvailabilityState =
    scheduleDate === selectedDate ? availabilityState : "loading";
  const heldPaymentReady =
    !isLive ||
    (bootstrapState === "ready" &&
      bootstrap?.readiness.publicBookingEnabled === true &&
      paymentAccountReady);

  useEffect(() => {
    let active = true;
    getTenantBootstrap()
      .then((result) => {
        if (!active) return;
        setBootstrap(result);
        if (isLive && result.courts.length) {
          const requestedCourt = result.courts.find(
            (court) => court.slug === initialCourtSlug,
          );
          const configuredCourt = requestedCourt ?? result.courts[0];
          setSelectedCourtId((current) => {
            if (requestedCourt) return requestedCourt.id;
            return result.courts.some((court) => court.id === current)
              ? current
              : result.courts[0].id;
          });
          const publicConfig = (configuredCourt.publicConfig ?? {}) as {
            maximumAdvanceDays?: number;
          };
          if (typeof publicConfig?.maximumAdvanceDays === "number") {
            setDateHorizon(publicConfig.maximumAdvanceDays);
          }
        }
        setBootstrapState("ready");
      })
      .catch(() => {
        if (!active) return;
        setBootstrap(null);
        setBootstrapState("error");
      });
    return () => {
      active = false;
    };
  }, [initialCourtSlug, isLive]);

  useEffect(() => {
    if (!isBookingPage || adapter !== platformAdapter) return;
    let active = true;

    const restoreActiveHold = async () => {
      let pointer: { reference: string; clientRequestId: string };
      let parsed: { record: BookingRecord; token: string };

      try {
        const pointerValue = sessionStorage.getItem("pickpoint-pickleclub:active-hold");
        if (!pointerValue) return;
        const candidatePointer = JSON.parse(pointerValue) as Partial<typeof pointer>;
        if (
          typeof candidatePointer.reference !== "string" ||
          !candidatePointer.reference ||
          typeof candidatePointer.clientRequestId !== "string" ||
          !candidatePointer.clientRequestId
        ) {
          sessionStorage.removeItem("pickpoint-pickleclub:active-hold");
          return;
        }
        pointer = {
          reference: candidatePointer.reference,
          clientRequestId: candidatePointer.clientRequestId,
        };

        const storedValue = sessionStorage.getItem(
          `pickpoint-pickleclub:booking:${pointer.reference}`,
        );
        if (!storedValue) {
          sessionStorage.removeItem("pickpoint-pickleclub:active-hold");
          return;
        }
        const candidateStored = JSON.parse(storedValue) as {
          record?: unknown;
          token?: unknown;
        };
        if (
          !isStoredBookingRecord(candidateStored.record) ||
          candidateStored.record.reference !== pointer.reference ||
          typeof candidateStored.token !== "string" ||
          !candidateStored.token
        ) {
          sessionStorage.removeItem("pickpoint-pickleclub:active-hold");
          return;
        }
        parsed = {
          record: candidateStored.record,
          token: candidateStored.token,
        };
      } catch {
        try {
          sessionStorage.removeItem("pickpoint-pickleclub:active-hold");
        } catch {
          // Storage can be unavailable in hardened browser modes.
        }
        return;
      }

      let current: Awaited<ReturnType<typeof bookingStatus>>;
      try {
        current = await bookingStatus(pointer.reference, parsed.token);
      } catch {
        // Fail closed: never reveal payment controls for an unverified saved hold.
        return;
      }
      if (!active) return;

      const currentBooking = current.booking as
        | { status?: string; expiresAt?: string | null; expires_at?: string | null }
        | undefined;
      const restoredExpiry =
        currentBooking?.expiresAt ??
        currentBooking?.expires_at ??
        parsed.record.expiresAt ??
        null;
      const mappedStatus = mappedBookingStatus(
        currentBooking?.status,
        parsed.record.status,
      );
      const validatedRestoredExpiry =
        restoredExpiry && Number.isFinite(Date.parse(restoredExpiry))
          ? restoredExpiry
          : null;
      const livePendingExpiryInvalid =
        platformMode() === "live" &&
        mappedStatus === "pending_payment" &&
        !validatedRestoredExpiry;
      const restored: BookingRecord = {
        ...parsed.record,
        status: livePendingExpiryInvalid ? "cancelled" : mappedStatus,
        expiresAt: validatedRestoredExpiry,
      };
      try {
        sessionStorage.setItem(
          `pickpoint-pickleclub:booking:${restored.reference}`,
          JSON.stringify({ ...parsed, record: restored }),
        );
      } catch {
        // Fail closed when the verified state cannot be persisted for recovery.
        return;
      }

      bookingAttemptIdRef.current = pointer.clientRequestId;
      bookingOwnsSelectionRef.current = true;
      setSelectedDate(restored.date);
      setSelectedCourtId(restored.courtId);
      dispatchSelection({
        type: "replace",
        items: restored.items?.length
          ? restored.items
          : Array.from({ length: restored.durationHours }, (_, index) => ({
              courtId: restored.courtId,
              startHour: restored.startHour + index,
              durationHours: 1 as const,
              amount: (restored.subtotalAmount ?? restored.amount) / restored.durationHours,
            })),
      });
      setCustomer(restored.customer);
      setAcceptedPolicy(restored.detailsComplete !== false);
      setPaymentError("");
      setMode("book");
      setHoldNow(Date.now());

      if (restored.status === "confirmed" || restored.status === "payment_review") {
        try {
          sessionStorage.removeItem("pickpoint-pickleclub:active-hold");
          sessionStorage.removeItem(`pickpoint-pickleclub:pending:${pointer.clientRequestId}`);
        } catch {
          // The authoritative status is still safe to show without payment controls.
        }
        setPendingBooking(null);
        setConfirmedBooking(restored);
        setStep(4);
        setLiveMessage(
          restored.status === "confirmed"
            ? `Booking ${restored.reference} is confirmed.`
            : `Payment for booking ${restored.reference} is under review.`,
        );
        return;
      }

      setConfirmedBooking(null);
      setPendingBooking(restored);
      setStep(restored.detailsComplete === false ? 2 : 3);
      setLiveMessage(
        restored.status === "pending_payment"
          ? restored.detailsComplete === false
            ? `Saved hold ${restored.reference} was restored. Add player details before it expires.`
            : `Saved hold ${restored.reference} was verified and restored.`
          : `Saved hold ${restored.reference} is no longer available.`,
      );
    };

    void restoreActiveHold();
    return () => {
      active = false;
    };
  }, [adapter, isBookingPage]);

  useEffect(() => {
    if (!pendingBooking?.expiresAt) return;
    const intervalId = window.setInterval(() => setHoldNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [pendingBooking?.expiresAt]);

  useEffect(() => {
    if (step !== 3 || !pendingBooking) return;
    const frame = window.requestAnimationFrame(() => paymentHeadingRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [pendingBooking, step]);

  useEffect(() => {
    if (!isBookingPage || step !== 2) return;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(".booking-compact-title")?.scrollIntoView({ block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isBookingPage, step]);

  useEffect(() => {
    if (!isBookingPage) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setAvailabilityState("loading");
    });
    if (isLive && availabilityBootstrapState !== "ready") {
      queueMicrotask(() => {
        if (active) {
          setSchedule([]);
          setScheduleDate("");
        }
      });
      return () => {
        active = false;
      };
    }

    adapter
      .getAvailability({
        tenantSlug: "pickpoint-pickleclub",
        date: selectedDate,
      })
      .then((nextSchedule) => {
        if (!active) return;
        setSchedule(nextSchedule);
        setScheduleDate(selectedDate);
        const openKeys = new Set(
          nextSchedule.flatMap((court) =>
            court.slots
              .filter((slot) => slot.status !== "unavailable")
              .map((slot) => selectionKey(court.courtId, slot.hour)),
          ),
        );
        if (!bookingOwnsSelectionRef.current) {
          dispatchSelection({ type: "retain-open", openKeys });
        }
        setAvailabilityState("ready");
      })
      .catch(() => {
        if (!active) return;
        setSchedule([]);
        setScheduleDate(selectedDate);
        setAvailabilityState("error");
      });

    return () => {
      active = false;
    };
  }, [adapter, availabilityBootstrapState, availabilityRetry, isBookingPage, isLive, selectedDate]);

  useEffect(() => {
    if (!pendingBooking) bookingAttemptIdRef.current = "";
  }, [pendingBooking, selectedDate, selectedSlots]);

  function scrollToBooking() {
    window.setTimeout(
      () => bookingSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      0,
    );
  }

  function openBooking(courtId?: string) {
    if (courtId) chooseCourt(courtId);
    setMode("book");
    setMobileNavOpen(false);
    scrollToBooking();
  }

  function openManage() {
    setMode("manage");
    setMobileNavOpen(false);
    scrollToBooking();
  }

  function chooseCourt(courtId: string) {
    setSelectedCourtId(courtId);
  }

  function chooseSlot(court: Court, slot: AvailabilitySlot) {
    if (slot.status === "unavailable") return;
    const publicCourt = bootstrap?.courts.find((candidate) => candidate.id === court.id);
    const pricingConfig = publicCourt?.pricingConfig as
      | { regular?: { maximumHours?: number } }
      | undefined;
    const configuredMaximum = pricingConfig?.regular?.maximumHours;
    const singleRunMaximumHours =
      isLive && typeof configuredMaximum === "number" && Number.isFinite(configuredMaximum)
        ? Math.min(18, Math.max(1, Math.floor(configuredMaximum)))
        : isLive
          ? 18
          : undefined;
    dispatchSelection({
      type: "toggle",
      item: {
        courtId: court.id,
        startHour: slot.hour,
        durationHours: 1,
        amount: slot.price,
      },
      courtName: court.name,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      restrictToSingleRun: isLive && !atomicMultiSessionBooking,
      maximumTotalHours: isLive && atomicMultiSessionBooking ? 18 : undefined,
      singleRunMaximumHours:
        isLive && !atomicMultiSessionBooking ? singleRunMaximumHours : undefined,
    });
  }

  function clearSelection() {
    dispatchSelection({ type: "clear" });
  }

  function chooseDate(date: string) {
    if (date === selectedDate) return;
    const nextDate = dates.find((candidate) => candidate.iso === date);
    const resetMessage = selectedSlots.length
      ? `${nextDate?.long ?? date} selected. Your previous court-hours were cleared.`
      : `${nextDate?.long ?? date} selected.`;
    if (selectedSlots.length) {
      dispatchSelection({ type: "clear", announcement: resetMessage });
    } else {
      setLiveMessage(resetMessage);
    }
    setSchedule([]);
    setScheduleDate("");
    setAvailabilityState("loading");
    setSelectedDate(date);
  }

  function validateDetails() {
    const errors: Partial<Record<keyof CustomerDetails, string>> = {};
    if (customer.fullName.trim().length < 2) errors.fullName = "Enter your full name.";
    if (!/^\S+@\S+\.\S+$/.test(customer.email)) errors.email = "Enter a valid email address.";
    if (!/^(\+?63|0)[\d\s-]{9,}$/.test(customer.phone)) {
      errors.phone = "Enter a valid Philippine mobile number.";
    }
    setDetailErrors(errors);
    const firstInvalidField = (["name", "email", "phone"] as const).find((field) => {
      if (field === "name") return Boolean(errors.fullName);
      return Boolean(errors[field]);
    });
    if (firstInvalidField) {
      window.requestAnimationFrame(() => document.getElementById(`${formId}-${firstInvalidField}`)?.focus());
    }
    return Object.keys(errors).length === 0;
  }

  async function submitDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await completeHeldBookingDetails();
  }

  async function createSelectionHold() {
    setPaymentError("");
    if (bootstrapState === "error") {
      setPaymentError("Booking setup could not be loaded. Refresh the page before trying again.");
      return;
    }
    if (isLive && !bootstrap?.readiness.publicBookingEnabled) {
      setPaymentError("Online booking is not active for this venue yet.");
      return;
    }
    if (isLive && !paymentMethod) {
      setPaymentError("A live payment method has not been published yet.");
      return;
    }
    if (isLive && !policyVersion) {
      setPaymentError("The current booking policy has not been published yet.");
      return;
    }
    if (!selectedSlots.length) {
      setStep(1);
      return;
    }
    if (isLive && !liveSelectionSupported) {
      setPaymentError(
        atomicMultiSessionBooking
          ? "Check the minimum and maximum hours for each selected court session."
          : "Live group checkout is not active yet. Choose adjacent hours on one court; no partial reservation will be created.",
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const clientRequestId = bookingAttemptIdRef.current || crypto.randomUUID();
      bookingAttemptIdRef.current = clientRequestId;
      const primary = canonicalSelection ?? {
        courtId: selectedSlots[0].courtId,
        startHour: selectedSlots[0].startHour,
        durationHours: 1,
      };
      const booking = await adapter.createHold({
        tenantSlug: "pickpoint-pickleclub",
        date: selectedDate,
        courtId: primary.courtId,
        startHour: primary.startHour,
        durationHours: primary.durationHours,
        amount: total,
        items: selectedSlots,
        customer,
        policyAccepted: true,
        policyVersion: isLive ? policyVersion : "pickpoint-pickleclub-provisional-v1",
        clientRequestId,
        atomicMultiSessionBooking,
        detailsPending: true,
      });
      bookingOwnsSelectionRef.current = true;
      setPendingBooking(booking);
      setHoldNow(Date.now());
      setStep(2);
      setLiveMessage(
        isLive
          ? `Booking ${booking.reference} is held. Add player details before the timer expires.`
          : `Preview hold ${booking.reference} was created. No real court is reserved.`,
      );
    } catch (error) {
      setPaymentError(
        error instanceof Error
          ? error.message
          : "The slot could not be reserved. Refresh availability and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function completeHeldBookingDetails() {
    setPaymentError("");
    if (!validateDetails()) return;
    if (!acceptedPolicy) {
      setPaymentError("Accept the booking and cancellation rules before continuing to payment.");
      window.requestAnimationFrame(() => document.getElementById(`${formId}-policy`)?.focus());
      return;
    }
    if (!pendingBooking) {
      setPaymentError("This court is not held yet. Return to the schedule and choose Hold & continue.");
      return;
    }
    if (holdExpired) {
      setPaymentError("This hold has expired or been released. Choose a new time.");
      return;
    }

    setIsSubmitting(true);
    try {
      const booking = await adapter.completeDetails({
        booking: pendingBooking,
        customer,
      });
      setPendingBooking(booking);
      setStep(3);
      setLiveMessage(
        isLive
          ? `Player details saved for held booking ${booking.reference}.`
          : `Preview player details saved for ${booking.reference}.`,
      );
    } catch (error) {
      setPaymentError(
        error instanceof Error
          ? error.message
          : "Player details could not be saved. Try again before the hold expires.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPaymentError("");
    if (!pendingBooking) {
      setPaymentError("Reserve the slot before sending payment.");
      return;
    }
    if (holdExpired) {
      setPaymentError("This hold has expired or been released. Choose a new time.");
      return;
    }
    if (!heldPaymentReady) {
      setPaymentError(
        "Live payment setup is unavailable. Payment remains disabled; cancel this hold or try again before it expires.",
      );
      return;
    }
    if (paymentReference.trim().length < 6) {
      setPaymentError(
        isLive
          ? `Enter the reference number from your ${paymentLabel} receipt.`
          : "Enter a sample reference number to continue the preview. Do not send money.",
      );
      return;
    }
    if (!receiptFileName || !receiptFile) {
      setPaymentError(
        isLive
          ? "Upload a JPG, PNG, or WebP copy of your payment receipt."
          : "Choose a sample JPG, PNG, or WebP image. No real receipt or payment is required.",
      );
      return;
    }
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(receiptFile.type) ||
      receiptFile.size > 2 * 1024 * 1024
    ) {
      setPaymentError("Choose a JPG, PNG, or WebP receipt no larger than 2 MB.");
      return;
    }

    setIsSubmitting(true);
    try {
      const booking = await adapter.submitPayment({
        booking: pendingBooking,
        paymentReference: paymentReference.trim(),
        receiptFileName,
        receiptFile,
        paymentMethod: paymentMethodCode,
        clientRequestId: bookingAttemptIdRef.current,
      });
      setConfirmedBooking(booking);
      setPendingBooking(null);
      setStep(4);
      setLiveMessage(
        !isLive
          ? `Preview checkout ${booking.reference} is complete. No payment was sent.`
          : booking.status === "confirmed"
            ? `Booking ${booking.reference} is confirmed.`
            : `Payment for booking ${booking.reference} has been received for review.`,
      );
    } catch (error) {
      setPaymentError(
        error instanceof Error
          ? error.message
          : isLive
            ? "Payment could not be submitted. Your slot has not been charged."
            : "The preview could not be completed. No reservation or payment was created.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function addConfirmationToCalendar() {
    if (!confirmedBooking || confirmedBooking.status !== "confirmed") return;
    const sessions = confirmedBooking.items?.length ? confirmedBooking.items : selectedSlots;
    const earliestHour = sessions.length
      ? Math.min(...sessions.map((item) => item.startHour))
      : confirmedBooking.startHour;
    const latestHour = sessions.length
      ? Math.max(...sessions.map((item) => item.startHour + item.durationHours))
      : confirmedBooking.startHour + confirmedBooking.durationHours;
    const calendarDate = confirmedBooking.date.replaceAll("-", "");
    const courtNames = Array.from(new Set(selectedSlotDetails.map((item) => item.court.name))).join(", ") || "PickPoint court";
    const escapeCalendar = (value: string) => value.replaceAll("\\", "\\\\").replaceAll(",", "\\,").replaceAll(";", "\\;").replaceAll("\n", "\\n");
    const calendar = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//PickPoint//Court Booking//EN",
      "BEGIN:VEVENT",
      `UID:${escapeCalendar(confirmedBooking.reference)}@pickpoint-pickleclub.boothsandbeyondoffic.chatgpt.site`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`,
      `DTSTART;TZID=Asia/Manila:${calendarDate}T${String(earliestHour).padStart(2, "0")}0000`,
      `DTEND;TZID=Asia/Manila:${calendarDate}T${String(latestHour).padStart(2, "0")}0000`,
      `SUMMARY:${escapeCalendar(`Pickleball at PickPoint · ${courtNames}`)}`,
      `DESCRIPTION:${escapeCalendar(`Booking reference: ${confirmedBooking.reference}`)}`,
      `LOCATION:${escapeCalendar(bootstrap?.tenant.locationLabel || "PickPoint Court Hub")}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([calendar], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `pickpoint-pickleclub-${confirmedBooking.reference.toLowerCase()}.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function shareConfirmation() {
    if (!confirmedBooking) return;
    const shareText = `PickPoint booking ${confirmedBooking.reference} · ${selectedBookingDateLabel || confirmedBooking.date} · ${selectedCourtCount} court${selectedCourtCount === 1 ? "" : "s"}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "PickPoint court booking", text: shareText, url: window.location.origin + "/book" });
      } else {
        await navigator.clipboard?.writeText(`${shareText}\n${window.location.origin}/book`);
        setLiveMessage("Booking details copied. Share them with your players.");
      }
    } catch {
      // Closing the native share sheet should leave the confirmation unchanged.
    }
  }

  function clearHoldForReselection(message: string) {
    try {
      sessionStorage.removeItem("pickpoint-pickleclub:active-hold");
      if (bookingAttemptIdRef.current) {
        sessionStorage.removeItem(
          `pickpoint-pickleclub:pending:${bookingAttemptIdRef.current}`,
        );
      }
    } catch {
      // The UI can still recover when browser storage is unavailable.
    }
    bookingOwnsSelectionRef.current = false;
    setPendingBooking(null);
    setConfirmedBooking(null);
    dispatchSelection({ type: "clear", announcement: message });
    setPaymentReference("");
    setReceiptFileName("");
    setReceiptFile(null);
    setPaymentError("");
    setAcceptedPolicy(false);
    bookingAttemptIdRef.current = "";
    setStep(1);
    scrollToBooking();
  }

  async function cancelCurrentHold() {
    if (!pendingBooking) return;
    if (holdExpired) {
      setIsSubmitting(true);
      if (pendingBooking.status === "pending_payment") {
        try {
          await adapter.cancelBooking(
            pendingBooking.reference,
            "hold-expired-customer-reselected",
          );
        } catch {
          // Expiry remains authoritative even when the best-effort release fails.
        }
      }
      clearHoldForReselection(
        "The unavailable hold was cleared. Choose a new time.",
      );
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(true);
    setPaymentError("");
    try {
      const cancelled = await adapter.cancelBooking(
        pendingBooking.reference,
        "customer-reselected",
      );
      clearHoldForReselection(
        isLive
          ? `Booking ${cancelled.reference} was cancelled and the court was released.`
          : `Preview hold ${cancelled.reference} was cleared. No real court was reserved.`,
      );
    } catch (error) {
      setPaymentError(
        error instanceof Error
          ? error.message
          : "The hold could not be cancelled. Try again before choosing another time.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function resetBooking() {
    bookingOwnsSelectionRef.current = false;
    setStep(1);
    dispatchSelection({ type: "clear", announcement: "Ready for another booking." });
    setPaymentReference("");
    setReceiptFileName("");
    setReceiptFile(null);
    setPaymentError("");
    setPendingBooking(null);
    setConfirmedBooking(null);
    setAcceptedPolicy(false);
    bookingAttemptIdRef.current = "";
    scrollToBooking();
  }

  async function lookupBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lookupReference.trim() || !/^\S+@\S+\.\S+$/.test(lookupEmail)) {
      setLookupState("error");
      return;
    }

    setLookupState("loading");
    setManagedBooking(null);
    setShowCancel(false);
    setShowRescheduleHelp(false);
    setCancelState("idle");
    try {
      const result = await adapter.findBooking(lookupReference, lookupEmail);
      setManagedBooking(result);
      setLookupState(result ? "found" : "empty");
    } catch {
      setLookupState("error");
    }
  }

  async function confirmCancel() {
    if (!managedBooking || managedBooking.status !== "pending_payment" || !cancelReason) return;
    setCancelState("loading");
    try {
      const cancelled = await adapter.cancelBooking(managedBooking.reference, cancelReason);
      setManagedBooking(cancelled);
      setCancelState("success");
      setShowCancel(false);
      setLiveMessage(`Booking ${cancelled.reference} has been cancelled.`);
    } catch {
      setCancelState("error");
    }
  }

  const stepLabels = ["Courts", "Details", "Payment"];
  const confirmationApproved = confirmedBooking?.status === "confirmed";
  const confirmationNeedsAttention = confirmedBooking?.paymentReviewState === "short_payment" || confirmedBooking?.paymentReviewState === "rejected";
  const confirmationTone = !isLive
    ? "is-preview"
    : confirmationApproved
      ? "is-approved"
      : confirmationNeedsAttention
        ? "is-attention"
        : "is-pending";
  const confirmationCourtNames = Array.from(new Set(selectedSlotDetails.map((item) => item.court.name))).join(", ") || "Court details pending";
  const confirmationEarliestHour = selectedSlots.length ? Math.min(...selectedSlots.map((item) => item.startHour)) : confirmedBooking?.startHour ?? 0;
  const confirmationLatestHour = selectedSlots.length ? Math.max(...selectedSlots.map((item) => item.startHour + item.durationHours)) : (confirmedBooking?.startHour ?? 0) + (confirmedBooking?.durationHours ?? 1);
  const confirmationTimeLabel = selectedSlots.length ? formatHourRange(confirmationEarliestHour, confirmationLatestHour) : "Time in booking record";
  const gallerySection = (
    <section className="club-gallery section-pad" id="gallery" aria-labelledby="gallery-heading">
      <div className="site-container">
        <div className="gallery-heading">
          <div>
            <p className="eyebrow eyebrow-dark">Court gallery</p>
            <h2 id="gallery-heading">See the space before you play.</h2>
          </div>
          <p>Fresh photos published by the PickPoint team.</p>
        </div>

        {galleryPhotos.length ? (
          <div
            className={`gallery-grid${galleryPhotos.length === 5 ? " is-bento" : ""}`}
            aria-label="PickPoint court gallery"
            role="region"
            tabIndex={0}
          >
            {galleryPhotos.map((photo) => (
              <figure className="gallery-card" key={photo.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.src}
                  alt={photo.alt}
                  width={1200}
                  height={900}
                  loading="lazy"
                  decoding="async"
                />
                <figcaption>{photo.caption}</figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <div className="gallery-empty">
            <div className="gallery-empty-frames" aria-hidden="true">
              <span>01</span><span>02</span><span>+</span>
            </div>
            <div>
              <p className="eyebrow eyebrow-dark">Gallery ready</p>
              <h3>Court photos are coming soon.</h3>
              <p>Fresh court photos will appear here after the PickPoint team publishes them.</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );

  return (
    <div className={`pickpoint-pickleclub-site${isBookingPage ? " booking-route" : ""}${isBookingPage && mode === "book" ? " booking-new-route rallyos-player-shell player-mode" : ""}`}>
      {isBookingPage ? (
        <div className="preview-ribbon" role="status">
          <strong>{isLive ? "Live booking" : "Setup preview"}</strong>
          <span>{isLive ? "Court availability and payments are connected." : "No live reservations or payments are created."}</span>
        </div>
      ) : !isLive && (
        <div className="preview-ribbon" role="status">
          <strong>Setup preview</strong><span>No live reservations or payments are created.</span>
        </div>
      )}
      {isBookingPage && (
        <header className={`booking-app-header ${!isLive ? "has-preview-ribbon" : ""}`}>
          <div className="booking-app-mobile-bar">
            <button
              className="booking-app-menu-button"
              type="button"
              aria-expanded={mobileNavOpen}
              aria-controls="primary-navigation"
              aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
              onClick={() => setMobileNavOpen((open) => !open)}
            >
              <span className="menu-lines" aria-hidden="true" />
            </button>
            <strong>Book a court</strong>
          </div>
          <div className="booking-app-desktop-bar">
            <div className="booking-app-title">
              <small>PickPoint Court Hub</small>
              <strong>Book a court</strong>
            </div>
            <div className="booking-app-actions">
              <label className="booking-app-search">
                <span aria-hidden="true">⌕</span>
                <input type="search" placeholder="Search bookings and players" aria-label="Search bookings and players" />
                <kbd>⌘ K</kbd>
              </label>
              <Link className="booking-app-notification" href="/book?mode=manage" aria-label="Manage booking notifications">♧<b>2</b></Link>
            </div>
          </div>
          <nav
            id="primary-navigation"
            className={`primary-nav booking-app-navigation ${mobileNavOpen ? "is-open" : ""}`}
            aria-label="Primary navigation"
          >
            <Link href="/" onClick={() => setMobileNavOpen(false)}>Home</Link>
            <Link href="/courts" onClick={() => setMobileNavOpen(false)}>Courts</Link>
            <Link href="/book" aria-current={mode === "book" ? "page" : undefined} onClick={() => setMobileNavOpen(false)}>New booking</Link>
            <Link href="/book?mode=manage" aria-current={mode === "manage" ? "page" : undefined} onClick={() => setMobileNavOpen(false)}>Manage booking</Link>
          </nav>
        </header>
      )}
      {!isBookingPage && <header className={`site-header ${!isLive ? "has-preview-ribbon" : ""}`}>
        <div className="site-container header-inner">
          <Link className="wordmark" href="/" aria-label="PickPoint home">
            <Image
              className="brand-logo"
              src="/pickpoint-pickleclub-logo.png"
              alt=""
              width={2046}
              height={769}
              sizes="(max-width: 390px) 128px, (max-width: 779px) 132px, 164px"
              unoptimized
              priority
            />
          </Link>
          <button
            className="menu-button"
            type="button"
            aria-expanded={mobileNavOpen}
            aria-controls="primary-navigation"
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            <span className="menu-lines" aria-hidden="true" />
            <span>{mobileNavOpen ? "Close" : "Menu"}</span>
          </button>
          <nav
            id="primary-navigation"
            className={`primary-nav ${mobileNavOpen ? "is-open" : ""}`}
            aria-label="Primary navigation"
          >
            <Link href="/" aria-current={isHome ? "page" : undefined} onClick={() => setMobileNavOpen(false)}>
              Home
            </Link>
            <Link href="/courts" aria-current={isCourtsPage ? "page" : undefined} onClick={() => setMobileNavOpen(false)}>
              Courts
            </Link>
            {isHome ? (
              <a href="#how-it-works" onClick={() => setMobileNavOpen(false)}>
                How it works
              </a>
            ) : (
              <Link href="/#how-it-works" onClick={() => setMobileNavOpen(false)}>
                How it works
              </Link>
            )}
            <Link
              className="nav-text-button"
              href="/book?mode=manage"
              aria-current={isBookingPage && mode === "manage" ? "page" : undefined}
              onClick={() => setMobileNavOpen(false)}
            >
              Manage booking
            </Link>
            <Link className="button button-small button-lime" href="/book" onClick={() => setMobileNavOpen(false)}>
              Book a court <span aria-hidden="true">↗</span>
            </Link>
          </nav>
        </div>
      </header>}

      <main id="main-content" className={isHome ? undefined : isBookingPage && mode === "book" ? "route-main rallyos-main-content" : "route-main"}>
        {isHome && <section className="hero" id="top">
          <div className="hero-grid site-container">
            <div className="hero-copy">
              <p className="eyebrow hero-eyebrow"><span aria-hidden="true">●</span><span>Welcome to your next favorite habit</span></p>
              <h1>
                Your next rally
                <span>starts here.</span>
              </h1>
              <p className="hero-lede">
                Good games should be easy to find. Pick your court, lock in an hour,
                and meet your crew on the bright side of the net.
              </p>
              <div className="hero-actions">
                <Link className="button button-lime button-large" href="/book">
                  Book a court <span aria-hidden="true">→</span>
                </Link>
                <a className="text-link" href="#how-it-works">
                  How booking works <span aria-hidden="true">↓</span>
                </a>
              </div>
              <ul className="hero-proof" aria-label="Booking highlights">
                <li><strong>{displayCourts.length}</strong><span>{isLive ? "bookable courts" : "preview courts"}</span></li>
                <li><strong>{startingHourlyRate === null ? "Rates soon" : `From ${peso(startingHourlyRate)}`}</strong><span>per court-hour</span></li>
                <li><strong>24/7</strong><span>live availability</span></li>
              </ul>
            </div>

            <div className="hero-visual" aria-hidden="true">
              <div className="court-art" aria-hidden="true">
                <div className="court-net" />
                <div className="court-service-line court-service-line-one" />
                <div className="court-service-line court-service-line-two" />
                <div className="court-center-line court-center-line-one" />
                <div className="court-center-line court-center-line-two" />
                <div className="court-player court-player-one" />
                <div className="court-player court-player-two" />
                <div className="court-ball" />
                <span className="court-label court-label-one">DINK</span>
                <span className="court-label court-label-two">TOPIA</span>
              </div>
              <div className="score-card">
                <div><span>COURT</span><strong>01</strong></div>
                <div><span>NEXT OPEN</span><strong>07:00</strong></div>
                <span className="score-live"><i aria-hidden="true" /> LIVE</span>
              </div>
              <div className="floating-note">
                <span className="floating-note-icon" aria-hidden="true">↗</span>
                <p><strong>One tap closer</strong><br />to your next game</p>
              </div>
            </div>
          </div>
          <div className="ticker">
            <p id={`${formId}-ticker-copy`} className="sr-only">
              Play more. Rally often. Stay focused. New habit.
            </p>
            <input
              id={`${formId}-ticker-motion`}
              className="ticker-motion-toggle sr-only"
              type="checkbox"
              aria-label="Pause or resume moving club phrases"
            />
            <label className="ticker-viewport" htmlFor={`${formId}-ticker-motion`}>
              <span className="ticker-track" aria-hidden="true">
                {[0, 1].map((copy) => (
                  <span
                    className={`ticker-group${copy === 1 ? " ticker-group-clone" : ""}`}
                    key={copy}
                  >
                    {tickerPhrases.map((phrase) => (
                      <span key={`${copy}-${phrase}`}>
                        <strong>{phrase}</strong><i aria-hidden="true">◆</i>
                      </span>
                    ))}
                  </span>
                ))}
              </span>
            </label>
          </div>
        </section>}

        {isHome && gallerySection}

        {isCourtsPage && <section className="court-discovery section-pad" id="courts">
          <div className="site-container">
            <div className="section-heading">
              <div>
                <p className="eyebrow eyebrow-dark">Pick your playground</p>
                <h1>Choose your court.<br />Start your rally.</h1>
              </div>
              <p>
                {isLive && bootstrapState !== "ready"
                  ? "Loading configured courts."
                  : `${isLive ? `${courtDirectoryCourts.length} configured courts` : `${previewCourts.length} dedicated preview courts`}, designed for quick games, long rallies, and the happy blur in between.`}
              </p>
            </div>
            {isLive && bootstrapState !== "ready" ? (
              <div
                className="setup-unavailable-card"
                role={bootstrapState === "loading" ? "status" : "alert"}
              >
                <span
                  className={bootstrapState === "loading" ? "spinner" : "setup-unavailable-symbol"}
                  aria-hidden="true"
                >
                  {bootstrapState === "loading" ? "" : "!"}
                </span>
                <div>
                  <p className="eyebrow eyebrow-dark">
                    {bootstrapState === "loading" ? "Checking court setup" : "Courts unavailable"}
                  </p>
                  <h3>
                    {bootstrapState === "loading"
                      ? "Loading the court directory…"
                      : "The verified court list could not be loaded."}
                  </h3>
                  <p>
                    {bootstrapState === "loading"
                      ? "We’ll show booking links after the PickPoint courts are verified."
                      : "Please refresh before choosing a court. Preview links stay hidden in live mode."}
                  </p>
                </div>
              </div>
            ) : courtDirectoryCourts.length ? (
              <div className="court-card-grid">
                {courtDirectoryCourts.map((court) => (
                  <article className={`court-card court-card-${court.color}`} key={court.id}>
                    <div className="court-card-topline">
                      <span>COURT {court.number}</span>
                      <span className="court-status"><i aria-hidden="true" /> {isLive ? "Published court" : "Booking preview"}</span>
                    </div>
                    <div className="mini-court" aria-hidden="true">
                      <span className="mini-court-number">{court.number}</span>
                      <i className="mini-court-line-one" />
                      <i className="mini-court-line-two" />
                      <i className="mini-court-net" />
                    </div>
                    <div className="court-card-copy">
                      <p>{court.descriptor}</p>
                      <h3>{court.name}</h3>
                      <div className="court-card-meta">
                        <span>{court.mood}</span>
                        <span>From ₱300 / hour</span>
                      </div>
                      <Link
                        className="button court-button"
                        href={`/book?court=${encodeURIComponent(court.slug)}`}
                        aria-label={`See times for Court ${court.number}`}
                      >
                        See times <span aria-hidden="true">→</span>
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="setup-unavailable-card" role="status">
                <span className="setup-unavailable-symbol" aria-hidden="true">!</span>
                <div>
                  <p className="eyebrow eyebrow-dark">No published courts</p>
                  <h3>Court booking is not open yet.</h3>
                  <p>The PickPoint team will publish bookable courts here when setup is complete.</p>
                </div>
              </div>
            )}
          </div>
        </section>}

        {isHome && <section className="how-section section-pad" id="how-it-works">
          <div className="site-container how-grid">
            <div className="how-intro">
              <p className="eyebrow">No back-and-forth</p>
              <h2>From “game?” to booked.</h2>
              <p>Everything you need, nothing that slows down the rally.</p>
            </div>
            <ol className="how-list">
              <li><span>01</span><div><h3>Build your court plan</h3><p>See every active court and select exact court-hours.</p></div></li>
              <li><span>02</span><div><h3>Bring your crew</h3><p>Book one to three whole hours, up to 30 days ahead.</p></div></li>
              <li><span>03</span><div><h3>Pay, then play</h3><p>Send your GCash receipt and get a booking reference.</p></div></li>
            </ol>
          </div>
        </section>}

        {isBookingPage && <section className="booking-zone section-pad" id="book" ref={bookingSectionRef}>
          <div className="site-container booking-container">
            <div className="booking-zone-heading">
              <div className="booking-zone-title">
                <p className="eyebrow eyebrow-dark">Make your move</p>
                <h1>{mode === "book" ? "Book a court" : "Manage your booking"}</h1>
              </div>
              <nav className="mode-switch" aria-label="Booking actions">
                <Link
                  href="/book"
                  className={mode === "book" ? "is-active" : ""}
                  aria-current={mode === "book" ? "page" : undefined}
                >
                  New booking
                </Link>
                <Link
                  href="/book?mode=manage"
                  className={mode === "manage" ? "is-active" : ""}
                  aria-current={mode === "manage" ? "page" : undefined}
                >
                  Manage
                </Link>
              </nav>
            </div>

            {mode === "book" && step === 1 && (
              <div className="booking-venue-hero player-hero player-hero-image" aria-label="PickPoint Court Hub booking">
                <div className="booking-venue-hero-copy">
                  <span className="booking-venue-mark" aria-hidden="true">DT</span>
                  <div>
                    <p>Book direct</p>
                    <h2>Book court time in seconds.</h2>
                    <span>Tap any open slot. Choose as many courts and times as you need, then check out once.</span>
                  </div>
                </div>
                <span className="booking-venue-location">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>
                  PickPoint Court Hub
                </span>
              </div>
            )}

            {mode === "book" && isLive && !liveBookingReady ? (
              <div className="setup-unavailable-card" role={bootstrapState === "loading" ? "status" : "alert"}>
                <span className={bootstrapState === "loading" ? "spinner" : "setup-unavailable-symbol"} aria-hidden="true">{bootstrapState === "loading" ? "" : "!"}</span>
                <div>
                  <p className="eyebrow eyebrow-dark">{bootstrapState === "loading" ? "Checking venue setup" : "Online booking unavailable"}</p>
                  <h3>{bootstrapState === "loading" ? "Loading the court board…" : "The clubhouse is still getting ready."}</h3>
                  <p>{bootstrapState === "loading" ? "We’re confirming courts, policies, payment, and security." : "No payment instructions are shown until the venue, published policy, payment method, and security check are all active."}</p>
                </div>
                {bootstrapState !== "loading" && <Link className="button button-outline" href="/courts">Explore the preview courts</Link>}
              </div>
            ) : mode === "book" ? (
              <div className="booking-shell">
                {step === 2 && (
                  <div className="booking-compact-title">
                    <button className="back-link" type="button" disabled={isSubmitting} onClick={() => void cancelCurrentHold()}>
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
                      Back
                    </button>
                    <div>
                      <p className="player-kicker">Almost yours</p>
                      <h2>Who&apos;s playing?</h2>
                    </div>
                  </div>
                )}
                {step === 3 && (
                  <div className="booking-compact-title">
                    <button className="back-link" type="button" disabled={isSubmitting} onClick={() => setStep(2)}>
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
                      Back
                    </button>
                    <div>
                      <p className="player-kicker">Secure checkout</p>
                      <h2>Pay with {paymentLabel}</h2>
                    </div>
                  </div>
                )}
                {step < 4 && (
                  <>
                    <p className="booking-step-summary">
                      <span>{step} of {stepLabels.length} ·</span>
                      <strong>{stepLabels[step - 1]}</strong>
                    </p>
                    <ol className="booking-progress" aria-label="Booking progress">
                      {stepLabels.map((label, index) => {
                        const number = index + 1;
                        const state = number === step ? "current" : number < step ? "complete" : "upcoming";
                        return (
                          <li key={label} className={`is-${state}${state === "current" ? " active" : state === "complete" ? " complete" : ""}`} aria-current={number === step ? "step" : undefined}>
                            <span>{number < step ? "✓" : number}</span>
                            <small>{label}</small>
                          </li>
                        );
                      })}
                    </ol>
                  </>
                )}

                {step === 1 && (
                  <div className="booking-layout booking-slot-step">
                    <div className={`booking-main-card booking-selection-card booking-stage surface-card${selectedSlots.length ? " has-mobile-selection" : ""}`}>
                      <div className="booking-card-heading booking-choice-heading stage-heading">
                        <span className="step-chip">01</span>
                        <div><p className="booking-card-kicker">Court booking</p><h3>Choose your slots</h3></div>
                      </div>

                      <fieldset className="booking-fieldset field-group">
                        <legend className="sr-only">Select a date</legend>
                        <div className="booking-field-label field-group-label"><strong>Select a date</strong><span>Next 6 days</span></div>
                        <div className="date-rail date-strip" role="radiogroup" aria-label="Select a booking date">
                          {dates.slice(1, 7).map((date, index) => (
                            <button
                              type="button"
                              key={date.iso}
                              className={`date-option ${selectedDate === date.iso ? "is-selected selected" : ""}`}
                              role="radio"
                              aria-checked={selectedDate === date.iso}
                              aria-label={date.long}
                              onClick={() => chooseDate(date.iso)}
                            >
                              <span>{index === 0 ? "Tomorrow" : date.day}</span>
                              <strong>{date.date}</strong>
                              <small>{date.month}</small>
                            </button>
                          ))}
                        </div>
                        {selectedSlots.length > 0 && <p className="date-selection-note">Changing the date clears your selected court-hours.</p>}
                      </fieldset>

                      <fieldset className={`booking-fieldset availability-fieldset field-group availability-section${selectedSlots.length ? "" : " waiting"}`}>
                        <legend className="sr-only">Choose court-hours</legend>
                        <div className="schedule-heading-row field-group-label availability-heading">
                          <div className="schedule-title-group">
                            <h4>{visibleAvailabilityState === "loading" ? "Refreshing times" : visibleAvailabilityState === "error" ? "Schedule needs a retry" : "Court schedule"}</h4>
                            <p className="schedule-help">
                              Tap an open slot to select it. Tap again to remove.
                            </p>
                          </div>
                          <div
                            className="schedule-selection-count"
                            role="status"
                            aria-live="polite"
                            aria-label={`${selectedSlots.length} court-hour${selectedSlots.length === 1 ? "" : "s"} selected`}
                          >
                            {selectedSlots.length
                              ? `${selectedSlots.length} slot${selectedSlots.length === 1 ? "" : "s"} · ${peso(courtSubtotal)}`
                              : "No slots selected"}
                          </div>
                        </div>
                        <div className="availability-legend-row">
                          <div className="slot-legend availability-legend" aria-label="Availability legend">
                            <span><i className="legend-open" />Open</span>
                            <span><i className="legend-booked" />Booked</span>
                            <span><i className="legend-selected" />Your selection</span>
                          </div>
                        </div>

                        {visibleAvailabilityState === "loading" && (
                          <div className="availability-loading" role="status" aria-live="polite">
                            <span className="spinner" aria-hidden="true" />
                            <div><strong>Checking the court board…</strong><small>Looking for open whole-hour slots.</small></div>
                          </div>
                        )}

                        {visibleAvailabilityState === "error" && (
                          <div className="state-card state-error" role="alert">
                            <span className="state-symbol" aria-hidden="true">!</span>
                            <div><h4>The schedule took a timeout.</h4><p>Your choices are still here. Try loading availability again.</p></div>
                            <button className="button button-outline" type="button" onClick={() => setAvailabilityRetry((value) => value + 1)}>Try again</button>
                          </div>
                        )}

                        {visibleAvailabilityState === "ready" && displayCourts.length > 0 && availableCount === 0 && (
                          <div className="state-card state-empty" role="status">
                            <span className="state-symbol" aria-hidden="true">0</span>
                            <div><h4>This day is rally-packed.</h4><p>No court-hours are open. Try the next date.</p></div>
                            <button
                              className="button button-outline"
                              type="button"
                              onClick={() => {
                                const currentIndex = dates.findIndex((date) => date.iso === selectedDate);
                                chooseDate(dates[Math.min(currentIndex + 1, dates.length - 1)].iso);
                              }}
                            >
                              Check next day
                            </button>
                          </div>
                        )}

                        {visibleAvailabilityState === "ready" && displayCourts.length === 0 && (
                          <div className="state-card state-empty" role="status">
                            <span className="state-symbol" aria-hidden="true">0</span>
                            <div><h4>No courts are published yet.</h4><p>The venue owner can add and activate courts in system settings.</p></div>
                          </div>
                        )}

                        {visibleAvailabilityState === "ready" && availableCount > 0 && displayCourts.length > 0 && (
                          <div className="rally-availability-board">
                            <div
                              className="availability-scroll"
                              role="region"
                              aria-label={`All courts hourly availability for ${selectedBaseDateLabel}. Scroll horizontally to see later times.`}
                              tabIndex={0}
                            >
                              <div className="availability-grid" style={{ "--slot-count": scheduleHours.length } as CSSProperties}>
                                <div className="availability-corner"><strong>All courts</strong><small>Hourly view</small></div>
                                {scheduleHours.map((hour) => (
                                  <div
                                    className={`availability-time${hour === 24 ? " schedule-next-day-divider" : ""}`}
                                    key={`time-${hour}`}
                                    aria-label={hour === 24 && selectedFollowingDate ? `Next day, ${longDateLabel(selectedFollowingDate)}` : undefined}
                                  >
                                    <strong>{formatHour(hour).replace(":00", "")}</strong>
                                    <small>{hour === 24 ? "NEXT DAY · " : "to "}{formatHour(hour + 1).replace(":00", "")}</small>
                                  </div>
                                ))}
                                {displayCourts.map((court) => {
                                  const courtSchedule = schedule.find((item) => item.courtId === court.id);
                                  const courtSelectionCount = selectedSlots.filter((item) => item.courtId === court.id).length;
                                  return (
                                    <Fragment key={court.id}>
                                      <div className="availability-court">
                                        <span className="court-number">{Number(court.number)}</span>
                                        <span><strong>{court.name}</strong><small>{compactCourtSurface(court)}</small></span>
                                        <em>{courtSelectionCount ? `${courtSelectionCount} selected` : ""}</em>
                                      </div>
                                      {scheduleHours.map((hour) => {
                                        const slot = courtSchedule?.slots.find((item) => item.hour === hour);
                                        const isSelected = selectedKeys.has(selectionKey(court.id, hour));
                                        const busy = !slot || slot.status === "unavailable";
                                        return (
                                          <button
                                            type="button"
                                            key={`${court.id}-${hour}`}
                                            className={`availability-cell${busy ? " busy" : isSelected ? " selected" : ""}`}
                                            aria-pressed={isSelected}
                                            disabled={busy}
                                            aria-label={`${court.name}, ${formatHourWithDay(hour)} to ${formatHourWithDay(hour + 1)}, ${busy ? "Booked" : isSelected ? "Selected, click to remove" : "Open, click to select"}`}
                                            onClick={() => slot && !busy && chooseSlot(court, slot)}
                                          ><span aria-hidden="true" /><small>{busy ? "Booked" : isSelected ? "Selected" : "Open"}</small></button>
                                        );
                                      })}
                                    </Fragment>
                                  );
                                })}
                              </div>
                            </div>
                            <div className="availability-mobile" role="region" aria-label="Mobile all-court availability">
                              <div
                                className="mobile-availability-grid"
                                style={{
                                  "--court-count": displayCourts.length,
                                  "--mobile-grid-min": `${80 + displayCourts.length * 58}px`,
                                } as CSSProperties}
                              >
                                <div className="mobile-availability-corner"><strong>Time</strong><small>Hourly</small></div>
                                {displayCourts.map((court) => (
                                  <div className="mobile-court-head" key={`head-${court.id}`} title={court.name}>
                                    <span>C{Number(court.number)}</span><small>{compactCourtSurface(court)}</small>
                                  </div>
                                ))}
                                {scheduleHours.map((hour) => (
                                  <Fragment key={`mobile-${hour}`}>
                                    <div className={`mobile-time-label${hour === 24 ? " schedule-next-day-divider" : ""}`}><strong>{formatHour(hour).replace(":00", "")}</strong><small>{hour === 24 ? "NEXT DAY · " : "to "}{formatHour(hour + 1).replace(":00", "")}</small></div>
                                    {displayCourts.map((court) => {
                                      const slot = schedule.find((item) => item.courtId === court.id)?.slots.find((item) => item.hour === hour);
                                      const isSelected = selectedKeys.has(selectionKey(court.id, hour));
                                      const busy = !slot || slot.status === "unavailable";
                                      return (
                                        <button
                                          type="button"
                                          key={`${court.id}-${hour}`}
                                          className={`availability-cell mobile-availability-cell${busy ? " busy" : isSelected ? " selected" : ""}`}
                                          aria-pressed={isSelected}
                                          disabled={busy}
                                          aria-label={`${court.name}, ${formatHourWithDay(hour)} to ${formatHourWithDay(hour + 1)}, ${busy ? "Booked" : isSelected ? "Selected, click to remove" : "Open, click to select"}`}
                                          onClick={() => slot && !busy && chooseSlot(court, slot)}
                                        ><span aria-hidden="true" /><small>{busy ? "Booked" : isSelected ? "Selected" : "Open"}</small></button>
                                      );
                                    })}
                                  </Fragment>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                        {isLive && selectedSlots.length > 0 && !liveSelectionSupported && (
                          <div className="schedule-live-guard" role="status">
                            <strong>{atomicMultiSessionBooking ? "Selection limit reached" : "Group checkout is being prepared"}</strong>
                            <p>{atomicMultiSessionBooking
                              ? "A booking can include up to 18 total court-hours."
                              : "Live checkout currently accepts adjacent hours on one court. We will never split this into partial reservations."}</p>
                          </div>
                        )}
                      </fieldset>

                      {step === 1 && paymentError && (
                        <div className="payment-error booking-selection-error" role="alert">
                          <span aria-hidden="true">!</span><div><strong>We couldn&apos;t hold your slots</strong><p>{paymentError}</p></div>
                        </div>
                      )}
                      <div className="slot-step-footer stage-footer booking-selection-footer" role="region" aria-label="Selected court-hours">
                        <div>
                          <strong><i aria-hidden="true">✓</i>{selectedSlots.length ? `${selectedSlots.length} slot${selectedSlots.length === 1 ? "" : "s"} selected` : "Select one or more open slots"}</strong>
                          {selectedSlots.length > 0 && <span>{selectedCourtCount} court{selectedCourtCount === 1 ? "" : "s"} · {peso(total)}</span>}
                        </div>
                        <button
                          className={`slot-clear-button${selectedSlots.length ? "" : " is-placeholder"}`}
                          type="button"
                          disabled={!selectedSlots.length}
                          aria-hidden={!selectedSlots.length}
                          tabIndex={selectedSlots.length ? 0 : -1}
                          onClick={clearSelection}
                        >Clear</button>
                        <button data-testid="booking-continue" className="button button-blue" type="button" disabled={isSubmitting || !selectedSlots.length || !liveSelectionSupported} onClick={() => void createSelectionHold()}>{isSubmitting ? <><span className="button-spinner" aria-hidden="true" /> Holding…</> : <>Hold &amp; continue{selectedSlots.length ? ` · ${peso(total)}` : ""} <span aria-hidden="true">→</span></>}</button>
                      </div>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="checkout-layout booking-details-view">
                    <form className="booking-main-card booking-details-form booking-stage surface-card guest-form" onSubmit={submitDetails} aria-busy={isSubmitting} noValidate>
                      <div className="booking-card-heading stage-heading">
                        <span className="step-chip">02</span>
                        <div><p className="player-kicker">Player details</p><h3>Tell us who to expect</h3></div>
                      </div>
                      {pendingBooking && (
                        <div className={`notice-banner ${holdExpired ? "" : "notice-success"}`} role={holdExpired ? "alert" : "status"}>
                          <div>
                            <strong>{holdExpired ? "Hold expired or released" : `Slots held · ${pendingBooking.reference}`}</strong>
                            <span>{holdExpired ? "Return to the schedule and choose another time." : holdRemainingSeconds == null ? "The server controls this hold window." : `Complete these details within ${formatHoldCountdown(holdRemainingSeconds)}.`}</span>
                          </div>
                        </div>
                      )}
                      <div className="form-grid player-form-grid">
                        <label className="player-field full">
                          <span>Full name</span>
                          <input
                            id={`${formId}-name`}
                            autoComplete="name"
                            value={customer.fullName}
                            aria-invalid={Boolean(detailErrors.fullName)}
                            aria-describedby={detailErrors.fullName ? fieldErrorId(formId, "name") : undefined}
                            onChange={(event) => setCustomer({ ...customer, fullName: event.target.value })}
                            placeholder="e.g. Gabriela Ramos"
                          />
                          {detailErrors.fullName && <span className="field-error" id={fieldErrorId(formId, "name")}>{detailErrors.fullName}</span>}
                        </label>
                        <label className="player-field">
                          <span>Mobile number</span>
                          <div className="phone-field">
                            <b>+63</b>
                            <input
                              id={`${formId}-phone`}
                              type="tel"
                              inputMode="tel"
                              autoComplete="tel"
                              value={customer.phone.replace(/^\+63\s?/, "").replace(/^0/, "")}
                              aria-invalid={Boolean(detailErrors.phone)}
                              aria-describedby={detailErrors.phone ? fieldErrorId(formId, "phone") : undefined}
                              onChange={(event) => setCustomer({ ...customer, phone: `+63 ${event.target.value}` })}
                              placeholder="917 123 4567"
                            />
                          </div>
                          {detailErrors.phone && <span className="field-error" id={fieldErrorId(formId, "phone")}>{detailErrors.phone}</span>}
                        </label>
                        <label className="player-field">
                          <span>Email address</span>
                          <input
                            id={`${formId}-email`}
                            type="email"
                            autoComplete="email"
                            value={customer.email}
                            aria-invalid={Boolean(detailErrors.email)}
                            aria-describedby={detailErrors.email ? fieldErrorId(formId, "email") : undefined}
                            onChange={(event) => setCustomer({ ...customer, email: event.target.value })}
                            placeholder="you@example.com"
                          />
                          {detailErrors.email && <span className="field-error" id={fieldErrorId(formId, "email")}>{detailErrors.email}</span>}
                        </label>
                        <label className="player-field full">
                          <span>Booking note <small>Optional</small></span>
                          <input name="note" placeholder="Celebration, coaching session, accessibility request…" />
                        </label>
                      </div>
                      <label className="check-row booking-updates-choice">
                        <input type="checkbox" checked={customer.updates} onChange={(event) => setCustomer({ ...customer, updates: event.target.checked })} />
                        <span><strong>Booking updates</strong><small>Receipts, court changes, and reminders.</small></span>
                      </label>
                      <div className="details-hold-gate">
                        <div className="policy-grid policy-grid-single">
                          <details className="policy-disclosure">
                            <summary><span aria-hidden="true">↺</span><strong>{policyTitle}</strong><small>View rules</small></summary>
                            <p><strong>Booking and cancellation</strong><br />{policyIntro}</p>
                            <p><strong>Rescheduling</strong><br />{policyContent}</p>
                          </details>
                        </div>
                        {isLive && !policyVersion && (
                          <div className="payment-error" role="alert">
                            <span aria-hidden="true">!</span><div><strong>Policy setup is incomplete</strong><p>New bookings stay unavailable until the venue publishes its current booking policy.</p></div>
                          </div>
                        )}
                        <label className={`check-row policy-check ${!acceptedPolicy ? "needs-check" : ""}`}>
                          <input id={`${formId}-policy`} type="checkbox" checked={acceptedPolicy} disabled={isLive && !policyVersion} onChange={(event) => setAcceptedPolicy(event.target.checked)} />
                          <span><strong>I agree to the booking and cancellation rules</strong><small>Required before payment.</small></span>
                        </label>
                        {paymentError && (
                          <div className="payment-error" role="alert">
                            <span aria-hidden="true">!</span><div><strong>We couldn&apos;t save your details</strong><p>{paymentError}</p></div>
                          </div>
                        )}
                      </div>
                      <div className="stage-footer form-footer">
                        <span>By continuing, you agree to the venue booking policy.</span>
                        <button
                          data-testid="hold-and-pay"
                          className="button button-blue"
                          type="submit"
                          disabled={isSubmitting || holdExpired || !acceptedPolicy || !liveSelectionSupported}
                        >
                          {isSubmitting ? <><span className="button-spinner" aria-hidden="true" /> Saving details…</> : <>Review payment <span aria-hidden="true">→</span></>}
                        </button>
                      </div>
                    </form>
                    <RallyBookingSummary selections={selectedSlotDetails} dateLabel={selectedBookingDateLabel} subtotal={courtSubtotal} bookingFee={bookingFee ?? 0} total={total} />
                  </div>
                )}

                {step === 3 && checkoutSlot && pendingBooking && (
                  <div className="checkout-layout booking-payment-view">
                    <form className="booking-stage surface-card gcash-payment-card" onSubmit={submitPayment} aria-busy={isSubmitting} noValidate>
                      <div className="gcash-heading">
                        <h3 ref={paymentHeadingRef} tabIndex={-1}><span>G</span>Cash</h3>
                        <span className="gcash-secure-pill"><i aria-hidden="true" /> Secure</span>
                      </div>
                      <div className="payment-amount">
                        <span>Amount to pay</span>
                        <strong>{peso(checkoutTotal)}</strong>
                        <small>Send the exact booking total</small>
                      </div>

                      {holdExpired ? (
                        <div className="payment-error" role="alert">
                          <span aria-hidden="true">!</span><div><strong>Hold expired or released</strong><p>Payment is disabled. Choose another court time to continue.</p></div>
                        </div>
                      ) : !heldPaymentReady ? (
                        <div className="payment-error" role="alert">
                          <span aria-hidden="true">!</span><div><strong>GCash setup is incomplete</strong><p>The court owner must publish a GCash account in System Setup before payment can continue.</p></div>
                        </div>
                      ) : (
                        <>
                          <div className="owner-payment-note">
                            <span aria-hidden="true">✦</span>
                            <div><strong>Pay the court owner directly</strong><small>Use the verified GCash details saved by the venue in System Setup.</small></div>
                          </div>
                          <div className="gcash-account-field">
                            <span>{paymentLabel} mobile number</span>
                            <div className="gcash-account-number">
                              {isGcashPayment && /^9\d{9}$/.test(gcashLocalDigits) && <b>+63</b>}
                              <output aria-label={`${paymentLabel} account number`}>{isLive ? paymentAccountDisplay : "Available on the live booking site"}</output>
                            </div>
                          </div>
                          <div className="payment-recipient">
                            <span>Paying</span>
                            <strong>{isLive ? paymentAccountName : "Court owner"}</strong>
                            <small>{paymentLabel} account from System Setup</small>
                          </div>
                          {isLive && paymentMethod?.instructions && <p className="payment-owner-instructions">{paymentMethod.instructions}</p>}
                          <div className="gcash-hold-status" role="status">
                            <span><i aria-hidden="true" /> Slot held · {pendingBooking.reference}</span>
                            <small>{holdRemainingSeconds == null ? "Complete payment while this hold is active." : `Expires in ${formatHoldCountdown(holdRemainingSeconds)}.`}</small>
                          </div>
                          <div className="form-grid payment-evidence-fields">
                            <div className="form-field">
                              <label htmlFor={`${formId}-payment-reference`}>{paymentLabel} reference number</label>
                              <input id={`${formId}-payment-reference`} inputMode="numeric" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="e.g. 1234 5678 9012" />
                            </div>
                            <div className="form-field">
                              <label htmlFor={`${formId}-receipt`}>Payment receipt</label>
                              <label className={`upload-control ${receiptFileName ? "has-file" : ""}`} htmlFor={`${formId}-receipt`}>
                                <span aria-hidden="true">＋</span>
                                <span><strong>{receiptFileName || "Choose a file"}</strong><small>{receiptFileName ? "Ready to submit" : "JPG, PNG, or WebP · max 2 MB"}</small></span>
                              </label>
                              <input
                                className="visually-hidden-file"
                                id={`${formId}-receipt`}
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                onChange={(event) => {
                                  const file = event.target.files?.[0] ?? null;
                                  if (file && (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024)) {
                                    setReceiptFile(null);
                                    setReceiptFileName("");
                                    setPaymentError("Choose a JPG, PNG, or WebP receipt no larger than 2 MB.");
                                    event.target.value = "";
                                    return;
                                  }
                                  setPaymentError("");
                                  setReceiptFile(file);
                                  setReceiptFileName(file?.name ?? "");
                                }}
                              />
                            </div>
                          </div>
                        </>
                      )}
                      {paymentError && (
                        <div className="payment-error" role="alert">
                          <span aria-hidden="true">!</span><div><strong>Payment needs another look</strong><p>{paymentError}</p></div>
                        </div>
                      )}
                      {!holdExpired && heldPaymentReady && <button data-testid="submit-receipt" className="button gcash-button" type="submit" disabled={isSubmitting}>
                        {isSubmitting ? <><span className="button-spinner" aria-hidden="true" /> Sending receipt…</> : <>Submit receipt · {peso(checkoutTotal)} <span aria-hidden="true">→</span></>}
                      </button>}
                      <button className="cancel-hold-link" type="button" onClick={() => void cancelCurrentHold()} disabled={isSubmitting}>{holdExpired ? "Choose a new time" : "Cancel unpaid hold"}</button>
                      <p className="payment-security"><span aria-hidden="true">✓</span> The court owner&apos;s GCash details come directly from System Setup.</p>
                    </form>
                    <RallyBookingSummary selections={selectedSlotDetails} dateLabel={selectedBookingDateLabel} subtotal={checkoutSubtotal} bookingFee={checkoutFee} total={checkoutTotal} />
                  </div>
                )}

                {step === 4 && confirmedBooking && (
                  <div className="rally-confirmation-view" role="status" aria-live="polite">
                    <article className={`rally-confirmation-card ${confirmationTone}`}>
                      <div className="rally-confirmation-orbit" aria-hidden="true">
                        <span>{confirmationNeedsAttention ? <TriangleAlert /> : confirmationApproved || !isLive ? <Check /> : <Clock3 />}</span>
                      </div>
                      <p className="rally-confirmation-kicker">
                        {!isLive ? "Preview complete" : confirmationApproved ? "Payment received" : confirmationNeedsAttention ? "Payment needs attention" : "Receipt submitted"}
                      </p>
                      <h3>
                        {!isLive
                          ? "You completed the preview."
                          : confirmationApproved
                            ? selectedCourtCount === 1 ? "Your court is ready." : "Your courts are ready."
                            : confirmationNeedsAttention
                              ? "Please review your payment."
                              : "PickPoint is reviewing your receipt."}
                      </h3>
                      <p className="rally-confirmation-lead">
                        {!isLive
                          ? "No real reservation or payment was created. This reference is for this browser preview only."
                          : confirmationApproved
                            ? "Your payment is verified and your booking is confirmed. We’ll see you on court."
                            : confirmationNeedsAttention
                              ? "The submitted receipt could not be approved. Check your payment details and use your booking reference when contacting the PickPoint team."
                              : "Your receipt was submitted successfully. The PickPoint team is reviewing it now, and your booking will remain pending until payment is approved."}
                      </p>

                      <div className="rally-confirmation-reference">
                        <span>Booking reference</span>
                        <strong>{confirmedBooking.reference}</strong>
                        <button type="button" onClick={() => {
                          void navigator.clipboard?.writeText(confirmedBooking.reference);
                          setLiveMessage(`Booking reference ${confirmedBooking.reference} copied.`);
                        }}>Copy</button>
                      </div>

                      <div className="rally-confirmation-details" aria-label="Booking summary">
                        <div><CalendarDays aria-hidden="true" /><span>Date &amp; time</span><strong>{selectedBookingDateLabel || confirmedBooking.date} · {confirmationTimeLabel}</strong></div>
                        <div><Grid2X2 aria-hidden="true" /><span>{selectedCourtCount === 1 ? "Court" : "Courts"}</span><strong>{confirmationCourtNames}</strong></div>
                        <div><WalletCards aria-hidden="true" /><span>Paid with GCash</span><strong>{peso(confirmedBooking.amount)} · {confirmationApproved ? "Payment verified" : confirmationNeedsAttention ? "Needs attention" : "Review pending"}</strong></div>
                      </div>

                      <div className="rally-confirmation-actions">
                        {confirmationApproved && isLive ? (
                          <>
                            <button className="button rally-confirmation-primary" type="button" onClick={addConfirmationToCalendar}><CalendarDays aria-hidden="true" /> Add to calendar</button>
                            <button className="button button-outline" type="button" onClick={() => void shareConfirmation()}><Share2 aria-hidden="true" /> Share booking</button>
                          </>
                        ) : (
                          <button className="button rally-confirmation-primary" type="button" onClick={() => {
                            setLookupReference(confirmedBooking.reference);
                            setLookupEmail(confirmedBooking.customer.email);
                            openManage();
                          }}>{isLive ? "Check booking status" : "Inspect preview status"}</button>
                        )}
                      </div>
                      <button className="rally-confirmation-again" type="button" onClick={resetBooking}>Book another court</button>
                    </article>
                  </div>
                )}
              </div>
            ) : (
              <ManageBooking
                formId={formId}
                isPreview={!isLive}
                courts={displayCourts}
                reference={lookupReference}
                email={lookupEmail}
                lookupState={lookupState}
                booking={managedBooking}
                showCancel={showCancel}
                showRescheduleHelp={showRescheduleHelp}
                cancelReason={cancelReason}
                cancelState={cancelState}
                onReferenceChange={setLookupReference}
                onEmailChange={setLookupEmail}
                onLookup={lookupBooking}
                onShowCancel={setShowCancel}
                onShowRescheduleHelp={setShowRescheduleHelp}
                onCancelReasonChange={setCancelReason}
                onConfirmCancel={confirmCancel}
                onBook={() => openBooking()}
              />
            )}
          </div>
        </section>}

        {isHome && <section className="club-note">
          <div className="site-container club-note-inner">
            <p className="eyebrow">Welcome to your next favorite habit</p>
            <h2>Serious court.<br /><span>Playful spirit.</span></h2>
            <Link className="button button-lime button-large" href="/book">Book a court <span aria-hidden="true">→</span></Link>
          </div>
        </section>}
      </main>

      <footer className="site-footer">
        <div className="site-container footer-grid">
          <div><Link className="wordmark wordmark-footer" href="/" aria-label="PickPoint home"><Image className="brand-logo" src="/pickpoint-pickleclub-logo.png" alt="" width={2172} height={724} sizes="212px" unoptimized /></Link><p>Pick your court. Lock your time.</p></div>
          <div><h2>Play</h2><Link href="/courts">Courts</Link>{isHome ? <a href="#gallery">Gallery</a> : <Link href="/#gallery">Gallery</Link>}<Link href="/book">Book a court</Link><Link href="/book?mode=manage">Manage booking</Link></div>
          <div><h2>Club hours</h2><p>Daily<br /><strong>6:00 AM–10:00 PM</strong></p><small>Asia/Manila · PHP</small></div>
          <div><h2>Setup status</h2><p>Preview booking experience.<br />Venue details coming next.</p></div>
        </div>
        <div className="site-container footer-bottom"><span>© 2026 PickPoint Pickle Club</span><span>Ready when you are.</span></div>
      </footer>
      <p className="sr-live" aria-live="polite" aria-atomic="true">{liveMessage}</p>
      <p className="sr-live" aria-live="polite" aria-atomic="true">{selectionState.announcement}</p>
    </div>
  );
}

type BookingSummaryProps = {
  selections: SelectionDetail[];
  dateLabel: string;
  subtotal: number;
  bookingFee: number;
  total: number;
};

function RallyBookingSummary({
  selections,
  dateLabel,
  subtotal,
  bookingFee,
  total,
}: BookingSummaryProps) {
  const groups = groupSelectionDetails(selections);
  const courts = Array.from(
    new Map(selections.map((item) => [item.court.id, item.court])).values(),
  );
  const courtSchedule = courts
    .map((court) => {
      const times = groups
        .filter((group) => group.court.id === court.id)
        .map((group) => formatHourRange(group.startHour, group.endHour))
        .join(", ");
      return `${court.name}: ${times}`;
    })
    .join(" · ");
  const slotLabel = `${selections.length} slot${selections.length === 1 ? "" : "s"} selected`;

  return (
    <aside className="booking-summary rally-booking-summary surface-card" aria-label="Booking summary">
      <p className="player-kicker">Your reservation</p>
      <h3>{courts.length === 1 ? courts[0]?.name : `${courts.length} courts reserved`}</h3>
      <div className="summary-detail">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>
        <span><strong>{dateLabel}</strong><small>{slotLabel}</small></span>
      </div>
      <div className="summary-detail">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
        <span><strong>{courts.map((court) => court.name).join(", ")}</strong><small>{courtSchedule}</small></span>
      </div>
      <div className="summary-detail">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>
        <span><strong>PickPoint Court Hub</strong><small>{activeTenant.venue.locationLabel}</small></span>
      </div>
      <div className="summary-price-lines">
        <span><small>Court reservation · {slotLabel}</small><strong>{peso(subtotal)}</strong></span>
        {bookingFee > 0 && <span><small>Booking fee</small><strong>{peso(bookingFee)}</strong></span>}
      </div>
      <div className="rally-summary-total"><span>Total</span><strong>{peso(total)}</strong></div>
      <p className="summary-note">Free cancellation up to 12 hours before your booking.</p>
    </aside>
  );
}

type ManageBookingProps = {
  formId: string;
  isPreview: boolean;
  courts: Court[];
  reference: string;
  email: string;
  lookupState: "idle" | "loading" | "found" | "empty" | "error";
  booking: BookingRecord | null;
  showCancel: boolean;
  showRescheduleHelp: boolean;
  cancelReason: string;
  cancelState: "idle" | "loading" | "success" | "error";
  onReferenceChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onLookup: (event: FormEvent<HTMLFormElement>) => void;
  onShowCancel: (show: boolean) => void;
  onShowRescheduleHelp: (show: boolean) => void;
  onCancelReasonChange: (value: string) => void;
  onConfirmCancel: () => void;
  onBook: () => void;
};

function ManageBooking({
  formId,
  isPreview,
  courts,
  reference,
  email,
  lookupState,
  booking,
  showCancel,
  showRescheduleHelp,
  cancelReason,
  cancelState,
  onReferenceChange,
  onEmailChange,
  onLookup,
  onShowCancel,
  onShowRescheduleHelp,
  onCancelReasonChange,
  onConfirmCancel,
  onBook,
}: ManageBookingProps) {
  const court = courts.find((item) => item.id === booking?.courtId) ?? courts[0];
  const formattedDate = booking
    ? new Intl.DateTimeFormat("en-PH", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${booking.date}T12:00:00Z`))
    : "";
  const formattedBookingDate = booking
    ? bookingDateLabel(formattedDate, booking.date, [booking])
    : "";

  return (
    <div className="manage-shell">
      <div className="manage-intro">
        <span className="manage-orbit" aria-hidden="true"><i /></span>
        <p className="eyebrow">Your booking, your call</p>
        <h3>Check status or change plans.</h3>
        <p>Use the same device, booking reference, and email from checkout. No password or account required.</p>
        {isPreview && <div className="manage-demo-note"><strong>Preview a found booking</strong><span>Reference: DT-260808-018<br />Email: mika@example.com</span></div>}
      </div>
      <div className="manage-panel">
        <form className="lookup-form" onSubmit={onLookup} noValidate>
          <div className="form-field">
            <label htmlFor={`${formId}-lookup-reference`}>Booking reference</label>
            <input id={`${formId}-lookup-reference`} value={reference} onChange={(event) => onReferenceChange(event.target.value.toUpperCase())} placeholder="DT-YYMMDD-000" autoComplete="off" />
          </div>
          <div className="form-field">
            <label htmlFor={`${formId}-lookup-email`}>Email address</label>
            <input id={`${formId}-lookup-email`} type="email" value={email} onChange={(event) => onEmailChange(event.target.value)} placeholder="you@example.com" autoComplete="email" />
          </div>
          <button className="button button-blue" type="submit" disabled={lookupState === "loading"}>{lookupState === "loading" ? <><span className="button-spinner" aria-hidden="true" /> Finding booking…</> : <>Find booking <span aria-hidden="true">→</span></>}</button>
        </form>

        {lookupState === "idle" && <div className="manage-placeholder"><span aria-hidden="true">⌕</span><p>Your booking details will appear here.</p></div>}
        {lookupState === "loading" && <div className="manage-loading" role="status"><span className="spinner" aria-hidden="true" /><div><strong>Looking up your booking…</strong><small>Checking the PickPoint board.</small></div></div>}
        {lookupState === "error" && <div className="state-card state-error" role="alert"><span className="state-symbol" aria-hidden="true">!</span><div><h4>Check those details</h4><p>Enter your booking reference and the email used at checkout, then try again.</p></div></div>}
        {lookupState === "empty" && <div className="state-card state-empty" role="status"><span className="state-symbol" aria-hidden="true">?</span><div><h4>We couldn&apos;t find that booking.</h4><p>Check for typos. If it still won&apos;t show, the clubhouse team can help.</p></div><button className="button button-outline" type="button" onClick={onBook}>Start a new booking</button></div>}

        {lookupState === "found" && booking && (
          <div className={`managed-booking ${booking.status === "cancelled" ? "is-cancelled" : ""}`}>
            <div className="managed-heading">
              <div><span className={`booking-status status-${booking.status}`}><i aria-hidden="true" /> {booking.status === "pending_payment" ? isPreview ? "Preview hold" : "Awaiting payment" : booking.status === "payment_review" ? isPreview ? "Preview review" : "Payment review" : booking.status === "confirmed" ? "Confirmed" : "Cancelled"}</span><h4>{booking.reference}</h4></div>
              <span className="managed-court-number">{court.number}</span>
            </div>
            {cancelState === "success" && <div className="notice-banner notice-success" role="status"><div><strong>{isPreview ? "Preview dismissed" : "Booking cancelled"}</strong><span>{isPreview ? "No real court or payment was affected." : "The unpaid hold has been released."}</span></div></div>}
            <dl className="managed-details">
              <div><dt>Court</dt><dd>{court.name}</dd></div>
              <div><dt>Date</dt><dd>{formattedBookingDate}</dd></div>
              <div><dt>Time</dt><dd>{formatHourRange(booking.startHour, booking.startHour + booking.durationHours)}</dd></div>
              <div><dt>Total</dt><dd>{peso(booking.amount)}</dd></div>
            </dl>
            {booking.status === "pending_payment" && <div className="payment-due-note"><span aria-hidden="true">◷</span><div><strong>{isPreview ? "Preview only" : "Payment has not been submitted"}</strong><p>{isPreview ? "No real reservation or payment exists. This simulated hold can be dismissed online." : "This unpaid hold can be cancelled online until its server-controlled expiry."}</p></div></div>}
            {(booking.status === "payment_review" || booking.status === "confirmed") && <div className="payment-due-note"><span aria-hidden="true">◎</span><div><strong>{isPreview ? "Preview record only" : "Owner assistance is required for cancellation"}</strong><p>{isPreview ? "No real reservation or payment exists, so no venue action is required." : "Paid and payment-review bookings follow the venue’s published policy and cannot be cancelled through this screen."}</p></div></div>}
            {booking.status !== "cancelled" && !showCancel && (
              <div className="managed-actions"><button className="button button-blue" type="button" onClick={() => onShowRescheduleHelp(!showRescheduleHelp)}>Reschedule options</button>{booking.status === "pending_payment" && <button className="button button-outline danger-button" type="button" onClick={() => onShowCancel(true)}>Cancel unpaid hold</button>}</div>
            )}
            {showRescheduleHelp && booking.status !== "cancelled" && !showCancel && (
              <div className="reschedule-help" role="status">
                <span aria-hidden="true">↺</span>
                <div><strong>{isPreview ? "Rescheduling preview" : "Rescheduling is owner-assisted"}</strong><p>{isPreview ? "This demonstrates where change options appear. No real court has been reserved." : "The venue owner or administrator moves confirmed bookings through the platform’s protected rescheduling flow. Online requests will become available after the clubhouse contact channel is activated."}</p><button type="button" onClick={() => navigator.clipboard?.writeText(booking.reference)}>Copy booking reference</button></div>
              </div>
            )}
            {showCancel && booking.status === "pending_payment" && (
              <div className="cancel-panel">
                <div><h5>{isPreview ? "Dismiss this preview?" : "Cancel this booking?"}</h5><p>{isPreview ? "No real court or payment will be affected." : "This releases the court. Paid bookings require owner assistance."}</p></div>
                <div className="form-field"><label htmlFor={`${formId}-cancel-reason`}>Reason for cancellation</label><select id={`${formId}-cancel-reason`} value={cancelReason} onChange={(event) => onCancelReasonChange(event.target.value)}><option value="">Choose a reason</option><option value="plans-changed">Plans changed</option><option value="weather">Weather or travel</option><option value="wrong-time">Booked the wrong time</option><option value="other">Something else</option></select></div>
                {cancelState === "error" && <p className="field-error" role="alert">Cancellation could not be completed. Try again.</p>}
                <div className="cancel-actions"><button className="button button-ghost" type="button" onClick={() => onShowCancel(false)} disabled={cancelState === "loading"}>Keep booking</button><button className="button button-danger" type="button" disabled={!cancelReason || cancelState === "loading"} onClick={onConfirmCancel}>{cancelState === "loading" ? "Cancelling…" : "Yes, cancel booking"}</button></div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
