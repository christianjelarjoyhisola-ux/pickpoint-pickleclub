"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useRef, useState } from "react";

const venueViews = [
  {
    src: "/images/venue/courts-main.jpg",
    alt: "Artist's perspective across both PickPoint pickleball courts",
    label: "Two dedicated courts",
    className: "pp-gallery-wide",
  },
  {
    src: "/images/venue/venue-overview.jpg",
    alt: "Aerial artist's perspective of the two PickPoint courts and clubhouse",
    label: "The complete venue",
    className: "pp-gallery-overview",
  },
  {
    src: "/images/venue/courts-sunset.jpg",
    alt: "Artist's perspective of the PickPoint courts in warm evening light",
    label: "Made for morning and evening play",
    className: "",
  },
  {
    src: "/images/venue/clubhouse-courtside.jpg",
    alt: "Artist's perspective of the covered courtside clubhouse",
    label: "Covered courtside clubhouse",
    className: "",
  },
  {
    src: "/images/venue/clubhouse-interior.jpg",
    alt: "Artist's perspective from the covered clubhouse seating area toward the courts",
    label: "A comfortable view of the action",
    className: "",
  },
  {
    src: "/images/venue/courts-clubhouse.jpg",
    alt: "Artist's perspective of a PickPoint court facing the clubhouse",
    label: "Courtside convenience",
    className: "",
  },
  {
    src: "/images/venue/courts-front.jpg",
    alt: "Front artist's perspective of the PickPoint pickleball courts",
    label: "A clear, open playing space",
    className: "",
  },
] as const;

export function HomeVenuePreview() {
  return (
    <section className="pp-home-venue" aria-labelledby="home-venue-title">
      <div className="pp-home-venue-image">
        <Image
          src="/images/venue/courts-main.jpg"
          alt="Artist's perspective of the PickPoint pickleball courts and clubhouse"
          width={1289}
          height={721}
          sizes="(max-width: 780px) calc(100vw - 40px), 58vw"
          unoptimized
        />
        <span>Artist&apos;s perspective</span>
      </div>
      <div className="pp-home-venue-copy">
        <p className="pp-kicker">Your place to play</p>
        <h2 id="home-venue-title">See the courts before you arrive.</h2>
        <p>Explore the planned courts, playing space, and covered clubhouse at PickPoint.</p>
        <Link className="pp-text-link pp-venue-link" href="/courts">
          Explore the venue <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

export function VenueGallery({ bookingOpen }: { bookingOpen: boolean }) {
  const galleryRef = useRef<HTMLDivElement>(null);
  const [currentView, setCurrentView] = useState(1);

  function updateCurrentView() {
    const gallery = galleryRef.current;
    if (!gallery) return;
    const cards = Array.from(gallery.querySelectorAll<HTMLElement>("figure"));
    const closest = cards.reduce((best, card, index) => {
      const distance = Math.abs(card.offsetLeft - gallery.scrollLeft - gallery.clientLeft);
      return distance < best.distance ? { index, distance } : best;
    }, { index: 0, distance: Number.POSITIVE_INFINITY });
    setCurrentView(closest.index + 1);
  }

  return (
    <section className="pp-venue-gallery" aria-labelledby="venue-gallery-title">
      <header className="pp-venue-gallery-head">
        <h2 id="venue-gallery-title">Venue preview</h2>
        <p>These architectural renderings show the planned courts and clubhouse. Final finishes and landscaping may vary.</p>
      </header>
      <div className="pp-gallery-progress" aria-live="polite">
        <span>Swipe to explore</span>
        <strong>{currentView} of {venueViews.length}</strong>
      </div>
      <div className="pp-gallery-grid" ref={galleryRef} onScroll={updateCurrentView} aria-label="Venue perspectives">
        {venueViews.map((view, index) => (
          <figure className={view.className} key={view.src}>
            <Image
              src={view.src}
              alt={view.alt}
              width={1289}
              height={view.className === "pp-gallery-overview" ? 1424 : 723}
              sizes={view.className === "pp-gallery-overview" ? "(max-width: 780px) 88vw, 38vw" : "(max-width: 780px) 88vw, 30vw"}
              unoptimized
            />
            <figcaption><span>{String(index + 1).padStart(2, "0")}</span>{view.label}</figcaption>
          </figure>
        ))}
      </div>
      <p className="pp-rendering-note">Artist&apos;s perspectives shown for visualization purposes.</p>
      <div className="pp-gallery-action">
        <div><small>Ready for your next rally?</small><strong>Find a time that works for your group.</strong></div>
        {bookingOpen
          ? <Link className="pp-button pp-button-lime" href="/book#booking-times">Check available times <ArrowRight aria-hidden="true" /></Link>
          : <span className="pp-pill">Online booking opening soon</span>}
      </div>
    </section>
  );
}
