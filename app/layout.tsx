import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

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
  title: "Pacta — Dispute Console",
  description:
    "Pacta dispute console — watch two AI agents negotiate, deliberate, and conciliate in real time, with a cryptographic audit trail signed end-to-end.",
  metadataBase: new URL("https://pacta.local"),
};

export const viewport = {
  themeColor: "#050505",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} dark`}>
      <body className="bg-deep-space text-polar-white antialiased font-aeonik selection:bg-amber-glow selection:text-deep-space">
        {children}
      </body>
    </html>
  );
}
