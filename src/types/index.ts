export interface TickerData {
  price: number;
  volume24h: number;
  timestamp: number;
}

export interface KlineData {
  time: number;

  close: number;
  volume: number;
}

export interface PricePoint {
  time: number;
  value: number;
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";
