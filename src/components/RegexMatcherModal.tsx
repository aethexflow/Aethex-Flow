import React, { useState } from 'react';
import { X, Search, Check, Copy, Sparkles, Code2 } from 'lucide-react';

interface RegexMatcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: 'dark' | 'light';
  onLogActivity?: (action: string) => void;
}

export const RegexMatcherModal: React.FC<RegexMatcherModalProps> = ({
  isOpen,
  onClose,
  theme,
  onLogActivity,
}) => {
  const isDark = theme === 'dark';
  const [pattern, setPattern] = useState<string>('[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}');
  const [flags, setFlags] = useState<string>('g');
  const [testText, setTestText] = useState<string>(
    'Contact our team at support@aethexflow.ai or admin@aethex.io for developer integrations.'
  );
  const [copied, setCopied] = useState<boolean>(false);

  if (!isOpen) return null;

  let matches: Array<{ match: string; index: number }> = [];
  let regexError: string | null = null;

  try {
    const rx = new RegExp(pattern, flags);
    let m: RegExpExecArray | null;
    if (flags.includes('g')) {
      while ((m = rx.exec(testText)) !== null) {
        matches.push({ match: m[0], index: m.index });
        if (m[0].length === 0) rx.lastIndex++;
      }
    } else {
      m = rx.exec(testText);
      if (m) {
        matches.push({ match: m[0], index: m.index });
      }
    }
  } catch (err: unknown) {
    regexError = err instanceof Error ? err.message : 'Invalid regular expression';
  }

  const handleCopyMatches = () => {
    const resultJson = JSON.stringify(matches.map((m) => m.match), null, 2);
    void navigator.clipboard.writeText(resultJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    onLogActivity?.('Copied regex matched list to clipboard');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className={`w-full max-w-3xl rounded-2xl overflow-hidden border shadow-2xl transition-all ${
          isDark ? 'bg-[#12141c] border-neutral-800 text-white' : 'bg-white border-neutral-200 text-neutral-900'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b ${
            isDark ? 'border-neutral-800/80 bg-neutral-900/50' : 'border-neutral-100 bg-neutral-50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-600/20 text-red-500 flex items-center justify-center border border-red-500/30">
              <Code2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">Regex Pattern &amp; Matcher</h3>
              <p className="text-xs text-neutral-400">Lightweight client-side regular expression tester &amp; highlighter</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Regex Matcher"
            className="p-2 rounded-lg hover:bg-neutral-800/50 text-neutral-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-3 space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Regex Pattern</label>
              <div className="relative flex items-center">
                <span className="absolute left-3 text-red-500 font-mono">/</span>
                <input
                  type="text"
                  value={pattern}
                  onChange={(e) => setPattern(e.target.value)}
                  placeholder="Enter regex pattern..."
                  className={`w-full pl-7 pr-4 py-2.5 rounded-xl border text-xs font-mono focus:outline-none focus:border-red-500 ${
                    isDark ? 'bg-neutral-900 border-neutral-800 text-white' : 'bg-neutral-50 border-neutral-300 text-neutral-900'
                  }`}
                />
                <span className="absolute right-3 text-red-500 font-mono">/</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Flags</label>
              <input
                type="text"
                value={flags}
                onChange={(e) => setFlags(e.target.value)}
                placeholder="g, i, m..."
                className={`w-full px-3 py-2.5 rounded-xl border text-xs font-mono focus:outline-none focus:border-red-500 ${
                  isDark ? 'bg-neutral-900 border-neutral-800 text-white' : 'bg-neutral-50 border-neutral-300 text-neutral-900'
                }`}
              />
            </div>
          </div>

          {regexError && (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/40 text-red-300 text-xs font-mono">
              Syntax Error: {regexError}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Test Sample String</label>
            <textarea
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              rows={4}
              placeholder="Enter text to test matches against..."
              className={`w-full p-3 rounded-xl border text-xs font-mono focus:outline-none focus:border-red-500 resize-none ${
                isDark ? 'bg-neutral-900 border-neutral-800 text-white' : 'bg-neutral-50 border-neutral-300 text-neutral-900'
              }`}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Match Results ({matches.length} found)
              </span>
              <button
                type="button"
                onClick={handleCopyMatches}
                disabled={matches.length === 0}
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-40"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy Matches JSON'}</span>
              </button>
            </div>

            <div
              className={`p-3.5 rounded-xl border min-h-[100px] max-h-48 overflow-y-auto text-xs font-mono space-y-1 ${
                isDark ? 'bg-neutral-900/80 border-neutral-800 text-emerald-400' : 'bg-neutral-100 border-neutral-200 text-emerald-700'
              }`}
            >
              {matches.length === 0 ? (
                <span className="text-neutral-500">No matches found for current pattern.</span>
              ) : (
                matches.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <span className="text-neutral-500">#{idx + 1}</span>
                    <span className="bg-emerald-500/15 px-1.5 py-0.5 rounded text-emerald-400 font-bold">
                      {item.match}
                    </span>
                    <span className="text-neutral-400 text-[10px]">at index {item.index}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
