"use client";

import { useEffect, useRef } from "react";
import { useTickStream, TickPoint } from "@/hooks/useTickStream";
import { useChartContext } from "@/context/ChartContext";

// ─── Types ───────────────────────────────────────────────────────────────────

export type LiveDotConfig =
  | {
      type: "circle";
      radius?: number;
      color?: string;
      pulse?: boolean;
      glow?: boolean;
    }
  | {
      type: "image";
      src: string;
      width?: number;
      height?: number;
      offsetX?: number;
      offsetY?: number;
    }
  | {
      type: "custom";
      draw: (
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        color: string,
      ) => void;
    };

export interface LiveLineChartProps {
  color?: string;
  lineWidth?: number;
  theme?: "dark" | "light";
  fill?: boolean;
  dot?: LiveDotConfig;
  windowSecs?: number;
  formatValue?: (v: number) => string;
  formatTime?: (unixSec: number) => string;
  padding?: { top?: number; right?: number; bottom?: number; left?: number };
  className?: string;
  /**
   * Сглаживание линии графика: 0 = максимально плавно (сильное EMA),
   * 1 = сырые данные без сглаживания. Default: 0.15
   */
  smoothing?: number;
  /**
   * Скорость реакции Y-оси на изменение диапазона цены.
   * Меньше = медленнее/плавнее. Default: 0.08
   */
  ySpeed?: number;
  /**
   * Скорость lerp живой точки к новой цене.
   * Меньше = медленнее/плавнее. Default: 0.12
   */
  valueSpeed?: number;
}

// ─── Image cache ──────────────────────────────────────────────────────────────

const imgCache = new Map<string, HTMLImageElement>();
function loadImg(src: string): HTMLImageElement {
  if (imgCache.has(src)) return imgCache.get(src)!;
  const img = new Image();
  img.onload = () => imgCache.set(src, img);
  img.src = src;
  return img;
}

// ─── interpolateAtTime (из liveline) ─────────────────────────────────────────
// Бинарный поиск + линейная интерполяция между двумя соседними тиками.
// Лучше velocity prediction: не угадывает куда пойдёт цена, а честно
// интерполирует между реальными точками данных.

function interpolateAtTime(points: TickPoint[], time: number): number | null {
  if (points.length === 0) return null;
  if (time <= points[0].time) return points[0].value;
  if (time >= points[points.length - 1].time)
    return points[points.length - 1].value;

  let lo = 0,
    hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].time <= time) lo = mid;
    else hi = mid;
  }
  const p1 = points[lo],
    p2 = points[hi];
  const dt = p2.time - p1.time;
  if (dt === 0) return p1.value;
  const t = (time - p1.time) / dt;
  return p1.value + (p2.value - p1.value) * t;
}

// ─── computeRange (из liveline) ──────────────────────────────────────────────
// Вычисляет Y-диапазон с отступами. Гарантирует минимальный span
// чтобы при флэтовом рынке график не растягивался до предела.

function computeRange(
  visible: TickPoint[],
  currentValue: number,
): { min: number; max: number } {
  let tMin = Infinity,
    tMax = -Infinity;
  for (const p of visible) {
    if (p.value < tMin) tMin = p.value;
    if (p.value > tMax) tMax = p.value;
  }
  if (currentValue < tMin) tMin = currentValue;
  if (currentValue > tMax) tMax = currentValue;

  const rawRange = tMax - tMin;
  // Минимальный span: 0.1% от цены (для BTC ~$95 = всегда видно движение)
  const minRange = Math.max(rawRange * 0.1, currentValue * 0.001, 0.4);

  if (rawRange < minRange) {
    const mid = (tMin + tMax) / 2;
    tMin = mid - minRange / 2;
    tMax = mid + minRange / 2;
  } else {
    const margin = rawRange * 0.12;
    tMin -= margin;
    tMax += margin;
  }
  return { min: tMin, max: tMax };
}

// ─── niceStep ────────────────────────────────────────────────────────────────
// Подбирает "красивый" шаг для Y-оси: 1, 2, 5, 10, 20, 50, 100 ...

