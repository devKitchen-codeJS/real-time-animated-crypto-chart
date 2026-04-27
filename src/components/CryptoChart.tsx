"use client";

import { useEffect, useRef, useCallback } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  PriceScaleMode,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import { KlineData } from "@/types";
import { SmoothedKline } from "@/hooks/useBinanceWebSocket";

interface ChartProps {
  klines: KlineData[];
  latestKline: SmoothedKline | null;
  currentPrice: number | null;
}

function computePriceRange(
  klines: KlineData[],
  currentPrice: number | null
): { min: number; max: number } | null {
  if (klines.length === 0) return null;
  const rawMin = Math.min(...klines.map((k) => k.low));
  const rawMax = Math.max(...klines.map((k) => k.high));
  const span = rawMax - rawMin || 1;
  const padding = span * 0.08;
  let visMin = rawMin - padding;
  let visMax = rawMax + padding;
  if (currentPrice !== null) {
    if (currentPrice >= visMax - span * 0.15) visMax += span * 0.3;
    if (currentPrice <= visMin + span * 0.15) visMin -= span * 0.3;
  }
  return { min: visMin, max: visMax };
}

export default function CryptoChart({ klines, latestKline, currentPrice }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
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
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true },
      handleScale: { mouseWheel: true, pinch: true },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    // v5 API: addSeries(SeriesDefinition, options)
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#00c896",
      downColor: "#ff4d4d",
      borderUpColor: "#00c896",
      borderDownColor: "#ff4d4d",
      wickUpColor: "#00c896",
      wickDownColor: "#ff4d4d",
    });

    const lineSeries = chart.addSeries(LineSeries, {
      color: "#f0b90b",
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 6,
      crosshairMarkerBackgroundColor: "#f0b90b",
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
    candleSeriesRef.current = candleSeries;
    lineSeriesRef.current = lineSeries;

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
    if (!candleSeriesRef.current || !lineSeriesRef.current || klines.length === 0) return;
    const sorted = [...klines].sort((a, b) => a.time - b.time);

    candleSeriesRef.current.setData(
      sorted.map((k) => ({
        time: k.time as Time,
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
      }))
    );

    lineSeriesRef.current.setData(
      sorted.map((k) => ({ time: k.time as Time, value: k.close }))
    );

    if (chartRef.current && !userZoomedRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, [klines]);

  // Real-time smooth update via smoothClose (60fps lerp from hook)
  useEffect(() => {
    if (!candleSeriesRef.current || !lineSeriesRef.current || !latestKline) return;
    const t = latestKline.time as Time;

    candleSeriesRef.current.update({
      time: t,
      open: latestKline.open,
      high: latestKline.high,
      low: latestKline.low,
      close: latestKline.smoothClose,
    });

    lineSeriesRef.current.update({ time: t, value: latestKline.smoothClose });
  }, [latestKline]);

  // Smart Y-axis scaling
  useEffect(() => {
    if (!candleSeriesRef.current || klines.length === 0) return;
    const range = computePriceRange(klines, currentPrice);
    if (!range) return;
    candleSeriesRef.current.applyOptions({
      autoscaleInfoProvider: () => ({
        priceRange: { minValue: range.min, maxValue: range.max },
        margins: { above: 8, below: 8 },
      }),
    });
  }, [klines, currentPrice]);

  const handleResetZoom = useCallback(() => {
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
      userZoomedRef.current = false;
    }
  }, []);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      <button
        onClick={handleResetZoom}
        className="absolute bottom-4 right-4 px-3 py-1.5 bg-surface border border-border text-muted hover:text-text hover:border-accent/50 transition-all duration-200 text-xs font-mono rounded-sm"
      >
        [ FIT ]
      </button>
    </div>
  );
}
