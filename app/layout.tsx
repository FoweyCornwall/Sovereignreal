import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AmbientBackground } from "@/components/ui/AmbientBackground";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sovereign",
  description: "An endless nation-building strategy game.",
};

const THEME_INIT_SCRIPT = `
(function () {
  try {
    var pref = localStorage.getItem("theme") || "dark";
    var isDark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", isDark);
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Satoshi isn't on Google Fonts, so next/font/local self-hosting
            isn't an option here - loaded via Fontshare's CDN instead. */}
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link
          href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <AmbientBackground />
        {children}
      </body>
    </html>
  );
}