function niceStep(rawStep: number): number {
  if (rawStep <= 0) return 1;
  const exp = Math.floor(Math.log10(rawStep));
  const mag = Math.pow(10, exp);
  const frac = rawStep / mag;
  let nice: number;
  if (frac <= 1) nice = 1;
  else if (frac <= 2) nice = 2;
  else if (frac <= 5) nice = 5;
  else nice = 10;
  return nice * mag;
}

// ─── chooseTimeStep ───────────────────────────────────────────────────────────

function chooseTimeStep(windowSecs: number): number {
  if (windowSecs <= 15) return 3;
  if (windowSecs <= 30) return 5;
  if (windowSecs <= 60) return 10;
  if (windowSecs <= 120) return 20;
  if (windowSecs <= 300) return 60;
  if (windowSecs <= 600) return 120;
  return 300;
}

// ─── pillPath ────────────────────────────────────────────────────────────────

function pillPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ─── Internal state ───────────────────────────────────────────────────────────

interface InternalState {
  W: number;
  H: number;
  lastRaf: number;
  rafId: number;
  pulse: number;
  // Текущее отображаемое значение (lerp к interpolated target)
  dispValue: number;
  // Y-диапазон (lerp к computeRange output)
  yMin: number;
  yMax: number;
  initValue: boolean;
  initY: boolean;
  dotImg: HTMLImageElement | null;
  pts: TickPoint[];
  smooth: number | null;
}

function makeState(): InternalState {
  return {
    W: 0,
    H: 0,
    lastRaf: 0,
    rafId: 0,
    pulse: 0,
    dispValue: 0,
    yMin: 0,
    yMax: 0,
    initValue: false,
    initY: false,
    dotImg: null,
    pts: [],
    smooth: null,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LiveLineChart({
  color = "#3b82f6",
  lineWidth = 2,
  theme = "dark",
  fill = true,
  dot = { type: "circle", radius: 5, pulse: true, glow: true },
  windowSecs = 60,
  smoothing = 0.15,
  ySpeed = 0.08,
  valueSpeed = 0.12,
  formatValue = (v) =>
    v.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
  formatTime = (t) => {
    const d = new Date(t * 1000);
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  },
  padding: padProp = {},
  className,
}: LiveLineChartProps) {
  const { symbol } = useChartContext();
  const { points, smoothPrice, status } = useTickStream(symbol);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stRef = useRef<InternalState>(makeState());

  const PAD = {
    top: padProp.top ?? 20,
    right: padProp.right ?? 92,
    bottom: padProp.bottom ?? 44,
    left: padProp.left ?? 12,
  };

  useEffect(() => {
    stRef.current.pts = points;
  }, [points]);
  useEffect(() => {
    stRef.current.smooth = smoothPrice;
  }, [smoothPrice]);

  useEffect(() => {
    if (dot.type === "image") stRef.current.dotImg = loadImg(dot.src);
  }, [dot]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(dpr, dpr);
      stRef.current.W = width;
      stRef.current.H = height;
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const st = stRef.current;
    st.lastRaf = 0;

    const loop = (now: number) => {
      st.rafId = requestAnimationFrame(loop);
      frame(now, canvas, st, PAD, {
        color,
        lineWidth,
        theme,
        fill,
        dot,
        windowSecs,
        smoothing,
        ySpeed,
        valueSpeed,
        formatValue,
        formatTime,
      });
    };
    st.rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(st.rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, lineWidth, theme, fill, dot, windowSecs]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%" }}
      />
      {status === "connecting" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}>
          <span
            style={{
              fontFamily: "monospace",
              fontSize: 11,
              color: "rgba(255,255,255,0.2)",
              letterSpacing: "0.15em",
            }}>
            CONNECTING…
          </span>
        </div>
      )}
    </div>
  );
}

// ─── frame ────────────────────────────────────────────────────────────────────

interface DrawOpts {
  color: string;
  lineWidth: number;
  theme: "dark" | "light";
  fill: boolean;
  dot: LiveDotConfig;
  windowSecs: number;
  smoothing: number;
  ySpeed: number;
  valueSpeed: number;
  formatValue: (v: number) => string;
  formatTime: (t: number) => string;
}

