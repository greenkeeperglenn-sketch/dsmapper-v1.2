import type { Metadata } from "next";
import Image from "next/image";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dollar Spot Monitor",
  description:
    "Environmental disease pressure tracking and photo-based dollar spot assessment.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-stone-50 text-stone-900">
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center gap-5 px-6 py-5">
            <Image
              src="/stri-logo.png"
              alt="STRI"
              width={216}
              height={80}
              priority
              className="h-14 w-auto sm:h-16"
            />
            <span className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Dollar Spot Monitor
            </span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
