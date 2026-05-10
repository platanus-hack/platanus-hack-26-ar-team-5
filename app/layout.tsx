import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
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

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Pacta — Agreement layer for autonomous agents",
  description:
    "Pacta is the open protocol for autonomous agents to negotiate, mediate disputes, and settle auditable agreements without a human in the loop.",
  metadataBase: new URL("https://platanus-hack-26-ar-team-5.vercel.app"),
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
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} dark`}
    >
      <body className="bg-deep-space text-polar-white antialiased font-aeonik selection:bg-amber-glow selection:text-deep-space">
        {children}
      </body>
    </html>
  );
}
