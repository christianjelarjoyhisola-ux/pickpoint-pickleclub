import type { Metadata } from "next";
import { GuestHome } from "./pickpoint-v2/guest/guest-home";
import "./pickpoint-v2/guest/guest.css";

export const metadata: Metadata = {
  title: "Home",
  description: "Pick a court and reserve a time at PickPoint Pickle Club.",
};

export default function HomePage() {
  return <GuestHome />;
}
