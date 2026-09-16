"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, ChevronDown, Clock3 } from "lucide-react";
import { GuestShell } from "./guest-shell";
import { isPublicBookingReady } from "./readiness";
import { useTenant } from "./use-tenant";

function clock12(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

function courtPhoto(value: Record<string, unknown> | undefined) {
  const url = value?.photoUrl;
  return typeof url === "string" && url.startsWith("https://neqvrwtofiolcuxewdze.supabase.co/storage/v1/object/public/tenant-public-assets/") ? url : null;
}

export function CourtsView() {
  const { data, error, loading } = useTenant();
  const [openCourtId, setOpenCourtId] = useState<string | null>(null);
  const live = isPublicBookingReady(data);
  return (
    <GuestShell current="courts">
      <section className="pp-page-head"><p className="pp-kicker">Court ledger</p><h1>Pick your playing space.</h1><p>Tap a court to see its photo and details.</p></section>
      <section className="pp-court-list" aria-live="polite">
        {loading && <div className="pp-state"><span className="pp-spinner" /> Checking the court setup…</div>}
        {error && <div className="pp-state pp-error"><strong>Courts are unavailable right now.</strong><span>{error}</span></div>}
        {data && data.courts.length === 0 && <div className="pp-state"><strong>No courts have been published yet.</strong><span>The venue team is still completing setup. Check back before opening day.</span></div>}
        {data?.courts.map((court, index) => { const expanded = openCourtId === court.id; const photoUrl = courtPhoto(court.publicConfig); return <article className={`pp-court-row${expanded ? " is-open" : ""}`} key={court.id}>
          <button className="pp-court-summary" type="button" aria-expanded={expanded} onClick={() => setOpenCourtId(expanded ? null : court.id)}>
            <span className="pp-court-number">{String(index + 1).padStart(2, "0")}</span>
            <span className="pp-court-copy"><small>PickPoint court</small><strong>{court.name}</strong><span>{court.description || "Court details will be confirmed by the venue."}</span></span>
            <span className="pp-court-hours"><Clock3 /><span><small>Published hours</small>{clock12(court.opensAt)}–{clock12(court.closesAt)}</span></span>
            <span className="pp-court-expand"><ChevronDown aria-hidden="true" /></span>
          </button>
          {expanded && <div className="pp-court-detail">{photoUrl ? <Image src={photoUrl} alt={`${court.name} at PickPoint Pickle Club`} width={1200} height={675} unoptimized /> : <div className="pp-court-photo-empty">Court photo coming soon</div>}<div><p>{court.description || "This court is ready for your next game."}</p>{live ? <Link className="pp-button pp-button-lime" href={`/book?court=${encodeURIComponent(court.slug)}`}>Book this court <ArrowRight /></Link> : <span className="pp-pill">Not open yet</span>}</div></div>}
        </article>; })}
      </section>
    </GuestShell>
  );
}
