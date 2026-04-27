"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { TickerData, KlineData, ConnectionStatus } from "@/types";

const BINANCE_WS = "wss://stream.binance.com:9443/stream";
const SYMBOL = "btcusdt";

export interface SmoothedKline extends KlineData {
  smoothClose: number;
}

interface UseBinanceWebSocketReturn {
  ticker: TickerData | null;
  klines: KlineData[];
  latestKline: SmoothedKline | null;
  status: ConnectionStatus;
  reconnect: () => void;
}

export function useBinanceWebSocket(): UseBinanceWebSocketReturn {
  const [ticker, setTicker] = useState<TickerData | null>(null);
  const [klines, setKlines] = useState<KlineData[]>([]);
  const [latestKline, setLatestKline] = useState<SmoothedKline | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // Smooth animation refs
  const animRef = useRef<number | null>(null);
  const smoothCloseRef = useRef<number | null>(null);
  const targetCloseRef = useRef<number | null>(null);
  const latestKlineDataRef = useRef<KlineData | null>(null);

  // RAF loop: smoothly interpolate smoothClose → targetClose
  const startAnimLoop = useCallback(() => {
    if (animRef.current) return;
    const loop = () => {
      if (!mountedRef.current) return;
      const target = targetCloseRef.current;
      const current = smoothCloseRef.current;
      if (target !== null && latestKlineDataRef.current) {
        let next: number;
        if (current === null) {
          next = target;
        } else {
          // ease factor 0.06 = ~16 frames to close 90% of gap (~270ms at 60fps)
          next = current + (target - current) * 0.06;
          if (Math.abs(next - target) < 0.001) next = target;
        }
        smoothCloseRef.current = next;
        setLatestKline({ ...latestKlineDataRef.current, smoothClose: next });
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

  const fetchHistoricalKlines = useCallback(async () => {
    try {
      const res = await fetch(
        "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=200"
      );
      const data = await res.json();
      const parsed: KlineData[] = (data as unknown[][]).map((k) => ({
        time: Math.floor((k[0] as number) / 1000),
        open: parseFloat(k[1] as string),
        high: parseFloat(k[2] as string),
        low: parseFloat(k[3] as string),
        close: parseFloat(k[4] as string),
        volume: parseFloat(k[5] as string),
      }));
      if (mountedRef.current) setKlines(parsed);
    } catch (err) {
      console.error("Failed to fetch historical klines:", err);
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current) wsRef.current.close();
    setStatus("connecting");

    // kline_1m + aggTrade (fires ~100ms) for smooth candle animation
    const streams = `${SYMBOL}@ticker/${SYMBOL}@kline_1m/${SYMBOL}@aggTrade`;
    const ws = new WebSocket(`${BINANCE_WS}?streams=${streams}`);
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
        const msg = JSON.parse(event.data) as { stream: string; data: Record<string, unknown> };
        const { stream, data } = msg;

        if (stream === `${SYMBOL}@ticker`) {
          setTicker({
            price: parseFloat(data.c as string),
            priceChange: parseFloat(data.p as string),
            priceChangePercent: parseFloat(data.P as string),
            high24h: parseFloat(data.h as string),
            low24h: parseFloat(data.l as string),
            volume24h: parseFloat(data.v as string),
            timestamp: data.T as number,
          });
        }

        // aggTrade: update animation target at ~100ms frequency
        if (stream === `${SYMBOL}@aggTrade`) {
          const tradePrice = parseFloat(data.p as string);
          if (!isNaN(tradePrice)) {
            targetCloseRef.current = tradePrice;
          }
        }

        if (stream === `${SYMBOL}@kline_1m`) {
          const k = data.k as Record<string, unknown>;
          const kline: KlineData = {
            time: Math.floor((k.t as number) / 1000),
            open: parseFloat(k.o as string),
            high: parseFloat(k.h as string),
            low: parseFloat(k.l as string),
            close: parseFloat(k.c as string),
            volume: parseFloat(k.v as string),
          };
          targetCloseRef.current = kline.close;
          latestKlineDataRef.current = kline;

          setKlines((prev) => {
            if (prev.length === 0) return prev;
            const last = prev[prev.length - 1];
            if (last.time === kline.time) {
              return [...prev.slice(0, -1), kline];
            } else {
              // New candle: snap smooth value to new open
              smoothCloseRef.current = kline.open;
              return [...prev, kline];
            }
          });
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
      }, 3000);
    };
  }, [startAnimLoop, stopAnimLoop]);

  useEffect(() => {
    mountedRef.current = true;
    fetchHistoricalKlines();
    connect();
    return () => {
      mountedRef.current = false;
      stopAnimLoop();
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [connect, fetchHistoricalKlines, stopAnimLoop]);

  return { ticker, klines, latestKline, status, reconnect: connect };
}
