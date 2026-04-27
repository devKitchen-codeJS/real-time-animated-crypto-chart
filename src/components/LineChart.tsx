"use client";

import { useEffect, useRef, useCallback } from "react";
import { PriceDelta } from "@/hooks/useTradeStream";

interface LineChartProps {
  // Array of {time, value} points to draw
  points: { time: number; value: number }[];
  // The smoothly-interpolated current price (updated at 60fps via RAF)
  smoothPrice: number | null;
  currentTime: number;
}

const COLORS = {
  bg: "#060608",
  grid: "#0d0d12",
  gridLine: "#111118",
  line: "#f0b90b",
  lineGlow: "#f0b90b22",
  dot: "#f0b90b",
  dotRing: "#f0b90b44",
  text: "#4a4a5a",
  area: "rgba(240,185,11,0.04)",
};

export default function LineChart({
  points,
  smoothPrice,
  currentTime,
}: LineChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);

  // We keep a local "display points" list that we render each frame
  // smoothPrice replaces the last point's value for the animated dot
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const PAD_LEFT = 12;
    const PAD_RIGHT = 72;
    const PAD_TOP = 24;
    const PAD_BOT = 32;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    if (points.length < 2) return;

    // Build display points: replace last value with smoothPrice if available
    const display = [...points];
    if (smoothPrice !== null && display.length > 0) {
      display[display.length - 1] = {
        ...display[display.length - 1],
        value: smoothPrice,
      };
      // Also add a "now" point slightly ahead for continuous feel
      display.push({ time: currentTime, value: smoothPrice });
    }

    // Value range with smart scaling
    const values = display.map((p) => p.value);
    let minV = Math.min(...values);
    let maxV = Math.max(...values);
    const span = maxV - minV || 1;
    // Add padding
    minV -= span * 0.1;
    maxV += span * 0.1;

    const chartW = W - PAD_LEFT - PAD_RIGHT;
    const chartH = H - PAD_TOP - PAD_BOT;

    const minT = display[0].time;
    const maxT = display[display.length - 1].time;
    const timeSpan = maxT - minT || 1;

    const toX = (t: number) => PAD_LEFT + ((t - minT) / timeSpan) * chartW;
    const toY = (v: number) =>
      PAD_TOP + (1 - (v - minV) / (maxV - minV)) * chartH;

    // ── Grid lines ──────────────────────────────────────────────────────
    const gridCount = 5;
    ctx.strokeStyle = COLORS.gridLine;
    ctx.lineWidth = 1;
    for (let i = 0; i <= gridCount; i++) {
      const y = PAD_TOP + (i / gridCount) * chartH;
      ctx.beginPath();
      ctx.moveTo(PAD_LEFT, y);
      ctx.lineTo(W - PAD_RIGHT, y);
      ctx.stroke();

      // Y-axis labels
      const val = maxV - (i / gridCount) * (maxV - minV);
      ctx.fillStyle = COLORS.text;
      ctx.font = "10px 'JetBrains Mono', monospace";
      ctx.textAlign = "left";
      ctx.fillText("$" + val.toFixed(0), W - PAD_RIGHT + 6, y + 4);
    }

    // Time labels
    const timeLabels = 4;
    for (let i = 0; i <= timeLabels; i++) {
      const t = minT + (i / timeLabels) * timeSpan;
      const x = toX(t);
      const d = new Date(t * 1000);
      const label = d.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      ctx.fillStyle = COLORS.text;
      ctx.font = "10px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(label, x, H - PAD_BOT + 16);
    }

    // ── Area fill ────────────────────────────────────────────────────────
    const gradient = ctx.createLinearGradient(0, PAD_TOP, 0, PAD_TOP + chartH);
    gradient.addColorStop(0, "rgba(240,185,11,0.12)");
    gradient.addColorStop(0.6, "rgba(240,185,11,0.03)");
    gradient.addColorStop(1, "rgba(240,185,11,0)");

    ctx.beginPath();
    ctx.moveTo(toX(display[0].time), toY(display[0].value));
    for (let i = 1; i < display.length; i++) {
      // Smooth curve via bezier
      const prev = display[i - 1];
      const curr = display[i];
      const mx = (toX(prev.time) + toX(curr.time)) / 2;
      ctx.bezierCurveTo(
        mx,
        toY(prev.value),
        mx,
        toY(curr.value),
        toX(curr.time),
        toY(curr.value)
      );
    }
    ctx.lineTo(toX(display[display.length - 1].time), PAD_TOP + chartH);
    ctx.lineTo(toX(display[0].time), PAD_TOP + chartH);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // ── Main line ────────────────────────────────────────────────────────
    // Glow pass
    ctx.save();
    ctx.shadowColor = "#f0b90b";
    ctx.shadowBlur = 8;
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(toX(display[0].time), toY(display[0].value));
    for (let i = 1; i < display.length; i++) {
      const prev = display[i - 1];
      const curr = display[i];
      const mx = (toX(prev.time) + toX(curr.time)) / 2;
      ctx.bezierCurveTo(
        mx,
        toY(prev.value),
        mx,
        toY(curr.value),
        toX(curr.time),
        toY(curr.value)
      );
    }
    ctx.stroke();
    ctx.restore();

    // ── Live dot (last point) ────────────────────────────────────────────
    const lastX = toX(display[display.length - 1].time);
    const lastY = toY(display[display.length - 1].value);

    // Outer pulse ring
    ctx.beginPath();
    ctx.arc(lastX, lastY, 8, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.dotRing;
    ctx.fill();

    // Inner dot
    ctx.save();
    ctx.shadowColor = "#f0b90b";
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.dot;
    ctx.fill();
    ctx.restore();

    // Price label next to dot
    const priceStr = smoothPrice !== null ? `$${smoothPrice.toFixed(2)}` : "";
    if (priceStr) {
      ctx.font = "bold 11px 'JetBrains Mono', monospace";
      ctx.textAlign = "left";
      const labelX = lastX + 12;
      const labelY = lastY + 4;
      ctx.fillStyle = "#f0b90b";
      ctx.fillText(priceStr, labelX, labelY);
    }
  }, [points, smoothPrice, currentTime]);

  // Run draw every animation frame
  useEffect(() => {
    const loop = () => {
      draw();
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [draw]);

  // Resize canvas to match container
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width = parent.clientWidth * window.devicePixelRatio;
      canvas.height = parent.clientHeight * window.devicePixelRatio;
      canvas.style.width = parent.clientWidth + "px";
      canvas.style.height = parent.clientHeight + "px";
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
    });
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    return () => ro.disconnect();
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className='absolute inset-0 w-full h-full'
      style={{ display: "block" }}
    />
  );
}

