import type { Metadata } from "next";
import { BookingExperience } from "../booking-experience";
import "../pickpoint-pickleclub.css";

type BookPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ searchParams }: BookPageProps): Promise<Metadata> {
  const params = await searchParams;
  const isManageMode = params.mode === "manage";

  return isManageMode
    ? {
        title: "Manage Booking",
        description: "Find and manage an existing PickPoint court booking.",
      }
    : {
        title: "Book a Court",
        description: "Choose a PickPoint time, review the booking details, and reserve your court.",
      };
}

export default async function BookPage({ searchParams }: BookPageProps) {
  const params = await searchParams;
  const requestedCourt = typeof params.court === "string" ? params.court.trim() : undefined;
  const courtSlug =
    requestedCourt && /^[a-z0-9][a-z0-9_-]{0,79}$/i.test(requestedCourt)
      ? requestedCourt
      : undefined;
  const initialMode = params.mode === "manage" ? "manage" : "book";

  return (
    <BookingExperience
      key={`${initialMode}:${courtSlug ?? "default"}`}
      surface="booking"
      initialCourtSlug={courtSlug}
      initialMode={initialMode}
    />
  );
}
