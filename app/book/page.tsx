import type { Metadata } from "next";
import { BookingView } from "../pickpoint-v2/guest/booking-view";
import "../pickpoint-v2/guest/guest.css";

type BookPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ searchParams }: BookPageProps): Promise<Metadata> {
  const params = await searchParams;
  const isManageMode = params.mode === "manage";

  return isManageMode
    ? {
        title: "Manage Booking",
        description: "Check a PickPoint booking on this device.",
      }
    : {
        title: "Book a Court",
        description: "Choose one court and one continuous playing time.",
      };
}

export default async function BookPage({ searchParams }: BookPageProps) {
  const params = await searchParams;
  const courtSlug = typeof params.court === "string" && /^[a-z0-9_-]{1,80}$/i.test(params.court)
    ? params.court
    : undefined;
  return <BookingView initialMode={params.mode === "manage" ? "manage" : "book"} initialCourtSlug={courtSlug} />;
}
