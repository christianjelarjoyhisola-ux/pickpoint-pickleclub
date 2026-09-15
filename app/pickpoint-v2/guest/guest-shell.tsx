"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

type GuestShellProps = { children: ReactNode; current?: "home" | "courts" | "book" | "manage" };

export function GuestShell({ children, current }: GuestShellProps) {
  return (
    <div className="pp-app">
      <header className="pp-header">
        <Link className="pp-brand" href="/" aria-label="PickPoint Pickle Club home">
          <Image src="/pickpoint-wordmark-v3.png" alt="PickPoint Pickle Club" width={420} height={140} priority unoptimized />
        </Link>
        <nav className="pp-nav" aria-label="Main navigation">
          <Link aria-current={current === "courts" ? "page" : undefined} className={current === "courts" ? "is-current" : ""} href="/courts">Courts</Link>
          <Link aria-current={current === "manage" ? "page" : undefined} className={current === "manage" ? "is-current" : ""} href="/book?mode=manage">My booking</Link>
          <Link aria-current={current === "book" ? "page" : undefined} className="pp-nav-cta" href="/book">Book a court</Link>
        </nav>
      </header>
      <main id="main-content">{children}</main>
      <footer className="pp-footer">
        <div><Image src="/pickpoint-mark-v2.png" alt="" width={56} height={64} unoptimized /><strong>PickPoint Pickle Club</strong></div>
        <p>Play. Rally. Connect.</p>
        <Link href="/manage">Staff sign in</Link>
      </footer>
    </div>
  );
}
