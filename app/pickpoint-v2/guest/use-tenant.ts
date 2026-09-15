"use client";

import { useEffect, useState } from "react";
import { getTenantBootstrap } from "../../lib/platform/client";
import type { TenantBootstrap } from "../../lib/platform/types";

export function useTenant() {
  const [data, setData] = useState<TenantBootstrap | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    getTenantBootstrap()
      .then((result) => { if (active) setData(result); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Venue details are unavailable."); });
    return () => { active = false; };
  }, []);
  return { data, error, loading: !data && !error };
}
