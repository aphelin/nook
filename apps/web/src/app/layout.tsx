import type { Metadata, Viewport } from "next";
import { Funnel_Display, Funnel_Sans } from "next/font/google";
import { QueryProvider } from "@/lib/query";
import { RealtimeProvider } from "@/lib/realtime";
import { SessionProvider } from "@/lib/session";
import "./globals.css";

/*
 * The working face. Funnel Sans carries every message, label and control: a plain, open grotesk at
 * 15px that stays calm on a loud colour, drawn by the same hand as the display cut so the two read
 * as one voice at two volumes.
 */
const sans = Funnel_Sans({
  subsets: ["latin"],
  variable: "--font-funnel-sans",
  display: "swap",
});

/*
 * The loud voice. Funnel Display at 800 names things at poster size — the channel at the head of
 * the room, the nook, the landing headline — where its pinched joins show and the club's colour
 * behind it does the rest.
 */
const display = Funnel_Display({
  subsets: ["latin"],
  variable: "--font-funnel-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Nook", template: "%s · Nook" },
  description: "A chat app for communities and clubs.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f39539" },
    { media: "(prefers-color-scheme: dark)", color: "#163755" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} h-full`}>
      <body className="surface-stage min-h-full">
        <SessionProvider>
          <QueryProvider>
            <RealtimeProvider>{children}</RealtimeProvider>
          </QueryProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
