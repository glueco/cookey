import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Cookey — connect your keys safely",
  description:
    "Self-hosted personal API gateway: store your API keys once, grant apps controlled, time-limited, budget-capped access — without ever handing over the keys.",
  keywords: [
    "API gateway",
    "BYOK",
    "API key management",
    "personal proxy",
    "self-hosted",
  ],
  authors: [{ name: "Cookey" }],
  openGraph: {
    title: "Cookey — connect your keys safely",
    description:
      "Grant apps controlled, revocable access to your API keys without ever handing them over.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f5" },
    { media: "(prefers-color-scheme: dark)", color: "#161512" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      /* Brand accent. Swap for "iris" | "blue" | "teal" to re-tone the
         whole app — the ramps live in the brand palette block at the
         top of globals.css. */
      data-brand="ink"
      className={`${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Set the theme class before paint (localStorage pref, else system) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("cookey:theme");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d);}catch(e){}`,
          }}
        />
      </head>
      <body className={`${inter.className} antialiased min-h-screen`}>
        {children}
      </body>
    </html>
  );
}
