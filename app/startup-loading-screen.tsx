"use client";

import { useEffect, useState } from "react";
import { RouteLoadingScreen } from "./route-loading-screen";

const MINIMUM_VISIBLE_MS = 900;
const MAXIMUM_VISIBLE_MS = 2500;
const EXIT_MS = 360;

export function StartupLoadingScreen() {
  const [phase, setPhase] = useState<"visible" | "leaving" | "hidden">("visible");

  useEffect(() => {
    const startedAt = performance.now();
    let exitTimer = 0;
    let hiddenTimer = 0;
    let maximumTimer = 0;
    let finishing = false;

    const finish = () => {
      if (finishing) return;
      finishing = true;
      const remaining = Math.max(0, MINIMUM_VISIBLE_MS - (performance.now() - startedAt));
      exitTimer = window.setTimeout(() => {
        setPhase("leaving");
        hiddenTimer = window.setTimeout(() => setPhase("hidden"), EXIT_MS);
      }, remaining);
    };

    if (document.readyState === "complete") finish();
    else window.addEventListener("load", finish, { once: true });
    maximumTimer = window.setTimeout(finish, MAXIMUM_VISIBLE_MS);

    return () => {
      window.removeEventListener("load", finish);
      window.clearTimeout(exitTimer);
      window.clearTimeout(hiddenTimer);
      window.clearTimeout(maximumTimer);
    };
  }, []);

  if (phase === "hidden") return null;
  return (
    <div className={`startup-loading-root${phase === "leaving" ? " is-leaving" : ""}`}>
      <RouteLoadingScreen source="startup" />
    </div>
  );
}
