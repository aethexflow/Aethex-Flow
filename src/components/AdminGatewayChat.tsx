import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  Send,
  Database,
  Radio,
  Cpu,
  Lock,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  RefreshCw,
} from 'lucide-react';

interface AdminGatewayChatProps {
  theme: 'dark' | 'light';
  onExit: () => void;
  onLogActivity?: (action: string) => void;
}

interface AdminChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  modelUsed?: string;
  routeTarget?: string;
  sqlStatement?: string;
  tunnelNote?: string;
  d1Persisted?: boolean;
  timestamp: string;
}

interface AdminStateSnapshot {
  targetDomain: string;
  d1Bound: boolean;
  tunnelTarget: string;
  siteConfig?: Record<string, string | boolean>;
  modelsConfigured: {
    gemini: boolean;
    claude: boolean;
    openai: boolean;
    grok: boolean;
  };
  recentUpdates: Array<{
    id: string;
    intent_type: string;
    payload_json: string;
    model_used?: string;
    route_target?: string;
    created_at: string;
  }>;
}

export const AdminGatewayChat: React.FC<AdminGatewayChatProps> = ({
  theme,
  onExit,
  onLogActivity,
}) => {
  const isDark = theme === 'dark';

  const [sessionToken, setSessionToken] = useState<string>(() => {
    return sessionStorage.getItem('aethex_admin_session') || '';
  });
  const [passcodeInput, setPasscodeInput] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);

  const [preferredModel, setPreferredModel] = useState<'auto' | 'gemini' | 'claude' | 'openai' | 'grok'>('auto');
  const [inputText, setInputText] = useState<string>('');
  const [isDispatching, setIsDispatching] = useState<boolean>(false);
  const [stateSnapshot, setStateSnapshot] = useState<AdminStateSnapshot | null>(null);

  const [messages, setMessages] = useState<AdminChatMessage[]>([
    {
      id: 'm3_welcome',
      role: 'assistant',
      text: 'Admin Gateway authenticated. Commands entered here pass through the AethexFlow multi-model intent parser and route directly to Cloudflare D1 or down your active cloudflared tunnel (127.0.1.1:251).',
      modelUsed: 'aethex-blind-router',
      routeTarget: 'cloudflare_d1',
      timestamp: 'Ready',
    },
  ]);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadGatewayState = async (token: string) => {
    try {
      const res = await fetch('/api/admin/state', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        sessionStorage.removeItem('aethex_admin_session');
        setSessionToken('');
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setStateSnapshot(data);
      }
    } catch {
      // ignore transient network check
    }
  };

  useEffect(() => {
    if (sessionToken) {
      loadGatewayState(sessionToken);
    }
  }, [sessionToken]);

  const handleAuthenticate = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsAuthenticating(true);
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: passcodeInput }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setAuthError(data.error || 'Access denied by Cloudflare Worker guard');
        return;
      }
      sessionStorage.setItem('aethex_admin_session', data.sessionToken);
      setSessionToken(data.sessionToken);
      onLogActivity?.('Authenticated hidden Admin Gateway (/admin-gateway-secret)');
    } catch {
      setAuthError('Could not reach Worker authentication endpoint.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleDispatch = async (promptOverride?: string) => {
    const instruction = (promptOverride || inputText).trim();
    if (!instruction || isDispatching || !sessionToken) return;

    const userMsg: AdminChatMessage = {
      id: `usr_${Date.now()}`,
      role: 'user',
      text: instruction,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!promptOverride) setInputText('');
    setIsDispatching(true);

    try {
      const res = await fetch('/api/admin/dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ instruction, preferredModel }),
      });
      const data = await res.json();
      if (res.status === 401) {
        setSessionToken('');
        sessionStorage.removeItem('aethex_admin_session');
        return;
      }

      const botMsg: AdminChatMessage = {
        id: `bot_${Date.now()}`,
        role: 'assistant',
        text: data.assistantReply || 'Instruction dispatched.',
        modelUsed: data.modelUsed,
        routeTarget: data.routeTarget,
        sqlStatement: data.sqlStatement,
        d1Persisted: data.d1Persisted,
        tunnelNote: data.tunnelResult?.attempted
          ? data.tunnelResult.delivered
            ? `Delivered to ${data.tunnelResult.endpoint} (HTTP ${data.tunnelResult.status})`
            : data.tunnelResult.note
          : undefined,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, botMsg]);
      await loadGatewayState(sessionToken);
      onLogActivity?.(`Admin Gateway [${data.routeTarget}]: ${instruction.slice(0, 42)}`);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'assistant',
          text: 'Failed to reach /api/admin/dispatch worker endpoint.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsDispatching(false);
    }
  };

  // M3 Surface Classes (Google Material Design 3 inspired tonal surfaces & rounded-3xl geometry)
  const surfaceBg = isDark ? 'bg-[#13151d]' : 'bg-[#f8f9fc]';
  const surfaceCard = isDark ? 'bg-[#1b1e28] border-slate-800/80' : 'bg-white border-slate-200 shadow-sm';
  const surfaceContainer = isDark ? 'bg-[#232735]' : 'bg-[#edf1fa]';

  if (!sessionToken) {
    return (
      <div className="max-w-md mx-auto py-14 animate-in fade-in duration-300">
        <div className={`rounded-[28px] border p-7 space-y-5 ${surfaceCard}`}>
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#d3e3fd] text-[#041e49] flex items-center justify-center shrink-0">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <h1 className={`text-lg font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Secret Admin Gateway
              </h1>
              <p className="text-xs text-slate-400">
                aethexflow.online • Unindexed Cloudflare Worker Guard
              </p>
            </div>
          </div>

          <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            Verify your Cloudflare Access token or operator passcode to open the Material 3 Management Chat, D1 SQL dispatcher, and cloudflared tunnel bridge.
          </p>

          <form onSubmit={handleAuthenticate} className="space-y-4">
            <label className="block space-y-1.5 text-xs">
              <span className="font-semibold text-slate-400">Worker Access Token / Operator Code</span>
              <input
                type="password"
                required
                value={passcodeInput}
                onChange={(e) => setPasscodeInput(e.target.value)}
                placeholder="Enter access token..."
                className={`w-full px-4 py-3 rounded-2xl border text-sm outline-none focus:ring-2 focus:ring-blue-500/30 ${
                  isDark ? 'bg-[#0f1118] border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                }`}
              />
            </label>

            {authError && (
              <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={onExit}
                className={`px-4 py-2.5 rounded-full text-xs font-semibold ${surfaceContainer} ${
                  isDark ? 'text-slate-200' : 'text-slate-800'
                }`}
              >
                Return
              </button>
              <button
                type="submit"
                disabled={isAuthenticating}
                className="flex-1 py-2.5 px-5 rounded-full bg-[#a8c7fa] hover:bg-[#8ab4f8] text-[#041e49] font-bold text-xs transition-colors"
              >
                {isAuthenticating ? 'Verifying Guard...' : 'Verify & Unlock Gateway'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={`max-w-6xl mx-auto space-y-5 pb-12 animate-in fade-in duration-300`}>
      {/* Material Design 3 Top App Bar */}
      <div className={`rounded-[28px] border p-4 sm:px-6 flex flex-wrap items-center justify-between gap-4 ${surfaceCard}`}>
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-[#d3e3fd] text-[#041e49] flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className={`text-lg font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                AethexFlow Admin Gateway
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#c2e7ff] text-[#001d35]">
                noindex, nofollow
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {stateSnapshot?.targetDomain || 'aethexflow.online'} • Material 3 Multi-Model Dispatcher
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={preferredModel}
            onChange={(e) => setPreferredModel(e.target.value as any)}
            aria-label="Select multi-model parser route"
            className={`px-3.5 py-2 rounded-full border text-xs font-semibold outline-none ${
              isDark ? 'bg-[#232735] border-slate-700 text-slate-100' : 'bg-[#edf1fa] border-slate-300 text-slate-900'
            }`}
          >
            <option value="auto">Blind Auto-Router (All Models)</option>
            <option value="gemini">AethexFlow Engine Alpha</option>
            <option value="claude">AethexFlow Engine Beta</option>
            <option value="openai">AethexFlow Engine Gamma</option>
            <option value="grok">AethexFlow Edge Core</option>
          </select>

          <button
            type="button"
            onClick={onExit}
            className={`px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 ${surfaceContainer} ${
              isDark ? 'text-slate-200 hover:bg-slate-700' : 'text-slate-800 hover:bg-slate-200'
            }`}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Workspace</span>
          </button>
        </div>
      </div>

      {/* Main 2-column Material 3 Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Material Design 3 Chat Surface */}
        <div className={`lg:col-span-8 rounded-[28px] border flex flex-col h-[580px] overflow-hidden ${surfaceCard}`}>
          <div className={`px-5 py-3.5 border-b flex items-center justify-between text-xs ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
            <span className={`font-semibold flex items-center gap-2 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
              <Sparkles className="w-4 h-4 text-blue-400" />
              Site Updates &amp; Local Tunnel Chat
            </span>
            <span className="text-emerald-400 font-medium flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Worker Guard Active
            </span>
          </div>

          {/* Chat Feed */}
          <div className={`flex-1 overflow-y-auto p-5 space-y-4 ${surfaceBg}`}>
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-3xl px-4 py-3 text-xs sm:text-sm space-y-2 ${
                      isUser
                        ? 'bg-[#a8c7fa] text-[#041e49] font-medium rounded-br-md'
                        : isDark
                        ? 'bg-[#1e222d] border border-slate-800 text-slate-100 rounded-bl-md'
                        : 'bg-white border border-slate-200 text-slate-800 rounded-bl-md shadow-xs'
                    }`}
                  >
                    <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>

                    {!isUser && (msg.modelUsed || msg.routeTarget) && (
                      <div className="flex flex-wrap gap-1.5 pt-1 text-[10px] font-mono">
                        {msg.modelUsed && (
                          <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20">
                            model: {msg.modelUsed}
                          </span>
                        )}
                        {msg.routeTarget && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                            route: {msg.routeTarget}
                          </span>
                        )}
                      </div>
                    )}

                    {msg.sqlStatement && (
                      <pre
                        className={`p-2.5 rounded-2xl text-[10px] font-mono overflow-x-auto ${
                          isDark ? 'bg-[#0e1017] text-emerald-300' : 'bg-slate-900 text-emerald-300'
                        }`}
                      >
                        {msg.sqlStatement}
                      </pre>
                    )}

                    {msg.tunnelNote && (
                      <p className="text-[11px] text-amber-400 font-mono">{msg.tunnelNote}</p>
                    )}

                    <div className={`text-[10px] text-right ${isUser ? 'text-[#041e49]/70' : 'text-slate-400'}`}>
                      {msg.timestamp}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={scrollRef} />
          </div>

          {/* M3 Prompt Chips + Input Composer */}
          <div className={`p-4 border-t space-y-3 ${isDark ? 'border-slate-800 bg-[#181b24]' : 'border-slate-200 bg-white'}`}>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              {[
                'Update banner to "Cloudflare Edge v4.2 Live"',
                'Set edge cache to aggressive in D1',
                'Send local hub sync command via 127.0.1.1:251 tunnel',
              ].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleDispatch(chip)}
                  className={`px-3 py-1 rounded-full font-medium transition-colors ${surfaceContainer} ${
                    isDark ? 'text-slate-200 hover:bg-slate-700' : 'text-slate-800 hover:bg-slate-200'
                  }`}
                >
                  {chip}
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleDispatch();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Instruct D1 site update or tunnel command..."
                className={`flex-1 px-4 py-3 rounded-full border text-xs sm:text-sm outline-none focus:ring-2 focus:ring-blue-500/30 ${
                  isDark ? 'bg-[#0f1118] border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                }`}
              />
              <button
                type="submit"
                disabled={!inputText.trim() || isDispatching}
                aria-label="Dispatch Admin Command"
                className="w-11 h-11 rounded-full bg-[#a8c7fa] hover:bg-[#8ab4f8] text-[#041e49] flex items-center justify-center shrink-0 disabled:opacity-40 transition-colors"
              >
                {isDispatching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </form>
          </div>
        </div>

        {/* Right: D1 Config & Cloudflare Tunnel Inspector */}
        <div className="lg:col-span-4 space-y-4">
          <div className={`rounded-[24px] border p-5 space-y-3 text-xs ${surfaceCard}`}>
            <div className="flex items-center justify-between">
              <span className={`font-bold text-sm flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                <Database className="w-4 h-4 text-blue-400" />
                Cloudflare D1 State
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400">
                {stateSnapshot?.d1Bound ? 'Bound' : 'Ready'}
              </span>
            </div>

            {stateSnapshot?.siteConfig && (
              <div className={`p-3 rounded-2xl space-y-1.5 font-mono text-[11px] ${surfaceContainer}`}>
                {Object.entries(stateSnapshot.siteConfig).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-2">
                    <span className="text-slate-400">{k}</span>
                    <span className={`truncate max-w-[170px] font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      {String(v)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={`rounded-[24px] border p-5 space-y-3 text-xs ${surfaceCard}`}>
            <span className={`font-bold text-sm flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              <Radio className="w-4 h-4 text-emerald-400" />
              Cloudflared Tunnel Gateway
            </span>
            <p className="text-[11px] text-slate-400">
              Target endpoint: <code className="text-blue-400">{stateSnapshot?.tunnelTarget || 'http://127.0.1.1:251'}</code>
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
              {[
                { label: 'Engine Alpha', active: stateSnapshot?.modelsConfigured.gemini },
                { label: 'Engine Beta', active: stateSnapshot?.modelsConfigured.claude },
                { label: 'Engine Gamma', active: stateSnapshot?.modelsConfigured.openai },
                { label: 'Edge Core', active: stateSnapshot?.modelsConfigured.grok },
              ].map((m) => (
                <div
                  key={m.label}
                  className={`px-3 py-2 rounded-2xl flex items-center justify-between ${surfaceContainer}`}
                >
                  <span className={isDark ? 'text-slate-200' : 'text-slate-800'}>{m.label}</span>
                  <span className={`text-[10px] font-bold ${m.active ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {m.active ? 'Key Ready' : 'Standby'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className={`rounded-[24px] border p-5 space-y-2.5 text-xs ${surfaceCard}`}>
            <span className={`font-bold text-sm flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              <Cpu className="w-4 h-4 text-amber-400" />
              Recent D1 Update Log
            </span>
            <div className="space-y-2 max-h-[190px] overflow-y-auto">
              {(stateSnapshot?.recentUpdates || []).slice(0, 5).map((item) => (
                <div key={item.id} className={`p-2.5 rounded-2xl text-[11px] space-y-1 ${surfaceContainer}`}>
                  <div className="flex items-center justify-between font-mono text-[10px]">
                    <span className="text-blue-400 font-bold">{item.intent_type}</span>
                    <span className="text-slate-400">{item.model_used || 'router'}</span>
                  </div>
                  <p className={`truncate ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{item.payload_json}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
