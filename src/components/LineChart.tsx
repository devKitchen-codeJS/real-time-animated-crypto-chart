"use client";

import { useEffect, useRef, useCallback } from "react";
import {
  createChart,
  LineSeries,
  AreaSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  PriceScaleMode,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import { TickPoint, PriceDelta } from "@/hooks/useTickStream";

// ─── LineChart ────────────────────────────────────────────────────────────────

interface LineChartProps {
  // Весь массив точек: историческая база (kline close) + live aggTrade точки
  historicalPoints: TickPoint[];
  // Live точки от aggTrade — каждый тик добавляет новую точку
  livePoints: TickPoint[];
  // Плавно анимированная цена от GSAP — двигает живую точку между тиками
  smoothPrice: number | null;
}

export default function LineChart({
  historicalPoints,
  livePoints,
  smoothPrice,
}: LineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  // Две серии: одна для истории (kline close), одна для live aggTrade
  const histLineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const histAreaRef = useRef<ISeriesApi<"Area"> | null>(null);
  const liveLineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const liveAreaRef = useRef<ISeriesApi<"Area"> | null>(null);

  const userZoomedRef = useRef(false);
  // Запоминаем сколько live-точек уже отрисовано чтобы не делать setData каждый тик
  const lastLiveCountRef = useRef(0);

  // ── Инициализация графика ─────────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#060608" },
        textColor: "#4a4a5a",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#0f0f18", style: LineStyle.Solid },
        horzLines: { color: "#0f0f18", style: LineStyle.Solid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "#f0b90b33",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#f0b90b",
        },
        horzLine: {
          color: "#f0b90b33",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#f0b90b",
        },
      },
      rightPriceScale: {
        borderColor: "#1a1a24",
        scaleMargins: { top: 0.08, bottom: 0.08 },
        mode: PriceScaleMode.Normal,
      },
      timeScale: {
        borderColor: "#1a1a24",
        timeVisible: true,
        secondsVisible: true, // показываем секунды — точки плотные
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
      },
      handleScale: { mouseWheel: true, pinch: true },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    // ── Историческая серия (kline close points) ───────────────────────────
    // Более приглушённый цвет — это "фон" картины
    const histArea = chart.addSeries(AreaSeries, {
      lineColor: "transparent",
      topColor: "rgba(240,185,11,0.05)",
      bottomColor: "rgba(240,185,11,0.00)",
      lineWidth: undefined,
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
    });

    const histLine = chart.addSeries(LineSeries, {
      color: "#f0b90b55", // приглушённое золото для истории
      lineWidth: 1,
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
    });

    // ── Live серия (aggTrade точки) ───────────────────────────────────────
    // Яркий цвет — это "живая" часть
    const liveArea = chart.addSeries(AreaSeries, {
      lineColor: "transparent",
      topColor: "rgba(240,185,11,0.14)",
      bottomColor: "rgba(240,185,11,0.00)",
      lineWidth: undefined,
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
    });

    const liveLine = chart.addSeries(LineSeries, {
      color: "#f0b90b", // яркое золото для live
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 6,
      crosshairMarkerBackgroundColor: "#f0b90b",
      crosshairMarkerBorderColor: "#f0b90b55",
      crosshairMarkerBorderWidth: 3,
      lastValueVisible: true,
      priceLineVisible: true,
      priceLineWidth: 1,
      priceLineColor: "#f0b90b44",
      priceLineStyle: LineStyle.Dashed,
    });

    chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      userZoomedRef.current = true;
    });

    chartRef.current = chart;
    histLineRef.current = histLine;
    histAreaRef.current = histArea;
    liveLineRef.current = liveLine;
    liveAreaRef.current = liveArea;

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, []);

  // ── Загрузка исторических данных (kline close) ────────────────────────────

  useEffect(() => {
    if (
      !histLineRef.current ||
      !histAreaRef.current ||
      historicalPoints.length === 0
    )
      return;

    console.log(
      "Loading historical data, points count:",
      historicalPoints,
      historicalPoints.length,
    );
    const data = historicalPoints.map((p) => ({
      time: p.time as unknown as Time,
      value: p.value,
    }));

    histLineRef.current.setData(data);
    histAreaRef.current.setData(data);

    // При первой загрузке истории — сбрасываем счётчик live-точек
    lastLiveCountRef.current = 0;

    if (chartRef.current && !userZoomedRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, [historicalPoints]);

  // ── Live обновления (aggTrade точки) ─────────────────────────────────────
  //
  // Ключевая идея: мы не делаем setData() каждый тик — это дорого.
  // Вместо этого:
  // - Если пришла НОВАЯ точка (count увеличился) → update() с новой точкой
  // - GSAP двигает smoothPrice между тиками
  // - Мы обновляем последнюю точку плавным значением от GSAP каждый кадр

  useEffect(() => {
    if (!liveLineRef.current || !liveAreaRef.current || livePoints.length === 0)
      return;

    const newCount = livePoints.length;
    const prevCount = lastLiveCountRef.current;
    console.log(
      "Updating live data, new points count:",
      newCount,
      "previous count:",
      prevCount,
    );
    console.log("Live points:", livePoints);
    if (prevCount === 0) {
      // Первый раз — загружаем весь массив
      const data = livePoints.map((p) => ({
        time: p.time as unknown as Time,
        value: p.value,
      }));
      liveLineRef.current.setData(data);
      liveAreaRef.current.setData(data);
    } else if (newCount > prevCount) {
      // Новые точки добавились — добавляем только их через update()
      // update() намного дешевле чем setData() — не пересчитывает всю серию
      for (let i = prevCount; i < newCount; i++) {
        const p = livePoints[i];
        const t = p.time as unknown as Time;
        liveLineRef.current.update({ time: t, value: p.value });
        liveAreaRef.current.update({ time: t, value: p.value });
      }
    }

    lastLiveCountRef.current = newCount;
  }, [livePoints]);

  // ── GSAP smooth price → обновляем последнюю точку ────────────────────────
  //
  // Это срабатывает ~60 раз в секунду пока GSAP анимирует значение.
  // smoothPrice медленно едет от предыдущей цены к новой.
  // Мы берём это промежуточное значение и обновляем ПОСЛЕДНЮЮ точку серии.
  // Визуально: живая точка плавно скользит, не прыгает.

  useEffect(() => {
    if (
      !liveLineRef.current ||
      !liveAreaRef.current ||
      !smoothPrice ||
      livePoints.length === 0
    )
      return;

    // Берём время последней реальной точки
    const lastPoint = livePoints[livePoints.length - 1];
    const t = lastPoint.time as unknown as Time;

    // Обновляем последнюю точку плавным значением
    // LightweightCharts обновит позицию точки и конец линии
    liveLineRef.current.update({ time: t, value: smoothPrice });
    liveAreaRef.current.update({ time: t, value: smoothPrice });
  }, [smoothPrice, livePoints]);

  const handleResetZoom = useCallback(() => {
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
      userZoomedRef.current = false;
    }
  }, []);

  return (
    <div className='relative w-full h-full'>
      <div ref={containerRef} className='w-full h-full' />

      {/* Легенда серий */}
      <div className='absolute top-3 left-3 flex items-center gap-3 pointer-events-none'>
        <div className='flex items-center gap-1.5'>
          <div className='w-6 h-[1px] bg-[#f0b90b55]' />
          <span className='text-[9px] font-mono text-muted/60'>HISTORY</span>
        </div>
        <div className='flex items-center gap-1.5'>
          <div className='w-6 h-[2px] bg-[#f0b90b]' />
          <span className='text-[9px] font-mono text-muted/60'>
            LIVE · AGG TRADE
          </span>
        </div>
      </div>

      <button
        onClick={handleResetZoom}
        className='absolute bottom-4 right-4 px-3 py-1.5 bg-surface border border-border text-muted hover:text-text hover:border-accent/50 transition-all duration-200 text-xs font-mono rounded-sm'>
        [ FIT ]
      </button>
    </div>
  );
}

