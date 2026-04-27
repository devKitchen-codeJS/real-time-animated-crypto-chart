"use client";

import { ConnectionStatus } from "@/types";

interface StatusBarProps {
  status: ConnectionStatus;
  onReconnect: () => void;
}

const STATUS_CONFIG: Record<ConnectionStatus, { label: string; color: string; dot: string }> = {
  connecting: { label: "CONNECTING", color: "text-yellow-500", dot: "bg-yellow-500" },
  connected: { label: "LIVE", color: "text-green", dot: "bg-green animate-pulse-dot" },
  disconnected: { label: "DISCONNECTED", color: "text-muted", dot: "bg-muted" },
  error: { label: "ERROR", color: "text-red", dot: "bg-red" },
};

export default function StatusBar({ status, onReconnect }: StatusBarProps) {
  const cfg = STATUS_CONFIG[status];

  return (
    <div className="flex items-center gap-2">
      <div className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      <span className={`text-xs font-mono ${cfg.color}`}>{cfg.label}</span>
      {(status === "disconnected" || status === "error") && (
        <button
          onClick={onReconnect}
          className="text-xs font-mono text-muted hover:text-accent transition-colors ml-1"
        >
          [reconnect]
        </button>
      )}
    </div>
  );
}
