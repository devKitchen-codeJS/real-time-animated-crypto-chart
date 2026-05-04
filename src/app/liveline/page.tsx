"use client";

import { useState } from "react";
import { useBinanceWebSocket } from "@/hooks/useBinanceWebSocket";
import { useChartContext } from "@/context/ChartContext";
import { useTickStream } from "@/hooks/useTickStream";
import NavHeader from "@/components/NavHeader";
import PriceDisplay from "@/components/PriceDisplay";
import { DeltaColumn } from "@/components/LineChart";
import { LiveLineChart, LiveDotConfig } from "@/components/LiveLineChart";

const DOT_PRESETS: { label: string; dot: LiveDotConfig }[] = [
  {
    label: "● Pulse",
    dot: { type: "circle", radius: 5, pulse: true, glow: true },
  },
  {
    label: "◎ Solid",
    dot: { type: "circle", radius: 6, pulse: false, glow: true },
  },
  {
    label: "◆ Diamond",
    dot: {
      type: "custom",
      draw: (ctx, x, y, color) => {
        const s = 9;
        ctx.save();
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(x, y - s);
        ctx.lineTo(x + s, y);
        ctx.lineTo(x, y + s);
        ctx.lineTo(x - s, y);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      },
    },
  },
  {
    label: "★ Star",
    dot: {
      type: "custom",
      draw: (ctx, x, y, color) => {
        ctx.save();
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 === 0 ? 10 : 4;
          const a = (i * Math.PI) / 5 - Math.PI / 2;
          if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
          else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      },
    },
  },
  {
    label: "🪙 BTC Icon",
    dot: {
      type: "image",
      src: "https://assets.coingecko.com/coins/images/1/small/bitcoin.png",
      width: 28,
      height: 28,
    },
  },
];

export default function LiveLinePage() {
  const { symbol, timeRange } = useChartContext();
  const [dotIdx, setDotIdx] = useState(0);

  const {
    ticker,
    status: wsStatus,
    reconnect,
  } = useBinanceWebSocket(symbol, timeRange);
  const { deltas, status: tickStatus } = useTickStream(symbol);
  const combinedStatus = tickStatus === "connected" ? tickStatus : wsStatus;

  return (
    <main className='w-screen h-screen flex flex-col bg-[#0a0a0f]'>
      <NavHeader
        status={combinedStatus}
        onReconnect={reconnect}
        rightSlot={<PriceDisplay ticker={ticker} />}
      />

      <div className='sm:hidden px-4 py-2 border-b border-border/50'>
        <PriceDisplay ticker={ticker} />
      </div>

      {/* Dot selector */}
      <div className='flex-none px-4 py-2 border-b border-white/5 flex items-center gap-2 overflow-x-auto'>
        <span className='text-[10px] font-mono text-white/25 whitespace-nowrap mr-1 tracking-widest uppercase'>
          Dot
        </span>
        {DOT_PRESETS.map((p, i) => (
          <button
            key={i}
            onClick={() => setDotIdx(i)}
            className={`text-[11px] font-mono px-3 py-1 rounded whitespace-nowrap transition-all ${
              i === dotIdx
                ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                : "text-white/35 border border-white/8 hover:border-white/20 hover:text-white/55"
            }`}>
            {p.label}
          </button>
        ))}
      </div>

      <div className='flex-1 min-h-0 flex overflow-hidden'>
        <div className='flex-1 min-w-0 relative'>
          <LiveLineChart
            color='#3b82f6'
            lineWidth={2}
            theme='dark'
            fill
            dot={DOT_PRESETS[dotIdx].dot}
            windowSecs={90}
            smoothing={0.3}
            ySpeed={0.06}
            valueSpeed={0.1}
            formatValue={(v) =>
              v.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })
            }
            padding={{ top: 16, right: 92, bottom: 44, left: 12 }}
          />
        </div>
        <div className='flex-none w-[88px]'>
          <DeltaColumn deltas={deltas} />
        </div>
      </div>

      <footer className='flex-none px-4 py-1.5 border-t border-border flex items-center justify-between'>
        <span className='text-[10px] font-mono text-muted/40 uppercase tracking-widest'>
          {symbol.label} · Canvas · Catmull-Rom · Wall-clock scroll
        </span>
      </footer>
    </main>
  );
}
