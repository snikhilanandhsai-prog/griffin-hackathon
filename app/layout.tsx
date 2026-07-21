import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "InfraAI — Fleet Monitor",
  description: "Intelligent infrastructure monitoring dashboard with digital twin simulation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" id="html-root">
      <body>
        {children}
        {/* Supabase UMD — beforeInteractive so it's available on all pages immediately */}
        <Script
          src="https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.js"
          strategy="beforeInteractive"
        />
        {/* Dashboard dependencies — loaded globally so they're ready for script.js */}
        <Script
          src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js"
          strategy="beforeInteractive"
        />
        <Script
          src="https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js"
          strategy="beforeInteractive"
        />
        <Script
          src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"
          strategy="beforeInteractive"
        />
      </body>
    </html>
  );
}
