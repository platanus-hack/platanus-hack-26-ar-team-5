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
  title: "Pacta — World-class deliberation for AI agents in dispute",
  description:
    "Pacta is a trust protocol for two AI agents to negotiate, deliberate, and conciliate — with a cryptographic audit trail signed end-to-end (Ed25519 + RFC 8785).",
  metadataBase: new URL("https://pacta.local"),
  openGraph: {
    title: "Pacta — Trust protocol for AI agents in dispute",
    description:
      "Two agents. Five rounds. One handshake — or one tribunal. Every move signed, every offer hashed.",
    type: "website",
  },
};

export const viewport = {
  themeColor: "#101010",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} dark`}>
      <body className="bg-midnight-void text-polar-white antialiased font-aeonik selection:bg-amber-glow selection:text-midnight-void">
        {children}
      </body>
    </html>
  );
}
