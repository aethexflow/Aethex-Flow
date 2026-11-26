import React from 'react';
import { ShieldCheck, KeyRound, RefreshCw, X } from 'lucide-react';
import type { ZeroTrustStatus } from '../types/chat';

interface ZeroTrustPanelProps {
  theme: 'dark' | 'light';
  status: ZeroTrustStatus | null;
  isVerifying: boolean;
  onVerifyHandshake: () => void;
  onClose: () => void;
}

export const ZeroTrustPanel: React.FC<ZeroTrustPanelProps> = ({
  theme,
  status,
  isVerifying,
  onVerifyHandshake,
  onClose,
}) => {
  const isDark = theme === 'dark';

  return (
    <div
      className={`rounded-xl border p-4 text-xs space-y-3 ${
        isDark
          ? 'bg-[#11131c] border-neutral-800 text-neutral-200'
          : 'bg-white border-neutral-200 text-neutral-800'
      }`}
    >
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-neutral-800/40">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
          <span className="font-semibold truncate">Aethi Zero-Trust Device Framework</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Zero-Trust panel"
          className="p-1 rounded hover:bg-neutral-800/40 text-neutral-400 hover:text-white"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px] tabular-nums">
        <div>
          <div className="text-neutral-500">Bound Device</div>
          <div className="font-mono font-medium truncate">{status?.deviceId || 'dev-local-01'}</div>
        </div>
        <div>
          <div className="text-neutral-500">Attestation State</div>
          <div className="font-medium text-emerald-500">
            {status?.trusted ? 'Verified · HMAC-SHA256' : 'Pending Handshake'}
          </div>
        </div>
        <div>
          <div className="text-neutral-500">Replay Window / Fingerprint</div>
          <div className="font-mono truncate">
            {status?.replayWindowSec ?? 300}s · {status?.fingerprint || 'pending'}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <span className="text-[11px] text-neutral-500">
          Authorized Scopes: {(status?.scopes || ['chat_save', 'chat_get_thread', 'task']).join(', ')}
        </span>
        <button
          type="button"
          onClick={onVerifyHandshake}
          disabled={isVerifying}
          className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors disabled:opacity-50"
        >
          {isVerifying ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <KeyRound className="w-3.5 h-3.5" />
          )}
          <span>{isVerifying ? 'Attesting Device...' : 'Verify Zero-Trust Handshake'}</span>
        </button>
      </div>
    </div>
  );
};
