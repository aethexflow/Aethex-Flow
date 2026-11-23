import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Sparkles,
  ArrowRight,
  X,
  Zap,
  Image,
  FileText,
  Languages,
  Film,
  Bot,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Braces,
  Sun,
  GitBranch,
} from 'lucide-react';
import { parseNaturalIntent, ParsedIntent } from '../utils/intentParser';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenTool: (toolId: string) => void;
  onNavigateTab: (tab: any) => void;
  onToggleTheme: () => void;
  onOpenMasterVault: () => void;
  onLogActivity?: (action: string) => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  onOpenTool,
  onNavigateTab,
  onToggleTheme,
  onOpenMasterVault,
  onLogActivity,
}) => {
  const [query, setQuery] = useState<string>('');
  const [parsedIntent, setParsedIntent] = useState<ParsedIntent | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setParsedIntent(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (val.trim()) {
      setParsedIntent(parseNaturalIntent(val));
    } else {
      setParsedIntent(null);
    }
  };

  const executeIntent = (intent: ParsedIntent) => {
    onLogActivity?.(`Command Palette executed: ${intent.label}`);
    onClose();

    if (intent.type === 'LAUNCH_TOOL') {
      onOpenTool(intent.targetId);
    } else if (intent.type === 'NAVIGATE_TAB') {
      onNavigateTab(intent.targetId);
    } else if (intent.type === 'MASTER_VAULT') {
      onOpenMasterVault();
    } else if (intent.type === 'SYSTEM_ACTION') {
      if (intent.targetId === 'toggle_theme') {
        onToggleTheme();
      } else if (intent.targetId === 'ping_hub') {
        onNavigateTab('settings');
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (parsedIntent) {
        executeIntent(parsedIntent);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Quick Find Command Palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="w-full max-w-2xl rounded-2xl overflow-hidden border border-neutral-800 bg-[#10121a] text-white shadow-2xl shadow-red-950/40">
        {/* Search Input Bar */}
        <div className="p-4 border-b border-neutral-800 flex items-center gap-3 bg-[#131520]">
          <Search className="w-5 h-5 text-red-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            aria-label="Search commands or tools"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command, tool name, or describe what to do..."
            className="w-full bg-transparent text-sm text-white placeholder-neutral-500 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear query"
              onClick={() => handleQueryChange('')}
              className="p-1 text-neutral-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="px-2 py-0.5 rounded text-[10px] font-mono text-neutral-400 bg-neutral-800 border border-neutral-700">
            ESC
          </kbd>
        </div>

        {/* Dynamic Parsed Intent Banner */}
        {parsedIntent && query.trim() && (
          <button
            type="button"
            onClick={() => executeIntent(parsedIntent)}
            className="w-[calc(100%-2rem)] text-left p-3.5 mx-4 mt-3 rounded-xl border border-red-500/30 bg-red-950/20 hover:bg-red-900/30 transition-all cursor-pointer flex items-center justify-between group"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-red-600/20 text-red-400 flex items-center justify-center font-bold">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-white group-hover:text-red-400 transition-colors">
                    {parsedIntent.label}
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400 font-semibold px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/30">
                    {(parsedIntent.confidence * 100).toFixed(0)}% match
                  </span>
                </div>
                <p className="text-xs text-neutral-300">{parsedIntent.description}</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs font-semibold text-red-400">
              <span>Enter to Run</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
            </div>
          </button>
        )}

        {/* Suggested Quick Actions */}
        <div className="p-4 space-y-4 max-h-[380px] overflow-y-auto text-xs">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-400 block mb-2">
              Real Utilities & Crypto
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenTool('background-remover');
                }}
                className="p-2.5 rounded-xl border border-neutral-800 bg-neutral-900/40 hover:border-red-500/30 hover:bg-neutral-800 text-left flex items-center gap-2.5 transition-all"
              >
                <Image className="w-4 h-4 text-red-500 shrink-0" />
                <span className="font-semibold text-neutral-200">Background Remover</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenTool('pdf-compressor');
                }}
                className="p-2.5 rounded-xl border border-neutral-800 bg-neutral-900/40 hover:border-red-500/30 hover:bg-neutral-800 text-left flex items-center gap-2.5 transition-all"
              >
                <FileText className="w-4 h-4 text-red-500 shrink-0" />
                <span className="font-semibold text-neutral-200">PDF Compressor</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenTool('crypto-vault');
                }}
                className="p-2.5 rounded-xl border border-neutral-800 bg-neutral-900/40 hover:border-red-500/30 hover:bg-neutral-800 text-left flex items-center gap-2.5 transition-all"
              >
                <ShieldCheck className="w-4 h-4 text-red-500 shrink-0" />
                <span className="font-semibold text-neutral-200">AES-256 Crypto Vault</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenTool('data-formatter');
                }}
                className="p-2.5 rounded-xl border border-neutral-800 bg-neutral-900/40 hover:border-red-500/30 hover:bg-neutral-800 text-left flex items-center gap-2.5 transition-all"
              >
                <Braces className="w-4 h-4 text-red-500 shrink-0" />
                <span className="font-semibold text-neutral-200">JSON & CSV Transformer</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenTool('image-converter');
                }}
                className="p-2.5 rounded-xl border border-neutral-800 bg-neutral-900/40 hover:border-red-500/30 hover:bg-neutral-800 text-left flex items-center gap-2.5 transition-all"
              >
                <Zap className="w-4 h-4 text-red-500 shrink-0" />
                <span className="font-semibold text-neutral-200">Image Converter</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenTool('text-translator');
                }}
                className="p-2.5 rounded-xl border border-neutral-800 bg-neutral-900/40 hover:border-red-500/30 hover:bg-neutral-800 text-left flex items-center gap-2.5 transition-all"
              >
                <Languages className="w-4 h-4 text-red-500 shrink-0" />
                <span className="font-semibold text-neutral-200">Text Translator (Roman Urdu)</span>
              </button>
            </div>
          </div>

          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-400 block mb-2">
              Navigation & Studios
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigateTab('studio');
                }}
                className="p-2.5 rounded-xl border border-neutral-800 bg-neutral-900/40 hover:border-neutral-700 hover:bg-neutral-800 text-left flex items-center gap-2.5 transition-all"
              >
                <Film className="w-4 h-4 text-red-400 shrink-0" />
                <span className="text-neutral-200 font-semibold">Video & Photo Studio</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigateTab('workflows');
                }}
                className="p-2.5 rounded-xl border border-neutral-800 bg-neutral-900/40 hover:border-neutral-700 hover:bg-neutral-800 text-left flex items-center gap-2.5 transition-all"
              >
                <GitBranch className="w-4 h-4 text-red-400 shrink-0" />
                <span className="text-neutral-200 font-semibold">Workflow DAG Visualizer</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigateTab('bots');
                }}
                className="p-2.5 rounded-xl border border-neutral-800 bg-neutral-900/40 hover:border-neutral-700 hover:bg-neutral-800 text-left flex items-center gap-2.5 transition-all"
              >
                <Bot className="w-4 h-4 text-neutral-400 shrink-0" />
                <span className="text-neutral-300">Automation Bots Fleet</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigateTab('settings');
                }}
                className="p-2.5 rounded-xl border border-neutral-800 bg-neutral-900/40 hover:border-neutral-700 hover:bg-neutral-800 text-left flex items-center gap-2.5 transition-all"
              >
                <Settings className="w-4 h-4 text-neutral-400 shrink-0" />
                <span className="text-neutral-300">Settings & Security</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onToggleTheme();
                }}
                className="p-2.5 rounded-xl border border-neutral-800 bg-neutral-900/40 hover:bg-neutral-800 text-left flex items-center gap-2.5 transition-all"
              >
                <Sun className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-neutral-300">Toggle Theme Mode</span>
              </button>
            </div>
          </div>

          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-400 block mb-2">
              Administrative Diagnostics
            </span>
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenMasterVault();
                }}
                className="p-2.5 rounded-xl border border-red-500/30 bg-red-950/20 hover:bg-red-900/40 text-left flex items-center gap-2.5 transition-all"
              >
                <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                <div>
                  <span className="font-bold text-white block">Master Control Vault</span>
                  <span className="text-[10px] text-red-300">Unindexed root governance</span>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="px-4 py-2.5 border-t border-neutral-800 bg-[#0d0e14] flex items-center justify-between text-[11px] text-neutral-400">
          <span>Type natural queries like "open video studio", "encrypt text", "json to csv", or "shrink pdf"</span>
          <span>AethexFlow v4.2.0</span>
        </div>
      </div>
    </div>
  );
};
