import { pickPointConfig } from "./pickpoint-pickleclub/config";

export const ACTIVE_TENANT_SLUG = "pickpoint-pickleclub" as const;

const tenantRegistry = {
  "pickpoint-pickleclub": pickPointConfig,
} as const;

export type RegisteredTenantSlug = keyof typeof tenantRegistry;

export function getTenantConfig(slug: string) {
  if (slug !== ACTIVE_TENANT_SLUG) {
    throw new Error("Unknown tenant.");
  }
  return tenantRegistry[slug];
}

export const activeTenant = getTenantConfig(ACTIVE_TENANT_SLUG);
