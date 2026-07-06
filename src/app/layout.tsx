import "./globals.css";
import type { Metadata } from "next";
import { AuroraBrain } from "@/components/AuroraBrain";

export const metadata: Metadata = {
  title: "Silas",
  description: "Hudson's personal AI brain",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600&family=JetBrains+Mono:wght@500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AuroraBrain />
        <div className="relative z-10 min-h-screen">{children}</div>
      </body>
    </html>
  );
}
