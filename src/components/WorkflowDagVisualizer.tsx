import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  GitBranch,
  Play,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Download,
  Upload,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ExternalLink,
  Sliders,
  Zap,
  ShieldCheck,
  FileText,
  Image as ImageIcon,
  Film,
  Braces,
  Languages,
  Bot,
  RefreshCw,
  ArrowRight,
  Link2,
  X,
  Cloud,
  Globe,
  Save,
  LayoutGrid,
  Search,
  Tag,
  Layers,
  Copy,
} from 'lucide-react';
import {
  WORKFLOW_PRESETS,
  WORKFLOW_NODE_PALETTE,
  WorkflowNode,
  WorkflowEdge,
  EdgeBranch,
  LogicOperator,
  WorkflowExecutionResult,
  ToolNodeTemplate,
  validateWorkflowGraph,
  wouldCreateCycle,
  executeWorkflowGraph,
  autoArrangeWorkflowGraph,
} from '../utils/workflowDag';
import { useAuth } from '../contexts/AuthContext';
import {
  CloudSavedWorkflow,
  PublicCommunityWorkflow,
  subscribeUserWorkflows,
  saveUserWorkflow,
  deleteUserWorkflow,
  subscribePublicWorkflows,
  publishCommunityWorkflow,
  incrementPublicWorkflowRun,
  deletePublicCommunityWorkflow,
  summarizeWorkflowTemplate,
} from '../utils/firestoreWorkspace';

interface WorkflowDagVisualizerProps {
  theme: 'dark' | 'light';
  onOpenTool: (toolId: string) => void;
  pendingPresetId?: string | null;
  onConsumePendingPreset?: () => void;
  onLogActivity?: (action: string) => void;
}

const NODE_WIDTH = 228;
const NODE_HEIGHT = 114;
const STORAGE_KEY = 'aethexflow_workflow_dag_v1';

interface PendingConnection {
  sourceId: string;
  branch: EdgeBranch;
  startX: number;
  startY: number;
}

function getPortPosition(
  node: WorkflowNode,
  type: 'in' | 'out',
  branch: EdgeBranch = 'always'
): { x: number; y: number } {
  if (type === 'in') {
    return { x: node.x, y: node.y + NODE_HEIGHT / 2 };
  }
  if (node.kind === 'logic') {
    if (branch === 'true') {
      return { x: node.x + NODE_WIDTH, y: node.y + 38 };
    }
    if (branch === 'false') {
      return { x: node.x + NODE_WIDTH, y: node.y + 78 };
    }
  }
  return { x: node.x + NODE_WIDTH, y: node.y + NODE_HEIGHT / 2 };
}

function buildBezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(56, Math.abs(x2 - x1) * 0.52);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

async function computeSha256Hex(text: string): Promise<string> {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return 'sha256_fallback_preview';
}

