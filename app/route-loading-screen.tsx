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
        <div className="route-loading-brand" aria-hidden="true">
          <Image
            className="route-loading-mark"
            src="/pickpoint-mark-v4.png"
            alt=""
            width={96}
            height={86}
            priority
            unoptimized
          />
          <Image
            className="route-loading-wordmark"
            src="/pickpoint-wordmark-v3.png"
            alt=""
            width={420}
            height={140}
            priority
            unoptimized
          />
        </div>
        <div className="route-loading-court" aria-hidden="true">
          <span className="route-loading-court-line" />
          <span className="route-loading-runner" />
        </div>
        <p>PickPoint Court Desk</p>
        <strong>Preparing your next rally…</strong>
        <span>Live courts. Clear times. Ready to play.</span>
        <span className="route-loading-progress" aria-hidden="true"><i /></span>
      </div>
    </div>
  );
}
