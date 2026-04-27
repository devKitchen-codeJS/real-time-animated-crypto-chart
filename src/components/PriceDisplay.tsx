"use client";

import { useRef, useEffect } from "react";
import { TickerData } from "@/types";

interface PriceDisplayProps {
  ticker: TickerData | null;
}

function fmt(n: number, decimals = 2) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtVol(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toFixed(2);
}

export default function PriceDisplay({ ticker }: PriceDisplayProps) {
  const prevPriceRef = useRef<number | null>(null);
  const priceRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!ticker || !priceRef.current) return;
    const prev = prevPriceRef.current;
    if (prev !== null) {
      const el = priceRef.current;
      const up = ticker.price > prev;
      el.style.color = up ? "#00c896" : "#ff4d4d";
      const timeout = setTimeout(() => {
        if (el) el.style.color = "";
      }, 600);
      return () => clearTimeout(timeout);
    }
    prevPriceRef.current = ticker?.price ?? null;
  }, [ticker]);

  useEffect(() => {
    prevPriceRef.current = ticker?.price ?? null;
  }, [ticker?.price]);

  const isPositive = ticker ? ticker.priceChangePercent >= 0 : true;

  return (
    <div className="flex flex-col gap-1">
      {/* Main price */}
      <div className="flex items-baseline gap-3">
        <span
          ref={priceRef}
          className="text-3xl font-mono font-bold text-text transition-colors duration-300"
          style={{ letterSpacing: "-0.02em" }}
        >
          {ticker ? `$${fmt(ticker.price, 2)}` : "—"}
        </span>
        <span
          className={`text-sm font-mono ${isPositive ? "text-green" : "text-red"}`}
        >
          {ticker
            ? `${isPositive ? "+" : ""}${fmt(ticker.priceChangePercent, 2)}%`
            : ""}
        </span>
      </div>

      {/* Stats row */}
      <div className="flex gap-5 text-xs font-mono text-muted">
        <span>
          24H{" "}
          <span className="text-green">H {ticker ? `$${fmt(ticker.high24h)}` : "—"}</span>
        </span>
        <span>
          <span className="text-red">L {ticker ? `$${fmt(ticker.low24h)}` : "—"}</span>
        </span>
        <span>
          VOL{" "}
          <span className="text-text/60">
            {ticker ? fmtVol(ticker.volume24h) : "—"} BTC
          </span>
        </span>
        <span className="hidden sm:inline">
          CHG{" "}
          <span className={isPositive ? "text-green" : "text-red"}>
            {ticker
              ? `${isPositive ? "+" : ""}$${fmt(Math.abs(ticker.priceChange))}`
              : "—"}
          </span>
        </span>
      </div>
    </div>
  );
}