function frame(
  now: number,
  canvas: HTMLCanvasElement,
  s: InternalState,
  PAD: { top: number; right: number; bottom: number; left: number },
  o: DrawOpts,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx || s.W === 0 || s.H === 0) return;

  const dt = s.lastRaf ? Math.min(now - s.lastRaf, 64) : 16;
  s.lastRaf = now;
  s.pulse = (s.pulse + dt * 0.004) % (Math.PI * 2);

  const { W, H } = s;
  const dark = o.theme === "dark";
  const pts = s.pts;

  ctx.fillStyle = dark ? "#0a0a0f" : "#f8f9fc";
  ctx.fillRect(0, 0, W, H);

  if (pts.length < 2) return;

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const xAxisY = PAD.top + plotH;

  // ── Wall-clock now: ось X движется плавно каждый кадр ────────────────────
  const wallNowSec = Date.now() / 1000;
  const windowStart = wallNowSec - o.windowSecs;

  // ── Live value: lerp к smoothPrice/interpolated ──────────────────────────
  const interpolated = interpolateAtTime(pts, wallNowSec);
  const target = s.smooth !== null ? s.smooth : (interpolated ?? s.dispValue);
  if (!s.initValue && target !== 0) {
    s.dispValue = target;
    s.initValue = true;
  }
  // valueSpeed: 0.12 default. Меньше = медленнее реагирует на новую цену.
  const vA = 1 - Math.pow(1 - o.valueSpeed, dt / 16);
  s.dispValue += (target - s.dispValue) * vA;

  // ── Y-диапазон: медленный lerp ────────────────────────────────────────────
  const visible = pts.filter((p) => p.time >= windowStart);
  const range = computeRange(visible, s.dispValue);
  if (!s.initY) {
    s.yMin = range.min;
    s.yMax = range.max;
    s.initY = true;
  }
  // ySpeed: 0.08 default. Меньше = ось Y медленнее подстраивается.
  const yA = 1 - Math.pow(1 - o.ySpeed, dt / 16);
  s.yMin += (range.min - s.yMin) * yA;
  s.yMax += (range.max - s.yMax) * yA;

  // ── Map helpers ───────────────────────────────────────────────────────────
  const ySpan = s.yMax - s.yMin || 1;
  const mapX = (t: number) =>
    PAD.left + ((t - windowStart) / o.windowSecs) * plotW;
  const mapY = (v: number) => PAD.top + plotH - ((v - s.yMin) / ySpan) * plotH;

  const liveX = mapX(wallNowSec);
  const liveY = mapY(s.dispValue);

  // ── Построение curve с EMA-сглаживанием ──────────────────────────────────
  //
  // Проблема "ступенек" — фундаментальная: цена реально стоит на месте
  // 200-500ms между тиками, затем резко прыгает. Пиксельный ресамплинг
  // не помогает — он точно воспроизводит те же ступеньки.
  //
  // Решение: EMA (exponential moving average) по Y-координатам.
  // smoothing=0 → сильное сглаживание (очень плавно)
  // smoothing=1 → сырые данные (ступеньки видны)
  //
  // Сначала ресамплируем по пикселям (1px шаг), затем прогоняем через EMA.
  // Это сглаживает углы без искажения общей формы графика.
  //
  const allPts = [...visible, { time: wallNowSec, value: s.dispValue }];
  const curve: { x: number; y: number }[] = [];

  if (allPts.length >= 2) {
    const startX = Math.max(PAD.left, mapX(allPts[0].time));
    const endX = liveX;

    // Ресамплинг по пикселям
    const raw: number[] = []; // только Y, X восстановим по индексу
    for (let px = startX; px <= endX + 0.5; px += 1) {
      const t = windowStart + ((px - PAD.left) / plotW) * o.windowSecs;
      const v = interpolateAtTime(allPts, t);
      raw.push(
        v !== null ? mapY(v) : raw.length > 0 ? raw[raw.length - 1] : liveY,
      );
    }

    if (raw.length > 0) {
      // EMA только прямой проход — обратный проход убран намеренно.
      // Обратный проход смещал правый край кривой от реального значения,
      // из-за чего точка "не успевала" за линией при скачках.
      // Прямой EMA не имеет этой проблемы: правый край всегда = liveY.
      const alpha = Math.max(0.01, Math.min(1, o.smoothing));
      const smoothed = new Float64Array(raw.length);
      smoothed[0] = raw[0];
      for (let i = 1; i < raw.length; i++) {
        smoothed[i] = smoothed[i - 1] + alpha * (raw[i] - smoothed[i - 1]);
      }

      // Принудительно фиксируем последнюю точку на реальном liveY.
      // Это гарантирует что конец линии = позиция точки, всегда, без исключений.
      smoothed[smoothed.length - 1] = liveY;

      for (let i = 0; i < raw.length; i++) {
        curve.push({ x: startX + i, y: smoothed[i] });
      }
    }
  }

  if (curve.length === 0) curve.push({ x: liveX, y: liveY });

  // dotY = последняя точка curve = liveY (зафиксирован выше).
  // Точка и конец линии теперь физически одно и то же значение.
  const dotY = liveY;

  // ── Цвета ─────────────────────────────────────────────────────────────────
  const gridClr = dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const gridDotClr = dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
  const labelClr = dark ? "rgba(255,255,255,0.30)" : "rgba(0,0,0,0.32)";

  // ── Y axis ────────────────────────────────────────────────────────────────
  // Минималистичная ось как у liveline:
  // - мало меток (~4-5 на экран)
  // - пунктирные горизонтальные линии
  // - метки справа в отдельной колонке
  //
  const targetLabelCount = Math.max(3, Math.round(plotH / 80));
  const yStep = niceStep(ySpan / targetLabelCount);
  const yFirst = Math.ceil(s.yMin / yStep) * yStep;

  ctx.font = "11px 'JetBrains Mono','Fira Mono',ui-monospace,monospace";

  for (let v = yFirst; v <= s.yMax + yStep * 0.01; v += yStep) {
    const vr = Math.round(v / yStep) * yStep;
    const y = mapY(vr);
    if (y < PAD.top || y > xAxisY) continue;

    // Пунктирная горизонтальная линия
    ctx.save();
    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = gridDotClr;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(W - PAD.right, y);
    ctx.stroke();
    ctx.restore();

    // Метка — справа, в зоне PAD.right
    ctx.fillStyle = labelClr;
    ctx.textAlign = "left";
    ctx.fillText(o.formatValue(vr), W - PAD.right + 8, y + 4);
  }

  // ── X axis ────────────────────────────────────────────────────────────────
  // Тонкая линия оси
  ctx.strokeStyle = gridClr;
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(PAD.left, xAxisY);
  ctx.lineTo(W - PAD.right, xAxisY);
  ctx.stroke();

  const xStep = chooseTimeStep(o.windowSecs);
  const firstTick = Math.ceil(windowStart / xStep) * xStep;

  ctx.font = "10px 'JetBrains Mono','Fira Mono',ui-monospace,monospace";

  for (let t = firstTick; t <= wallNowSec + xStep; t += xStep) {
    const x = mapX(t);
    if (x < PAD.left + 4 || x > W - PAD.right - 4) continue;

    // Вертикальная пунктирная grid-линия
    ctx.save();
    ctx.setLineDash([2, 6]);
    ctx.strokeStyle = gridClr;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, PAD.top);
    ctx.lineTo(x, xAxisY);
    ctx.stroke();
    ctx.restore();

    // Tick mark
    ctx.strokeStyle = labelClr;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x, xAxisY);
    ctx.lineTo(x, xAxisY + 4);
    ctx.stroke();

    // Label
    ctx.fillStyle = labelClr;
    ctx.textAlign = "center";
    ctx.fillText(o.formatTime(t), x, xAxisY + 16);
  }

  // ── Gradient fill (сверху вниз) ──────────────────────────────────────────
  if (o.fill && curve.length > 1) {
    const fillGrad = ctx.createLinearGradient(0, PAD.top, 0, xAxisY);
    fillGrad.addColorStop(0, o.color + "22");
    fillGrad.addColorStop(1, o.color + "00");
    ctx.save();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(curve[0].x, curve[0].y);
    for (let i = 1; i < curve.length; i++) ctx.lineTo(curve[i].x, curve[i].y);
    ctx.lineTo(liveX, xAxisY);
    ctx.lineTo(curve[0].x, xAxisY);
    ctx.closePath();
    ctx.fillStyle = fillGrad;
    ctx.fill();
    ctx.restore();
  }

  // ── Line с горизонтальным градиентом (левый край → живая точка) ──────────
  // Эффект как на розовом графике: линия становится ярче к правому краю.
  // Реализация: рисуем линию через clip-маску, заливаем горизонтальным
  // градиентом поверх — иначе Canvas не поддерживает stroke gradient нативно.
  if (curve.length > 1) {
    ctx.save();
    ctx.setLineDash([]);
    ctx.lineWidth = o.lineWidth;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // Строим path линии
    ctx.beginPath();
    ctx.moveTo(curve[0].x, curve[0].y);
    for (let i = 1; i < curve.length; i++) ctx.lineTo(curve[i].x, curve[i].y);

    // Горизонтальный градиент вдоль линии: прозрачный слева → полный цвет справа
    const lineGrad = ctx.createLinearGradient(curve[0].x, 0, liveX, 0);
    lineGrad.addColorStop(0, o.color + "00"); // прозрачный у левого края
    lineGrad.addColorStop(0.35, o.color + "60"); // полупрозрачный
    lineGrad.addColorStop(1, o.color + "ff"); // полный цвет у живой точки

    ctx.strokeStyle = lineGrad;
    ctx.stroke();
    ctx.restore();
  }

  // ── Live dot ──────────────────────────────────────────────────────────────
  renderDot(ctx, liveX, dotY, o.color, o.dot, s.pulse, s.dotImg);

  // ── Price badge ───────────────────────────────────────────────────────────
  renderBadge(
    ctx,
    liveX,
    dotY,
    s.dispValue,
    o.color,
    dark,
    o.formatValue,
    W,
    PAD,
  );
}

