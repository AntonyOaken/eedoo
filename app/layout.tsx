import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Попути — прогулки по городу",
  description: "Пешеходные маршруты с интересными местами, временем и шагами.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Попути", statusBarStyle: "default" },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <head><link rel="stylesheet" href="/vendor/leaflet.css" /></head><body className="antialiased">{children}</body>
    </html>
  );
}
