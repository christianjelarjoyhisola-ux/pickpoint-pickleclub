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
          <Image src="/pickpoint-pickleclub-wordmark.png" alt="PickPoint Pickle Club" width={420} height={122} priority />
        </Link>
        <nav className="pp-nav" aria-label="Main navigation">
          <Link className={current === "courts" ? "is-current" : ""} href="/courts">Courts</Link>
          <Link className={current === "manage" ? "is-current" : ""} href="/book?mode=manage">My booking</Link>
          <Link className="pp-nav-cta" href="/book">Book a court</Link>
        </nav>
      </header>
      <main id="main-content">{children}</main>
      <footer className="pp-footer">
        <div><Image src="/pickpoint-pickleclub-mark.png" alt="" width={56} height={64} /><strong>PickPoint Pickle Club</strong></div>
        <p>Play. Rally. Connect.</p>
        <Link href="/manage">Staff sign in</Link>
      </footer>
    </div>
  );
}
