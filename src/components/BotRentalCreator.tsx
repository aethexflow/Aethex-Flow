import React, { useState, useEffect } from 'react';
import {
  Bot,
  Play,
  Pause,
  Plus,
  X,
  RefreshCw,
  Globe,
  Sparkles,
  Send,
  Database,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { executeAutomatedPipeline } from '../utils/dagEngine';

type RealBotType = 'web-monitor' | 'ai-digest' | 'webhook-relay' | 'data-normalizer';

interface BotItem {
  id: string;
  name: string;
  botType: RealBotType;
  category: string;
  description: string;
  status: 'Active' | 'Paused';
  target: string;
  payload: string;
  lastRunAt?: string;
  lastLatencyMs?: number;
  lastSummary?: string;
  lastOk?: boolean;
  lastData?: unknown;
  runsCount: number;
}

const INITIAL_BOTS: BotItem[] = [
  {
    id: 'bot_web_monitor',
    name: 'Live HTTP Web Monitor',
    botType: 'web-monitor',
    category: 'Edge Diagnostics',
    description: 'Fetches real HTTP status codes, response latency, server headers, and page <title>.',
    status: 'Active',
    target: '/api/health',
    payload: '',
    runsCount: 0,
  },
  {
    id: 'bot_ai_digest',
    name: 'AI Content Digest Bot',
    botType: 'ai-digest',
    category: 'Intelligence',
    description: 'Extracts headlines, key points, and concrete action items via Aethi Intelligence engine.',
    status: 'Active',
    target: 'Executive Summary',
    payload:
      'AethexFlow v4.2 Cloudflare release removes manual toolchain locking, adds automated video editing, and activates real AES-256 and PDF utilities. Verify all tests and deploy to Cloudflare Pages.',
    runsCount: 0,
  },
  {
    id: 'bot_webhook_relay',
    name: 'Webhook Payload Relay',
    botType: 'webhook-relay',
    category: 'Integration',
    description: 'Validates and dispatches signed JSON payloads to external endpoints (dry-run or live POST).',
    status: 'Active',
    target: '',
    payload: '{"event":"aethexflow.release","version":"4.2.0","status":"verified"}',
    runsCount: 0,
  },
  {
    id: 'bot_data_normalizer',
    name: 'Batch Data Normalizer',
    botType: 'data-normalizer',
    category: 'Data Pipeline',
    description: 'Parses messy CSV/TSV or JSON rows, normalizes keys, and deduplicates records.',
    status: 'Active',
    target: 'Dataset Cleanse',
    payload:
      'Full Name, Region, Role\nAlex Rivera, US-East, Operator\nAlex Rivera, US-East, Operator\nAyesha Khan, EU-West, Reviewer',
    runsCount: 0,
  },
];

interface BotRentalCreatorProps {
  theme: 'dark' | 'light';
  onLogActivity?: (action: string) => void;
}

export const BotRentalCreator: React.FC<BotRentalCreatorProps> = ({
  theme,
  onLogActivity,
}) => {
  const isDark = theme === 'dark';

  const [bots, setBots] = useState<BotItem[]>(() => {
    const saved = localStorage.getItem('aethexflow_real_bots_v42');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as BotItem[];
        return parsed.map((b) =>
          b.id === 'bot_web_monitor' && b.target === 'http://localhost:3000/api/health'
            ? { ...b, target: '/api/health' }
            : b
        );
      } catch {
        return INITIAL_BOTS;
      }
    }
    return INITIAL_BOTS;
  });

  const [runningBotId, setRunningBotId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [newBotName, setNewBotName] = useState<string>('');
  const [newBotType, setNewBotType] = useState<RealBotType>('web-monitor');
  const [newBotTarget, setNewBotTarget] = useState<string>('https://example.com');
  const [newBotPayload, setNewBotPayload] = useState<string>('');

  useEffect(() => {
    localStorage.setItem('aethexflow_real_bots_v42', JSON.stringify(bots));
  }, [bots]);

  const handleFieldChange = (id: string, field: 'target' | 'payload', value: string) => {
    setBots((prev) => prev.map((b) => (b.id === id ? { ...b, [field]: value } : b)));
  };

  const toggleBotStatus = (id: string) => {
    setBots((prev) =>
      prev.map((b) => {
        if (b.id !== id) return b;
        const nextStatus = b.status === 'Active' ? 'Paused' : 'Active';
        onLogActivity?.(`Set bot "${b.name}" to ${nextStatus}`);
        return { ...b, status: nextStatus };
      })
    );
  };

  const runBotNow = async (bot: BotItem) => {
    if (bot.status === 'Paused' || runningBotId) return;
    setRunningBotId(bot.id);
    executeAutomatedPipeline(`Bot Runner: ${bot.name}`);

    try {
      const res = await fetch('/api/bots/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botType: bot.botType,
          target: bot.target,
          payload: bot.payload,
          dryRun: bot.botType === 'webhook-relay' && !bot.target.trim(),
        }),
      });
      const result = await res.json();
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      setBots((prev) =>
        prev.map((b) =>
          b.id === bot.id
            ? {
                ...b,
                lastRunAt: timeStr,
                lastLatencyMs: result.latencyMs,
                lastSummary: result.summary || result.error || 'Completed',
                lastOk: Boolean(result.ok),
                lastData: result.data,
                runsCount: b.runsCount + 1,
              }
            : b
        )
      );
      onLogActivity?.(`Executed bot "${bot.name}": ${result.summary || 'Completed'}`);
    } catch (err: any) {
      setBots((prev) =>
        prev.map((b) =>
          b.id === bot.id
            ? {
                ...b,
                lastRunAt: new Date().toLocaleTimeString(),
                lastSummary: err?.message || 'Network request failed',
                lastOk: false,
              }
            : b
        )
      );
    } finally {
      setRunningBotId(null);
    }
  };

  const handleCreateBot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBotName.trim()) return;

    const categoryMap: Record<RealBotType, string> = {
      'web-monitor': 'Edge Diagnostics',
      'ai-digest': 'Intelligence',
      'webhook-relay': 'Integration',
      'data-normalizer': 'Data Pipeline',
    };

    const created: BotItem = {
      id: `bot_${Date.now()}`,
      name: newBotName.trim(),
      botType: newBotType,
      category: categoryMap[newBotType],
      description: `Custom ${newBotType} worker ready for live server-side execution.`,
      status: 'Active',
      target: newBotTarget,
      payload: newBotPayload,
      runsCount: 0,
    };

    setBots([created, ...bots]);
    setNewBotName('');
    setNewBotPayload('');
    setIsCreateModalOpen(false);
    onLogActivity?.(`Created real automation bot "${created.name}" (${created.botType})`);
  };

  const getBotIcon = (botType: RealBotType) => {
    switch (botType) {
      case 'web-monitor':
        return <Globe className="w-5 h-5 text-red-500" />;
      case 'ai-digest':
        return <Sparkles className="w-5 h-5 text-red-500" />;
      case 'webhook-relay':
        return <Send className="w-5 h-5 text-red-500" />;
      case 'data-normalizer':
      default:
        return <Database className="w-5 h-5 text-red-500" />;
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className={`text-2xl font-black tracking-tight ${isDark ? 'text-white' : 'text-neutral-900'}`}>
            Live Automation Bots
          </h1>
          <p className="text-xs text-neutral-400">
            Configure real targets and execute server-backed Web Monitors, AI Digests, Webhooks, and Data Normalizers.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsCreateModalOpen(true)}
          className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-sm transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Automation Bot</span>
        </button>
      </div>

      {/* Bots Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {bots.map((bot) => {
          const isRunning = runningBotId === bot.id;
          return (
            <div
              key={bot.id}
              className={`p-5 rounded-2xl border transition-all flex flex-col justify-between gap-4 ${
                isDark ? 'bg-[#12141c] border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-red-600/10 border border-red-500/20 flex items-center justify-center shrink-0">
                      {getBotIcon(bot.botType)}
                    </div>
                    <div>
                      <h3 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                        {bot.name}
                      </h3>
                      <p className="text-[11px] text-neutral-400">
                        {bot.category} • {bot.runsCount} run(s)
                      </p>
                    </div>
                  </div>

                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                      bot.status === 'Active'
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                    }`}
                  >
                    {bot.status}
                  </span>
                </div>

                <p className="text-xs text-neutral-400 leading-relaxed">{bot.description}</p>

                {/* Configurable Target / Payload */}
                {(bot.botType === 'web-monitor' || bot.botType === 'webhook-relay') && (
                  <label className="block space-y-1">
                    <span className="text-[10px] uppercase font-bold text-neutral-400">
                      {bot.botType === 'web-monitor' ? 'Target URL' : 'Webhook URL (leave blank for dry-run)'}
                    </span>
                    <input
                      type="text"
                      value={bot.target}
                      onChange={(e) => handleFieldChange(bot.id, 'target', e.target.value)}
                      placeholder="https://..."
                      className={`w-full px-3 py-2 rounded-xl border text-xs font-mono outline-none focus:border-red-500 ${
                        isDark ? 'bg-[#0a0b0f] border-neutral-800 text-white' : 'bg-neutral-50 border-neutral-200 text-neutral-900'
                      }`}
                    />
                  </label>
                )}

                {bot.botType !== 'web-monitor' && (
                  <label className="block space-y-1">
                    <span className="text-[10px] uppercase font-bold text-neutral-400">
                      {bot.botType === 'ai-digest'
                        ? 'Source Text / Brief'
                        : bot.botType === 'webhook-relay'
                        ? 'JSON Payload'
                        : 'CSV or JSON Rows'}
                    </span>
                    <textarea
                      rows={3}
                      value={bot.payload}
                      onChange={(e) => handleFieldChange(bot.id, 'payload', e.target.value)}
                      className={`w-full p-2.5 rounded-xl border text-[11px] font-mono outline-none focus:border-red-500 ${
                        isDark ? 'bg-[#0a0b0f] border-neutral-800 text-white' : 'bg-neutral-50 border-neutral-200 text-neutral-900'
                      }`}
                    />
                  </label>
                )}

                {/* Live Execution Output */}
                {bot.lastSummary && (
                  <div
                    className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                      bot.lastOk
                        ? 'border-emerald-500/30 bg-emerald-500/10'
                        : 'border-red-500/30 bg-red-500/10'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold flex items-center gap-1.5">
                        {bot.lastOk ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                        )}
                        <span className={bot.lastOk ? 'text-emerald-400' : 'text-red-400'}>
                          {bot.lastSummary}
                        </span>
                      </span>
                      <span className="font-mono text-[10px] text-neutral-400">{bot.lastRunAt}</span>
                    </div>
                    {Boolean(bot.lastData) && (
                      <pre
                        className={`text-[10px] font-mono overflow-x-auto max-h-28 p-2 rounded-lg ${
                          isDark ? 'bg-[#090a0f] text-neutral-300' : 'bg-white text-neutral-800'
                        }`}
                      >
                        {JSON.stringify(bot.lastData, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-neutral-800/70 text-xs">
                <button
                  type="button"
                  onClick={() => toggleBotStatus(bot.id)}
                  className={`px-3 py-1.5 rounded-lg border font-semibold flex items-center gap-1.5 ${
                    isDark
                      ? 'border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-neutral-200'
                      : 'border-neutral-200 bg-neutral-100 text-neutral-800'
                  }`}
                >
                  {bot.status === 'Active' ? (
                    <>
                      <Pause className="w-3.5 h-3.5 text-amber-400" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Resume</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={bot.status === 'Paused' || Boolean(runningBotId)}
                  onClick={() => runBotNow(bot)}
                  className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold flex items-center gap-1.5 disabled:opacity-40 transition-colors"
                >
                  {isRunning ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Running...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      <span>Run Now</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Bot Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div
            className={`w-full max-w-md rounded-2xl border p-6 space-y-4 ${
              isDark ? 'bg-[#12141c] border-neutral-800 text-white' : 'bg-white border-neutral-200 text-neutral-900'
            }`}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Bot className="w-4 h-4 text-red-500" />
                <span>Create Real Automation Bot</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded-lg hover:bg-neutral-800/50 text-neutral-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBot} className="space-y-3 text-xs">
              <label className="block space-y-1">
                <span className="font-semibold text-neutral-400">Bot Name</span>
                <input
                  type="text"
                  required
                  value={newBotName}
                  onChange={(e) => setNewBotName(e.target.value)}
                  placeholder="e.g. Cloudflare Endpoint Watcher"
                  className={`w-full p-2.5 rounded-xl border outline-none ${
                    isDark ? 'bg-[#0a0b0f] border-neutral-800 text-white' : 'bg-neutral-50 border-neutral-200 text-neutral-900'
                  }`}
                />
              </label>

              <label className="block space-y-1">
                <span className="font-semibold text-neutral-400">Execution Runner Type</span>
                <select
                  value={newBotType}
                  onChange={(e) => setNewBotType(e.target.value as RealBotType)}
                  className={`w-full p-2.5 rounded-xl border outline-none ${
                    isDark ? 'bg-[#0a0b0f] border-neutral-800 text-white' : 'bg-neutral-50 border-neutral-200 text-neutral-900'
                  }`}
                >
                  <option value="web-monitor">HTTP Web Monitor</option>
                  <option value="ai-digest">AI Content Digest</option>
                  <option value="webhook-relay">Webhook Relay</option>
                  <option value="data-normalizer">Batch Data Normalizer</option>
                </select>
              </label>

              <label className="block space-y-1">
                <span className="font-semibold text-neutral-400">Default Target / Label</span>
                <input
                  type="text"
                  value={newBotTarget}
                  onChange={(e) => setNewBotTarget(e.target.value)}
                  className={`w-full p-2.5 rounded-xl border outline-none ${
                    isDark ? 'bg-[#0a0b0f] border-neutral-800 text-white' : 'bg-neutral-50 border-neutral-200 text-neutral-900'
                  }`}
                />
              </label>

              {newBotType !== 'web-monitor' && (
                <label className="block space-y-1">
                  <span className="font-semibold text-neutral-400">Initial Payload</span>
                  <textarea
                    rows={3}
                    value={newBotPayload}
                    onChange={(e) => setNewBotPayload(e.target.value)}
                    className={`w-full p-2.5 rounded-xl border outline-none ${
                      isDark ? 'bg-[#0a0b0f] border-neutral-800 text-white' : 'bg-neutral-50 border-neutral-200 text-neutral-900'
                    }`}
                  />
                </label>
              )}

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold"
              >
                Deploy Automation Bot
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
