"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ConnectionStatus } from "@/types";
import { SymbolInfo } from "@/context/ChartContext";

export interface PriceDelta {
  id: number;
  delta: number;
  price: number;
  timestamp: number;
  direction: "up" | "down" | "flat";
}

interface UseTradeStreamReturn {
  deltas: PriceDelta[];
  status: ConnectionStatus;
  reconnect: () => void;
}

const BINANCE_WS_BASE = "wss://stream.binance.com:9443/ws";
const TICK_BUFFER = 3;

export function useTradeStream(symbolInfo: SymbolInfo): UseTradeStreamReturn {
  const [deltas, setDeltas] = useState<PriceDelta[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const tickBufferRef = useRef<number[]>([]);
  const prevCommittedPriceRef = useRef<number | null>(null);
  const deltaIdRef = useRef(0);

  const connectRef = useRef<((sym: SymbolInfo) => void) | null>(null);

  const connect = useCallback((sym: SymbolInfo) => {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);

    setStatus("connecting");
    setDeltas([]);
    tickBufferRef.current = [];
    prevCommittedPriceRef.current = null;

    const ws = new WebSocket(`${BINANCE_WS_BASE}/${sym.wsSymbol}@aggTrade`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (mountedRef.current) setStatus("connected");
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(event.data);
        const price = parseFloat(data.p);
        if (isNaN(price)) return;

        tickBufferRef.current.push(price);
        if (tickBufferRef.current.length >= TICK_BUFFER) {
          const avg = tickBufferRef.current.reduce((a, b) => a + b, 0) / tickBufferRef.current.length;
          const prev = prevCommittedPriceRef.current;
          if (prev !== null) {
            const delta = parseFloat((avg - prev).toFixed(4));
            if (Math.abs(delta) >= 0.0001) {
              const entry: PriceDelta = {
                id: deltaIdRef.current++,
                delta,
                price: avg,
                timestamp: Date.now(),
                direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
              };
              setDeltas((d) => [entry, ...d].slice(0, 60));
            }
          }
          prevCommittedPriceRef.current = avg;
          tickBufferRef.current = [];
        }
      } catch (e) {
        console.error("Trade stream parse error:", e);
      }
    };

    ws.onerror = () => {
      if (mountedRef.current) setStatus("error");
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setStatus("disconnected");
      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current && connectRef.current) connectRef.current(sym);
      }, 3000);
    };
  }, []);

  connectRef.current = connect;

  useEffect(() => {
    mountedRef.current = true;
    connect(symbolInfo);
    return () => {
      mountedRef.current = false;
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolInfo.symbol]);

  const reconnect = useCallback(() => connect(symbolInfo), [connect, symbolInfo]);

  return { deltas, status, reconnect };
}
