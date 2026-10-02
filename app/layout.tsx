import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Civilist — юридический тренажёр",
  description: "Уроки, повторение права и интерактивные юридические дела.",
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
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}
