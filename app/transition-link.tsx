"use client";

import NextLink, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";
import { createPortal } from "react-dom";
import { RouteLoadingScreen } from "./route-loading-screen";

type TransitionLinkProps = ComponentProps<typeof NextLink>;

function PendingRouteLoader() {
  const { pending } = useLinkStatus();
  const portalRoot = typeof document === "undefined" ? null : document.body;

  if (!pending || !portalRoot) return null;
  return createPortal(
    <div
      className="route-loading-portal"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <RouteLoadingScreen source="link" />
    </div>,
    portalRoot,
  );
}

export function TransitionLink({ children, ...props }: TransitionLinkProps) {
  return (
    <NextLink {...props}>
      {children}
      <PendingRouteLoader />
    </NextLink>
  );
}
