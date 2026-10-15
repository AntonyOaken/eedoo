import type { Metadata, Viewport } from "next";
import "./globals.css";
import { appleStartupImages } from "@/lib/apple-startup-images";
import { AppExperience } from "@/components/app-experience";

export const viewport: Viewport = { themeColor: "#315e7d", width: "device-width", initialScale: 1, viewportFit: "cover" };

export const metadata: Metadata = {
  title: "EEDOO — прогулки по городу",
  description: "Пешеходные маршруты с интересными местами, временем и шагами.",
  manifest: "/manifest.webmanifest?v=loop-2",
  appleWebApp: { capable: true, title: "EEDOO", statusBarStyle: "black-translucent", startupImage: appleStartupImages },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" data-launching="" suppressHydrationWarning>
      <head>
        <link rel="icon" type="image/x-icon" sizes="16x16 32x32 48x48 256x256" href="/favicon.ico?v=loop-3"/>
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/eedoo-loop-32.png"/>
        <link rel="icon" type="image/png" sizes="192x192" href="/icons/eedoo-loop-192.png"/>
        <link rel="shortcut icon" type="image/png" href="/icons/eedoo-loop-192.png"/>
        <link rel="apple-touch-icon" type="image/png" sizes="180x180" href="/eedoo-apple-touch-icon-v2.png"/>
        <link rel="apple-touch-icon-precomposed" type="image/png" sizes="180x180" href="/eedoo-apple-touch-icon-v2.png"/>
        <meta name="apple-mobile-web-app-capable" content="yes"/>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
        <link rel="preload" as="image" href="/launch/saint-isaacs-portrait.jpeg"/>
        <link rel="preload" as="font" href="/fonts/outfit-medium.ttf" type="font/ttf" crossOrigin="anonymous"/>
        <link rel="stylesheet" href="/vendor/leaflet.css"/>
      </head><body className="antialiased"><AppExperience />{children}</body>
    </html>
  );
}
