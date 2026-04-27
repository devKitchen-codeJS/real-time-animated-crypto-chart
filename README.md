# BTC/USDT Live Chart

Real-time Bitcoin price chart powered by Binance WebSocket API.

## Stack

- **Next.js 15** — App Router
- **TypeScript** — strict mode
- **Tailwind CSS** — dark minimal theme
- **Lightweight Charts** (TradingView) — candlestick + line chart
- **JetBrains Mono + Syne** — fonts

## Features

- 📡 **Real-time WebSocket** — Binance `btcusdt@ticker` + `btcusdt@kline_1m` streams
- 📈 **Candlestick chart** with real-time line overlay
- 🔁 **Smart Y-axis scaling** — automatically shifts the price range when price approaches ceiling or floor (within 15% margin), shifting by 30% of the visible range
- 🔍 **Zoom & Pan** — mouse wheel zoom, drag to pan, pinch on mobile
- 🔄 **Auto-reconnect** — reconnects every 3s on disconnect
- 📊 **200 historical candles** loaded on startup via REST API
- ⚡ **Price flash** — green/red color flash when price changes

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Zoom Controls

| Action | Effect |
|--------|--------|
| Mouse wheel | Zoom in/out |
| Click + drag | Pan left/right |
| Pinch (mobile) | Zoom |
| `[ FIT ]` button | Reset to full view |

## Y-Axis Smart Scaling

The chart automatically adjusts the visible price range:
- When current price rises within **15% of the top**, the max shifts up by **30%** of the span
- When current price falls within **15% of the bottom**, the min shifts down by **30%** of the span