// ── Delta Column ──────────────────────────────────────────────────────────────

interface DeltaColumnProps {
  deltas: PriceDelta[];
}

function fmt(n: number): string {
  const abs = Math.abs(n);
  const sign = n > 0 ? "+" : n < 0 ? "-" : " ";
  if (abs >= 100) return sign + abs.toFixed(0);
  if (abs >= 10) return sign + abs.toFixed(1);
  if (abs >= 1) return sign + abs.toFixed(2);
  return sign + abs.toFixed(2);
}

export function DeltaColumn({ deltas }: DeltaColumnProps) {
  return (
    <div className='flex flex-col h-full overflow-hidden border-l border-border bg-surface/30'>
      {/* Header */}
      <div className='flex-none px-3 py-2 border-b border-border'>
        <div className='text-[10px] font-mono text-muted tracking-widest'>
          Δ PRICE
        </div>
        <div className='text-[9px] font-mono text-muted/40 mt-0.5'>
          per 3 ticks
        </div>
      </div>

      {/* Delta list */}
      <div className='flex-1 overflow-hidden flex flex-col-reverse'>
        {deltas.length === 0 && (
          <div className='flex items-center justify-center h-full'>
            <span className='text-[10px] font-mono text-muted/30'>
              waiting...
            </span>
          </div>
        )}
        <div className='flex flex-col gap-px p-1'>
          {deltas.slice(0, 40).map((d, i) => {
            const isUp = d.direction === "up";
            const isDown = d.direction === "down";
            const opacity = Math.max(0.25, 1 - i * 0.025);

            return (
              <div
                key={d.id}
                className='flex items-center justify-between px-2 py-[3px] rounded-[2px] transition-all'
                style={{
                  opacity,
                  backgroundColor:
                    i === 0
                      ? isUp
                        ? "rgba(0,200,150,0.08)"
                        : "rgba(255,77,77,0.08)"
                      : "transparent",
                }}>
                {/* Delta value */}
                <span
                  className={`text-[11px] font-mono font-medium tabular-nums ${
                    isUp ? "text-green" : isDown ? "text-red" : "text-muted"
                  }`}>
                  {fmt(d.delta)}
                </span>

                {/* Arrow */}
                <span
                  className={`text-[10px] ml-1 ${
                    isUp ? "text-green" : isDown ? "text-red" : "text-muted"
                  }`}>
                  {isUp ? "▲" : isDown ? "▼" : "—"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary bar */}
      {deltas.length > 0 && (
        <div className='flex-none border-t border-border px-3 py-2'>
          <div className='text-[9px] font-mono text-muted/40 mb-1'>
            LAST 10 BIAS
          </div>
          <div className='flex gap-0.5 h-2'>
            {(() => {
              const last10 = deltas.slice(0, 10);
              const ups = last10.filter((d) => d.direction === "up").length;
              const downs = last10.filter((d) => d.direction === "down").length;
              const total = last10.length || 1;
              return (
                <>
                  <div
                    className='bg-green rounded-l-sm transition-all duration-300'
                    style={{ width: `${(ups / total) * 100}%` }}
                  />
                  <div
                    className='bg-red rounded-r-sm transition-all duration-300'
                    style={{ width: `${(downs / total) * 100}%` }}
                  />
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
