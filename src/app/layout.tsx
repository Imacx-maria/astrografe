import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "./ConvexClientProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Astrografe — Quote Parser",
  description: "Local quote extraction and search dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <nav className="border-b border-neutral-200 px-6 py-3 flex gap-6 text-sm font-medium">
          <a href="/ingest" className="hover:text-blue-600">Ingest</a>
          <a href="/search" className="hover:text-blue-600">Search</a>
          <a href="/settings" className="hover:text-blue-600">Settings</a>
        </nav>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
