"use client";

import Link from "next/link";
import { ArrowRight, Clock3 } from "lucide-react";
import { GuestShell } from "./guest-shell";
import { isPublicBookingReady } from "./readiness";
import { useTenant } from "./use-tenant";

export function CourtsView() {
  const { data, error, loading } = useTenant();
  const live = isPublicBookingReady(data);
  return (
    <GuestShell current="courts">
      <section className="pp-page-head"><p className="pp-kicker">Court ledger</p><h1>Pick your playing space.</h1><p>Only courts confirmed by the venue appear here.</p></section>
      <section className="pp-court-list" aria-live="polite">
        {loading && <div className="pp-state"><span className="pp-spinner" /> Checking the court setup…</div>}
        {error && <div className="pp-state pp-error"><strong>Courts are unavailable right now.</strong><span>{error}</span></div>}
        {data && data.courts.length === 0 && <div className="pp-state"><strong>No courts have been published yet.</strong><span>The venue team is still completing setup. Check back before opening day.</span></div>}
        {data?.courts.map((court, index) => (
          <article className="pp-court-row" key={court.id}>
            <span className="pp-court-number">{String(index + 1).padStart(2, "0")}</span>
            <div><p>PickPoint court</p><h2>{court.name}</h2><span>{court.description || "Court details will be confirmed by the venue."}</span></div>
            <div className="pp-court-hours"><Clock3 /><span><small>Published hours</small>{court.opensAt}–{court.closesAt}</span></div>
            {live
              ? <Link className="pp-icon-link" href={`/book?court=${encodeURIComponent(court.slug)}`} aria-label={`Book ${court.name}`}><ArrowRight /></Link>
              : <span className="pp-pill">Not open yet</span>}
          </article>
        ))}
      </section>
    </GuestShell>
  );
}
