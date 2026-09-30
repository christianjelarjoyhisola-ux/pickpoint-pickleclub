/** Project a reservation into its actual occupied court/time ranges for the schedule.
 * Keep the booking identity and payment total intact; these are not new bookings.
 */
export function calendarBookingRows(row: Record<string, unknown>, date: string): Record<string, unknown>[] {
  if (!Array.isArray(row.booking_slots)) return [row];
  const startOfDay = Date.parse(`${date}T00:00:00+08:00`);
  const endOfDay = startOfDay + 86_400_000;
  const ranges: {courtId: string; start: number; end: number}[] = [];
  for (const candidate of row.booking_slots) {
    if (!candidate || typeof candidate !== "object") continue;
    const slot = candidate as Record<string, unknown>;
    if (!["held", "confirmed"].includes(String(slot.status))) continue;
    const start = Date.parse(String(slot.starts_at)), end = Date.parse(String(slot.ends_at));
    if (typeof slot.court_id !== "string" || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || end <= startOfDay || start >= endOfDay) continue;
    ranges.push({courtId: slot.court_id, start: Math.max(start, startOfDay), end: Math.min(end, endOfDay)});
  }
  ranges.sort((a, b) => a.courtId.localeCompare(b.courtId) || a.start - b.start);
  const merged: typeof ranges = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (previous && previous.courtId === range.courtId && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else merged.push({...range});
  }
  return merged.map(range => ({
    ...row, court_id: range.courtId, court_name: undefined, courtName: undefined,
    starts_at: new Date(range.start).toISOString(), ends_at: new Date(range.end).toISOString(),
    local_booking_date: date,
    schedule_key: `${row.id}:${range.courtId}:${range.start}`,
  }));
}
