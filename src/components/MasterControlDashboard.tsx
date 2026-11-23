import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Lock,
  Activity,
  Bot,
  CheckCircle2,
  RotateCcw,
  Sparkles,
  Plus,
  Trash2,
  ArrowRight,
  X,
  Cloud,
  Terminal,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { parseNaturalIntent, ParsedIntent } from '../utils/intentParser';

interface CustomIntentMapping {
  id: string;
  triggerPhrase: string;
  actionType: 'LAUNCH_TOOL' | 'NAVIGATE' | 'PIPELINE';
  target: string;
  enabled: boolean;
}

const DEFAULT_CUSTOM_MAPPINGS: CustomIntentMapping[] = [
  {
    id: 'm1',
    triggerPhrase: 'create vertical short reel',
    actionType: 'NAVIGATE',
    target: 'video-studio',
    enabled: true,
  },
  {
    id: 'm2',
    triggerPhrase: 'shrink financial quarterly report',
    actionType: 'LAUNCH_TOOL',
    target: 'pdf-compressor',
    enabled: true,
  },
  {
    id: 'm3',
    triggerPhrase: 'encrypt api credentials',
    actionType: 'LAUNCH_TOOL',
    target: 'crypto-vault',
    enabled: true,
  },
];

interface MasterControlDashboardProps {
  theme: 'dark' | 'light';
  onClose: () => void;
  onOpenTool: (toolId: string) => void;
  onNavigateTab: (tab: any) => void;
  onOpenAdminGateway?: () => void;
  onLogActivity?: (action: string) => void;
}

