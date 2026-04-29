"use client";

import { useState, useRef, useEffect } from "react";
import {
  SYMBOLS,
  TIME_RANGES,
  SymbolInfo,
  TimeRange,
  useChartContext,
} from "@/context/ChartContext";

// ─── Shared dropdown hook ─────────────────────────────────────────────────────

function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return { open, setOpen, ref };
}

// ─── Symbol Selector ──────────────────────────────────────────────────────────

export function SymbolSelector() {
  const { symbol, setSymbol } = useChartContext();
  const { open, setOpen, ref } = useDropdown();

  const handleSelect = (s: SymbolInfo) => {
    setSymbol(s);
    setOpen(false);
  };

  return (
    <div ref={ref} className='relative'>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 border rounded-sm text-xs font-mono transition-all duration-150 ${
          open
            ? "border-accent/60 text-accent bg-accent/5"
            : "border-border text-text hover:border-accent/40 hover:text-accent"
        }`}>
        <span className='font-bold'>{symbol.label}</span>
        <svg
          className={`w-3 h-3 transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
          fill='none'
          viewBox='0 0 10 6'>
          <path
            d='M1 1l4 4 4-4'
            stroke='currentColor'
            strokeWidth='1.5'
            strokeLinecap='round'
          />
        </svg>
      </button>

      {open && (
        <div className='absolute top-full left-0 mt-1 w-36 bg-surface border border-border rounded-sm shadow-2xl shadow-black/60 z-50 overflow-hidden'>
          {SYMBOLS.map((s) => (
            <button
              key={s.symbol}
              onClick={() => handleSelect(s)}
              className={`w-full text-left px-3 py-2 text-xs font-mono transition-colors duration-100 flex items-center justify-between ${
                s.symbol === symbol.symbol
                  ? "bg-accent/10 text-accent"
                  : "text-muted hover:bg-white/4 hover:text-text"
              }`}>
              <span>{s.label}</span>
              {s.symbol === symbol.symbol && (
                <span className='text-accent text-[8px]'>●</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Time Range Selector ──────────────────────────────────────────────────────

export function TimeRangeSelector() {
  const { timeRange, setTimeRange } = useChartContext();
  const { open, setOpen, ref } = useDropdown();

  const handleSelect = (r: TimeRange) => {
    setTimeRange(r);
    setOpen(false);
  };

  return (
    <div ref={ref} className='relative'>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 border rounded-sm text-xs font-mono transition-all duration-150 ${
          open
            ? "border-accent/60 text-accent bg-accent/5"
            : "border-border text-muted hover:border-accent/40 hover:text-text"
        }`}>
        <span>{timeRange.label}</span>
        <svg
          className={`w-3 h-3 transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
          fill='none'
          viewBox='0 0 10 6'>
          <path
            d='M1 1l4 4 4-4'
            stroke='currentColor'
            strokeWidth='1.5'
            strokeLinecap='round'
          />
        </svg>
      </button>

      {open && (
        <div className='absolute top-full left-0 mt-1 w-28 bg-surface border border-border rounded-sm shadow-2xl shadow-black/60 z-50 overflow-hidden'>
          {TIME_RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => handleSelect(r)}
              className={`w-full text-left px-3 py-2 text-xs font-mono transition-colors duration-100 flex items-center justify-between ${
                r.label === timeRange.label
                  ? "bg-accent/10 text-accent"
                  : "text-muted hover:bg-white/4 hover:text-text"
              }`}>
              <span>{r.label}</span>
              <span className='text-[9px] text-muted/40'>{r.interval}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
