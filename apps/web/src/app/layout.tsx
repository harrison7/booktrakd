import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import { Suspense } from "react";
import { Header } from "@/components/header";
import { Providers } from "@/lib/trpc";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const serif = Source_Serif_4({ subsets: ["latin"], variable: "--font-source-serif" });

export const metadata: Metadata = {
  title: { default: "booktrakd", template: "%s • booktrakd" },
  description:
    "Track books you've read. Save those you want to read. Tell your friends what's good.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable}`}>
      <body className="min-h-screen">
        <Providers>
          <Suspense>
            <Header />
          </Suspense>
          <main>{children}</main>
          <footer className="mx-auto max-w-6xl px-4 py-10 text-xs text-muted">
            Book data from{" "}
            <a href="https://openlibrary.org" className="underline">
              Open Library
            </a>
            .
          </footer>
        </Providers>
      </body>
    </html>
  );
}
