export type ClockOption = {
  value: string;
  label: string;
  logicalHour: number;
  dayOffset: number;
};

export type HourlyPriceBand = {
  start: string;
  end: string;
  hourlyRate: number;
};

export type TwoBandSchedule = {
  opensAt: string;
  closesAt: string;
  bands: [HourlyPriceBand, HourlyPriceBand];
};

export type LogicalPriceBand = HourlyPriceBand & {
  logicalStart: number;
  logicalEnd: number;
};

export type TwoBandScheduleInput = {
  opensAt: string;
  closesAt: string;
  boundaryAt: string;
  firstHourlyRate: number;
  secondHourlyRate: number;
};

const WHOLE_HOUR_PATTERN = /^(?:[01]\d|2[0-3]):00$/;
const LEGACY_MIDNIGHT_END = "24:00";

/** Parse a canonical stored clock (`HH:00`) into its 0-23 hour. */
export function parseClockHour(value: unknown): number | null {
  if (typeof value !== "string" || !WHOLE_HOUR_PATTERN.test(value)) return null;
  return Number(value.slice(0, 2));
}

export function isWholeHourClock(value: unknown): value is string {
  return parseClockHour(value) !== null;
}

/** Convert an in-memory logical hour back to a canonical stored clock. */
export function clockValueForHour(logicalHour: number): string | null {
  if (!Number.isInteger(logicalHour) || logicalHour < 0) return null;
  const hour = logicalHour % 24;
  return `${String(hour).padStart(2, "0")}:00`;
}

/**
 * Format a canonical clock, or an extended logical hour such as 25, for display.
 * Extended hours automatically receive the next-day annotation.
 */
export function formatClockLabel(
  value: string | number,
  dayOffset = 0,
): string {
  if (!Number.isInteger(dayOffset) || dayOffset < 0) return "";
  const baseHour = typeof value === "number" ? value : parseClockHour(value);
  if (baseHour === null || !Number.isInteger(baseHour) || baseHour < 0) return "";
  const logicalHour = baseHour + dayOffset * 24;
  const hour = logicalHour % 24;
  const displayHour = hour % 12 || 12;
  const suffix = Math.floor(logicalHour / 24) > 0 ? " (next day)" : "";
  return `${displayHour} ${hour < 12 ? "AM" : "PM"}${suffix}`;
}

/** Map a clock onto the first occurrence at or after the opening hour. */
export function logicalHourFromOpen(
  value: string,
  opensAt: string,
): number | null {
  const hour = parseClockHour(value);
  const openHour = parseClockHour(opensAt);
  if (hour === null || openHour === null) return null;
  return openHour + ((hour - openHour + 24) % 24);
}

/** Resolve closing into an extended hour. Equal open/close is intentionally invalid. */
export function logicalCloseHour(
  opensAt: string,
  closesAt: string,
): number | null {
  const openHour = parseClockHour(opensAt);
  const closeHour = logicalHourFromOpen(closesAt, opensAt);
  if (openHour === null || closeHour === null || closeHour === openHour) return null;
  return closeHour;
}

/** Resolve a rate boundary only when it is strictly inside the operating window. */
export function logicalBoundaryHour(
  opensAt: string,
  closesAt: string,
  boundaryAt: string,
): number | null {
  const openHour = parseClockHour(opensAt);
  const closeHour = logicalCloseHour(opensAt, closesAt);
  const boundaryHour = logicalHourFromOpen(boundaryAt, opensAt);
  if (
    openHour === null || closeHour === null || boundaryHour === null ||
    boundaryHour <= openHour || boundaryHour >= closeHour
  ) return null;
  return boundaryHour;
}

function optionForLogicalHour(logicalHour: number): ClockOption {
  return {
    value: clockValueForHour(logicalHour)!,
    label: formatClockLabel(logicalHour),
    logicalHour,
    dayOffset: Math.floor(logicalHour / 24),
  };
}

/** Closing choices in operating order: opening + 1 hour through opening + 23 hours. */
export function closeOptionsFor(opensAt: string): ClockOption[] {
  const openHour = parseClockHour(opensAt);
  if (openHour === null) return [];
  return Array.from(
    { length: 23 },
    (_, index) => optionForLogicalHour(openHour + index + 1),
  );
}

/** Boundary choices strictly inside the selected operating window. */
export function boundaryOptionsFor(
  opensAt: string,
  closesAt: string,
): ClockOption[] {
  const openHour = parseClockHour(opensAt);
  const closeHour = logicalCloseHour(opensAt, closesAt);
  if (openHour === null || closeHour === null) return [];
  return Array.from(
    { length: Math.max(0, closeHour - openHour - 1) },
    (_, index) => optionForLogicalHour(openHour + index + 1),
  );
}

function isHourlyRate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 &&
    value <= 9_999_999_999.99 &&
    Math.abs(value * 100 - Math.round(value * 100)) <= 1e-7;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function canonicalBandClock(value: unknown): string | null {
  if (value === LEGACY_MIDNIGHT_END) return "00:00";
  return isWholeHourClock(value) ? value : null;
}

/**
 * Validate and canonicalize a continuous two-band schedule. A wrapped band is
 * represented with ordinary clock values (for example `22:00` -> `02:00`).
 */
