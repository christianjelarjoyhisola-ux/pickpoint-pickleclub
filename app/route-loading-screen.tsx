import Image from "next/image";

type RouteLoadingScreenProps = {
  source?: "boundary" | "link" | "startup";
};

export function RouteLoadingScreen({
  source = "boundary",
}: RouteLoadingScreenProps) {
  return (
    <div
      className="route-loading-screen"
      data-loading-source={source}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="route-loading-card">
        <div className="route-loading-emblem" aria-hidden="true">
          <span className="route-loading-halo" />
          <span className="route-loading-orbit"><i /></span>
          <Image
            className="route-loading-mark"
            src="/pickpoint-mark-v2.png"
            alt=""
            width={120}
            height={107}
            priority
            unoptimized
          />
        </div>
        <span className="route-loading-progress" aria-hidden="true"><i /></span>
        <span className="sr-only">Loading PickPoint…</span>
      </div>
    </div>
  );
}
