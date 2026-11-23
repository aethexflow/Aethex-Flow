import React, { useState } from 'react';
import {
  Mic,
  ArrowUp,
  Pin,
  Sparkles,
  Zap,
  Image,
  FileText,
  RefreshCw,
  Languages,
  Clock,
  ArrowRight,
  Film,
  ShieldCheck,
  Braces,
  Bot,
  GitBranch,
  LogIn,
  CloudCheck,
} from 'lucide-react';
import { ToolItem } from '../utils/toolsData';
import { parseNaturalIntent } from '../utils/intentParser';
import { executeAutomatedPipeline } from '../utils/dagEngine';
import { useAuth } from '../contexts/AuthContext';

interface HomeDashboardProps {
  tools: ToolItem[];
  onOpenTool: (id: string) => void;
  onNavigateTab: (tab: any) => void;
  theme: 'dark' | 'light';
  activityLog: Array<{ id: string; action: string; time: string; status: string }>;
  onLogActivity?: (action: string) => void;
}

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  tools,
  onOpenTool,
  onNavigateTab,
  theme,
  activityLog,
  onLogActivity,
}) => {
  const isDark = theme === 'dark';
  const { user, profile, authBusy, signInWithGoogle } = useAuth();
  const [commandInput, setCommandInput] = useState<string>('');
  const [routedNotification, setRoutedNotification] = useState<{
    label: string;
    message: string;
    confidence: number;
    pipelineSteps: number;
  } | null>(null);

  const pinnedTools = tools.filter((t) => t.isPinned);

  const executeParsedIntent = (query: string) => {
    const clean = query.trim();
    if (!clean) return;

    const intent = parseNaturalIntent(clean);
    const pipeline = executeAutomatedPipeline(intent.label);

    setRoutedNotification({
      label: intent.label,
      message: intent.description,
      confidence: intent.confidence,
      pipelineSteps: pipeline.stepsExecuted.length,
    });
    onLogActivity?.(`Autonomous router executed: ${intent.label}`);

    setTimeout(() => {
      setRoutedNotification(null);
      if (intent.type === 'LAUNCH_TOOL') {
        onOpenTool(intent.targetId);
      } else if (intent.type === 'NAVIGATE_TAB') {
        onNavigateTab(intent.targetId);
      } else if (intent.type === 'MASTER_VAULT') {
        window.location.hash = '#control-vault-master';
      }
    }, 450);
  };

  const handleCommandRoute = (promptQuery: string) => {
    if (!promptQuery.trim()) return;
    executeParsedIntent(promptQuery);
  };

  const getToolIcon = (iconName: string) => {
    switch (iconName) {
      case 'Image':
        return <Image className="w-5 h-5 text-red-500" />;
      case 'FileText':
        return <FileText className="w-5 h-5 text-red-500" />;
      case 'RefreshCw':
        return <RefreshCw className="w-5 h-5 text-red-500" />;
      case 'Languages':
        return <Languages className="w-5 h-5 text-red-500" />;
      case 'Film':
        return <Film className="w-5 h-5 text-red-500" />;
      case 'ShieldCheck':
        return <ShieldCheck className="w-5 h-5 text-red-500" />;
      case 'Braces':
        return <Braces className="w-5 h-5 text-red-500" />;
      case 'Bot':
        return <Bot className="w-5 h-5 text-red-500" />;
      case 'GitBranch':
        return <GitBranch className="w-5 h-5 text-red-500" />;
      default:
        return <Sparkles className="w-5 h-5 text-red-500" />;
    }
  };

  const greetingName = user
    ? profile?.displayName || user.displayName || 'Creator'
    : 'Creator';

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-12 animate-in fade-in duration-300">
      {/* 1. Public-Ready Multi-User Greeting Header */}
        <div className="space-y-3 pt-1">

        <h1
          className={`text-3xl sm:text-5xl font-black tracking-tight leading-tight ${
            isDark ? 'text-white' : 'text-neutral-900'
          }`}
        >
          Assalam-o-Alaikum,{' '}
          <span className="bg-gradient-to-r from-red-500 via-rose-500 to-red-600 bg-clip-text text-transparent">
            {greetingName}.
          </span>
        </h1>

        <p
          className={`text-sm sm:text-base max-w-2xl leading-relaxed ${
            isDark ? 'text-neutral-400' : 'text-neutral-600'
          }`}
        >
          Build visual DAG workflows, edit automated videos, run real browser tools, and chat with AethexFlow intelligence-powered Ask Aethe Copilot — synced to your own workspace account.
        </p>
      </div>

      {/* Autonomous Intent Notification Toast */}
      {routedNotification && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs animate-in fade-in duration-200 shadow-lg ${
            isDark
              ? 'border-red-500/40 bg-red-950/30 text-red-200'
              : 'border-red-200 bg-red-50 text-red-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            <span className="font-semibold">{routedNotification.label}:</span>
            <span className={isDark ? 'text-neutral-300' : 'text-neutral-700'}>
              {routedNotification.message} ({routedNotification.pipelineSteps}-stage DAG auto-verified)
            </span>
          </div>
          <span className="font-mono text-[10px] text-emerald-500 font-bold">
            {(routedNotification.confidence * 100).toFixed(0)}% Parsed
          </span>
        </div>
      )}

      {/* 2. Primary "What do you want to do?" Autonomous Intent Box */}
      <div
        className={`p-7 rounded-3xl border text-center space-y-4 relative overflow-hidden transition-all ${
          isDark
            ? 'bg-[#10121b]/90 border-neutral-800/80 shadow-xl'
            : 'bg-white border-neutral-200 shadow-lg'
        }`}
      >
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-[10px] font-bold text-red-500 uppercase tracking-wider">
          <Zap className="w-3 h-3 text-red-500" />
          Autonomous Intent Router
        </div>

        <h2
          className={`text-2xl sm:text-3xl font-black tracking-tight ${
            isDark ? 'text-white' : 'text-neutral-900'
          }`}
        >
          What do you want to do?
        </h2>

        <p
          className={`text-xs sm:text-sm max-w-xl mx-auto leading-relaxed ${
            isDark ? 'text-neutral-400' : 'text-neutral-600'
          }`}
        >
          Describe any task naturally or talk to Ask Aethe Copilot. AethexFlow opens the matching studio, tool, workflow, or live automation bot.
        </p>

        {/* Single Central Command Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleCommandRoute(commandInput);
          }}
          className={`max-w-xl mx-auto relative flex items-center rounded-2xl border transition-all p-1.5 shadow-inner ${
            isDark
              ? 'border-neutral-800 bg-neutral-900/70 focus-within:border-red-500'
              : 'border-neutral-200 bg-neutral-50 focus-within:border-red-500'
          }`}
        >
          <Mic className="w-4 h-4 text-neutral-400 ml-3 shrink-0" />
          <input
            type="text"
            aria-label="Describe what you want to do"
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
            placeholder="Try 'open video editor', 'workflow dag', 'encrypt text', or 'compress PDF'..."
            className={`w-full py-2.5 px-3 bg-transparent text-xs sm:text-sm placeholder-neutral-400 focus:outline-none ${
              isDark ? 'text-white' : 'text-neutral-900'
            }`}
          />
          <button
            type="submit"
            onClick={(e) => {
              if (!commandInput.trim()) {
                e.preventDefault();
                handleCommandRoute('open video editor');
              }
            }}
            className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-500 to-red-600 hover:from-red-400 text-white flex items-center justify-center shrink-0 shadow-md shadow-red-950/30 transition-transform active:scale-95"
            aria-label="Run intent command"
            title="Run command"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        </form>
      </div>

      {/* 4. Recent Activity */}
      <div className="space-y-4">
        <div>
          <h3
            className={`text-base sm:text-lg font-bold tracking-tight ${
              isDark ? 'text-white' : 'text-neutral-900'
            }`}
          >
            Recent Activity
          </h3>
          <p className={`text-xs ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>
            {user ? 'Synced to your private cloud history.' : 'Recent session actions on this browser.'}
          </p>
        </div>

        <div className="space-y-2.5">
          {activityLog.length === 0 ? (
            <div
              className={`p-4 rounded-xl border text-xs flex items-center justify-between ${
                isDark
                  ? 'border-neutral-800/80 bg-neutral-900/30 text-neutral-400'
                  : 'border-neutral-200 bg-white text-neutral-600'
              }`}
            >
              <span>
                No workspace actions recorded yet. Run Ask Aethe Copilot, Workflow DAG, or any tool to see real activity here.
              </span>
              <button
                type="button"
                onClick={() => onNavigateTab('chat')}
                className="text-red-500 font-semibold hover:text-red-400 shrink-0 ml-3"
              >
                Open AI Chat
              </button>
            </div>
          ) : (
            activityLog.slice(0, 4).map((act) => (
              <div
                key={act.id}
                className={`p-3.5 rounded-xl border flex items-center justify-between text-xs ${
                  isDark
                    ? 'border-neutral-800/80 bg-neutral-900/30'
                    : 'border-neutral-200 bg-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-red-500 ${
                      isDark ? 'bg-neutral-800/80' : 'bg-red-50'
                    }`}
                  >
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <p
                      className={`font-semibold ${
                        isDark ? 'text-neutral-200' : 'text-neutral-800'
                      }`}
                    >
                      {act.action}
                    </p>
                    <p className="text-[11px] text-neutral-400">{act.time}</p>
                  </div>
                </div>

                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 font-semibold border border-emerald-500/20 text-[10px]">
                  {act.status}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
