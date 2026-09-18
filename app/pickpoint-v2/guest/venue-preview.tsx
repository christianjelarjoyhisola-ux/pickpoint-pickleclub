import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

const venueViews = [
  {
    src: "/images/venue/venue-overview.jpg",
    alt: "Aerial artist's perspective of the two PickPoint courts and clubhouse",
    label: "The complete venue",
    className: "pp-gallery-overview",
  },
  {
    src: "/images/venue/courts-main.jpg",
    alt: "Artist's perspective across both PickPoint pickleball courts",
    label: "Two dedicated courts",
    className: "pp-gallery-wide",
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

export function VenueGallery() {
  return (
    <section className="pp-venue-gallery" aria-labelledby="venue-gallery-title">
      <header className="pp-venue-gallery-head">
        <div>
          <p className="pp-kicker">Venue preview</p>
          <h2 id="venue-gallery-title">A closer look at PickPoint.</h2>
        </div>
        <p>These architectural renderings show the planned courts and clubhouse. Final finishes and landscaping may vary.</p>
      </header>
      <div className="pp-gallery-grid">
        {venueViews.map((view, index) => (
          <figure className={view.className} key={view.src}>
            <Image
              src={view.src}
              alt={view.alt}
              width={1289}
              height={index === 0 ? 1424 : 723}
              sizes={index === 0 ? "(max-width: 780px) 88vw, 38vw" : "(max-width: 780px) 88vw, 30vw"}
              unoptimized
            />
            <figcaption><span>{String(index + 1).padStart(2, "0")}</span>{view.label}</figcaption>
          </figure>
        ))}
      </div>
      <p className="pp-rendering-note">Artist&apos;s perspectives shown for visualization purposes.</p>
    </section>
  );
}
