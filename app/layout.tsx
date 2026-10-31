import Link from "next/link";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NagarNetra",
  description: "One report. The right authority. Public accountability.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <nav className="flex flex-wrap items-center gap-4 border-b px-4 py-2 text-sm">
          <Link href="/" className="font-semibold">NagarNetra</Link>
          <Link href="/report">Report</Link>
          <Link href="/stats">Stats</Link>
          <Link href="/me">My reports</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
