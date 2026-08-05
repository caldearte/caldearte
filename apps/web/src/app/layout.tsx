import type { Metadata, Viewport } from "next";
import { Inter, Lato, Geist, Fragment_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { esCL } from "@/i18n/es-CL";
import AuthSessionProvider from "@/components/AuthSessionProvider";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

// Rediseño 2.0.0 — 3 fuentes nuevas (Figma, ver
// docs/plan de rediseño): Lato para wordmark/headings, Geist para
// labels/UI, Fragment Mono para texto trackeado/body. Lato en Google
// Fonts solo trae 100/300/400/700/900 (no 600/800, que es lo que Figma
// pide como SemiBold/ExtraBold) — aproximado con 700/900, decisión
// confirmada con el usuario.
const lato = Lato({
  variable: "--font-lato",
  subsets: ["latin"],
  weight: ["400", "700", "900"],
});

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const fragmentMono = Fragment_Mono({
  variable: "--font-fragment-mono",
  subsets: ["latin"],
  weight: ["400"],
});

const title = "Caldearte";
const description = esCL.appDescription;

export const metadata: Metadata = {
  // www, not the apex — caldearte.com 308-redirects to www.caldearte.com at
  // the Vercel domain level (project settings, not in this repo), so the
  // apex is never the actual final URL for anything. Using it here would
  // make every relative-URL-derived OG/canonical tag resolve to a URL that
  // immediately redirects, which is exactly what broke Google Search
  // Console's sitemap fetch (see robots.ts/sitemap.ts).
  metadataBase: new URL("https://www.caldearte.com"),
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: title,
    locale: "es_CL",
    type: "website",
  },
  twitter: {
    card: "summary",
    title,
    description,
  },
};

// Next.js doesn't inject this by default — without it, mobile browsers
// assume a ~980px desktop layout and scale the whole page down to fit,
// which is exactly the "everything looks zoomed out" symptom.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${inter.variable} ${lato.variable} ${geist.variable} ${fragmentMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <AuthSessionProvider>{children}</AuthSessionProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
