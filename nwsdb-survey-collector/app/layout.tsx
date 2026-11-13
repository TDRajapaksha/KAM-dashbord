import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KAM Collector",
  description: "KAM Collector data collection",
  icons: {
    icon: "/kam-app-icon.png",
    apple: "/kam-app-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}