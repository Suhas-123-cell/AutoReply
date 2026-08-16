import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

// Self-hosted at build time (no request to Google at runtime), OFL-licensed,
// so it's safe to ship in a self-hosted, MIT-licensed repo. Replaces the bare
// `system-ui` stack that made every screen render in whatever font happened
// to be installed on the visitor's OS.
const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AutoReply",
  description: "AutoReply — Instagram and Telegram comment-to-DM automation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full dark ${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-full bg-background text-foreground font-sans antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
