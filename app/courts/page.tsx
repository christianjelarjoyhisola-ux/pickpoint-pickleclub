import type { Metadata } from "next";
import { CourtsView } from "../pickpoint-v2/guest/courts-view";
import "../pickpoint-v2/guest/guest.css";

export const metadata: Metadata = {
  title: "Courts",
  description: "See the courts currently configured at PickPoint Pickle Club.",
};

export default function CourtsPage() {
  return <CourtsView />;
}
