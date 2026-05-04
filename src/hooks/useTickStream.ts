"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import gsap from "gsap";
import { ConnectionStatus } from "@/types";
import { SymbolInfo } from "@/context/ChartContext";

// ─── Типы ─────────────────────────────────────────────────────────────────────

// Одна точка на графике — время + цена
export interface TickPoint {
  // Время в секундах (дробное, например 1716900123.456)
  // Дробное потому что aggTrade приходит быстрее чем раз в секунду
  // и нам нужно различать точки внутри одной секунды
  time: number;
  value: number;
}

// Дельта для правой колонки
export interface PriceDelta {
  id: number;
  delta: number;
  price: number;
  timestamp: number;
  direction: "up" | "down" | "flat";
}

// Что возвращает хук
export interface TickStreamReturn {
  // Весь накопленный массив точек для отрисовки (история + live)
  points: TickPoint[];

  // Текущее ПЛАВНОЕ значение цены (GSAP двигает это число между тиками)
  // Именно это число двигает живую точку на графике
  smoothPrice: number | null;

  // Дельты для колонки справа
  deltas: PriceDelta[];

  status: ConnectionStatus;
  reconnect: () => void;
}

// ─── Константы ────────────────────────────────────────────────────────────────

const WS_BASE = "wss://stream.binance.com:9443/ws";

// Сколько точек храним в истории live-режима
// aggTrade приходит ~10-15 раз в секунду
// 3600 точек = примерно 4-6 минут живой истории
const MAX_LIVE_POINTS = 3600;

// Через сколько тиков фиксировать дельту (для колонки Δ)
const DELTA_BUFFER_SIZE = 3;

// ─── Главный хук ─────────────────────────────────────────────────────────────

