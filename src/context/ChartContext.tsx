"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SymbolInfo {
  symbol: string;       // e.g. "BTCUSDT"
  base: string;         // e.g. "BTC"
  quote: string;        // e.g. "USDT"
  label: string;        // e.g. "BTC/USDT"
  wsSymbol: string;     // e.g. "btcusdt"
}

export interface TimeRange {
  label: string;        // e.g. "1H"
  interval: string;     // Binance kline interval e.g. "1m"
  limit: number;        // number of candles
  seconds: number;      // total seconds in range (for display)
}

// ─── Available symbols ────────────────────────────────────────────────────────

export const SYMBOLS: SymbolInfo[] = [
  { symbol: "BTCUSDT",  base: "BTC",  quote: "USDT", label: "BTC/USDT",  wsSymbol: "btcusdt"  },
  { symbol: "ETHUSDT",  base: "ETH",  quote: "USDT", label: "ETH/USDT",  wsSymbol: "ethusdt"  },
  { symbol: "SOLUSDT",  base: "SOL",  quote: "USDT", label: "SOL/USDT",  wsSymbol: "solusdt"  },
  { symbol: "BNBUSDT",  base: "BNB",  quote: "USDT", label: "BNB/USDT",  wsSymbol: "bnbusdt"  },
  { symbol: "XRPUSDT",  base: "XRP",  quote: "USDT", label: "XRP/USDT",  wsSymbol: "xrpusdt"  },
  { symbol: "ADAUSDT",  base: "ADA",  quote: "USDT", label: "ADA/USDT",  wsSymbol: "adausdt"  },
  { symbol: "DOGEUSDT", base: "DOGE", quote: "USDT", label: "DOGE/USDT", wsSymbol: "dogeusdt" },
  { symbol: "AVAXUSDT", base: "AVAX", quote: "USDT", label: "AVAX/USDT", wsSymbol: "avaxusdt" },
  { symbol: "DOTUSDT",  base: "DOT",  quote: "USDT", label: "DOT/USDT",  wsSymbol: "dotusdt"  },
  { symbol: "LINKUSDT", base: "LINK", quote: "USDT", label: "LINK/USDT", wsSymbol: "linkusdt" },
];

// ─── Available time ranges ────────────────────────────────────────────────────

export const TIME_RANGES: TimeRange[] = [
  { label: "15M",  interval: "1m",  limit: 15,  seconds: 15 * 60        },
  { label: "1H",   interval: "1m",  limit: 60,  seconds: 60 * 60        },
  { label: "3H",   interval: "3m",  limit: 60,  seconds: 3 * 60 * 60    },
  { label: "6H",   interval: "5m",  limit: 72,  seconds: 6 * 60 * 60    },
  { label: "12H",  interval: "15m", limit: 48,  seconds: 12 * 60 * 60   },
  { label: "1D",   interval: "30m", limit: 48,  seconds: 24 * 60 * 60   },
  { label: "3D",   interval: "1h",  limit: 72,  seconds: 3 * 24 * 60 * 60 },
  { label: "1W",   interval: "2h",  limit: 84,  seconds: 7 * 24 * 60 * 60 },
];

const DEFAULT_SYMBOL = SYMBOLS[0];
const DEFAULT_RANGE  = TIME_RANGES[2]; // 3H

// ─── Context ──────────────────────────────────────────────────────────────────

interface ChartContextValue {
  symbol: SymbolInfo;
  timeRange: TimeRange;
  setSymbol: (s: SymbolInfo) => void;
  setTimeRange: (r: TimeRange) => void;
}

const ChartContext = createContext<ChartContextValue>({
  symbol: DEFAULT_SYMBOL,
  timeRange: DEFAULT_RANGE,
  setSymbol: () => {},
  setTimeRange: () => {},
});

const LS_SYMBOL_KEY    = "chart_symbol";
const LS_TIMERANGE_KEY = "chart_timerange";

export function ChartProvider({ children }: { children: React.ReactNode }) {
  const [symbol, setSymbolState] = useState<SymbolInfo>(DEFAULT_SYMBOL);
  const [timeRange, setTimeRangeState] = useState<TimeRange>(DEFAULT_RANGE);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage once on mount
  useEffect(() => {
    try {
      const savedSymbol = localStorage.getItem(LS_SYMBOL_KEY);
      if (savedSymbol) {
        const found = SYMBOLS.find((s) => s.symbol === savedSymbol);
        if (found) setSymbolState(found);
      }
      const savedRange = localStorage.getItem(LS_TIMERANGE_KEY);
      if (savedRange) {
        const found = TIME_RANGES.find((r) => r.label === savedRange);
        if (found) setTimeRangeState(found);
      }
    } catch {}
    setHydrated(true);
  }, []);

  const setSymbol = useCallback((s: SymbolInfo) => {
    setSymbolState(s);
    try { localStorage.setItem(LS_SYMBOL_KEY, s.symbol); } catch {}
  }, []);

  const setTimeRange = useCallback((r: TimeRange) => {
    setTimeRangeState(r);
    try { localStorage.setItem(LS_TIMERANGE_KEY, r.label); } catch {}
  }, []);

  if (!hydrated) return null; // avoid SSR mismatch

  return (
    <ChartContext.Provider value={{ symbol, timeRange, setSymbol, setTimeRange }}>
      {children}
    </ChartContext.Provider>
  );
}

export function useChartContext() {
  return useContext(ChartContext);
}
