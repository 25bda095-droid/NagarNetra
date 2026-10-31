import { Suspense } from "react";
import Nav from "@/components/Nav";
import EyeBackdrop from "@/components/EyeBackdrop";
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
      <body className="flex min-h-full flex-col pb-16 sm:pb-0">
        <EyeBackdrop />
        {/* the nav highlights the current path, which is request data on dynamic pages */}
        <Suspense fallback={<div className="h-14 border-b bg-surface" />}>
          <Nav />
        </Suspense>
        <div className="flex flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