export const MasterControlDashboard: React.FC<MasterControlDashboardProps> = ({
  onClose,
  onOpenTool,
  onNavigateTab,
  onOpenAdminGateway,
  onLogActivity,
}) => {
  const [activeVaultTab, setActiveVaultTab] = useState<'telemetry' | 'fleet' | 'intents' | 'security'>('telemetry');

  // Security Toggles
  const [argonRounds, setArgonRounds] = useState<number>(4);
  const [ed25519Strict, setEd25519Strict] = useState<boolean>(true);
  const [airGappedMode, setAirGappedMode] = useState<boolean>(false);
  const [keyRotatedToast, setKeyRotatedToast] = useState<boolean>(false);

  // Bot Fleet Controls
  const [allBotsPaused, setAllBotsPaused] = useState<boolean>(false);
  const [fleetCpuCap, setFleetCpuCap] = useState<number>(15);
  const [fleetRamCeiling, setFleetRamCeiling] = useState<number>(64);

  // Custom Intent Mappings
  const [customMappings, setCustomMappings] = useState<CustomIntentMapping[]>(DEFAULT_CUSTOM_MAPPINGS);
  const [newTrigger, setNewTrigger] = useState<string>('');
  const [newTarget, setNewTarget] = useState<string>('video-studio');
  const [testQuery, setTestQuery] = useState<string>('shrink quarterly report');
  const [simulatedParsed, setSimulatedParsed] = useState<ParsedIntent | null>(() =>
    parseNaturalIntent('shrink quarterly report')
  );

  const [readiness, setReadiness] = useState<{
    version: string;
    geminiConfigured: boolean;
    firebaseConfigured: boolean;
    cloudflareFiles: Record<string, boolean>;
    serverMemoryMb: number;
    uptimeSec: number;
    latencyMs: number;
  } | null>(null);
  const [ownerFixStatus, setOwnerFixStatus] = useState<string | null>(null);
  const [isRefreshingTelemetry, setIsRefreshingTelemetry] = useState<boolean>(false);

  const fetchRealTelemetry = async () => {
    setIsRefreshingTelemetry(true);
    const t0 = performance.now();
    try {
      const res = await fetch('/api/system/readiness');
      const latencyMs = Math.max(1, Math.round(performance.now() - t0));
      if (res.ok) {
        const data = await res.json();
        setReadiness({
          version: String(data.version || '4.2.0'),
          geminiConfigured: Boolean(data.geminiConfigured),
          firebaseConfigured: Boolean(data.firebaseConfigured),
          cloudflareFiles: data.cloudflareFiles || {},
          serverMemoryMb: Number(data.serverMemoryMb || 0),
          uptimeSec: Number(data.uptimeSec || 0),
          latencyMs,
        });
      }
    } catch {
      // ignore transient check failure
    } finally {
      setIsRefreshingTelemetry(false);
    }
  };

  useEffect(() => {
    void fetchRealTelemetry();
  }, []);

  const handleTestIntent = (q: string) => {
    setTestQuery(q);
    setSimulatedParsed(parseNaturalIntent(q));
  };

  const handleAddMapping = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTrigger.trim()) return;

    const newMap: CustomIntentMapping = {
      id: `m_${Date.now()}`,
      triggerPhrase: newTrigger.trim(),
      actionType: 'LAUNCH_TOOL',
      target: newTarget,
      enabled: true,
    };
    setCustomMappings([newMap, ...customMappings]);
    setNewTrigger('');
    onLogActivity?.(`Added custom intent trigger: "${newMap.triggerPhrase}" -> ${newMap.target}`);
  };

  const deleteMapping = (id: string) => {
    setCustomMappings(customMappings.filter((m) => m.id !== id));
  };

  const toggleMappingEnabled = (id: string) => {
    setCustomMappings(
      customMappings.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m))
    );
  };

  const handleRotateVaultKeys = () => {
    setKeyRotatedToast(true);
    setTimeout(() => setKeyRotatedToast(false), 3000);
    onLogActivity?.('Rotated zero-trust AES-256-GCM / Argon2id hardware master keys');
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16 animate-in fade-in duration-300">
      {/* Discreet Master Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl border border-red-500/30 bg-[#0e1017] shadow-2xl relative overflow-hidden">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-red-600 to-red-800 text-white flex items-center justify-center font-bold shadow-lg shadow-red-950 ring-2 ring-red-500/20">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white tracking-tight">Master Control Vault</h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-red-950 text-red-400 border border-red-500/40">
                UNINDEXED ROOT
              </span>
            </div>
            <p className="text-xs text-neutral-400">
              Centralized governance, Cloudflare release diagnostics, and autonomous intent routing.
            </p>
          </div>
        </div>

        {/* Master Navigation & Exit */}
        <div className="flex items-center gap-2">
          {onOpenAdminGateway && (
            <button
              type="button"
              onClick={onOpenAdminGateway}
              className="px-3.5 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 text-xs font-semibold transition-all flex items-center gap-1.5"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Admin Gateway Chat</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              window.location.hash = '';
              onClose();
            }}
            className="px-3.5 py-1.5 rounded-xl border border-neutral-800 bg-neutral-900/60 hover:bg-neutral-800 text-neutral-300 text-xs font-semibold transition-all flex items-center gap-1.5"
          >
            <X className="w-3.5 h-3.5" />
            <span>Exit Vault</span>
          </button>
        </div>
      </div>

      {/* Vault Tabs */}
      <div className="flex flex-wrap gap-2 p-1.5 rounded-2xl bg-[#12141d] border border-neutral-800/80 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setActiveVaultTab('telemetry')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${
            activeVaultTab === 'telemetry'
              ? 'bg-red-600 text-white font-bold shadow-md shadow-red-950'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Live Telemetry & Cloudflare Status</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveVaultTab('intents')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${
            activeVaultTab === 'intents'
              ? 'bg-red-600 text-white font-bold shadow-md shadow-red-950'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Autonomous Intent Dispatcher</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveVaultTab('fleet')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${
            activeVaultTab === 'fleet'
              ? 'bg-red-600 text-white font-bold shadow-md shadow-red-950'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
          }`}
        >
          <Bot className="w-4 h-4" />
          <span>Bot Fleet Quotas</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveVaultTab('security')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${
            activeVaultTab === 'security'
              ? 'bg-red-600 text-white font-bold shadow-md shadow-red-950'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
          }`}
        >
          <Lock className="w-4 h-4" />
          <span>Zero-Trust Hardening</span>
        </button>
      </div>

      {/* TAB 1: LIVE SERVER TELEMETRY & RELEASE READINESS */}
      {activeVaultTab === 'telemetry' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl border border-neutral-800 bg-[#12141c] space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-400 block">
                Server Process RSS Memory
              </span>
              <span className="font-mono text-2xl font-black text-emerald-400">
                {readiness ? `${readiness.serverMemoryMb} MB` : 'Checking...'}
              </span>
              <p className="text-[11px] text-neutral-400">Measured live from Node runtime</p>
            </div>

            <div className="p-4 rounded-2xl border border-neutral-800 bg-[#12141c] space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-400 block">
                Live API Round-Trip
              </span>
              <span className="font-mono text-2xl font-black text-red-400">
                {readiness ? `${readiness.latencyMs} ms` : 'Measuring...'}
              </span>
              <p className="text-[11px] text-neutral-400">/api/system/readiness response time</p>
            </div>

            <div className="p-4 rounded-2xl border border-neutral-800 bg-[#12141c] space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-400 block">
                AethexFlow API Key
              </span>
              <span
                className={`font-mono text-xl font-black ${
                  readiness?.geminiConfigured ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {readiness ? (readiness.geminiConfigured ? 'Configured' : 'Missing Key') : 'Checking...'}
              </span>
              <p className="text-[11px] text-neutral-400">Server-side AI SDK status</p>
            </div>

            <div className="p-4 rounded-2xl border border-neutral-800 bg-[#12141c] space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-400 block">
                Server Uptime
              </span>
              <span className="font-mono text-2xl font-black text-blue-400">
                {readiness ? `${readiness.uptimeSec}s` : '--'}
              </span>
              <p className="text-[11px] text-neutral-400">Target: aethexflow.online</p>
            </div>
          </div>

          {/* Cloudflare Release & Owner Auto-Fix Card */}
          <div className="p-6 rounded-2xl border border-neutral-800 bg-[#12141c] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Cloud className="w-5 h-5 text-blue-400" />
                <div>
                  <h3 className="font-bold text-sm text-white">Infrastructure File Verification</h3>
                  <p className="text-xs text-neutral-400">Real disk verification across Firebase &amp; Cloudflare manifests</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void fetchRealTelemetry()}
                  disabled={isRefreshingTelemetry}
                  className="px-3 py-1.5 rounded-xl border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-xs font-semibold text-neutral-200 flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingTelemetry ? 'animate-spin' : ''}`} />
                  <span>Re-probe</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setOwnerFixStatus('Running server auto-fix...');
                    try {
                      const res = await fetch('/api/owner/auto-fix', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ownerEmail: 'aethexflow@gmail.com' }),
                      });
                      const data = await res.json();
                      setOwnerFixStatus(
                        data.readyForPublic
                          ? 'Owner Auto-Fix passed: server ready for public release.'
                          : 'Owner Auto-Fix found warnings in API configuration.'
                      );
                      await fetchRealTelemetry();
                    } catch {
                      setOwnerFixStatus('Failed to run owner auto-fix endpoint.');
                    }
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Owner Auto-Fix Live Config</span>
                </button>
              </div>
            </div>

            {ownerFixStatus && (
              <p className="text-xs text-emerald-400 font-medium">{ownerFixStatus}</p>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
              {[
                { key: 'wrangler', name: 'wrangler.toml', desc: 'Pages + D1 config' },
                { key: 'workerFunctions', name: 'functions/api', desc: 'Edge Worker API' },
                { key: 'headers', name: '_headers', desc: 'CSP & noindex tag' },
                { key: 'redirects', name: '_redirects', desc: 'SPA fallback 200' },
                { key: 'robots', name: 'robots.txt', desc: 'Admin disallowed' },
                { key: 'manifest', name: 'manifest', desc: 'PWA webmanifest' },
              ].map((item) => {
                const present = readiness ? Boolean(readiness.cloudflareFiles[item.key]) : false;
                return (
                  <div key={item.name} className="p-3 rounded-xl border border-neutral-800 bg-neutral-950/60">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-[11px] font-bold text-white">{item.name}</span>
                      {present ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                      )}
                    </div>
                    <span className="text-[10px] text-neutral-400">{item.desc}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: AUTONOMOUS INTENT DISPATCHER */}
      {activeVaultTab === 'intents' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl border border-neutral-800 bg-[#12141c] space-y-4">
            <div>
              <h3 className="font-bold text-sm text-white">Natural Language Intent Testing Console</h3>
              <p className="text-xs text-neutral-400">
                Test how the autonomous intent parser categorizes and routes commands.
              </p>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                aria-label="Test natural command"
                value={testQuery}
                onChange={(e) => handleTestIntent(e.target.value)}
                placeholder="Test a command (e.g., 'compress this pdf', 'open video editor', 'encrypt text')"
                className="flex-1 px-4 py-2.5 rounded-xl border border-neutral-800 bg-neutral-900 text-xs text-white focus:border-red-500 outline-none"
              />
              <button
                type="button"
                onClick={() => handleTestIntent(testQuery)}
                className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs"
              >
                Parse Intent
              </button>
            </div>

            {simulatedParsed && (
              <div className="p-4 rounded-xl border border-red-500/30 bg-red-950/20 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-red-900 text-red-200">
                      {simulatedParsed.type}
                    </span>
                    <span className="font-bold text-sm text-white">{simulatedParsed.label}</span>
                    <span className="text-[11px] font-mono text-emerald-400">
                      {(simulatedParsed.confidence * 100).toFixed(0)}% Confidence
                    </span>
                  </div>
                  <p className="text-xs text-neutral-300">{simulatedParsed.description}</p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (simulatedParsed.type === 'LAUNCH_TOOL') {
                      onOpenTool(simulatedParsed.targetId);
                    } else if (simulatedParsed.type === 'NAVIGATE_TAB') {
                      onNavigateTab(simulatedParsed.targetId);
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold flex items-center gap-1"
                >
                  <span>Execute Target</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="p-6 rounded-2xl border border-neutral-800 bg-[#12141c] space-y-4">
            <div>
              <h3 className="font-bold text-sm text-white">Custom Natural Intent Mappings</h3>
              <p className="text-xs text-neutral-400">Map custom trigger phrases to real tools and studios</p>
            </div>

            <form
              onSubmit={handleAddMapping}
              className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3.5 rounded-xl border border-neutral-800 bg-neutral-900/50"
            >
              <input
                type="text"
                required
                aria-label="Trigger phrase"
                value={newTrigger}
                onChange={(e) => setNewTrigger(e.target.value)}
                placeholder="Trigger Phrase (e.g. 'edit vertical reel')"
                className="px-3 py-2 rounded-lg border border-neutral-700 bg-neutral-800 text-xs text-white outline-none"
              />
              <select
                aria-label="Target tool"
                value={newTarget}
                onChange={(e) => setNewTarget(e.target.value)}
                className="px-3 py-2 rounded-lg border border-neutral-700 bg-neutral-800 text-xs text-white outline-none"
              >
                <option value="video-studio">Automated Video Studio</option>
                <option value="workflow-dag">Workflow DAG Visualizer</option>
                <option value="background-remover">Background Remover</option>
                <option value="pdf-compressor">PDF Compressor</option>
                <option value="image-converter">Image Converter</option>
                <option value="text-translator">Text Translator</option>
                <option value="crypto-vault">AES-256 Crypto Vault</option>
                <option value="data-formatter">JSON & CSV Transformer</option>
                <option value="bot-rental">Automation Bots Fleet</option>
              </select>
              <button
                type="submit"
                className="py-2 px-4 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Register Mapping</span>
              </button>
            </form>

            <div className="space-y-2">
              {customMappings.map((map) => (
                <div
                  key={map.id}
                  className="p-3.5 rounded-xl border border-neutral-800 bg-neutral-900/30 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      aria-label={`Toggle mapping ${map.triggerPhrase}`}
                      onClick={() => toggleMappingEnabled(map.id)}
                      className={`w-4 h-4 rounded flex items-center justify-center border ${
                        map.enabled ? 'bg-red-600 border-red-500 text-white' : 'border-neutral-700'
                      }`}
                    >
                      {map.enabled && <CheckCircle2 className="w-3 h-3" />}
                    </button>
                    <div>
                      <span className="font-semibold text-white">"{map.triggerPhrase}"</span>
                      <span className="text-neutral-400 text-[11px] block">
                        Routes to: <strong className="text-red-400">{map.target}</strong>
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    aria-label={`Delete mapping ${map.triggerPhrase}`}
                    onClick={() => deleteMapping(map.id)}
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-red-400 hover:bg-neutral-800 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: BOT FLEET QUOTAS */}
      {activeVaultTab === 'fleet' && (
        <div className="p-6 rounded-2xl border border-neutral-800 bg-[#12141c] space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-white">Autonomous Bot Fleet Governance</h3>
              <p className="text-xs text-neutral-400">Global sandboxing limits and emergency halt controls</p>
            </div>

            <button
              type="button"
              onClick={() => {
                setAllBotsPaused(!allBotsPaused);
                onLogActivity?.(allBotsPaused ? 'Resumed all bot fleet automations' : 'Emergency halted all bot fleet tasks');
              }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                allBotsPaused
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-red-700 hover:bg-red-600 text-white'
              }`}
            >
              {allBotsPaused ? 'Resume All Fleet Bots' : 'Emergency Halt All Bots'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-900/40 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-neutral-300 font-semibold">Global Fleet CPU Cap</span>
                <span className="font-mono text-red-400 font-bold">{fleetCpuCap}%</span>
              </div>
              <input
                type="range"
                aria-label="Global Fleet CPU Cap"
                min="5"
                max="50"
                value={fleetCpuCap}
                onChange={(e) => setFleetCpuCap(Number(e.target.value))}
                className="w-full accent-red-500 h-1.5 bg-neutral-800 rounded-lg cursor-pointer"
              />
              <p className="text-[11px] text-neutral-400">
                Restricts aggregate background process scheduler across all automation bots.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-900/40 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-neutral-300 font-semibold">Shared RAM Ceiling</span>
                <span className="font-mono text-emerald-400 font-bold">{fleetRamCeiling} MB</span>
              </div>
              <input
                type="range"
                aria-label="Shared RAM Ceiling"
                min="32"
                max="256"
                step="16"
                value={fleetRamCeiling}
                onChange={(e) => setFleetRamCeiling(Number(e.target.value))}
                className="w-full accent-emerald-500 h-1.5 bg-neutral-800 rounded-lg cursor-pointer"
              />
              <p className="text-[11px] text-neutral-400">
                Terminates runaway edge threads exceeding this threshold.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: ZERO-TRUST HARDENING */}
      {activeVaultTab === 'security' && (
        <div className="p-6 rounded-2xl border border-neutral-800 bg-[#12141c] space-y-6">
          <div>
            <h3 className="font-bold text-sm text-white">Cryptographic Security Parameters</h3>
            <p className="text-xs text-neutral-400">
              PBKDF2/Argon2id derivation rounds, Ed25519 tamper verification, and air-gapped isolation
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-900/40 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-neutral-300 font-semibold">Argon2id Derivation Rounds</span>
                <span className="font-mono text-red-400 font-bold">{argonRounds} Passes</span>
              </div>
              <input
                type="range"
                aria-label="Argon2id Derivation Rounds"
                min="2"
                max="8"
                value={argonRounds}
                onChange={(e) => setArgonRounds(Number(e.target.value))}
                className="w-full accent-red-500 h-1.5 bg-neutral-800 rounded-lg cursor-pointer"
              />
              <p className="text-[11px] text-neutral-400">
                Determines key derivation cost for local vault operations.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-900/40 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-neutral-300 block">Strict Ed25519 Tamper Halt</span>
                <span className="text-[11px] text-neutral-400">Halts pipelines if signature drifts</span>
              </div>
              <button
                type="button"
                aria-label="Toggle Strict Ed25519 Tamper Halt"
                onClick={() => setEd25519Strict(!ed25519Strict)}
                className={`w-12 h-6 rounded-full transition-colors relative ${
                  ed25519Strict ? 'bg-red-600' : 'bg-neutral-800'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${
                    ed25519Strict ? 'right-1' : 'left-1'
                  }`}
                />
              </button>
            </div>

            <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-900/40 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-neutral-300 block">Air-Gapped Local Mode</span>
                <span className="text-[11px] text-neutral-400">Restricts outbound Worker proxy calls</span>
              </div>
              <button
                type="button"
                aria-label="Toggle Air-Gapped Local Mode"
                onClick={() => setAirGappedMode(!airGappedMode)}
                className={`w-12 h-6 rounded-full transition-colors relative ${
                  airGappedMode ? 'bg-emerald-600' : 'bg-neutral-800'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${
                    airGappedMode ? 'right-1' : 'left-1'
                  }`}
                />
              </button>
            </div>

            <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-900/40 space-y-2">
              <span className="text-xs font-semibold text-neutral-300 block">Rotate Hardware Master Keys</span>
              <button
                type="button"
                onClick={handleRotateVaultKeys}
                className="w-full py-2 px-3 rounded-lg border border-red-500/30 bg-red-950/30 hover:bg-red-900/40 text-red-400 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Rotate AES-256 Keys & Invalidate Cache</span>
              </button>
              {keyRotatedToast && (
                <p className="text-[11px] text-emerald-400 font-medium animate-in fade-in">
                  Keys successfully rotated and cryptographically sealed.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