export function normalizeTwoBandSchedule(
  candidate: unknown,
): TwoBandSchedule | null {
  const schedule = objectValue(candidate);
  if (!schedule || !isWholeHourClock(schedule.opensAt) ||
      !isWholeHourClock(schedule.closesAt) || !Array.isArray(schedule.bands) ||
      schedule.bands.length !== 2) return null;

  const first = objectValue(schedule.bands[0]);
  const second = objectValue(schedule.bands[1]);
  if (!first || !second || !isWholeHourClock(first.start) ||
      !isWholeHourClock(second.start)) return null;

  const firstEnd = canonicalBandClock(first.end);
  const secondEnd = canonicalBandClock(second.end);
  if (!firstEnd || !secondEnd || !isHourlyRate(first.hourlyRate) ||
      !isHourlyRate(second.hourlyRate)) return null;

  const opensAt = schedule.opensAt;
  const closesAt = schedule.closesAt;
  if (
    first.start !== opensAt || firstEnd !== second.start ||
    secondEnd !== closesAt ||
    logicalBoundaryHour(opensAt, closesAt, firstEnd) === null
  ) return null;

  return {
    opensAt,
    closesAt,
    bands: [
      { start: opensAt, end: firstEnd, hourlyRate: first.hourlyRate },
      { start: firstEnd, end: closesAt, hourlyRate: second.hourlyRate },
    ],
  };
}

export function isTwoBandSchedule(candidate: unknown): candidate is TwoBandSchedule {
  return normalizeTwoBandSchedule(candidate) !== null;
}

/** Build a canonical stored schedule after validating its logical time window. */
export function buildTwoBandSchedule({
  opensAt,
  closesAt,
  boundaryAt,
  firstHourlyRate,
  secondHourlyRate,
}: TwoBandScheduleInput): TwoBandSchedule | null {
  if (
    logicalBoundaryHour(opensAt, closesAt, boundaryAt) === null ||
    !isHourlyRate(firstHourlyRate) || !isHourlyRate(secondHourlyRate)
  ) return null;
  return {
    opensAt,
    closesAt,
    bands: [
      { start: opensAt, end: boundaryAt, hourlyRate: firstHourlyRate },
      { start: boundaryAt, end: closesAt, hourlyRate: secondHourlyRate },
    ],
  };
}

export function logicalBandsForSchedule(
  candidate: unknown,
): [LogicalPriceBand, LogicalPriceBand] | null {
  const schedule = normalizeTwoBandSchedule(candidate);
  if (!schedule) return null;
  const logicalStart = parseClockHour(schedule.opensAt)!;
  const logicalBoundary = logicalBoundaryHour(
    schedule.opensAt,
    schedule.closesAt,
    schedule.bands[0].end,
  )!;
  const logicalEnd = logicalCloseHour(schedule.opensAt, schedule.closesAt)!;
  return [
    { ...schedule.bands[0], logicalStart, logicalEnd: logicalBoundary },
    { ...schedule.bands[1], logicalStart: logicalBoundary, logicalEnd },
  ];
}

/**
 * Validate and order all price bands that cover one operating window. This is
 * intentionally more general than the two-band management editor: existing
 * platform courts may publish between one and 24 bands in any array order.
 */
export function logicalBandsForOperatingWindow(
  candidate: unknown,
): LogicalPriceBand[] | null {
  const schedule = objectValue(candidate);
  if (
    !schedule || !isWholeHourClock(schedule.opensAt) ||
    !isWholeHourClock(schedule.closesAt) || !Array.isArray(schedule.bands) ||
    schedule.bands.length < 1 || schedule.bands.length > 24
  ) return null;

  const opensAt = schedule.opensAt;
  const openHour = parseClockHour(opensAt)!;
  const closeHour = logicalCloseHour(opensAt, schedule.closesAt);
  if (closeHour === null) return null;

  const bands: LogicalPriceBand[] = [];
  for (const candidateBand of schedule.bands) {
    const band = objectValue(candidateBand);
    if (!band || !isHourlyRate(band.hourlyRate)) return null;
    const start = canonicalBandClock(band.start);
    const end = canonicalBandClock(band.end);
    if (!start || !end) return null;
    const logicalStart = logicalHourFromOpen(start, opensAt);
    const logicalEnd = logicalHourFromOpen(end, opensAt);
    if (
      logicalStart === null || logicalEnd === null ||
      logicalStart < openHour || logicalEnd > closeHour ||
      logicalEnd <= logicalStart
    ) return null;
    bands.push({
      start,
      end,
      hourlyRate: band.hourlyRate,
      logicalStart,
      logicalEnd,
    });
  }

  bands.sort((left, right) =>
    left.logicalStart - right.logicalStart || left.logicalEnd - right.logicalEnd
  );
  if (
    bands[0]?.logicalStart !== openHour ||
    bands.at(-1)?.logicalEnd !== closeHour ||
    bands.some((band, index) =>
      index > 0 && bands[index - 1]?.logicalEnd !== band.logicalStart
    )
  ) return null;
  return bands;
}

/** Find the price band containing an extended logical hour (half-open ranges). */
export function logicalBandForHour(
  candidate: unknown,
  logicalHour: number,
): LogicalPriceBand | null {
  if (!Number.isFinite(logicalHour)) return null;
  const bands = logicalBandsForOperatingWindow(candidate);
  if (!bands) return null;
  return bands.find((band) =>
    logicalHour >= band.logicalStart && logicalHour < band.logicalEnd
  ) ?? null;
}

/** Advance a strict ISO calendar date without depending on the local timezone. */
export function nextIsoDate(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) return null;
  candidate.setUTCDate(candidate.getUTCDate() + 1);
  return candidate.toISOString().slice(0, 10);
}
