import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FrameScan · Order Studio",
  description: "Capture patient orders, track their progress, and collect frame UPCs from your laptop or phone.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