// ─── Delta Column ─────────────────────────────────────────────────────────────

interface DeltaColumnProps {
  deltas: PriceDelta[];
}

function fmt(n: number): string {
  const abs = Math.abs(n);
  const sign = n > 0 ? "+" : n < 0 ? "-" : " ";
  if (abs >= 1000) return sign + abs.toFixed(0);
  if (abs >= 100) return sign + abs.toFixed(1);
  if (abs >= 10) return sign + abs.toFixed(2);
  return sign + abs.toFixed(2);
}

export function DeltaColumn({ deltas }: DeltaColumnProps) {
  return (
    <div className='flex flex-col h-full overflow-hidden border-l border-border bg-surface/30'>
      <div className='flex-none px-3 py-2 border-b border-border'>
        <div className='text-[10px] font-mono text-muted tracking-widest'>
          Δ PRICE
        </div>
        <div className='text-[9px] font-mono text-muted/40 mt-0.5'>
          per 3 ticks
        </div>
      </div>

      <div className='flex-1 overflow-hidden'>
        {deltas.length === 0 ? (
          <div className='flex items-center justify-center h-full'>
            <span className='text-[10px] font-mono text-muted/30'>
              waiting...
            </span>
          </div>
        ) : (
          <div className='flex flex-col gap-px p-1'>
            {deltas.slice(0, 42).map((d, i) => {
              const isUp = d.direction === "up";
              const isDown = d.direction === "down";
              const opacity = Math.max(0.2, 1 - i * 0.022);
              return (
                <div
                  key={d.id}
                  className='flex items-center justify-between px-2 py-[3px] rounded-[2px]'
                  style={{
                    opacity,
                    backgroundColor:
                      i === 0
                        ? isUp
                          ? "rgba(0,200,150,0.09)"
                          : "rgba(255,77,77,0.09)"
                        : "transparent",
                  }}>
                  <span
                    className={`text-[11px] font-mono font-medium tabular-nums leading-none ${
                      isUp ? "text-green" : isDown ? "text-red" : "text-muted"
                    }`}>
                    {fmt(d.delta)}
                  </span>
                  <span
                    className={`text-[9px] ml-1 leading-none ${
                      isUp ? "text-green" : isDown ? "text-red" : "text-muted"
                    }`}>
                    {isUp ? "▲" : isDown ? "▼" : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {deltas.length > 0 && (
        <div className='flex-none border-t border-border px-3 py-2'>
          <div className='text-[9px] font-mono text-muted/40 mb-1.5'>
            BIAS · LAST 10
          </div>
          <div className='flex gap-px h-1.5 rounded-full overflow-hidden'>
            {(() => {
              const last10 = deltas.slice(0, 10);
              const ups = last10.filter((d) => d.direction === "up").length;
              const downs = last10.filter((d) => d.direction === "down").length;
              const total = last10.length || 1;
              return (
                <>
                  <div
                    className='bg-green transition-all duration-300'
                    style={{ width: `${(ups / total) * 100}%` }}
                  />
                  <div
                    className='bg-red transition-all duration-300'
                    style={{ width: `${(downs / total) * 100}%` }}
                  />
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
