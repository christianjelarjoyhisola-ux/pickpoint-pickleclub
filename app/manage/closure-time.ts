/** Keep end-of-day midnight distinct from the start of the selected date. */
export function closureTime(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) {
    throw new Error("Invalid court closure time.");
  }
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function closureEndTime(value: string): string {
  return value === "00:00" ? "24:00" : value;
}
