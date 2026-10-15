import type { Metadata, Viewport } from "next";
import "./globals.css";
import { appleStartupImages } from "@/lib/apple-startup-images";
import { AppExperience } from "@/components/app-experience";

export const viewport: Viewport = { themeColor: "#147b73", width: "device-width", initialScale: 1, viewportFit: "cover" };

export const metadata: Metadata = {
  title: "EEDOO — прогулки по городу",
  description: "Пешеходные маршруты с интересными местами, временем и шагами.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "EEDOO", statusBarStyle: "black-translucent", startupImage: appleStartupImages },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/icons/icon-180.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <head><link rel="stylesheet" href="/vendor/leaflet.css" /></head><body className="antialiased"><AppExperience />{children}</body>
    </html>
  );
}
