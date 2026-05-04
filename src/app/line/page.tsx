// "use client";

// import dynamic from "next/dynamic";
// import { useMemo } from "react";
// import { useTickStream } from "@/hooks/useTickStream";
// import { useBinanceWebSocket } from "@/hooks/useBinanceWebSocket";
// import { useChartContext } from "@/context/ChartContext";
// import NavHeader from "@/components/NavHeader";
// import PriceDisplay from "@/components/PriceDisplay";
// import { DeltaColumn } from "@/components/LineChart";
// import { TickPoint } from "@/hooks/useTickStream";

// const LineChart = dynamic(() => import("@/components/LineChart"), {
//   ssr: false,
//   loading: () => (
//     <div className="w-full h-full flex items-center justify-center">
//       <div className="flex flex-col items-center gap-4">
//         <div className="w-8 h-8 border border-accent/30 border-t-accent animate-spin rounded-full" />
//         <span className="text-xs font-mono text-muted tracking-widest">LOADING CHART</span>
//       </div>
//     </div>
//   ),
// });

// export default function LinePage() {
//   const { symbol, timeRange } = useChartContext();

//   // useBinanceWebSocket даёт нам:
//   // - ticker: текущая цена + 24h статистика (для PriceDisplay в хедере)
//   // - klines: исторические свечи (используем close как исторические точки)
//   const { ticker, klines, status: wsStatus, reconnect } = useBinanceWebSocket(symbol, timeRange);

//   // useTickStream даёт нам:
//   // - points: массив ВСЕХ aggTrade точек (10-20 в секунду, живые данные)
//   // - smoothPrice: GSAP-анимированное значение (плавно едет между тиками ~60fps)
//   // - deltas: дельты для правой колонки
//   const { points: livePoints, smoothPrice, deltas, status: tickStatus } = useTickStream(symbol);

//   // Конвертируем klines (исторические свечи) в TickPoint[]
//   // Берём close каждой свечи как точку истории
//   // Это будет "фон" графика — тонкая линия истории до начала live-режима
//   const historicalPoints = useMemo<TickPoint[]>(() => {
//     return klines
//       .slice()
//       .sort((a, b) => a.time - b.time)
//       .map((k) => ({ time: k.time, value: k.close }));
//   }, [klines]);

//   // Статус: показываем статус tick stream как приоритетный
//   // (он самый важный для live обновлений)
//   const combinedStatus = tickStatus === "connected"
//     ? tickStatus
//     : wsStatus;

//   return (
//     <main className="w-screen h-screen bg-bg flex flex-col overflow-hidden">
//       <NavHeader
//         status={combinedStatus}
//         onReconnect={reconnect}
//         rightSlot={<PriceDisplay ticker={ticker} />}
//       />

//       <div className="sm:hidden px-4 py-2 border-b border-border/50">
//         <PriceDisplay ticker={ticker} />
//       </div>

//       <div className="flex-1 min-h-0 flex overflow-hidden">
//         <div className="flex-1 min-w-0 relative">
//           <LineChart
//             historicalPoints={historicalPoints}
//             livePoints={livePoints}
//             smoothPrice={smoothPrice}
//           />
//         </div>
//         <div className="flex-none w-[88px]">
//           <DeltaColumn deltas={deltas} />
//         </div>
//       </div>

//       <footer className="flex-none px-4 py-1.5 border-t border-border flex items-center justify-between">
//         <span className="text-[10px] font-mono text-muted/40">
//           {symbol.label} · {timeRange.label} HISTORY · AGG TRADE LIVE · GSAP SMOOTH
//         </span>
//         <span className="text-[10px] font-mono text-muted/40">
//           {livePoints.length > 0
//             ? new Date(livePoints[livePoints.length - 1].time * 1000).toLocaleTimeString("en-US", {
//                 hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
//               })
//             : "——:——:——"}
//         </span>
//       </footer>
//     </main>
//   );
// }
