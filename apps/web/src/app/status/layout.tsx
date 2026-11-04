import type { CSSProperties, ReactNode } from "react";
import { Geist_Mono } from "next/font/google";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Geist Mono is only used on this page, so only this layout loads and preloads it.
export default function StatusLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={geistMono.variable}
      style={{ "--font-mono": "var(--font-geist-mono)" } as CSSProperties}
    >
      {children}
    </div>
  );
}