export function useTickStream(symbolInfo: SymbolInfo): TickStreamReturn {
  // points и deltas — это React state, потому что их изменение должно
  // вызывать перерисовку компонента (React должен знать о них)
  const [points, setPoints] = useState<TickPoint[]>([]);
  const [smoothPrice, setSmoothPrice] = useState<number | null>(null);
  const [deltas, setDeltas] = useState<PriceDelta[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  // ── Рефы (не вызывают перерисовку, меняются мгновенно) ──────────────────

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // Мастер-массив всех точек.
  // Почему реф а не state? Потому что он меняется ~15 раз в секунду.
  // Если бы это был state — React делал бы 15 full re-render в секунду
  // на весь компонент. Реф меняется без ре-рендера, а мы сами решаем
  // когда "скормить" новые данные в React state через setPoints().
  const pointsBufferRef = useRef<TickPoint[]>([]);

  // Объект-посредник для GSAP.
  // GSAP не умеет анимировать "число в React state" напрямую.
  // Он умеет анимировать свойства обычного JS-объекта.
  // Поэтому создаём объект { value: 0 } и говорим GSAP:
  // "двигай animated.value от текущего к целевому за N миллисекунд"
  // В onUpdate мы читаем animated.value и пишем в setSmoothPrice.
  const animatedRef = useRef({ value: 0 });

  // Время последнего пришедшего тика (в миллисекундах)
  // Нужно для вычисления динамического duration в GSAP
  const lastTickTimeRef = useRef<number | null>(null);

  // Буфер для подсчёта дельт
  const deltaBufferRef = useRef<number[]>([]);
  const prevDeltaPriceRef = useRef<number | null>(null);
  const deltaIdRef = useRef(0);

  // Ссылка на саму функцию connect — нужна для рекурсивного вызова
  // при авто-реконнекте (ws.onclose вызывает connect снова)
  const connectRef = useRef<((sym: SymbolInfo) => void) | null>(null);

  // ── GSAP tween ───────────────────────────────────────────────────────────

  // Эта функция вызывается при каждом новом тике с биржи.
  // Она запускает GSAP tween который плавно двигает animated.value
  // от текущего значения к новому.
  const animateTo = useCallback((targetPrice: number) => {
    const now = Date.now();

    // Вычисляем сколько времени прошло с предыдущего тика
    // Это и будет duration для GSAP — мы хотим доехать до цели
    // ровно к моменту когда придёт следующий тик
    let tickInterval = 80; // дефолт: 80ms (типичный интервал aggTrade)
    if (lastTickTimeRef.current !== null) {
      const elapsed = now - lastTickTimeRef.current;
      // Clamp: не меньше 30ms и не больше 300ms
      // Если тики вдруг участились или замедлились — не сходим с ума
      tickInterval = Math.max(30, Math.min(300, elapsed));
    }
    lastTickTimeRef.current = now;

    // gsap.to() — главная функция GSAP для анимации.
    //
    // Первый аргумент: ОБЪЕКТ который анимируем (animatedRef.current = { value: ... })
    // Второй аргумент: КУДА и КАК анимируем
    //
    // overwrite: true — КРИТИЧЕСКИ ВАЖНО.
    // Если предыдущий tween ещё не закончился (мы не успели доехать до цели),
    // а пришёл новый тик — убиваем старый tween и стартуем новый.
    // Без этого tweens накапливаются и начинают конфликтовать.
    //
    // ease: "none" — ЛИНЕЙНОЕ движение.
    // Мы не хотим easing (замедление в конце) потому что цена движется
    // равномерно. Если использовать "power2.out" — в конце движение
    // замедлится и будет казаться что цена "зависает" перед новым тиком.
    //
    // onUpdate — вызывается КАЖДЫЙ RAF КАДР пока идёт анимация (~60fps).
    // Здесь мы читаем текущее анимированное значение и записываем в React state.
    // setSmoothPrice() → React видит изменение → перерисовывает компонент →
    // компонент передаёт новое значение в LightweightCharts → точка двигается.
    gsap.to(animatedRef.current, {
      value: targetPrice,
      duration: tickInterval / 1000, // GSAP принимает duration в секундах
      ease: "none",
      overwrite: true,
      onUpdate: () => {
        if (!mountedRef.current) return;
        setSmoothPrice(animatedRef.current.value);
      },
    });
  }, []);

  // ── WebSocket подключение ─────────────────────────────────────────────────

  const connect = useCallback(
    (sym: SymbolInfo) => {
      // Закрываем старый сокет если есть
      if (wsRef.current) {
        wsRef.current.onclose = null; // отключаем авто-реконнект на intentional close
        wsRef.current.close();
      }
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);

      // Убиваем все активные GSAP tweens на нашем объекте
      // Важно при смене символа — не хотим чтобы старая анимация
      // продолжала двигать значение пока новые данные ещё не пришли
      gsap.killTweensOf(animatedRef.current);

      // Сбрасываем всё состояние
      setStatus("connecting");
      setPoints([]);
      setDeltas([]);
      setSmoothPrice(null);
      pointsBufferRef.current = [];
      deltaBufferRef.current = [];
      prevDeltaPriceRef.current = null;
      lastTickTimeRef.current = null;
      animatedRef.current.value = 0;

      // aggTrade — самый детальный публичный стрим Binance
      // Каждое сообщение = одна агрегированная сделка
      // Агрегация: несколько сделок в одну миллисекунду от одного тейкера
      // Частота: ~5-20 сообщений в секунду в зависимости от активности рынка
      const ws = new WebSocket(`${WS_BASE}/${sym.wsSymbol}@aggTrade`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (mountedRef.current) setStatus("connected");
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;

        let data: Record<string, unknown>;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }

        // Структура aggTrade сообщения от Binance:
        // data.p — price (цена сделки), строка
        // data.T — trade time (время в миллисекундах)
        // data.q — quantity (объём)
        // data.m — isBuyerMaker (true = продавец агрессор, false = покупатель)
        const price = parseFloat(data.p as string);
        const tradeTimeMs = data.T as number;

        if (isNaN(price) || !tradeTimeMs) return;

        // ── 1. Запускаем GSAP анимацию к новой цене ──────────────────────
        animateTo(price);

        // ── 2. Добавляем точку в буфер истории ───────────────────────────
        // Время в секундах, дробное (миллисекунды / 1000)
        // LightweightCharts принимает Unix timestamp в секундах
        // Но важно: дробная часть нужна нам чтобы различать точки
        // внутри одной секунды (иначе LW Charts выдаст ошибку дубликата)
        const timeInSeconds = tradeTimeMs / 1000;

        const newPoint: TickPoint = { time: timeInSeconds, value: price };
        pointsBufferRef.current.push(newPoint);

        // Ограничиваем размер буфера — убираем старые точки с начала
        if (pointsBufferRef.current.length > MAX_LIVE_POINTS) {
          pointsBufferRef.current.shift(); // удаляем самую старую точку
        }

        // Передаём копию массива в React state
        // Используем spread [...] чтобы React увидел новый референс массива
        // (иначе React может не заметить изменение)
        setPoints([...pointsBufferRef.current]);

        // ── 3. Считаем дельту для колонки ────────────────────────────────
        deltaBufferRef.current.push(price);

        if (deltaBufferRef.current.length >= DELTA_BUFFER_SIZE) {
          const avg =
            deltaBufferRef.current.reduce((a, b) => a + b, 0) /
            deltaBufferRef.current.length;

          if (prevDeltaPriceRef.current !== null) {
            const delta = parseFloat(
              (avg - prevDeltaPriceRef.current).toFixed(4),
            );
            if (Math.abs(delta) >= 0.0001) {
              setDeltas((prev) =>
                [
                  {
                    id: deltaIdRef.current++,
                    delta,
                    price: avg,
                    timestamp: Date.now(),
                    direction: getDirection(delta),
                  },
                  ...prev,
                ].slice(0, 60),
              );
            }
          }

          prevDeltaPriceRef.current = avg;
          deltaBufferRef.current = [];
        }
      };

      ws.onerror = () => {
        if (mountedRef.current) setStatus("error");
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        gsap.killTweensOf(animatedRef.current);
        setStatus("disconnected");
        // Авто-реконнект через 3 секунды
        reconnectTimerRef.current = setTimeout(() => {
          if (mountedRef.current && connectRef.current) {
            connectRef.current(sym);
          }
        }, 3000);
      };
    },
    [animateTo],
  );

  // Сохраняем актуальную ссылку на connect для авто-реконнекта
  connectRef.current = connect;

  // ── useEffect: запуск и очистка ───────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;
    connect(symbolInfo);

    const animatedNode = animatedRef.current;

    return () => {
      // Cleanup при unmount компонента или смене символа:
      mountedRef.current = false;

      // Убиваем GSAP — иначе onUpdate будет вызываться после unmount
      gsap.killTweensOf(animatedNode);

      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolInfo.symbol]); // Перезапускаем только при смене символа

  const reconnect = useCallback(
    () => connect(symbolInfo),
    [connect, symbolInfo],
  );

  return { points, smoothPrice, deltas, status, reconnect };
}

function getDirection(delta: number): PriceDelta["direction"] {
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "flat";
}
