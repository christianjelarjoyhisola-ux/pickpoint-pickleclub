import type { Metadata } from "next";
import { DM_Sans, Sora } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { StartupLoadingScreen } from "./startup-loading-screen";

const dmSans = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

const sora = Sora({
  variable: "--font-display",
  subsets: ["latin"],
});

const title = "PickPoint Pickle Club — Book your court";
const description =
  "Choose a court, see live availability, and reserve your next game at PickPoint Pickle Club.";

function safeRequestOrigin(requestHeaders: Headers): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Fall through to the current request host.
    }
  }
  const host =
    requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "";
  if (!/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(host)) {
    return "http://localhost:3000";
  }
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto");
  const protocol = forwardedProtocol === "https" ? "https" : "http";
  return `${protocol}://${host}`;
}

export async function generateMetadata(): Promise<Metadata> {
  const origin = safeRequestOrigin(await headers());
  return {
    metadataBase: new URL(origin),
    title: { default: title, template: "%s · PickPoint Pickle Club" },
    description,
    applicationName: "PickPoint Pickle Club",
    keywords: ["pickleball", "court booking", "PickPoint", "Philippines"],
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      locale: "en_PH",
      siteName: "PickPoint Pickle Club",
      title,
      description,
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
    icons: {
      icon: [{ url: "/pickpoint-mark-v4.png", type: "image/png" }],
      apple: [{ url: "/pickpoint-mark-v4.png", type: "image/png" }],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-PH">
      <body
        className={`${dmSans.variable} ${sora.variable}`}
      >
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <StartupLoadingScreen />
        {children}
      </body>
    </html>
  );
}
