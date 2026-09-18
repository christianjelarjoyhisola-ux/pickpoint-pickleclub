"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, Clock3, MapPin } from "lucide-react";
import { GuestShell } from "./guest-shell";
import { isPublicBookingReady } from "./readiness";
import { useTenant } from "./use-tenant";
import { HomeVenuePreview } from "./venue-preview";

export function GuestHome() {
  const { data, loading } = useTenant();
  const live = isPublicBookingReady(data);
  const courtCount = data?.courts.length ?? 0;
  const publicConfig = data?.tenant.publicConfig;
  const locationName = typeof publicConfig?.locationName === "string" ? publicConfig.locationName : "Teves Residence Chicote";
  const address = typeof publicConfig?.address === "string" ? publicConfig.address : "Tibanban, Governor Generoso, Davao Oriental";
  const mapsUrl = typeof publicConfig?.mapsUrl === "string" ? publicConfig.mapsUrl : "https://maps.app.goo.gl/XmD7VMpTBQJinTeP7";
  return (
    <GuestShell current="home">
      <section className="pp-hero">
        <div className="pp-hero-copy">
          <p className="pp-kicker"><span /> Court reservations, made clear</p>
          <div className="pp-hero-title">
            <h1><span>Play.</span><em>Rally.</em><span>Connect.</span></h1>
          </div>
          <p className="pp-lede">Choose one court, lock in a continuous playing time, and keep everything under one booking reference.</p>
          <div className="pp-actions">
            {live || loading
              ? <Link className="pp-button pp-button-lime" href="/book#booking-times">Check available times <ArrowRight /></Link>
              : <a className="pp-button pp-button-lime" href={mapsUrl} target="_blank" rel="noreferrer">Get directions <MapPin /></a>}
            {live
              ? <Link className="pp-text-link" href="/book?mode=manage">Already booked? Find it</Link>
              : loading
                ? <span className="pp-closed-note">Checking booking availability…</span>
              : <span className="pp-closed-note">Online booking is opening soon</span>}
          </div>
        </div>
        <div className="pp-board" aria-label="PickPoint venue status">
          <div className="pp-board-top"><span>PickPoint court desk</span><span className={live ? "pp-status live" : "pp-status"}>{loading ? "Checking status" : live ? "Booking open" : "Opening soon"}</span></div>
          <dl>
            <div><dt><MapPin /></dt><dd><strong>{locationName}</strong><span>{address}</span><a className="pp-directions" href={mapsUrl} target="_blank" rel="noreferrer">Open in Google Maps <ArrowRight /></a></dd></div>
            <div><dt><CalendarDays /></dt><dd><strong>Courts</strong><span>{loading ? "Checking setup…" : courtCount ? `${courtCount} configured` : "Being prepared"}</span></dd></div>
            <div><dt><Clock3 /></dt><dd><strong>Reservations</strong><span>{loading ? "Checking availability…" : live ? "Available online" : "Not open yet"}</span></dd></div>
          </dl>
        </div>
      </section>
      <HomeVenuePreview />
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