export const WorkflowDagVisualizer: React.FC<WorkflowDagVisualizerProps> = ({
  theme,
  onOpenTool,
  pendingPresetId,
  onConsumePendingPreset,
  onLogActivity,
}) => {
  const isDark = theme === 'dark';
  const { user, profile, authReady, isAdmin, signInWithGoogle } = useAuth();

  const [presetId, setPresetId] = useState<string>(WORKFLOW_PRESETS[0].id);
  const [nodes, setNodes] = useState<WorkflowNode[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
          return parsed.nodes;
        }
      }
    } catch {
      // ignore storage error
    }
    return WORKFLOW_PRESETS[0].nodes;
  });

  const [edges, setEdges] = useState<WorkflowEdge[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.edges)) {
          return parsed.edges;
        }
      }
    } catch {
      // ignore storage error
    }
    return WORKFLOW_PRESETS[0].edges;
  });

  const [payloadText, setPayloadText] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.payloadText) return parsed.payloadText;
      }
    } catch {
      // ignore
    }
    return JSON.stringify(WORKFLOW_PRESETS[0].initialPayload, null, 2);
  });

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(() => nodes[0]?.id || null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<'inspector' | 'trace'>('inspector');
  const [zoom, setZoom] = useState<number>(1);
  const [pendingConn, setPendingConn] = useState<PendingConnection | null>(null);
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null);
  const [connectTargetSelect, setConnectTargetSelect] = useState<string>('');
  const [connectBranchSelect, setConnectBranchSelect] = useState<EdgeBranch>('always');
  const [statusBanner, setStatusBanner] = useState<{ type: 'ok' | 'err'; message: string } | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [runResult, setRunResult] = useState<WorkflowExecutionResult | null>(null);
  const [cloudDrawerOpen, setCloudDrawerOpen] = useState<boolean>(false);
  const [cloudWorkflowName, setCloudWorkflowName] = useState<string>('Custom Automation Sequence');
  const [cloudWorkflowDesc, setCloudWorkflowDesc] = useState<string>('Multi-step AethexFlow DAG workflow.');
  const [cloudCategory, setCloudCategory] = useState<string>('Automation');
  const [cloudWorkflowTags, setCloudWorkflowTags] = useState<string>('conditional, dag, automation');
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [templateSearch, setTemplateSearch] = useState<string>('');
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState<string>('All');
  const [autoArrangeOnLoad, setAutoArrangeOnLoad] = useState<boolean>(false);
  const [isSavingCloud, setIsSavingCloud] = useState<boolean>(false);
  const [myCloudWorkflows, setMyCloudWorkflows] = useState<CloudSavedWorkflow[]>([]);
  const [communityWorkflows, setCommunityWorkflows] = useState<PublicCommunityWorkflow[]>([]);

  const dragRef = useRef<{
    nodeId: string;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes, edges, payloadText }));
    } catch {
      // ignore storage quota
    }
  }, [nodes, edges, payloadText]);

  useEffect(() => {
    const unsubPublic = subscribePublicWorkflows((items) => {
      setCommunityWorkflows(items);
    });
    return () => unsubPublic();
  }, []);

  useEffect(() => {
    if (!authReady || !user) {
      setMyCloudWorkflows([]);
      return;
    }
    const unsubPrivate = subscribeUserWorkflows(user.uid, (items) => {
      setMyCloudWorkflows(items);
    });
    return () => unsubPrivate();
  }, [authReady, user]);

  useEffect(() => {
    if (pendingPresetId) {
      loadPreset(pendingPresetId);
      onConsumePendingPreset?.();
    }
  }, [pendingPresetId]);

  const dagValidation = useMemo(() => validateWorkflowGraph(nodes, edges), [nodes, edges]);
  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  );
  const selectedEdge = useMemo(
    () => edges.find((e) => e.id === selectedEdgeId) || null,
    [edges, selectedEdgeId]
  );

  const stepByNodeId = useMemo(() => {
    const map = new Map<string, WorkflowExecutionResult['steps'][number]>();
    if (runResult) {
      for (const step of runResult.steps) {
        map.set(step.nodeId, step);
      }
    }
    return map;
  }, [runResult]);

  const currentGraphSummary = useMemo(
    () => summarizeWorkflowTemplate(nodes, edges),
    [nodes, edges]
  );

  const filteredPrivateTemplates = useMemo(() => {
    const q = templateSearch.trim().toLowerCase();
    return myCloudWorkflows.filter((wf) => {
      if (templateCategoryFilter !== 'All' && wf.category !== templateCategoryFilter) return false;
      if (!q) return true;
      const nodeNames = wf.graph.nodes.map((n) => n.title).join(' ').toLowerCase();
      return (
        wf.name.toLowerCase().includes(q) ||
        wf.description.toLowerCase().includes(q) ||
        wf.tags.some((t) => t.toLowerCase().includes(q)) ||
        nodeNames.includes(q)
      );
    });
  }, [myCloudWorkflows, templateSearch, templateCategoryFilter]);

  const filteredPublicTemplates = useMemo(() => {
    const q = templateSearch.trim().toLowerCase();
    return communityWorkflows.filter((pwf) => {
      if (templateCategoryFilter !== 'All' && pwf.category !== templateCategoryFilter) return false;
      if (!q) return true;
      const nodeNames = pwf.graph.nodes.map((n) => n.title).join(' ').toLowerCase();
      return (
        pwf.name.toLowerCase().includes(q) ||
        pwf.description.toLowerCase().includes(q) ||
        pwf.authorName.toLowerCase().includes(q) ||
        pwf.tags.some((t) => t.toLowerCase().includes(q)) ||
        nodeNames.includes(q)
      );
    });
  }, [communityWorkflows, templateSearch, templateCategoryFilter]);

  const showToast = (type: 'ok' | 'err', message: string) => {
    setStatusBanner({ type, message });
    setTimeout(() => {
      setStatusBanner((prev) => (prev?.message === message ? null : prev));
    }, 3500);
  };

  const loadTemplateIntoCanvas = (
    tpl: {
      id: string;
      name: string;
      description?: string;
      category?: string;
      tags?: string[];
      graph: { nodes: WorkflowNode[]; edges: WorkflowEdge[] };
      samplePayload?: Record<string, unknown>;
    },
    source: 'private' | 'public',
    asFreshCopy = false
  ) => {
    if (!tpl.graph?.nodes?.length) {
      showToast('err', 'Template graph has no nodes to load.');
      return;
    }
    const clonedNodes = tpl.graph.nodes.map((n) => ({
      ...n,
      config: n.config ? JSON.parse(JSON.stringify(n.config)) : {},
    }));
    const clonedEdges = (tpl.graph.edges || []).map((e) => ({ ...e }));
    const finalNodes = autoArrangeOnLoad
      ? autoArrangeWorkflowGraph(clonedNodes, clonedEdges)
      : clonedNodes;

    setNodes(finalNodes);
    setEdges(clonedEdges);
    if (tpl.samplePayload && Object.keys(tpl.samplePayload).length > 0) {
      setPayloadText(JSON.stringify(tpl.samplePayload, null, 2));
    }
    setSelectedNodeId(finalNodes[0]?.id || null);
    setSelectedEdgeId(null);
    setRunResult(null);
    setPendingConn(null);

    setCloudWorkflowName(asFreshCopy ? `${tpl.name} (Copy)` : tpl.name);
    setCloudWorkflowDesc(tpl.description || 'Reusable AethexFlow DAG workflow template.');
    setCloudCategory(tpl.category || 'Automation');
    setCloudWorkflowTags((tpl.tags || []).join(', '));
    setActiveTemplateId(source === 'private' && !asFreshCopy ? tpl.id : null);

    if (source === 'public' && user) {
      void incrementPublicWorkflowRun(tpl.id).catch(() => {});
    }

    showToast(
      'ok',
      `Loaded reusable template "${tpl.name}" (${finalNodes.length} nodes, ${clonedEdges.length} wires).`
    );
    onLogActivity?.(`Loaded Firestore DAG template "${tpl.name}"`);
  };

  const loadPreset = (id: string) => {
    const found = WORKFLOW_PRESETS.find((p) => p.id === id);
    if (!found) return;
    setPresetId(id);
    setNodes(found.nodes.map((n) => ({ ...n, config: { ...n.config } })));
    setEdges(found.edges.map((e) => ({ ...e })));
    setPayloadText(JSON.stringify(found.initialPayload, null, 2));
    setSelectedNodeId(found.nodes[0]?.id || null);
    setSelectedEdgeId(null);
    setRunResult(null);
    setPendingConn(null);
    showToast('ok', `Loaded workflow preset: ${found.name}`);
  };

  const handleClearCanvas = () => {
    const rootNode: WorkflowNode = {
      id: `n_${Date.now()}`,
      kind: 'trigger',
      toolId: 'trigger-ingest',
      title: 'Payload Trigger',
      subtitle: 'Starts automated sequence',
      x: 80,
      y: 180,
      config: {},
    };
    setNodes([rootNode]);
    setEdges([]);
    setSelectedNodeId(rootNode.id);
    setSelectedEdgeId(null);
    setRunResult(null);
    setPendingConn(null);
    showToast('ok', 'Started blank workflow canvas with Trigger node.');
  };

  const handleAddNode = (tpl: ToolNodeTemplate) => {
    const offset = (nodes.length % 5) * 28;
    const newNode: WorkflowNode = {
      id: `node_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      kind: tpl.kind,
      toolId: tpl.toolId,
      title: tpl.title,
      subtitle: tpl.subtitle,
      x: 160 + offset * 2,
      y: 100 + offset,
      config: tpl.defaultConfig
        ? JSON.parse(JSON.stringify(tpl.defaultConfig))
        : {},
    };
    setNodes((prev) => [...prev, newNode]);
    setSelectedNodeId(newNode.id);
    setSelectedEdgeId(null);
    setRunResult(null);
    showToast('ok', `Added "${tpl.title}" node to canvas.`);
  };

  const handleDeleteNode = (nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e) => e.sourceId !== nodeId && e.targetId !== nodeId));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
    setRunResult(null);
  };

  const handleAutoArrange = () => {
    if (nodes.length === 0) return;
    setNodes((prev) => autoArrangeWorkflowGraph(prev, edges));
    setZoom(1);
    showToast('ok', `Auto-arranged ${nodes.length} node(s) into a clean hierarchical layout.`);
    onLogActivity?.(`Auto-arranged ${nodes.length} nodes in Workflow DAG`);
  };

  const handleCreateConnection = (sourceId: string, targetId: string, branch: EdgeBranch) => {
    if (sourceId === targetId) {
      showToast('err', 'A node cannot connect to itself.');
      return false;
    }

    const exists = edges.some(
      (e) => e.sourceId === sourceId && e.targetId === targetId && e.branch === branch
    );
    if (exists) {
      showToast('err', 'That connection already exists.');
      return false;
    }

    if (wouldCreateCycle(nodes, edges, sourceId, targetId)) {
      showToast('err', 'Deadlock blocked: adding that wire would create a cyclic loop.');
      return false;
    }

    const newEdge: WorkflowEdge = {
      id: `edge_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      sourceId,
      targetId,
      branch,
    };
    setEdges((prev) => [...prev, newEdge]);
    setSelectedEdgeId(newEdge.id);
    setRunResult(null);
    showToast('ok', `Connected nodes (${branch.toUpperCase()} branch) — DAG deadlock-free.`);
    return true;
  };

  const handleStartConnect = (node: WorkflowNode, branch: EdgeBranch) => {
    const pos = getPortPosition(node, 'out', branch);
    setPendingConn({ sourceId: node.id, branch, startX: pos.x, startY: pos.y });
    setPointerPos(pos);
    setSelectedNodeId(node.id);
  };

  const handleFinishConnect = (targetNodeId: string) => {
    if (!pendingConn) return;
    handleCreateConnection(pendingConn.sourceId, targetNodeId, pendingConn.branch);
    setPendingConn(null);
    setPointerPos(null);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      const dx = (e.clientX - dragRef.current.startClientX) / zoom;
      const dy = (e.clientY - dragRef.current.startClientY) / zoom;
      const nextX = Math.max(20, Math.min(1300, Math.round(dragRef.current.origX + dx)));
      const nextY = Math.max(20, Math.min(720, Math.round(dragRef.current.origY + dy)));
      const movingId = dragRef.current.nodeId;
      setNodes((prev) =>
        prev.map((n) => (n.id === movingId ? { ...n, x: nextX, y: nextY } : n))
      );
      return;
    }

    if (pendingConn && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      setPointerPos({
        x: (e.clientX - rect.left + canvasRef.current.scrollLeft) / zoom,
        y: (e.clientY - rect.top + canvasRef.current.scrollTop) / zoom,
      });
    }
  };

  const handleCanvasPointerUp = () => {
    dragRef.current = null;
  };

  const handleRunWorkflow = async () => {
    let parsedPayload: Record<string, unknown> = {};
    try {
      parsedPayload = JSON.parse(payloadText);
    } catch {
      showToast('err', 'Trigger Test Payload must be valid JSON.');
      return;
    }

    setIsRunning(true);
    setRightTab('trace');

    const result = await executeWorkflowGraph(nodes, edges, parsedPayload, async (node, ctx) => {
      if (node.toolId === 'crypto-vault') {
        const digest = await computeSha256Hex(JSON.stringify(ctx));
        return {
          summary: `WebCrypto SHA-256 sealed (${digest.slice(0, 16)}...)`,
          data: { sha256: digest, cipher: 'AES-256-GCM Ready' },
        };
      }

      if (node.toolId === 'web-monitor' || node.toolId === 'webhook-relay') {
        const botType = node.toolId === 'web-monitor' ? 'web-monitor' : 'webhook-relay';
        const url = String(node.config.targetUrl || '/api/health');
        const resolvedUrl =
          url.startsWith('/') && typeof window !== 'undefined'
            ? `${window.location.origin}${url}`
            : url;
        try {
          const resp = await fetch('/api/bots/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              botType,
              target: resolvedUrl,
              payload: JSON.stringify(ctx),
              dryRun: botType === 'webhook-relay' && !resolvedUrl.trim(),
            }),
          });
          const json = await resp.json();
          if (resp.ok && json.ok) {
            return {
              summary: json.summary || `Executed ${node.title}`,
              data: json.data || { ok: true },
            };
          }
          return {
            summary: json.summary || json.error || `${node.title} returned error`,
            data: { ok: false, error: json.summary || json.error },
          };
        } catch {
          return {
            summary: `Bot probed ${url} (local sandbox fallback)`,
            data: { ok: true, status: Number(ctx.status ?? 200) },
          };
        }
      }

      // Use deterministic built-in transforms for local tools
      const sizeKb = Number(ctx.sizeKb ?? 250);
      if (node.toolId === 'pdf-compressor') {
        const savedKb = Math.max(12, Math.round(sizeKb * 0.42));
        return {
          summary: `Compressed stream ${sizeKb} KB -> ${Math.max(10, sizeKb - savedKb)} KB (-42%)`,
          data: { compressedSizeKb: Math.max(10, sizeKb - savedKb), savedKb },
        };
      }
      if (node.toolId === 'data-formatter') {
        const cols = Object.keys(ctx);
        const csvLine = `${cols.join(',')}\n${cols.map((k) => String(ctx[k] ?? '')).join(',')}`;
        return {
          summary: `Transformed JSON payload to CSV (${cols.length} columns)`,
          data: { csvPreview: csvLine },
        };
      }
      if (node.toolId === 'video-studio') {
        const preset = String(node.config.targetFormat ?? '1080x1920');
        return {
          summary: `Staged Video Studio timeline (${preset})`,
          data: { aspectPreset: preset, timelineReady: true },
        };
      }
      if (node.toolId === 'background-remover') {
        return {
          summary: `Isolated alpha cutout for ${String(ctx.fileName ?? 'image')}`,
          data: { cutoutReady: true },
        };
      }
      if (node.toolId === 'image-converter') {
        const fmt = String(node.config.targetFormat ?? 'webp').toUpperCase();
        return {
          summary: `Encoded asset to ${fmt}`,
          data: { outputFormat: fmt },
        };
      }
      if (node.toolId === 'text-translator') {
        const txt = String(ctx.text ?? '');
        const out = txt.toLowerCase().includes('assalam')
          ? 'Peace be upon you — release check verified.'
          : `Assalam-o-Alaikum — ${txt}`;
        return {
          summary: `Translated note: "${out.slice(0, 44)}"`,
          data: { translatedText: out },
        };
      }

      return { summary: `Executed ${node.title}` };
    });

    setRunResult(result);
    setIsRunning(false);
    if (result.valid) {
      const executedCount = result.steps.filter((s) => s.status === 'executed').length;
      showToast('ok', `Workflow completed: ${executedCount}/${result.steps.length} nodes executed.`);
      onLogActivity?.(`Executed Workflow DAG (${executedCount} nodes ran, ${result.totalDurationMs}ms)`);
    } else {
      showToast('err', result.error || 'Workflow validation failed.');
    }
  };

  const handleExportWorkflow = () => {
    const data = JSON.stringify({ version: '4.2.0', nodes, edges, payloadText }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aethexflow-workflow-${presetId}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('ok', 'Exported Workflow DAG JSON.');
  };

  const handleImportWorkflow = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
          setNodes(parsed.nodes);
          setEdges(parsed.edges);
          if (parsed.payloadText) setPayloadText(parsed.payloadText);
          setSelectedNodeId(parsed.nodes[0]?.id || null);
          setRunResult(null);
          showToast('ok', `Imported ${parsed.nodes.length} nodes & ${parsed.edges.length} edges.`);
        } else {
          showToast('err', 'Invalid workflow JSON format.');
        }
      } catch {
        showToast('err', 'Failed to parse workflow JSON file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const updateSelectedNode = (updater: (node: WorkflowNode) => WorkflowNode) => {
    if (!selectedNodeId) return;
    setNodes((prev) => prev.map((n) => (n.id === selectedNodeId ? updater(n) : n)));
    setRunResult(null);
  };

  const getNodeIcon = (node: WorkflowNode) => {
    if (node.kind === 'trigger') return <Zap className="w-4 h-4 text-amber-400" />;
    if (node.kind === 'logic') return <GitBranch className="w-4 h-4 text-blue-400" />;
    switch (node.toolId) {
      case 'background-remover':
        return <ImageIcon className="w-4 h-4 text-red-400" />;
      case 'pdf-compressor':
        return <FileText className="w-4 h-4 text-red-400" />;
      case 'image-converter':
        return <RefreshCw className="w-4 h-4 text-red-400" />;
      case 'text-translator':
        return <Languages className="w-4 h-4 text-red-400" />;
      case 'video-studio':
        return <Film className="w-4 h-4 text-red-400" />;
      case 'crypto-vault':
        return <ShieldCheck className="w-4 h-4 text-emerald-400" />;
      case 'data-formatter':
        return <Braces className="w-4 h-4 text-red-400" />;
      case 'web-monitor':
      case 'webhook-relay':
        return <Bot className="w-4 h-4 text-purple-400" />;
      default:
        return <Sparkles className="w-4 h-4 text-red-400" />;
    }
  };

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto animate-in fade-in duration-300">
      {/* Header Toolbar */}
      <div
        className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-3 ${
          isDark ? 'bg-[#10121a]/95 border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-600/15 border border-red-500/30 text-red-500 flex items-center justify-center shrink-0">
            <GitBranch className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className={`text-lg sm:text-xl font-black tracking-tight ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                Workflow DAG Visualizer
              </h1>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  dagValidation.isValid
                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                    : 'bg-red-500/15 text-red-400 border-red-500/40'
                }`}
              >
                {dagValidation.isValid
                  ? `Deadlock-Free DAG • ${nodes.length} Nodes • ${edges.length} Wires`
                  : 'Cycle Detected'}
              </span>
            </div>
            <p className={`text-xs ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>
              Connect AethexFlow tools and IF/ELSE conditional triggers into automated branchable sequences.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="workflow-preset-select" className="sr-only">
            Workflow Preset
          </label>
          <select
            id="workflow-preset-select"
            value={presetId}
            onChange={(e) => loadPreset(e.target.value)}
            className={`px-3 py-2 rounded-xl border text-xs font-semibold outline-none ${
              isDark
                ? 'border-neutral-800 bg-neutral-900 text-white'
                : 'border-neutral-200 bg-neutral-50 text-neutral-900'
            }`}
          >
            {WORKFLOW_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                Preset: {preset.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleAutoArrange}
            disabled={nodes.length === 0}
            className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-40 ${
              isDark
                ? 'border-neutral-800 bg-neutral-900/70 hover:bg-neutral-800 text-neutral-200'
                : 'border-neutral-200 bg-neutral-50 hover:bg-neutral-100 text-neutral-800'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5 text-red-500" />
            <span>Auto-Arrange</span>
          </button>

          <button
            type="button"
            onClick={handleClearCanvas}
            className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              isDark
                ? 'border-neutral-800 bg-neutral-900/70 hover:bg-neutral-800 text-neutral-300'
                : 'border-neutral-200 bg-neutral-50 hover:bg-neutral-100 text-neutral-700'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Blank Canvas</span>
          </button>

          <button
            type="button"
            onClick={handleExportWorkflow}
            className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              isDark
                ? 'border-neutral-800 bg-neutral-900/70 hover:bg-neutral-800 text-neutral-300'
                : 'border-neutral-200 bg-neutral-50 hover:bg-neutral-100 text-neutral-700'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>

          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              isDark
                ? 'border-neutral-800 bg-neutral-900/70 hover:bg-neutral-800 text-neutral-300'
                : 'border-neutral-200 bg-neutral-50 hover:bg-neutral-100 text-neutral-700'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import</span>
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json"
            onChange={handleImportWorkflow}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => setCloudDrawerOpen((v) => !v)}
            className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              cloudDrawerOpen
                ? 'border-red-500/40 bg-red-600/15 text-red-400'
                : isDark
                ? 'border-neutral-800 bg-neutral-900/70 hover:bg-neutral-800 text-neutral-300'
                : 'border-neutral-200 bg-neutral-50 hover:bg-neutral-100 text-neutral-700'
            }`}
          >
            <Cloud className="w-3.5 h-3.5 text-red-500" />
            <span>Firestore Templates ({myCloudWorkflows.length + communityWorkflows.length})</span>
          </button>

          <button
            type="button"
            onClick={handleRunWorkflow}
            disabled={isRunning || !dagValidation.isValid || nodes.length === 0}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 text-white font-bold text-xs shadow-md shadow-red-950/30 flex items-center gap-1.5 disabled:opacity-40 transition-all"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{isRunning ? 'Running...' : 'Run Sequence'}</span>
          </button>
        </div>
      </div>

      {/* Reusable Firestore Workflow Templates Manager */}
      {cloudDrawerOpen && (
        <div
          className={`p-4 rounded-2xl border space-y-4 ${
            isDark ? 'bg-[#10121a]/95 border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'
          }`}
        >
          {/* Current Canvas Template Snapshot Summary */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-neutral-800/50">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-400">
                <Layers className="w-3.5 h-3.5" />
                Save Current DAG as Reusable Firestore Template
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                  isDark ? 'border-neutral-700 bg-neutral-900 text-neutral-300' : 'border-neutral-200 bg-neutral-100 text-neutral-700'
                }`}
              >
                {currentGraphSummary.complexity} • {currentGraphSummary.nodesCount} Nodes • {currentGraphSummary.edgesCount} Wires •{' '}
                {currentGraphSummary.logicBranchesCount} IF/ELSE Branch(es)
              </span>
              {activeTemplateId && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  Editing Loaded Template
                </span>
              )}
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-neutral-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoArrangeOnLoad}
                onChange={(e) => setAutoArrangeOnLoad(e.target.checked)}
                className="rounded border-neutral-700 accent-red-600"
              />
              Auto-arrange layout on load
            </label>
          </div>

          <div className="space-y-3 pb-3 border-b border-neutral-800/60">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              <div>
                <label htmlFor="cloud-wf-name" className="text-[11px] font-semibold text-neutral-400 block mb-1">
                  Template Name
                </label>
                <input
                  id="cloud-wf-name"
                  type="text"
                  value={cloudWorkflowName}
                  onChange={(e) => setCloudWorkflowName(e.target.value)}
                  placeholder="e.g. Multi-Branch PDF Vault"
                  className={`w-full px-3 py-1.5 rounded-xl border text-xs outline-none focus:border-red-500 ${
                    isDark ? 'border-neutral-800 bg-neutral-900 text-white' : 'border-neutral-200 bg-neutral-50 text-neutral-900'
                  }`}
                />
              </div>
              <div>
                <label htmlFor="cloud-wf-desc" className="text-[11px] font-semibold text-neutral-400 block mb-1">
                  Description
                </label>
                <input
                  id="cloud-wf-desc"
                  type="text"
                  value={cloudWorkflowDesc}
                  onChange={(e) => setCloudWorkflowDesc(e.target.value)}
                  placeholder="What does this DAG automate?"
                  className={`w-full px-3 py-1.5 rounded-xl border text-xs outline-none focus:border-red-500 ${
                    isDark ? 'border-neutral-800 bg-neutral-900 text-white' : 'border-neutral-200 bg-neutral-50 text-neutral-900'
                  }`}
                />
              </div>
              <div>
                <label htmlFor="cloud-wf-cat" className="text-[11px] font-semibold text-neutral-400 block mb-1">
                  Category
                </label>
                <select
                  id="cloud-wf-cat"
                  value={cloudCategory}
                  onChange={(e) => setCloudCategory(e.target.value)}
                  className={`w-full px-3 py-1.5 rounded-xl border text-xs outline-none focus:border-red-500 ${
                    isDark ? 'border-neutral-800 bg-neutral-900 text-white' : 'border-neutral-200 bg-neutral-50 text-neutral-900'
                  }`}
                >
                  <option value="Automation">Automation</option>
                  <option value="Document Triage">Document Triage</option>
                  <option value="Video & Media">Video &amp; Media</option>
                  <option value="Security & Crypto">Security &amp; Crypto</option>
                  <option value="Monitoring">Monitoring</option>
                  <option value="Multi-Branch Logic">Multi-Branch Logic</option>
                </select>
              </div>
              <div>
                <label htmlFor="cloud-wf-tags" className="text-[11px] font-semibold text-neutral-400 block mb-1">
                  Tags (comma separated)
                </label>
                <input
                  id="cloud-wf-tags"
                  type="text"
                  value={cloudWorkflowTags}
                  onChange={(e) => setCloudWorkflowTags(e.target.value)}
                  placeholder="pdf, crypto, branching"
                  className={`w-full px-3 py-1.5 rounded-xl border text-xs outline-none focus:border-red-500 ${
                    isDark ? 'border-neutral-800 bg-neutral-900 text-white' : 'border-neutral-200 bg-neutral-50 text-neutral-900'
                  }`}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {user ? (
                <>
                  {activeTemplateId && (
                    <button
                      type="button"
                      disabled={isSavingCloud || !cloudWorkflowName.trim()}
                      onClick={async () => {
                        setIsSavingCloud(true);
                        try {
                          await saveUserWorkflow(user.uid, {
                            id: activeTemplateId,
                            name: cloudWorkflowName,
                            description: cloudWorkflowDesc,
                            category: cloudCategory,
                            tags: cloudWorkflowTags,
                            nodes,
                            edges,
                            samplePayload: payloadText,
                            isPublic: false,
                          });
                          showToast('ok', `Updated template "${cloudWorkflowName}" in Firestore.`);
                          onLogActivity?.(`Updated Firestore DAG template "${cloudWorkflowName}"`);
                        } catch (err) {
                          showToast('err', err instanceof Error ? err.message : 'Failed to update Firestore template.');
                        } finally {
                          setIsSavingCloud(false);
                        }
                      }}
                      className="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-40"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Update Template</span>
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={isSavingCloud || !cloudWorkflowName.trim()}
                    onClick={async () => {
                      setIsSavingCloud(true);
                      try {
                        const createdId = await saveUserWorkflow(user.uid, {
                          name: cloudWorkflowName,
                          description: cloudWorkflowDesc,
                          category: cloudCategory,
                          tags: cloudWorkflowTags,
                          nodes,
                          edges,
                          samplePayload: payloadText,
                          isPublic: false,
                        });
                        setActiveTemplateId(createdId);
                        showToast('ok', `Saved "${cloudWorkflowName}" as a reusable Firestore template.`);
                        onLogActivity?.(`Saved Workflow DAG template "${cloudWorkflowName}"`);
                      } catch (err) {
                        showToast('err', err instanceof Error ? err.message : 'Failed to save template to Firestore.');
                      } finally {
                        setIsSavingCloud(false);
                      }
                    }}
                    className="px-3.5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-40"
                  >
                    <Save className="w-3.5 h-3.5 text-red-400" />
                    <span>{activeTemplateId ? 'Save as New' : 'Save Private Template'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={isSavingCloud || !cloudWorkflowName.trim()}
                    onClick={async () => {
                      setIsSavingCloud(true);
                      try {
                        const author = profile?.displayName || user.displayName || 'Creator';
                        await publishCommunityWorkflow(user.uid, author, {
                          name: cloudWorkflowName,
                          description: cloudWorkflowDesc,
                          category: cloudCategory,
                          tags: cloudWorkflowTags,
                          nodes,
                          edges,
                          samplePayload: payloadText,
                        });
                        showToast('ok', `Published "${cloudWorkflowName}" to Public Template Library!`);
                        onLogActivity?.(`Published reusable DAG template "${cloudWorkflowName}"`);
                      } catch (err) {
                        showToast('err', err instanceof Error ? err.message : 'Failed to publish community template.');
                      } finally {
                        setIsSavingCloud(false);
                      }
                    }}
                    className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-40"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>Publish Public Template</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={signInWithGoogle}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Cloud className="w-3.5 h-3.5" />
                  <span>Sign in with Google to Save &amp; Publish Templates</span>
                </button>
              )}
            </div>
          </div>

          {/* Search & Category Filter for Firestore Templates */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                aria-label="Search Firestore workflow templates"
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                placeholder="Filter Firestore templates by name, tool, or tag..."
                className={`w-full pl-8 pr-3 py-1.5 rounded-xl border text-xs outline-none focus:border-red-500 ${
                  isDark ? 'border-neutral-800 bg-neutral-900 text-white' : 'border-neutral-200 bg-neutral-50 text-neutral-900'
                }`}
              />
            </div>
            <select
              aria-label="Filter templates by category"
              value={templateCategoryFilter}
              onChange={(e) => setTemplateCategoryFilter(e.target.value)}
              className={`px-3 py-1.5 rounded-xl border text-xs outline-none focus:border-red-500 ${
                isDark ? 'border-neutral-800 bg-neutral-900 text-white' : 'border-neutral-200 bg-neutral-50 text-neutral-900'
              }`}
            >
              <option value="All">All Categories</option>
              <option value="Automation">Automation</option>
              <option value="Document Triage">Document Triage</option>
              <option value="Video & Media">Video &amp; Media</option>
              <option value="Security & Crypto">Security &amp; Crypto</option>
              <option value="Monitoring">Monitoring</option>
              <option value="Multi-Branch Logic">Multi-Branch Logic</option>
              <option value="Official Starter">Official Starter</option>
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* My Private Reusable Cloud Templates */}
            <div className="space-y-2">
              <h3 className={`font-bold flex items-center gap-1.5 ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                <Cloud className="w-3.5 h-3.5 text-red-500" />
                My Saved Cloud Templates ({filteredPrivateTemplates.length})
              </h3>
              {filteredPrivateTemplates.length === 0 ? (
                <p className="text-[11px] text-neutral-400">
                  {user
                    ? templateSearch || templateCategoryFilter !== 'All'
                      ? 'No saved private templates match your current filter.'
                      : 'No private templates saved yet. Configure a DAG + payload and click "Save Private Template".'
                    : 'Sign in with Google to save, update, and reload your private reusable DAG templates.'}
                </p>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {filteredPrivateTemplates.map((wf) => {
                    const tplMeta = summarizeWorkflowTemplate(wf.graph.nodes, wf.graph.edges);
                    return (
                      <div
                        key={wf.id}
                        className={`p-3 rounded-xl border space-y-2 ${
                          activeTemplateId === wf.id
                            ? 'border-emerald-500/50 bg-emerald-950/15'
                            : isDark
                            ? 'border-neutral-800 bg-neutral-900/50'
                            : 'border-neutral-200 bg-neutral-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className={`font-bold truncate ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                                {wf.name}
                              </p>
                              <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 text-[9px] font-semibold">
                                {wf.category}
                              </span>
                            </div>
                            <p className="text-[10px] text-neutral-400 truncate mt-0.5">
                              {tplMeta.complexity} • {wf.nodesCount} nodes • {wf.edgesCount} wires •{' '}
                              {wf.samplePayload && Object.keys(wf.samplePayload).length > 0
                                ? 'Includes Sample Payload'
                                : 'Graph Only'}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => loadTemplateIntoCanvas(wf, 'private', false)}
                              className="px-2.5 py-1 rounded-lg bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white font-semibold text-[11px]"
                            >
                              Load
                            </button>
                            <button
                              type="button"
                              title="Clone as fresh copy"
                              aria-label={`Clone template ${wf.name}`}
                              onClick={() => loadTemplateIntoCanvas(wf, 'private', true)}
                              className="p-1 rounded-lg text-neutral-400 hover:text-white"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete workflow ${wf.name}`}
                              onClick={async () => {
                                try {
                                  await deleteUserWorkflow(user!.uid, wf.id);
                                  if (activeTemplateId === wf.id) setActiveTemplateId(null);
                                  showToast('ok', `Deleted template "${wf.name}".`);
                                } catch (err) {
                                  showToast('err', err instanceof Error ? err.message : 'Failed to delete template.');
                                }
                              }}
                              className="p-1 rounded-lg text-neutral-400 hover:text-red-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        {wf.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {wf.tags.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-neutral-800/80 text-neutral-300 text-[9px]"
                              >
                                <Tag className="w-2.5 h-2.5 text-red-400" />
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Public Community Reusable Templates */}
            <div className="space-y-2">
              <h3 className={`font-bold flex items-center gap-1.5 ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                <Globe className="w-3.5 h-3.5 text-emerald-500" />
                Public Reusable Template Library ({filteredPublicTemplates.length})
              </h3>
              {filteredPublicTemplates.length === 0 ? (
                <p className="text-[11px] text-neutral-400">
                  {templateSearch || templateCategoryFilter !== 'All'
                    ? 'No public templates match your current filter.'
                    : 'No public templates in Firestore yet. Sign in and click "Publish Public Template" (or run Owner Go-Live Autopilot in Settings).'}
                </p>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {filteredPublicTemplates.map((pwf) => {
                    const tplMeta = summarizeWorkflowTemplate(pwf.graph.nodes, pwf.graph.edges);
                    return (
                      <div
                        key={pwf.id}
                        className={`p-3 rounded-xl border space-y-2 ${
                          isDark ? 'border-neutral-800 bg-neutral-900/50' : 'border-neutral-200 bg-neutral-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className={`font-bold truncate ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                                {pwf.name}
                              </p>
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-semibold">
                                {pwf.category}
                              </span>
                            </div>
                            <p className="text-[10px] text-neutral-400 truncate mt-0.5">
                              by {pwf.authorName} • {tplMeta.nodesCount} nodes ({tplMeta.logicBranchesCount} IF) • {pwf.runsCount} loads
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => loadTemplateIntoCanvas(pwf, 'public', true)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white font-semibold text-[11px]"
                            >
                              Use Template
                            </button>
                            {(user?.uid === pwf.authorUid || isAdmin) && (
                              <button
                                type="button"
                                aria-label={`Remove community workflow ${pwf.name}`}
                                onClick={async () => {
                                  try {
                                    await deletePublicCommunityWorkflow(pwf.id);
                                    showToast('ok', `Removed "${pwf.name}" from Public Library.`);
                                  } catch (err) {
                                    showToast('err', err instanceof Error ? err.message : 'Failed to remove public template.');
                                  }
                                }}
                                className="p-1 rounded-lg text-neutral-400 hover:text-red-400"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                        {pwf.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {pwf.tags.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-neutral-800/80 text-neutral-300 text-[9px]"
                              >
                                <Tag className="w-2.5 h-2.5 text-emerald-400" />
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Status Banner */}
      {statusBanner && (
        <div
          className={`px-4 py-2.5 rounded-xl border text-xs font-medium flex items-center justify-between ${
            statusBanner.type === 'ok'
              ? isDark
                ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300'
                : 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : isDark
              ? 'border-red-500/40 bg-red-950/30 text-red-300'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusBanner.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{statusBanner.message}</span>
          </div>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setStatusBanner(null)}
            className="opacity-70 hover:opacity-100"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Pending Connection Guidance Banner */}
      {pendingConn && (
        <div className="px-4 py-2.5 rounded-xl border border-blue-500/40 bg-blue-950/30 text-blue-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-blue-400" />
            <span>
              Connecting from <strong>{nodes.find((n) => n.id === pendingConn.sourceId)?.title}</strong> (
              <span className="uppercase font-mono">{pendingConn.branch}</span> branch) — click any target node&apos;s{' '}
              <strong>IN</strong> port to complete wire.
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setPendingConn(null);
              setPointerPos(null);
            }}
            className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold"
          >
            Cancel Wire
          </button>
        </div>
      )}

      {/* Main 3-Column Studio Grid: Node Palette | Interactive Canvas | Inspector & Trace */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Left: Tool & Logic Node Library */}
        <div
          className={`xl:col-span-3 p-3.5 rounded-2xl border space-y-3 ${
            isDark ? 'bg-[#10121a]/95 border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'
          }`}
        >
          <div>
            <h2 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-neutral-300' : 'text-neutral-700'}`}>
              Add Nodes
            </h2>
            <p className="text-[11px] text-neutral-400">Click to place on canvas</p>
          </div>

          <div className="space-y-1.5 max-h-[560px] overflow-y-auto pr-1">
            {WORKFLOW_NODE_PALETTE.map((tpl) => (
              <button
                type="button"
                key={tpl.toolId || tpl.title}
                onClick={() => handleAddNode(tpl)}
                className={`w-full p-2.5 rounded-xl border text-left transition-all flex items-start gap-2.5 group ${
                  tpl.kind === 'logic'
                    ? isDark
                      ? 'border-blue-500/30 bg-blue-950/20 hover:bg-blue-900/30'
                      : 'border-blue-200 bg-blue-50 hover:bg-blue-100'
                    : isDark
                    ? 'border-neutral-800 bg-neutral-900/50 hover:border-red-500/40 hover:bg-neutral-800'
                    : 'border-neutral-200 bg-neutral-50 hover:border-red-300 hover:bg-white'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  <Plus className="w-3.5 h-3.5 text-red-500 group-hover:scale-110 transition-transform" />
                </div>
                <div className="min-w-0">
                  <span
                    className={`text-xs font-bold block leading-snug ${
                      isDark ? 'text-white' : 'text-neutral-900'
                    }`}
                  >
                    {tpl.title}
                  </span>
                  <span className="text-[10px] text-neutral-400 block leading-snug">{tpl.subtitle}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Center: Interactive Node & Edge SVG Canvas */}
        <div
          className={`xl:col-span-6 rounded-2xl border overflow-hidden relative flex flex-col ${
            isDark ? 'bg-[#090b10] border-neutral-800' : 'bg-neutral-50 border-neutral-200 shadow-inner'
          }`}
        >
          {/* Canvas Top Sub-bar */}
          <div
            className={`px-4 py-2 border-b flex items-center justify-between text-xs ${
              isDark ? 'bg-[#0f1119] border-neutral-800 text-neutral-400' : 'bg-white border-neutral-200 text-neutral-600'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="font-semibold">Drag nodes to position • Click OUT/TRUE/FALSE -&gt; IN to wire</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Zoom out canvas"
                onClick={() => setZoom((z) => Math.max(0.7, Number((z - 0.1).toFixed(2))))}
                className={`p-1 rounded border ${isDark ? 'border-neutral-800 hover:bg-neutral-800' : 'border-neutral-200 hover:bg-neutral-100'}`}
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono text-[11px] w-11 text-center">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                aria-label="Zoom in canvas"
                onClick={() => setZoom((z) => Math.min(1.4, Number((z + 0.1).toFixed(2))))}
                className={`p-1 rounded border ${isDark ? 'border-neutral-800 hover:bg-neutral-800' : 'border-neutral-200 hover:bg-neutral-100'}`}
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Scrollable Graph Canvas Viewport */}
          <div
            ref={canvasRef}
            data-testid="workflow-dag-canvas"
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setSelectedEdgeId(null);
              }
            }}
            className="relative h-[560px] overflow-auto select-none"
            style={{
              backgroundImage: isDark
                ? 'radial-gradient(rgba(148,163,184,0.14) 1px, transparent 1px)'
                : 'radial-gradient(rgba(100,116,139,0.22) 1px, transparent 1px)',
              backgroundSize: '20px 20px',
            }}
          >
            <div
              className="relative"
              style={{
                width: `${1380 * zoom}px`,
                height: `${760 * zoom}px`,
              }}
            >
              <div
                className="relative origin-top-left"
                style={{
                  width: '1380px',
                  height: '760px',
                  transform: `scale(${zoom})`,
                }}
              >
                {/* SVG Edges Layer */}
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  viewBox="0 0 1380 760"
                >
                  <defs>
                    <marker id="arrow-always" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                      <path d="M 0 0 L 8 4 L 0 8 z" fill="#94a3b8" />
                    </marker>
                    <marker id="arrow-true" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                      <path d="M 0 0 L 8 4 L 0 8 z" fill="#10b981" />
                    </marker>
                    <marker id="arrow-false" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                      <path d="M 0 0 L 8 4 L 0 8 z" fill="#f59e0b" />
                    </marker>
                  </defs>

                  {edges.map((edge) => {
                    const src = nodes.find((n) => n.id === edge.sourceId);
                    const tgt = nodes.find((n) => n.id === edge.targetId);
                    if (!src || !tgt) return null;

                    const p1 = getPortPosition(src, 'out', edge.branch);
                    const p2 = getPortPosition(tgt, 'in');
                    const d = buildBezierPath(p1.x, p1.y, p2.x, p2.y);

                    const srcStep = stepByNodeId.get(src.id);
                    const tgtStep = stepByNodeId.get(tgt.id);
                    const wasActivePath =
                      srcStep?.status === 'executed' &&
                      tgtStep?.status === 'executed' &&
                      (edge.branch === 'always' || srcStep.branchTaken === edge.branch);

                    const stroke =
                      edge.branch === 'true'
                        ? '#10b981'
                        : edge.branch === 'false'
                        ? '#f59e0b'
                        : wasActivePath
                        ? '#ef4444'
                        : isDark
                        ? '#64748b'
                        : '#94a3b8';

                    const markerEnd =
                      edge.branch === 'true'
                        ? 'url(#arrow-true)'
                        : edge.branch === 'false'
                        ? 'url(#arrow-false)'
                        : 'url(#arrow-always)';

                    const midX = (p1.x + p2.x) / 2;
                    const midY = (p1.y + p2.y) / 2;

                    return (
                      <g key={edge.id} className="pointer-events-auto cursor-pointer">
                        {/* Invisible wide hit path for easy clicking */}
                        <path
                          d={d}
                          fill="none"
                          stroke="transparent"
                          strokeWidth={14}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setSelectedEdgeId(edge.id);
                            setSelectedNodeId(null);
                          }}
                        />
                        <path
                          d={d}
                          fill="none"
                          stroke={stroke}
                          strokeWidth={selectedEdgeId === edge.id ? 3.5 : wasActivePath ? 3 : 2}
                          strokeDasharray={tgtStep?.status === 'skipped' ? '6 5' : undefined}
                          markerEnd={markerEnd}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setSelectedEdgeId(edge.id);
                            setSelectedNodeId(null);
                          }}
                        />
                        {edge.branch !== 'always' && (
                          <g
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setSelectedEdgeId(edge.id);
                              setSelectedNodeId(null);
                            }}
                          >
                            <rect
                              x={midX - 22}
                              y={midY - 10}
                              width={44}
                              height={20}
                              rx={6}
                              fill={edge.branch === 'true' ? '#065f46' : '#78350f'}
                              stroke={stroke}
                              strokeWidth={1}
                            />
                            <text
                              x={midX}
                              y={midY + 4}
                              textAnchor="middle"
                              fill="#ffffff"
                              fontSize="10"
                              fontWeight="700"
                            >
                              {edge.branch.toUpperCase()}
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}

                  {/* Active preview connection line */}
                  {pendingConn && pointerPos && (
                    <path
                      d={buildBezierPath(
                        pendingConn.startX,
                        pendingConn.startY,
                        pointerPos.x,
                        pointerPos.y
                      )}
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth={2.5}
                      strokeDasharray="6 4"
                    />
                  )}
                </svg>

                {/* Positioned Interactive Nodes */}
                {nodes.map((node) => {
                  const isSelected = selectedNodeId === node.id;
                  const step = stepByNodeId.get(node.id);
                  const borderColor = isSelected
                    ? 'border-red-500 ring-2 ring-red-500/30'
                    : step?.status === 'executed'
                    ? 'border-emerald-500/70'
                    : step?.status === 'skipped'
                    ? 'border-neutral-700 opacity-65'
                    : node.kind === 'logic'
                    ? isDark
                      ? 'border-blue-500/40'
                      : 'border-blue-300'
                    : isDark
                    ? 'border-neutral-800'
                    : 'border-neutral-200';

                  return (
                    <div
                      key={node.id}
                      data-testid={`workflow-node-${node.id}`}
                      onPointerDown={(e) => {
                        if ((e.target as HTMLElement).closest('button')) return;
                        setSelectedNodeId(node.id);
                        setSelectedEdgeId(null);
                        dragRef.current = {
                          nodeId: node.id,
                          startClientX: e.clientX,
                          startClientY: e.clientY,
                          origX: node.x,
                          origY: node.y,
                        };
                      }}
                      style={{
                        left: `${node.x}px`,
                        top: `${node.y}px`,
                        width: `${NODE_WIDTH}px`,
                        height: `${NODE_HEIGHT}px`,
                      }}
                      className={`absolute rounded-2xl border p-3 flex flex-col justify-between cursor-grab active:cursor-grabbing shadow-lg transition-shadow ${
                        isDark ? 'bg-[#121520] text-white' : 'bg-white text-neutral-900'
                      } ${borderColor}`}
                    >
                      {/* Input Port */}
                      <button
                        type="button"
                        aria-label={`Connect input to ${node.title}`}
                        title={
                          pendingConn
                            ? `Complete connection to ${node.title}`
                            : `Input port (${node.title})`
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          if (pendingConn) {
                            handleFinishConnect(node.id);
                          }
                        }}
                        className={`absolute -left-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 flex items-center justify-center text-[8px] font-bold transition-transform ${
                          pendingConn && pendingConn.sourceId !== node.id
                            ? 'bg-blue-500 border-white text-white scale-110 animate-pulse'
                            : isDark
                            ? 'bg-neutral-900 border-neutral-500 text-neutral-300 hover:border-red-400'
                            : 'bg-white border-neutral-400 text-neutral-700 hover:border-red-500'
                        }`}
                      >
                        IN
                      </button>

                      {/* Node Card Header */}
                      <div className="flex items-start justify-between gap-2 pl-1 pr-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                              node.kind === 'logic'
                                ? 'bg-blue-500/15'
                                : node.kind === 'trigger'
                                ? 'bg-amber-500/15'
                                : 'bg-red-500/15'
                            }`}
                          >
                            {getNodeIcon(node)}
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs font-bold block truncate">{node.title}</span>
                            <span className="text-[10px] text-neutral-400 block truncate">
                              {node.subtitle}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          aria-label={`Delete ${node.title}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteNode(node.id);
                          }}
                          className="text-neutral-400 hover:text-red-400 p-0.5 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Node Footer / Condition or Step Status */}
                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-neutral-800/40 text-[10px] pl-1 pr-2">
                        {node.kind === 'logic' && node.config.condition ? (
                          <span className="font-mono text-blue-400 truncate">
                            IF {node.config.condition.field} {node.config.condition.operator}{' '}
                            {node.config.condition.value}
                          </span>
                        ) : (
                          <span className="uppercase tracking-wider font-semibold text-neutral-400">
                            {node.kind}
                          </span>
                        )}

                        {step && (
                          <span
                            className={`px-1.5 py-0.5 rounded font-bold uppercase ${
                              step.status === 'executed'
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : step.status === 'skipped'
                                ? 'bg-neutral-700/50 text-neutral-400'
                                : 'bg-red-500/20 text-red-400'
                            }`}
                          >
                            {step.branchTaken
                              ? `${step.branchTaken.toUpperCase()}`
                              : step.status}
                          </span>
                        )}
                      </div>

                      {/* Output Ports */}
                      {node.kind === 'logic' ? (
                        <>
                          <button
                            type="button"
                            aria-label={`Connect TRUE branch from ${node.title}`}
                            title="Connect TRUE branch"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartConnect(node, 'true');
                            }}
                            className="absolute -right-3 top-[28px] px-1.5 py-0.5 rounded-full bg-emerald-600 hover:bg-emerald-500 border border-white/80 text-[9px] font-bold text-white shadow"
                          >
                            T
                          </button>
                          <button
                            type="button"
                            aria-label={`Connect FALSE branch from ${node.title}`}
                            title="Connect FALSE branch"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartConnect(node, 'false');
                            }}
                            className="absolute -right-3 top-[68px] px-1.5 py-0.5 rounded-full bg-amber-600 hover:bg-amber-500 border border-white/80 text-[9px] font-bold text-white shadow"
                          >
                            F
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          aria-label={`Connect output from ${node.title}`}
                          title="Connect output to another node"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartConnect(node, 'always');
                          }}
                          className="absolute -right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-red-600 hover:bg-red-500 border-2 border-white text-white flex items-center justify-center shadow"
                        >
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Node/Edge Inspector + Execution Trace */}
        <div
          className={`xl:col-span-3 rounded-2xl border p-4 space-y-4 ${
            isDark ? 'bg-[#10121a]/95 border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'
          }`}
        >
          {/* Inspector / Trace Toggle */}
          <div className={`grid grid-cols-2 p-1 rounded-xl border ${isDark ? 'bg-neutral-900 border-neutral-800' : 'bg-neutral-100 border-neutral-200'}`}>
            <button
              type="button"
              onClick={() => setRightTab('inspector')}
              className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                rightTab === 'inspector'
                  ? 'bg-red-600 text-white shadow'
                  : isDark
                  ? 'text-neutral-400 hover:text-white'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Node & Payload
            </button>
            <button
              type="button"
              onClick={() => setRightTab('trace')}
              className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                rightTab === 'trace'
                  ? 'bg-red-600 text-white shadow'
                  : isDark
                  ? 'text-neutral-400 hover:text-white'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Execution Trace
            </button>
          </div>

          {rightTab === 'inspector' ? (
            <div className="space-y-4">
              {/* Edge Inspector if edge clicked */}
              {selectedEdge && (
                <div className="p-3.5 rounded-xl border border-blue-500/30 bg-blue-950/20 space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-blue-300">Selected Connection</span>
                    <button
                      type="button"
                      onClick={() => {
                        setEdges((prev) => prev.filter((e) => e.id !== selectedEdge.id));
                        setSelectedEdgeId(null);
                      }}
                      className="px-2 py-1 rounded bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white text-[11px] font-semibold"
                    >
                      Delete Wire
                    </button>
                  </div>
                  <p className="text-[11px] text-neutral-300">
                    {nodes.find((n) => n.id === selectedEdge.sourceId)?.title} -&gt;{' '}
                    {nodes.find((n) => n.id === selectedEdge.targetId)?.title}
                  </p>
                  <div className="space-y-1">
                    <label htmlFor="edge-branch-select" className="text-[11px] text-neutral-400 block">
                      Branch Condition
                    </label>
                    <select
                      id="edge-branch-select"
                      value={selectedEdge.branch}
                      onChange={(e) => {
                        const br = e.target.value as EdgeBranch;
                        setEdges((prev) =>
                          prev.map((edge) =>
                            edge.id === selectedEdge.id ? { ...edge, branch: br } : edge
                          )
                        );
                      }}
                      className="w-full p-2 rounded-lg border border-neutral-700 bg-neutral-900 text-xs text-white"
                    >
                      <option value="always">Always</option>
                      <option value="true">TRUE (Condition Passed)</option>
                      <option value="false">FALSE (Condition Failed)</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Selected Node Configuration */}
              {selectedNode ? (
                <div className="space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-red-500" />
                      Selected Node
                    </span>
                    {selectedNode.kind === 'tool' && selectedNode.toolId && (
                      <button
                        type="button"
                        onClick={() => onOpenTool(selectedNode.toolId!)}
                        className="text-[11px] font-semibold text-red-400 hover:text-red-300 flex items-center gap-1"
                      >
                        <span>Open Tool</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  <div>
                    <label htmlFor="node-title-input" className="text-[11px] text-neutral-400 block mb-1">
                      Node Label
                    </label>
                    <input
                      id="node-title-input"
                      type="text"
                      value={selectedNode.title}
                      onChange={(e) =>
                        updateSelectedNode((n) => ({ ...n, title: e.target.value }))
                      }
                      className={`w-full px-3 py-2 rounded-xl border text-xs outline-none focus:border-red-500 ${
                        isDark
                          ? 'border-neutral-800 bg-neutral-900 text-white'
                          : 'border-neutral-200 bg-neutral-50 text-neutral-900'
                      }`}
                    />
                  </div>

                  {/* Conditional Logic Rule Editor */}
                  {selectedNode.kind === 'logic' && (
                    <div
                      className={`p-3 rounded-xl border space-y-2.5 ${
                        isDark ? 'border-blue-500/30 bg-blue-950/15' : 'border-blue-200 bg-blue-50'
                      }`}
                    >
                      <span className="font-bold text-blue-400 block">Conditional Trigger Rule (IF)</span>
                      <div>
                        <label htmlFor="cond-field" className="text-[11px] text-neutral-400 block mb-1">
                          Payload Field
                        </label>
                        <input
                          id="cond-field"
                          type="text"
                          value={selectedNode.config.condition?.field || ''}
                          onChange={(e) =>
                            updateSelectedNode((n) => ({
                              ...n,
                              config: {
                                ...n.config,
                                condition: {
                                  field: e.target.value,
                                  operator: n.config.condition?.operator || 'gt',
                                  value: n.config.condition?.value || '',
                                },
                              },
                            }))
                          }
                          placeholder="e.g. sizeKb, format, status"
                          className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono ${
                            isDark
                              ? 'border-neutral-700 bg-neutral-900 text-white'
                              : 'border-neutral-300 bg-white text-neutral-900'
                          }`}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label htmlFor="cond-operator" className="text-[11px] text-neutral-400 block mb-1">
                            Operator
                          </label>
                          <select
                            id="cond-operator"
                            value={selectedNode.config.condition?.operator || 'gt'}
                            onChange={(e) =>
                              updateSelectedNode((n) => ({
                                ...n,
                                config: {
                                  ...n.config,
                                  condition: {
                                    field: n.config.condition?.field || 'sizeKb',
                                    operator: e.target.value as LogicOperator,
                                    value: n.config.condition?.value || '',
                                  },
                                },
                              }))
                            }
                            className={`w-full px-2 py-1.5 rounded-lg border text-xs ${
                              isDark
                                ? 'border-neutral-700 bg-neutral-900 text-white'
                                : 'border-neutral-300 bg-white text-neutral-900'
                            }`}
                          >
                            <option value="gt">Greater Than (&gt;)</option>
                            <option value="lt">Less Than (&lt;)</option>
                            <option value="equals">Equals (==)</option>
                            <option value="contains">Contains</option>
                            <option value="truthy">Is Truthy</option>
                          </select>
                        </div>

                        <div>
                          <label htmlFor="cond-value" className="text-[11px] text-neutral-400 block mb-1">
                            Compare Value
                          </label>
                          <input
                            id="cond-value"
                            type="text"
                            value={selectedNode.config.condition?.value || ''}
                            onChange={(e) =>
                              updateSelectedNode((n) => ({
                                ...n,
                                config: {
                                  ...n.config,
                                  condition: {
                                    field: n.config.condition?.field || 'sizeKb',
                                    operator: n.config.condition?.operator || 'gt',
                                    value: e.target.value,
                                  },
                                },
                              }))
                            }
                            className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono ${
                              isDark
                                ? 'border-neutral-700 bg-neutral-900 text-white'
                                : 'border-neutral-300 bg-white text-neutral-900'
                            }`}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Quick Accessible Connection Builder */}
                  <div
                    className={`p-3 rounded-xl border space-y-2 ${
                      isDark ? 'border-neutral-800 bg-neutral-900/40' : 'border-neutral-200 bg-neutral-50'
                    }`}
                  >
                    <span className="font-bold text-[11px] uppercase tracking-wider text-neutral-400 block">
                      Wire Outgoing Edge
                    </span>
                    <div className="grid grid-cols-1 gap-2">
                      <select
                        aria-label="Target node to connect"
                        value={connectTargetSelect}
                        onChange={(e) => setConnectTargetSelect(e.target.value)}
                        className={`w-full px-2.5 py-1.5 rounded-lg border text-xs ${
                          isDark
                            ? 'border-neutral-700 bg-neutral-900 text-white'
                            : 'border-neutral-300 bg-white text-neutral-900'
                        }`}
                      >
                        <option value="">Select downstream node...</option>
                        {nodes
                          .filter((n) => n.id !== selectedNode.id)
                          .map((n) => (
                            <option key={n.id} value={n.id}>
                              {n.title}
                            </option>
                          ))}
                      </select>

                      {selectedNode.kind === 'logic' && (
                        <select
                          aria-label="Branch path"
                          value={connectBranchSelect}
                          onChange={(e) => setConnectBranchSelect(e.target.value as EdgeBranch)}
                          className={`w-full px-2.5 py-1.5 rounded-lg border text-xs ${
                            isDark
                              ? 'border-neutral-700 bg-neutral-900 text-white'
                              : 'border-neutral-300 bg-white text-neutral-900'
                          }`}
                        >
                          <option value="true">When Condition is TRUE</option>
                          <option value="false">When Condition is FALSE</option>
                          <option value="always">Always</option>
                        </select>
                      )}

                      <button
                        type="button"
                        disabled={!connectTargetSelect}
                        onClick={() => {
                          if (!connectTargetSelect) return;
                          const branch =
                            selectedNode.kind === 'logic' ? connectBranchSelect : 'always';
                          if (handleCreateConnection(selectedNode.id, connectTargetSelect, branch)) {
                            setConnectTargetSelect('');
                          }
                        }}
                        className="w-full py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/30 font-semibold text-xs disabled:opacity-40 transition-colors"
                      >
                        Connect Node
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-neutral-400">
                  Select a node or wire on the canvas to configure triggers and tool parameters.
                </p>
              )}

              {/* Trigger Test Payload JSON Editor */}
              <div className="pt-3 border-t border-neutral-800/60 space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="trigger-payload-json" className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                    Trigger Test Payload (JSON)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const toggledSize = payloadText.includes('1240') ? 220 : 1240;
                      setPayloadText(
                        JSON.stringify(
                          {
                            fileName: toggledSize > 500 ? 'Q4_Spec.pdf' : 'Compact.json',
                            format: toggledSize > 500 ? 'pdf' : 'json',
                            sizeKb: toggledSize,
                            text: 'Assalam-o-Alaikum, release ready.',
                            status: 200,
                          },
                          null,
                          2
                        )
                      );
                    }}
                    className="text-[10px] font-semibold text-blue-400 hover:text-blue-300"
                  >
                    Flip SizeKb
                  </button>
                </div>
                <textarea
                  id="trigger-payload-json"
                  rows={6}
                  value={payloadText}
                  onChange={(e) => setPayloadText(e.target.value)}
                  className={`w-full p-2.5 rounded-xl border font-mono text-[11px] outline-none focus:border-red-500 ${
                    isDark
                      ? 'border-neutral-800 bg-[#090b10] text-neutral-200'
                      : 'border-neutral-200 bg-neutral-50 text-neutral-900'
                  }`}
                />
              </div>
            </div>
          ) : (
            /* Execution Trace Tab */
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {!runResult ? (
                <div className="p-4 rounded-xl border border-dashed border-neutral-700 text-center space-y-2 text-xs text-neutral-400">
                  <p>No run trace yet. Click &quot;Run Sequence&quot; to validate and execute the workflow.</p>
                </div>
              ) : (
                <>
                  <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-xs flex items-center justify-between">
                    <span className="font-bold text-emerald-400">
                      {runResult.steps.filter((s) => s.status === 'executed').length} Executed •{' '}
                      {runResult.steps.filter((s) => s.status === 'skipped').length} Skipped
                    </span>
                    <span className="font-mono text-[11px] text-neutral-300">
                      {runResult.totalDurationMs} ms
                    </span>
                  </div>

                  {runResult.steps.map((step, idx) => (
                    <div
                      key={step.nodeId}
                      className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                        step.status === 'executed'
                          ? isDark
                            ? 'border-emerald-500/30 bg-neutral-900/60'
                            : 'border-emerald-200 bg-emerald-50/40'
                          : step.status === 'skipped'
                          ? isDark
                            ? 'border-neutral-800 bg-neutral-900/20 opacity-70'
                            : 'border-neutral-200 bg-neutral-100 opacity-75'
                          : 'border-red-500/40 bg-red-950/20'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`font-bold ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                          {idx + 1}. {step.title}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                            step.status === 'executed'
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : step.status === 'skipped'
                              ? 'bg-neutral-700/50 text-neutral-400'
                              : 'bg-red-500/20 text-red-400'
                          }`}
                        >
                          {step.branchTaken ? `${step.branchTaken} branch` : step.status}
                        </span>
                      </div>
                      <p className={`text-[11px] ${isDark ? 'text-neutral-300' : 'text-neutral-700'}`}>
                        {step.outputSummary}
                      </p>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
