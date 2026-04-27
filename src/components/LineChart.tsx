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
import { KlineData } from "@/types";
import { PriceDelta } from "@/hooks/useTradeStream";
import { SmoothedKline } from "@/hooks/useBinanceWebSocket";

// ─── Smooth Line Chart ────────────────────────────────────────────────────────

interface LineChartProps {
  klines: KlineData[];
  latestKline: SmoothedKline | null;
}

export default function LineChart({ klines, latestKline }: LineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const areaSeriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const userZoomedRef = useRef(false);

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
        secondsVisible: false,
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

    // Area series for gradient fill under the line
    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: "transparent",
      topColor: "rgba(240,185,11,0.12)",
      bottomColor: "rgba(240,185,11,0.00)",
      lineWidth: undefined,
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
    });

    // Main animated line series
    const lineSeries = chart.addSeries(LineSeries, {
      color: "#f0b90b",
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 6,
      crosshairMarkerBackgroundColor: "#f0b90b",
      crosshairMarkerBorderColor: "#f0b90b44",
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
    lineSeriesRef.current = lineSeries;
    areaSeriesRef.current = areaSeries;

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

  // Load historical data
  useEffect(() => {
    if (!lineSeriesRef.current || !areaSeriesRef.current || klines.length === 0)
      return;
    const sorted = [...klines].sort((a, b) => a.time - b.time);
    const data = sorted.map((k) => ({ time: k.time as Time, value: k.close }));

    lineSeriesRef.current.setData(data);
    areaSeriesRef.current.setData(data);

    if (chartRef.current && !userZoomedRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, [klines]);

  // Real-time smooth update — smoothClose gives the gliding dot effect
  useEffect(() => {
    if (!lineSeriesRef.current || !areaSeriesRef.current || !latestKline)
      return;
    const t = latestKline.time as Time;
    const v = latestKline.smoothClose;

    lineSeriesRef.current.update({ time: t, value: v });
    areaSeriesRef.current.update({ time: t, value: v });
  }, [latestKline]);

  const handleResetZoom = useCallback(() => {
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
      userZoomedRef.current = false;
    }
  }, []);

  return (
    <div className='relative w-full h-full'>
      <div ref={containerRef} className='w-full h-full' />
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
  if (abs >= 100) return sign + abs.toFixed(0);
  if (abs >= 10) return sign + abs.toFixed(1);
  return sign + abs.toFixed(2);
}

export function DeltaColumn({ deltas }: DeltaColumnProps) {
  return (
    <div className='flex flex-col h-full overflow-hidden border-l border-border bg-surface/30'>
      {/* Header */}
      <div className='flex-none px-3 py-2 border-b border-border'>
        <div className='text-[10px] font-mono text-muted tracking-widest'>
          Δ PRICE
        </div>
        <div className='text-[9px] font-mono text-muted/40 mt-0.5'>
          per 3 ticks
        </div>
      </div>

      {/* List — newest on top */}
      <div className='flex-1 overflow-hidden relative'>
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

      {/* Bias bar */}
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
