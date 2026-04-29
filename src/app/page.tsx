"use client";

import dynamic from "next/dynamic";
import { useBinanceWebSocket } from "@/hooks/useBinanceWebSocket";
import { useChartContext } from "@/context/ChartContext";
import PriceDisplay from "@/components/PriceDisplay";
import NavHeader from "@/components/NavHeader";

const CryptoChart = dynamic(() => import("@/components/CryptoChart"), {
  ssr: false,
  loading: () => (
    <div className='w-full h-full flex items-center justify-center'>
      <div className='flex flex-col items-center gap-4'>
        <div className='w-8 h-8 border border-accent/30 border-t-accent animate-spin rounded-full' />
        <span className='text-xs font-mono text-muted tracking-widest'>
          LOADING CHART
        </span>
      </div>
    </div>
  ),
});

export default function Home() {
  const { symbol, timeRange } = useChartContext();
  const { ticker, klines, latestKline, status, reconnect } =
    useBinanceWebSocket(symbol, timeRange);

  return (
    <main className='w-screen h-screen bg-bg flex flex-col overflow-hidden'>
      <NavHeader
        status={status}
        onReconnect={reconnect}
        rightSlot={<PriceDisplay ticker={ticker} />}
      />

      <div className='sm:hidden px-4 py-2 border-b border-border/50'>
        <PriceDisplay ticker={ticker} />
      </div>

      <div className='flex-1 min-h-0 relative'>
        <CryptoChart
          klines={klines}
          latestKline={latestKline}
          currentPrice={ticker?.price ?? null}
        />
      </div>

      <footer className='flex-none px-4 py-1.5 border-t border-border flex items-center justify-between'>
        <span className='text-[10px] font-mono text-muted/40'>
          {symbol.label} · {timeRange.label} · {timeRange.interval} CANDLES ·
          BINANCE
        </span>
        <span className='text-[10px] font-mono text-muted/40'>
          {latestKline
            ? new Date(latestKline.time * 1000).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
              })
            : "——:——:——"}
        </span>
      </footer>
    </main>
  );
}
