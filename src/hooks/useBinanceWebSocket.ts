"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { TickerData, KlineData, ConnectionStatus } from "@/types";
import { SymbolInfo, TimeRange } from "@/context/ChartContext";

const BINANCE_WS = "wss://stream.binance.com:9443/stream";

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

export function useBinanceWebSocket(
  symbolInfo: SymbolInfo,
  timeRange: TimeRange
): UseBinanceWebSocketReturn {
  const [ticker, setTicker] = useState<TickerData | null>(null);
  const [klines, setKlines] = useState<KlineData[]>([]);
  const [latestKline, setLatestKline] = useState<SmoothedKline | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const animRef = useRef<number | null>(null);
  const smoothCloseRef = useRef<number | null>(null);
  const targetCloseRef = useRef<number | null>(null);
  const latestKlineDataRef = useRef<KlineData | null>(null);

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

  const fetchHistoricalKlines = useCallback(async (sym: string, interval: string, limit: number) => {
    try {
      const res = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${interval}&limit=${limit}`
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
      if (mountedRef.current) {
        setKlines(parsed);
        smoothCloseRef.current = null;
        targetCloseRef.current = null;
        latestKlineDataRef.current = null;
      }
    } catch (err) {
      console.error("Failed to fetch historical klines:", err);
    }
  }, []);

  const connectRef = useRef<((sym: SymbolInfo, range: TimeRange) => void) | null>(null);

  const connect = useCallback((sym: SymbolInfo, range: TimeRange) => {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    stopAnimLoop();

    setStatus("connecting");
    setTicker(null);
    setKlines([]);
    setLatestKline(null);
    smoothCloseRef.current = null;
    targetCloseRef.current = null;
    latestKlineDataRef.current = null;

    const ws_sym = sym.wsSymbol;
    const streams = `${ws_sym}@ticker/${ws_sym}@kline_${range.interval}/${ws_sym}@aggTrade`;
    const ws = new WebSocket(`${BINANCE_WS}?streams=${streams}`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setStatus("connected");
      startAnimLoop();
      fetchHistoricalKlines(sym.symbol, range.interval, range.limit);
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const msg = JSON.parse(event.data) as { stream: string; data: Record<string, unknown> };
        const { stream, data } = msg;

        if (stream === `${ws_sym}@ticker`) {
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

        if (stream === `${ws_sym}@aggTrade`) {
          const tradePrice = parseFloat(data.p as string);
          if (!isNaN(tradePrice)) targetCloseRef.current = tradePrice;
        }

        if (stream === `${ws_sym}@kline_${range.interval}`) {
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
        if (mountedRef.current && connectRef.current) connectRef.current(sym, range);
      }, 3000);
    };
  }, [startAnimLoop, stopAnimLoop, fetchHistoricalKlines]);

  connectRef.current = connect;

  useEffect(() => {
    mountedRef.current = true;
    connect(symbolInfo, timeRange);
    return () => {
      mountedRef.current = false;
      stopAnimLoop();
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  // Re-run only when symbol or interval label changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolInfo.symbol, timeRange.label]);

  const reconnect = useCallback(() => connect(symbolInfo, timeRange), [connect, symbolInfo, timeRange]);

  return { ticker, klines, latestKline, status, reconnect };
}
