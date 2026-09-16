"use client";

import Image from "next/image";
import Link from "next/link";
import { CalendarPlus, House, Map, ShieldCheck, TicketCheck } from "lucide-react";
import type { ReactNode } from "react";

type GuestShellProps = { children: ReactNode; current?: "home" | "courts" | "book" | "manage" };

export function GuestShell({ children, current }: GuestShellProps) {
  return (
    <div className="pp-app">
      <header className="pp-header">
        <Link className="pp-brand" href="/" aria-label="PickPoint Pickle Club home">
          <Image className="pp-brand-mark" src="/pickpoint-mark-v4.png" alt="" width={72} height={64} priority unoptimized />
          <Image className="pp-brand-wordmark" src="/pickpoint-wordmark-v3.png" alt="PickPoint Pickle Club" width={420} height={140} priority unoptimized />
        </Link>
        <nav className="pp-nav" aria-label="Main navigation">
          <Link aria-current={current === "home" ? "page" : undefined} className={`pp-mobile-home${current === "home" ? " is-current" : ""}`} href="/"><House aria-hidden="true" /><span>Home</span></Link>
          <Link aria-current={current === "courts" ? "page" : undefined} className={current === "courts" ? "is-current" : ""} href="/courts"><Map aria-hidden="true" /><span>Courts</span></Link>
          <Link aria-current={current === "manage" ? "page" : undefined} className={`pp-manage${current === "manage" ? " is-current" : ""}`} href="/book?mode=manage"><TicketCheck aria-hidden="true" /><span>My booking</span></Link>
          <Link aria-current={current === "book" ? "page" : undefined} className={`pp-nav-cta${current === "book" ? " is-current" : ""}`} href="/book"><CalendarPlus aria-hidden="true" /><span>Book</span></Link>
        </nav>
        <Link className="pp-admin-login" href="/manage"><ShieldCheck aria-hidden="true" /><span>Admin login</span></Link>
      </header>
      <main id="main-content">{children}</main>
      <footer className="pp-footer">
        <div><Image src="/pickpoint-mark-v4.png" alt="" width={56} height={50} unoptimized /><strong>PickPoint Pickle Club</strong></div>
        <p>Play. Rally. Connect.</p>
        <Link href="/manage">Admin login</Link>
      </footer>
    </div>
  );
}
