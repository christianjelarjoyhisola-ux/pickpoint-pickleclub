import type { TenantBootstrap } from "../../lib/platform/types";

export function isPublicBookingReady(data: TenantBootstrap | null | undefined) {
  return Boolean(
    data?.readiness.publicBookingEnabled === true
    && data.readiness.blockingReasons.length === 0
    && data.courts.length > 0
    && data.paymentMethods.length > 0,
  );
}
