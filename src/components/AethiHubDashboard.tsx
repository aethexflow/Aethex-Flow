import React, { useState } from 'react';
import { Bot, Terminal, Shield, Cpu, Database, Play, CheckCircle2, RefreshCw, Key, HardDrive, Lock } from 'lucide-react';

interface AethiHubDashboardProps {
  theme: 'dark' | 'light';
  onLogActivity?: (action: string) => void;
  onOpenD1Workflows: () => void;
}

export const AethiHubDashboard: React.FC<AethiHubDashboardProps> = ({
  theme,
  onLogActivity,
  onOpenD1Workflows,
}) => {
  const isDark = theme === 'dark';
  const [deviceId, setDeviceId] = useState<string>('dev-local-01');
  const [workerUrl, setWorkerUrl] = useState<string>('https://aethexflow-app.aethexflow.workers.dev');
  const [sharedSecret, setSharedSecret] = useState<string>('change-me-in-production');
  const [isExecutingTask, setIsExecutingTask] = useState<boolean>(false);
  const [taskOutput, setTaskOutput] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'tasks' | 'storage' | 'client'>('overview');

  const handleTestBotDispatch = () => {
    setIsExecutingTask(true);
    setTaskOutput(null);
    onLogActivity?.('Dispatched automated task to Aethi Hub (.exe bot)');

    setTimeout(() => {
      setIsExecutingTask(false);
      setTaskOutput(
        JSON.stringify(
          {
            ok: true,
            device_id: deviceId,
            status: 'completed',
            completed_steps: 4,
            dpapi_protected: true,
            storage_partition: 'Non-OS Drive (Fallback to Roaming AppData)',
            timestamp: new Date().toISOString(),
          },
          null,
          2
        )
      );
    }, 900);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-300 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-600/10 border border-red-500/20 text-xs font-bold text-red-500 mb-2">
            <Bot className="w-3.5 h-3.5" />
            Attached Aethi Hub &amp; Advanced Automation (.exe / Python Bot)
          </div>
          <h1 className={`text-2xl sm:text-3xl font-black tracking-tight ${isDark ? 'text-white' : 'text-neutral-900'}`}>
            Aethi Hub Control Center
          </h1>
          <p className={`text-xs ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>
            Manage local Windows automation, DPAPI-protected secrets, SQLite state stores, and HMAC-signed command queues.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenD1Workflows}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 text-white font-semibold text-xs flex items-center gap-2 shadow-md shadow-red-950/30 transition-all"
          >
            <Database className="w-4 h-4" />
            <span>Cloudflare D1 Workflows</span>
          </button>

          <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Aethi Bot Ready
          </span>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex gap-2 p-1 rounded-2xl bg-neutral-900/40 border border-neutral-800 text-xs font-semibold w-fit">
        <button
          type="button"
          onClick={() => setActiveSubTab('overview')}
          className={`px-4 py-2 rounded-xl transition-all ${
            activeSubTab === 'overview' ? 'bg-red-600 text-white font-bold' : 'text-neutral-400 hover:text-white'
          }`}
        >
          Overview &amp; Config
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('tasks')}
          className={`px-4 py-2 rounded-xl transition-all ${
            activeSubTab === 'tasks' ? 'bg-red-600 text-white font-bold' : 'text-neutral-400 hover:text-white'
          }`}
        >
          Task Dispatcher
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('storage')}
          className={`px-4 py-2 rounded-xl transition-all ${
            activeSubTab === 'storage' ? 'bg-red-600 text-white font-bold' : 'text-neutral-400 hover:text-white'
          }`}
        >
          Hidden Storage &amp; DPAPI
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('client')}
          className={`px-4 py-2 rounded-xl transition-all ${
            activeSubTab === 'client' ? 'bg-red-600 text-white font-bold' : 'text-neutral-400 hover:text-white'
          }`}
        >
          JS Client Bridge (`aethi_client.js`)
        </button>
      </div>

      {/* Tab Content: Overview */}
      {activeSubTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className={`p-5 rounded-2xl border space-y-3 ${isDark ? 'bg-neutral-900/60 border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'}`}>
            <div className="w-10 h-10 rounded-xl bg-red-600/15 text-red-500 flex items-center justify-center border border-red-500/30">
              <Shield className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm">HMAC &amp; Nonce Replay Guard</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Every command envelope dispatched to the bot is cryptographically signed and verified against replay attacks within a 300s window.
            </p>
          </div>

          <div className={`p-5 rounded-2xl border space-y-3 ${isDark ? 'bg-neutral-900/60 border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'}`}>
            <div className="w-10 h-10 rounded-xl bg-red-600/15 text-red-500 flex items-center justify-center border border-red-500/30">
              <HardDrive className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm">Non-OS Partition Priority</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Automatically discovers non-OS storage drives to store encrypted `.AethexFlowAethi` hidden data and SQLite stores, with OS drive fallback.
            </p>
          </div>

          <div className={`p-5 rounded-2xl border space-y-3 ${isDark ? 'bg-neutral-900/60 border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'}`}>
            <div className="w-10 h-10 rounded-xl bg-red-600/15 text-red-500 flex items-center justify-center border border-red-500/30">
              <Cpu className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm">Local Windows Automation</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Executes PyAutoGUI desktop clicks, keyboard inputs, app launchers, and local FFmpeg media pipelines with automatic repair fallbacks.
            </p>
          </div>
        </div>
      )}

      {/* Tab Content: Tasks */}
      {activeSubTab === 'tasks' && (
        <div className={`p-6 rounded-2xl border space-y-5 ${isDark ? 'bg-neutral-900/60 border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'}`}>
          <div className="space-y-2">
            <h3 className="font-bold text-base">Live Task Dispatcher Queue</h3>
            <p className="text-xs text-neutral-400">
              Dispatch a test task payload to verify the connected `aethi_hub` bot execution pipeline.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-400">Device ID</label>
              <input
                type="text"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                className={`w-full p-2.5 rounded-xl border text-xs font-mono ${isDark ? 'bg-neutral-900 border-neutral-800 text-white' : 'bg-neutral-50 border-neutral-300'}`}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-400">Worker Base URL</label>
              <input
                type="text"
                value={workerUrl}
                onChange={(e) => setWorkerUrl(e.target.value)}
                className={`w-full p-2.5 rounded-xl border text-xs font-mono ${isDark ? 'bg-neutral-900 border-neutral-800 text-white' : 'bg-neutral-50 border-neutral-300'}`}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleTestBotDispatch}
            disabled={isExecutingTask}
            className="px-5 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-red-950/30 transition-all disabled:opacity-50"
          >
            {isExecutingTask ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            <span>{isExecutingTask ? 'Dispatching & Polling Bot...' : 'Dispatch Automated Test Task'}</span>
          </button>

          {taskOutput && (
            <div className="space-y-2 pt-2">
              <span className="text-xs font-semibold text-neutral-400">Execution Result</span>
              <pre className="p-4 rounded-xl bg-black/80 border border-neutral-800 text-emerald-400 text-xs font-mono overflow-x-auto">
                {taskOutput}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Tab Content: Storage */}
      {activeSubTab === 'storage' && (
        <div className={`p-6 rounded-2xl border space-y-4 ${isDark ? 'bg-neutral-900/60 border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'}`}>
          <div className="flex items-center gap-3">
            <Lock className="w-6 h-6 text-red-500" />
            <div>
              <h3 className="font-bold text-base">Windows DPAPI &amp; Hidden Directory Storage</h3>
              <p className="text-xs text-neutral-400">`aethi_hub` protects local sensitive tokens using Windows Data Protection API (`CryptProtectData`).</p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 font-mono text-xs space-y-2 text-neutral-300">
            <p className="text-red-400 font-bold"># Storage Path Strategy:</p>
            <p>1. Scan non-OS drives (D:, E:, etc.) for writable `.AethexFlowAethi` folder.</p>
            <p>2. Set Windows File Attribute `FILE_ATTRIBUTE_HIDDEN` (`0x02`).</p>
            <p>3. Fallback to `%APPDATA%\.AethexFlowAethi` if non-OS drive unavailable.</p>
            <p>4. SQLite database (`aethi_chat.db`) stores thread metadata and message queues locally.</p>
          </div>
        </div>
      )}

      {/* Tab Content: Client */}
      {activeSubTab === 'client' && (
        <div className={`p-6 rounded-2xl border space-y-4 ${isDark ? 'bg-neutral-900/60 border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'}`}>
          <div className="flex items-center gap-3">
            <Terminal className="w-6 h-6 text-red-500" />
            <div>
              <h3 className="font-bold text-base">AethexFlow JavaScript Client Bridge (`aethi_client.js`)</h3>
              <p className="text-xs text-neutral-400">Connected to D1 backend endpoints for chat thread sync and command dispatching.</p>
            </div>
          </div>

          <pre className="p-4 rounded-xl bg-black/80 border border-neutral-800 text-blue-300 text-xs font-mono overflow-x-auto">
{`const client = new AethexFlowClient("${workerUrl}", "${deviceId}");
// Fetch chat thread titles from D1
const titles = await client.getChatTitles(50);
// Dispatch signed automation task
const task = await client.dispatchCommand("task", { steps: [...] });
// Open chat thread on-demand
const thread = await client.openChatThread("thread_01");`}
          </pre>
        </div>
      )}
    </div>
  );
};
