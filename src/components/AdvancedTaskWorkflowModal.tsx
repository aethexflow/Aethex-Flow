import React, { useState, useEffect } from 'react';
import { X, GitBranch, Play, Plus, Trash2, Cloud, CheckCircle2, RefreshCw, Terminal, Database, Sparkles } from 'lucide-react';

interface WorkflowStep {
  id: string;
  name: string;
  action: 'fetch_api' | 'transform_json' | 'sqlite_query' | 'webhook_relay' | 'ai_digest';
  targetEndpoint: string;
  retryCount: number;
}

interface WorkflowItem {
  id: string;
  title: string;
  description: string;
  steps: WorkflowStep[];
  created_at?: string;
  lastExecution?: {
    status: string;
    stepsExecuted: number;
    completedAt: string;
  };
}

interface AdvancedTaskWorkflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: 'dark' | 'light';
  onLogActivity?: (action: string) => void;
}

export const AdvancedTaskWorkflowModal: React.FC<AdvancedTaskWorkflowModalProps> = ({
  isOpen,
  onClose,
  theme,
  onLogActivity,
}) => {
  const isDark = theme === 'dark';
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [activeWorkflow, setActiveWorkflow] = useState<WorkflowItem | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [execResult, setExecResult] = useState<any>(null);

  useEffect(() => {
    if (isOpen) {
      void fetchWorkflows();
    }
  }, [isOpen]);

  const fetchWorkflows = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/d1/workflows');
      const data = await res.json();
      if (data.ok && Array.isArray(data.workflows)) {
        setWorkflows(data.workflows);
        if (data.workflows.length > 0 && !activeWorkflow) {
          setActiveWorkflow(data.workflows[0]);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateWorkflow = () => {
    const newWf: WorkflowItem = {
      id: 'wf_' + Math.random().toString(36).substring(2, 9),
      title: 'New Cloudflare D1 Pipeline',
      description: 'Automated multi-stage task workflow synced to Cloudflare D1 SQLite database.',
      steps: [
        {
          id: 'step_1',
          name: 'Fetch API Telemetry',
          action: 'fetch_api',
          targetEndpoint: '/api/health',
          retryCount: 3,
        },
        {
          id: 'step_2',
          name: 'Transform & Batch Record',
          action: 'sqlite_query',
          targetEndpoint: 'INSERT INTO telemetry_logs ...',
          retryCount: 2,
        },
      ],
    };
    setActiveWorkflow(newWf);
    void saveWorkflow(newWf);
  };

  const saveWorkflow = async (wf: WorkflowItem) => {
    try {
      const res = await fetch('/api/d1/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow: wf }),
      });
      const data = await res.json();
      if (data.ok) {
        await fetchWorkflows();
        onLogActivity?.(`Saved workflow "${wf.title}" to Cloudflare D1`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleExecuteWorkflow = async (wfId: string) => {
    setIsExecuting(true);
    setExecResult(null);
    onLogActivity?.(`Executing Cloudflare D1 task workflow: ${wfId}`);
    try {
      const res = await fetch('/api/d1/workflows/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId: wfId }),
      });
      const data = await res.json();
      setExecResult(data);
      await fetchWorkflows();
      onLogActivity?.(`Successfully executed Cloudflare D1 task workflow: ${wfId}`);
    } catch (err: any) {
      setExecResult({ ok: false, error: err.message });
    } finally {
      setIsExecuting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className={`w-full max-w-4xl rounded-2xl overflow-hidden border shadow-2xl transition-all flex flex-col max-h-[85vh] ${
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
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">Cloudflare D1 Advanced Task Workflows</h3>
              <p className="text-xs text-neutral-400">Multi-stage automated pipelines synced to Cloudflare D1 SQLite database</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close D1 Task Workflows"
            className="p-2 rounded-lg hover:bg-neutral-800/50 text-neutral-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6 overflow-y-auto flex-1">
          {/* Workflows List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Stored Workflows</span>
              <button
                type="button"
                onClick={handleCreateWorkflow}
                className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold flex items-center gap-1 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New</span>
              </button>
            </div>

            <div className="space-y-2">
              {workflows.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-neutral-800 text-center text-xs text-neutral-500">
                  No workflows found in D1. Create one to begin.
                </div>
              ) : (
                workflows.map((wf) => (
                  <button
                    type="button"
                    key={wf.id}
                    onClick={() => setActiveWorkflow(wf)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      activeWorkflow?.id === wf.id
                        ? 'border-red-500 bg-red-500/15 text-white'
                        : isDark
                        ? 'border-neutral-800 bg-neutral-900/60 hover:bg-neutral-800 text-neutral-300'
                        : 'border-neutral-200 bg-neutral-50 hover:bg-neutral-100 text-neutral-800'
                    }`}
                  >
                    <p className="font-bold text-xs truncate">{wf.title}</p>
                    <p className="text-[10px] text-neutral-400 mt-0.5">{wf.steps.length} sequential steps</p>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Workflow Details & Execution */}
          <div className="md:col-span-2 space-y-4">
            {activeWorkflow ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Workflow Title</label>
                  <input
                    type="text"
                    value={activeWorkflow.title}
                    onChange={(e) => {
                      const updated = { ...activeWorkflow, title: e.target.value };
                      setActiveWorkflow(updated);
                      void saveWorkflow(updated);
                    }}
                    className={`w-full p-2.5 rounded-xl border text-xs font-semibold ${
                      isDark ? 'bg-neutral-900 border-neutral-800 text-white' : 'bg-neutral-50 border-neutral-300 text-neutral-900'
                    }`}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Pipeline Steps ({activeWorkflow.steps.length})</label>
                  <div className="space-y-2">
                    {activeWorkflow.steps.map((st, i) => (
                      <div key={st.id || i} className={`p-3 rounded-xl border flex items-center justify-between text-xs ${isDark ? 'bg-neutral-900 border-neutral-800' : 'bg-neutral-50 border-neutral-200'}`}>
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-full bg-red-600/20 text-red-500 font-bold flex items-center justify-center text-[10px]">
                            {i + 1}
                          </span>
                          <div>
                            <p className="font-bold">{st.name}</p>
                            <p className="text-[10px] font-mono text-neutral-400">{st.action} • {st.targetEndpoint}</p>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono bg-neutral-800 px-2 py-0.5 rounded text-neutral-300">
                          Retries: {st.retryCount}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => handleExecuteWorkflow(activeWorkflow.id)}
                    disabled={isExecuting}
                    className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 text-white font-semibold text-xs flex items-center gap-2 shadow-md shadow-red-950/30 transition-all disabled:opacity-50"
                  >
                    {isExecuting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    <span>{isExecuting ? 'Executing in Cloudflare D1...' : 'Execute Task Pipeline'}</span>
                  </button>

                  {activeWorkflow.lastExecution && (
                    <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Last run: {activeWorkflow.lastExecution.stepsExecuted} steps completed
                    </span>
                  )}
                </div>

                {execResult && (
                  <div className="space-y-2 pt-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Execution Result Logs</span>
                    <pre className="p-3 rounded-xl bg-black/80 border border-neutral-800 text-emerald-400 text-xs font-mono overflow-x-auto">
                      {JSON.stringify(execResult, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center p-8 text-center text-xs text-neutral-500 border border-dashed border-neutral-800 rounded-2xl">
                Select or create a workflow to configure pipeline steps.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
