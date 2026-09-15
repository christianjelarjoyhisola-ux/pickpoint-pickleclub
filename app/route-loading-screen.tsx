type RouteLoadingScreenProps = {
  source?: "boundary" | "link";
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
        <div className="route-loading-court" aria-hidden="true">
          <span className="route-loading-court-line" />
          <span className="route-loading-ball-wrap">
            <span className="route-loading-ball" />
          </span>
          <span className="route-loading-shadow" />
        </div>
        <p>PickPoint · Court Hub</p>
        <strong>Loading your next rally…</strong>
        <span>Getting the court ready.</span>
      </div>
    </div>
  );
}
