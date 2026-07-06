import "./globals.css";
import type { Metadata } from "next";
import { Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import { BrainCanvas } from "@/components/BrainCanvas";

// Hanken Grotesk drives all body/UI text; JetBrains Mono is reserved for the
// clock, date, and the uppercase name labels above each message bubble.
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-hanken",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Silas",
  description: "Hudson's personal AI brain",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${hanken.variable} ${jetbrains.variable}`}>
      <body>
        <BrainCanvas />
        <div className="relative z-10 min-h-screen">{children}</div>
      </body>
    </html>
  );
}
