export interface TickerData {
  price: number;
  priceChange: number;
  priceChangePercent: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  timestamp: number;
}

export interface KlineData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PricePoint {
  time: number;
  value: number;
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";
