"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarDays, Clock3, MapPin } from "lucide-react";
import { GuestShell } from "./guest-shell";
import { useTenant } from "./use-tenant";

export function GuestHome() {
  const { data, loading } = useTenant();
  const live = data?.readiness.publicBookingEnabled === true;
  const courtCount = data?.courts.length ?? 0;
  return (
    <GuestShell current="home">
      <section className="pp-hero">
        <div className="pp-hero-copy">
          <p className="pp-kicker"><span /> Court reservations, made clear</p>
          <h1>Your court.<br /><em>Your time.</em></h1>
          <p className="pp-lede">Choose one court, lock in a continuous playing time, and keep everything under one booking reference.</p>
          <div className="pp-actions">
            <Link className="pp-button pp-button-lime" href="/book">Check available times <ArrowRight /></Link>
            <Link className="pp-text-link" href="/book?mode=manage">Already booked? Find it</Link>
          </div>
        </div>
        <div className="pp-board" aria-label="PickPoint venue status">
          <div className="pp-board-top"><span>PickPoint court desk</span><span className={live ? "pp-status live" : "pp-status"}>{live ? "Booking open" : "Opening soon"}</span></div>
          <Image src="/pickpoint-pickleclub-mark.png" alt="" width={210} height={240} priority />
          <dl>
            <div><dt><MapPin /></dt><dd><strong>Venue</strong><span>{data?.business && typeof data.business.address === "string" ? data.business.address : "Location to be announced"}</span></dd></div>
            <div><dt><CalendarDays /></dt><dd><strong>Courts</strong><span>{loading ? "Checking setup…" : courtCount ? `${courtCount} configured` : "Being prepared"}</span></dd></div>
            <div><dt><Clock3 /></dt><dd><strong>Reservations</strong><span>{live ? "Available online" : "Not open yet"}</span></dd></div>
          </dl>
        </div>
      </section>
      <section className="pp-how" aria-labelledby="how-title">
        <div><p className="pp-kicker">The simple way to play</p><h2 id="how-title">Three decisions. One booking.</h2></div>
        <ol>
          <li><span>01</span><div><strong>Pick a date</strong><p>See only times that fit your chosen duration.</p></div></li>
          <li><span>02</span><div><strong>Choose your court</strong><p>Reserve one clear, continuous playing window.</p></div></li>
          <li><span>03</span><div><strong>Confirm the details</strong><p>Review the total and keep your booking reference.</p></div></li>
        </ol>
      </section>
      {!live && data && <section className="pp-opening-note"><div><span>Club update</span><h2>Online booking is being prepared.</h2></div><p>PickPoint will open reservations after its courts, rates, payment details, and booking rules have been verified. Nothing shown here creates a reservation yet.</p></section>}
    </GuestShell>
  );
}
