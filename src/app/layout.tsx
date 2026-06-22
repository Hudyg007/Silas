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
      <body>
        <AuroraBrain />
        <div className="relative z-10 min-h-screen">{children}</div>
      </body>
    </html>
  );
}
