import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { ConvexClientProvider } from "./ConvexClientProvider";
import { Navigation } from "@/components/Navigation";
import { Header } from "@/components/Header";

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
    <html lang="pt" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange>
          <ConvexClientProvider>
            <div className="flex min-h-screen bg-background">
              <Navigation />
              <div className="flex flex-col flex-1 min-w-0">
                <Header />
                <main className="flex-1">
                  {children}
                </main>
              </div>
            </div>
          </ConvexClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
