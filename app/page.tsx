import type { Metadata } from "next";
import { BookingExperience } from "./booking-experience";
import "./pickpoint-pickleclub.css";

export const metadata: Metadata = {
  title: "Home",
  description: "Discover PickPoint courts and plan your next pickleball rally.",
};

export default function HomePage() {
  return <BookingExperience surface="home" />;
}