// ─── renderDot ────────────────────────────────────────────────────────────────

function renderDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  dot: LiveDotConfig,
  phase: number,
  dotImg: HTMLImageElement | null,
) {
  if (dot.type === "custom") {
    dot.draw(ctx, x, y, color);
    return;
  }
  if (dot.type === "image") {
    if (!dotImg?.complete) {
      circleDot(ctx, x, y, color, 5, true, true, phase);
      return;
    }
    const w = dot.width ?? 32,
      h = dot.height ?? 32;
    ctx.drawImage(
      dotImg,
      x - w / 2 + (dot.offsetX ?? 0),
      y - h / 2 + (dot.offsetY ?? 0),
      w,
      h,
    );
    return;
  }
  circleDot(
    ctx,
    x,
    y,
    dot.color ?? color,
    dot.radius ?? 5,
    dot.pulse ?? true,
    dot.glow ?? true,
    phase,
  );
}

function circleDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  r: number,
  pulse: boolean,
  glow: boolean,
  phase: number,
) {
  if (glow) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 5);
    g.addColorStop(0, color + "3a");
    g.addColorStop(1, color + "00");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (pulse) {
    const ring = r * 2.0 + Math.sin(phase) * r * 0.8;
    const a16 = Math.round((0.28 + Math.abs(Math.sin(phase)) * 0.22) * 255)
      .toString(16)
      .padStart(2, "0");
    ctx.strokeStyle = color + a16;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, ring, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.arc(x - r * 0.28, y - r * 0.28, r * 0.38, 0, Math.PI * 2);
  ctx.fill();
}

// ─── renderBadge ─────────────────────────────────────────────────────────────

function renderBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  value: number,
  color: string,
  dark: boolean,
  fmt: (v: number) => string,
  W: number,
  PAD: { top: number; right: number; bottom: number; left: number },
) {
  const text = fmt(value);
  ctx.font = "600 12px 'JetBrains Mono','Fira Mono',ui-monospace,monospace";
  const tw = ctx.measureText(text).width;
  const bW = tw + 22,
    bH = 22;
  const bX = W - PAD.right + 10;
  const bY = y - bH / 2;

  ctx.save();
  ctx.fillStyle = dark ? "rgba(8,8,14,0.95)" : "rgba(255,255,255,0.95)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  pillPath(ctx, bX, bY, bW, bH, bH / 2);
  ctx.fill();
  ctx.stroke();

  // Tail
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(bX, y - 4);
  ctx.lineTo(bX - 6, y);
  ctx.lineTo(bX, y + 4);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = dark ? "#ffffff" : "#000000";
  ctx.textAlign = "center";
  ctx.fillText(text, bX + bW / 2, y + 5);
  ctx.restore();
}
