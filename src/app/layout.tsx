import type { Metadata } from "next";
import { JetBrains_Mono, Syne } from "next/font/google";
import "./globals.css";
import { ChartProvider } from "@/context/ChartContext";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Crypto Chart · Live",
  description: "Real-time crypto charts via Binance WebSocket API",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang='en' className='dark'>
      <body
        className={`${jetbrainsMono.variable} ${syne.variable} antialiased bg-bg text-text`}>
        <ChartProvider>{children}</ChartProvider>
      </body>
    </html>
  );
}
