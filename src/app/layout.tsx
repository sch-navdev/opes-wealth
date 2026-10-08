import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Sans_Arabic, IBM_Plex_Sans_Devanagari, Michroma } from "next/font/google";
import { LanguageProvider } from "@/context/language-context";
import { ThemeProvider } from "@/components/theme-provider";
import { COMFORT_INIT_SCRIPT } from "@/lib/comfort-mode";
import "./globals.css";

// Brand typefaces (see tracker/Design-System.md > Chronograph). Self-hosted by next/font at build time.
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin", "latin-ext", "cyrillic"],
  // A variable font (Plex Sans is published with a weight axis): no explicit weight list.
});

const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-plex-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600"],
});

const plexDevanagari = IBM_Plex_Sans_Devanagari({
  variable: "--font-plex-devanagari",
  subsets: ["devanagari"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
});

/** Wide technical caps for small index labels only (currency codes, captions); never body text. */
const indexFace = Michroma({
  variable: "--font-index-face",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Opes Wealth",
  description: "A private dashboard for tracking real estate, holdings, and cash in one place.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${plexSans.variable} ${plexArabic.variable} ${plexDevanagari.variable} ${plexMono.variable} ${indexFace.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: COMFORT_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <LanguageProvider>{children}</LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
