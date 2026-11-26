import React from 'react';
import { Terminal, X } from 'lucide-react';
import type { ConsoleLogItem } from '../types/chat';

interface ChatConsoleDrawerProps {
  logs: ConsoleLogItem[];
  onClear: () => void;
  onClose: () => void;
}

export const ChatConsoleDrawer: React.FC<ChatConsoleDrawerProps> = ({
  logs,
  onClear,
  onClose,
}) => {
  return (
    <div className="rounded-xl border border-neutral-800 bg-[#0d0f17] text-neutral-300 p-4 text-xs font-mono space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-red-500" />
          <span className="font-semibold text-[11px] text-white">
            AethexFlow Runtime &amp; Aethi Bridge Console
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClear}
            className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-[10px]"
          >
            Clear Logs
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close console"
            className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 text-[11px] tabular-nums">
        {logs.map((log) => (
          <div key={log.id} className="flex items-start gap-2 leading-relaxed">
            <span className="text-neutral-500 shrink-0">{log.timestamp}</span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${
                log.level === 'success'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : log.level === 'api'
                  ? 'bg-blue-500/20 text-blue-400'
                  : log.level === 'warn'
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-neutral-800 text-neutral-300'
              }`}
            >
              {log.level}
            </span>
            <span className="break-all">{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
