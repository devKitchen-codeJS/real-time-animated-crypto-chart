"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const BTC_ICON = (
  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-accent" xmlns="http://www.w3.org/2000/svg">
    <path d="M23.638 14.904c-1.602 6.43-8.113 10.34-14.542 8.736C2.67 22.05-1.244 15.525.362 9.105 1.962 2.67 8.475-1.243 14.9.358c6.43 1.605 10.342 8.115 8.738 14.546z" />
    <path
      d="M17.38 10.258c.236-1.58-.966-2.43-2.61-2.997l.533-2.138-1.302-.325-.52 2.082c-.341-.085-.692-.165-1.04-.244l.522-2.094-1.301-.324-.533 2.138c-.283-.064-.56-.128-.83-.196l.001-.006-1.795-.449-.347 1.39s.965.221.945.235c.527.131.622.479.607.755l-.61 2.45c.036.009.083.022.135.043l-.137-.034-.856 3.43c-.065.16-.229.4-.6.31.013.02-.946-.236-.946-.236l-.645 1.493 1.693.422c.315.079.623.162.927.24l-.539 2.162 1.3.325.534-2.14c.354.096.698.184 1.034.268l-.532 2.13 1.301.325.539-2.157c2.222.42 3.892.251 4.594-1.76.567-1.618-.028-2.552-1.195-3.16.85-.196 1.49-.755 1.66-1.91zm-2.97 4.163c-.403 1.618-3.126.743-4.01.523l.715-2.868c.886.221 3.728.659 3.295 2.345zm.405-4.182c-.368 1.47-2.636.724-3.372.54l.649-2.601c.736.184 3.105.527 2.723 2.061z"
      fill="#060608"
    />
  </svg>
);

interface NavProps {
  status: "connecting" | "connected" | "disconnected" | "error";
  onReconnect?: () => void;
  rightSlot?: React.ReactNode;
}

export default function NavHeader({ status, onReconnect, rightSlot }: NavProps) {
  const pathname = usePathname();

  const statusDot: Record<string, string> = {
    connecting: "bg-yellow-500",
    connected: "bg-green animate-pulse-dot",
    disconnected: "bg-muted",
    error: "bg-red",
  };
  const statusLabel: Record<string, string> = {
    connecting: "CONNECTING",
    connected: "LIVE",
    disconnected: "DISCONNECTED",
    error: "ERROR",
  };

  return (
    <header className="flex-none px-5 py-3 border-b border-border flex items-center justify-between gap-4">
      {/* Left: logo + nav tabs */}
      <div className="flex items-center gap-5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-accent/10 border border-accent/30 flex items-center justify-center">
            {BTC_ICON}
          </div>
          <span className="text-sm font-mono font-bold text-text">BTC/USDT</span>
        </div>

        <nav className="flex items-center gap-1">
          <Link
            href="/"
            className={`px-3 py-1 text-xs font-mono rounded-sm transition-all duration-150 ${
              pathname === "/"
                ? "bg-accent/10 text-accent border border-accent/30"
                : "text-muted hover:text-text border border-transparent"
            }`}
          >
            CANDLES
          </Link>
          <Link
            href="/line"
            className={`px-3 py-1 text-xs font-mono rounded-sm transition-all duration-150 ${
              pathname === "/line"
                ? "bg-accent/10 text-accent border border-accent/30"
                : "text-muted hover:text-text border border-transparent"
            }`}
          >
            LINE
          </Link>
        </nav>
      </div>

      {/* Center: right slot (price display) */}
      <div className="flex-1 hidden sm:block">{rightSlot}</div>

      {/* Right: status */}
      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center gap-3 text-[10px] font-mono text-muted/40">
          <span>scroll: zoom</span>
          <span>drag: pan</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${statusDot[status]}`} />
          <span
            className={`text-xs font-mono ${
              status === "connected"
                ? "text-green"
                : status === "error"
                ? "text-red"
                : "text-muted"
            }`}
          >
            {statusLabel[status]}
          </span>
          {(status === "disconnected" || status === "error") && onReconnect && (
            <button
              onClick={onReconnect}
              className="text-xs font-mono text-muted hover:text-accent transition-colors"
            >
              [reconnect]
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
