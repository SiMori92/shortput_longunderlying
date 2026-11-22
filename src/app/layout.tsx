import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Strategy Monitor", description: "Private SOXL / SPAX V3.1 strategy workspace", manifest: "/manifest.webmanifest", icons: { icon: "/icon.svg", apple: "/icon-192.png" } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f7f5ef" };
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return <html lang="en"><body>{children}</body></html>;
}
