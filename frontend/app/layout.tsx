import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShiftSettle",
  description: "Autonomous workforce verification & UK payroll on Somnia Agentic L1",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
