import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "FreshTrace — Farm-to-Table Marketplace",
  description: "Freshness intelligence and direct produce delivery in Dhaka",
};

export default function RootLayout({ children }) {
  return (
    // `data-scroll-behavior="smooth"` tells Next.js that the smooth scrolling
    // set in `globals.css` is intentional, so it does not force
    // `scroll-behavior: auto` during route transitions. Without it the
    // catalogue's filter links animate a long scroll on every navigation.
    <html lang="en" data-scroll-behavior="smooth">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}