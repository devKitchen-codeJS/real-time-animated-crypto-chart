"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SymbolSelector, TimeRangeSelector } from "@/components/Selectors";
import { ConnectionStatus } from "@/types";

interface NavProps {
  status: ConnectionStatus;
  onReconnect?: () => void;
  rightSlot?: React.ReactNode;
}

const STATUS_DOT: Record<ConnectionStatus, string> = {
  connecting: "bg-yellow-500",
  connected: "bg-green animate-pulse-dot",
  disconnected: "bg-muted",
  error: "bg-red",
};
const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connecting: "CONNECTING",
  connected: "LIVE",
  disconnected: "DISCONNECTED",
  error: "ERROR",
};
const STATUS_COLOR: Record<ConnectionStatus, string> = {
  connecting: "text-yellow-500",
  connected: "text-green",
  disconnected: "text-muted",
  error: "text-red",
};

export default function NavHeader({
  status,
  onReconnect,
  rightSlot,
}: NavProps) {
  const pathname = usePathname();

  return (
    <header className='flex-none px-4 py-2.5 border-b border-border flex items-center gap-3 min-w-0'>
      {/* Symbol dropdown */}
      <SymbolSelector />

      {/* Divider */}
      <div className='w-px h-5 bg-border flex-none' />

      {/* Time range dropdown */}
      <TimeRangeSelector />

      {/* Divider */}
      <div className='w-px h-5 bg-border flex-none' />

      {/* Chart type tabs */}
      <nav className='flex items-center gap-1 flex-none'>
        <Link
          href='/'
          className={`px-2.5 py-1 text-xs font-mono rounded-sm transition-all duration-150 ${
            pathname === "/"
              ? "bg-accent/10 text-accent border border-accent/30"
              : "text-muted hover:text-text border border-transparent"
          }`}>
          CANDLES
        </Link>
        {/* <Link
          href="/line"
          className={`px-2.5 py-1 text-xs font-mono rounded-sm transition-all duration-150 ${
            pathname === "/line"
              ? "bg-accent/10 text-accent border border-accent/30"
              : "text-muted hover:text-text border border-transparent"
          }`}
        >
          LINE
        </Link> */}
        <Link
          href='/liveline'
          className={`px-2.5 py-1 text-xs font-mono rounded-sm transition-all duration-150 ${
            pathname === "/liveline"
              ? "bg-accent/10 text-accent border border-accent/30"
              : "text-muted hover:text-text border border-transparent"
          }`}>
          LINE
        </Link>
      </nav>

      {/* Price display — fills remaining space */}
      <div className='flex-1 min-w-0 hidden sm:block ml-2'>{rightSlot}</div>

      {/* Status */}
      <div className='flex items-center gap-2 flex-none ml-auto'>
        <div className='hidden lg:flex items-center gap-2 text-[10px] font-mono text-muted/40'>
          <span>scroll: zoom</span>
          <span>·</span>
          <span>drag: pan</span>
        </div>
        <div className='w-px h-4 bg-border hidden lg:block' />
        <div className='flex items-center gap-1.5'>
          <div
            className={`w-1.5 h-1.5 rounded-full flex-none ${STATUS_DOT[status]}`}
          />
          <span className={`text-xs font-mono ${STATUS_COLOR[status]}`}>
            {STATUS_LABEL[status]}
          </span>
          {(status === "disconnected" || status === "error") && onReconnect && (
            <button
              onClick={onReconnect}
              className='text-xs font-mono text-muted hover:text-accent transition-colors'>
              [retry]
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
