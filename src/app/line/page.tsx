"use client";

import dynamic from "next/dynamic";
import { useRef, useState, useEffect } from "react";
import { useTradeStream } from "@/hooks/useTradeStream";
import { useBinanceWebSocket } from "@/hooks/useBinanceWebSocket";
import NavHeader from "@/components/NavHeader";
import PriceDisplay from "@/components/PriceDisplay";
import { DeltaColumn } from "@/components/LineChart";

const LineChart = dynamic(() => import("@/components/LineChart"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border border-accent/30 border-t-accent animate-spin rounded-full" />
        <span className="text-xs font-mono text-muted tracking-widest">LOADING CHART</span>
      </div>
    </div>
  ),
});

// Convert klines to {time, value} points (close prices)
function toLinePoints(klines: { time: number; close: number }[]) {
  return klines.map((k) => ({ time: k.time, value: k.close }));
}

export default function LinePage() {
  const { ticker, klines, status: wsStatus, reconnect } = useBinanceWebSocket();
  const { smoothPrice, deltas, status: tradeStatus } = useTradeStream();

  const nowRef = useRef(Math.floor(Date.now() / 1000));
  const [currentTime, setCurrentTime] = useState(nowRef.current);

  // Tick current time every second so the dot stays at "now"
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const points = toLinePoints(klines);
  const combinedStatus = tradeStatus === "connected" ? tradeStatus : wsStatus;

  return (
    <main className="w-screen h-screen bg-bg flex flex-col overflow-hidden">
      <NavHeader
        status={combinedStatus}
        onReconnect={reconnect}
        rightSlot={<PriceDisplay ticker={ticker} />}
      />

      {/* Mobile price */}
      <div className="sm:hidden px-5 py-2 border-b border-border/50">
        <PriceDisplay ticker={ticker} />
      </div>

      {/* Main content: chart + delta column */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Chart area */}
        <div className="flex-1 min-w-0 relative">
          <LineChart
            points={points}
            smoothPrice={smoothPrice}
            currentTime={currentTime}
          />
        </div>

        {/* Delta column — right side */}
        <div className="flex-none w-[88px]">
          <DeltaColumn deltas={deltas} />
        </div>
      </div>

      {/* Footer */}
      <footer className="flex-none px-5 py-2 border-t border-border flex items-center justify-between">
        <span className="text-[10px] font-mono text-muted/40">
          DATA · BINANCE AGG TRADE STREAM · 3-TICK SMOOTHING
        </span>
        <span className="text-[10px] font-mono text-muted/40">
          {new Date(currentTime * 1000).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          })}
        </span>
      </footer>
    </main>
  );
}
