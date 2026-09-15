import type { Metadata } from "next";
import { BookingExperience } from "../booking-experience";
import "../pickpoint-pickleclub.css";

export const metadata: Metadata = {
  title: "Courts",
  description: "Compare PickPoint courts and choose where to play your next rally.",
};

export default function CourtsPage() {
  return <BookingExperience surface="courts" />;
}
