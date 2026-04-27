"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ConnectionStatus } from "@/types";

export interface TradeUpdate {
  price: number;
  timestamp: number;
  isBuyerMaker: boolean; // false = price went up (taker bought), true = price went down
}

export interface PriceDelta {
  id: number;
  delta: number;       // raw $ change
  price: number;       // price at this moment
  timestamp: number;
  direction: "up" | "down" | "flat";
}

interface UseTradeStreamReturn {
  currentPrice: number | null;
  smoothPrice: number | null;   // GSAP-interpolated value (updated via RAF)
  deltas: PriceDelta[];
  status: ConnectionStatus;
  reconnect: () => void;
}

const BINANCE_WS_BASE = "wss://stream.binance.com:9443/ws";
const SYMBOL = "btcusdt";
// Buffer: accumulate N ticks before committing a smoothed point
const TICK_BUFFER = 1;

export function useTradeStream(): UseTradeStreamReturn {
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [smoothPrice, setSmoothPrice] = useState<number | null>(null);
  const [deltas, setDeltas] = useState<PriceDelta[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // GSAP-style smooth interpolation state
  const animRef = useRef<number | null>(null);
  const displayedPriceRef = useRef<number | null>(null);
  const targetPriceRef = useRef<number | null>(null);

  // Tick buffer for 3-tick delay
  const tickBufferRef = useRef<number[]>([]);
  const prevCommittedPriceRef = useRef<number | null>(null);
  const deltaIdRef = useRef(0);

  // RAF-based smooth lerp — runs continuously, interpolates displayedPrice → targetPrice
  const startAnimLoop = useCallback(() => {
    if (animRef.current) return;
    const loop = () => {
      if (!mountedRef.current) return;
      const target = targetPriceRef.current;
      const current = displayedPriceRef.current;
      if (target !== null) {
        if (current === null) {
          displayedPriceRef.current = target;
          setSmoothPrice(target);
        } else {
          // Ease factor: how fast we chase the target (0.06 = smooth, 0.12 = snappier)
          const ease = 0.12;
          const next = current + (target - current) * ease;
          // Stop if close enough
          if (Math.abs(next - target) < 0.001) {
            displayedPriceRef.current = target;
            setSmoothPrice(target);
          } else {
            displayedPriceRef.current = next;
            setSmoothPrice(next);
          }
        }
      }
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
  }, []);

  const stopAnimLoop = useCallback(() => {
    if (animRef.current) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current) wsRef.current.close();
    setStatus("connecting");

    // Use aggTrade stream: fires on every aggregated trade, ~100ms intervals
    const ws = new WebSocket(`${BINANCE_WS_BASE}/${SYMBOL}@aggTrade`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (mountedRef.current) {
        setStatus("connected");
        startAnimLoop();
      }
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(event.data);
        const price = parseFloat(data.p);
        if (isNaN(price)) return;

        // Always update raw current price
        setCurrentPrice(price);

        // Buffer ticks; every TICK_BUFFER ticks, update target for smooth animation
        tickBufferRef.current.push(price);
        if (tickBufferRef.current.length >= TICK_BUFFER) {
          // Average of buffered ticks as smooth target
          const avg = tickBufferRef.current.reduce((a, b) => a + b, 0) / tickBufferRef.current.length;
          targetPriceRef.current = avg;

          // Compute delta vs last committed price
          const prev = prevCommittedPriceRef.current;
          if (prev !== null) {
            const delta = parseFloat((avg - prev).toFixed(2));
            if (Math.abs(delta) >= 0.01) {
              const entry: PriceDelta = {
                id: deltaIdRef.current++,
                delta,
                price: avg,
                timestamp: Date.now(),
                direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
              };
              setDeltas((prev) => [entry, ...prev].slice(0, 60)); // keep last 60
            }
          }
          prevCommittedPriceRef.current = avg;
          tickBufferRef.current = [];
        }
      } catch (e) {
        console.error("WS parse error:", e);
      }
    };

    ws.onerror = () => {
      if (mountedRef.current) setStatus("error");
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      stopAnimLoop();
      setStatus("disconnected");
      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, 5000);
    };
  }, [startAnimLoop, stopAnimLoop]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      stopAnimLoop();
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [connect, stopAnimLoop]);

  return { currentPrice, smoothPrice, deltas, status, reconnect: connect };
}
