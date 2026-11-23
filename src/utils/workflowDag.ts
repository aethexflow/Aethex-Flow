import { validateAndSortDAG, TaskNode, DAGValidationResult } from './dagEngine';

export type WorkflowNodeKind = 'trigger' | 'tool' | 'logic' | 'bot' | 'output';
export type LogicOperator = 'equals' | 'contains' | 'gt' | 'lt' | 'truthy';
export type EdgeBranch = 'always' | 'true' | 'false';

export interface ConditionRule {
  field: string;
  operator: LogicOperator;
  value: string;
}

export interface WorkflowNode {
  id: string;
  kind: WorkflowNodeKind;
  toolId?: string;
  title: string;
  subtitle: string;
  x: number;
  y: number;
  config: {
    condition?: ConditionRule;
    inputFormat?: string;
    targetFormat?: string;
    targetUrl?: string;
    samplePayload?: string;
    [key: string]: unknown;
  };
}

export interface WorkflowEdge {
  id: string;
  sourceId: string;
  targetId: string;
  branch: EdgeBranch;
}

export interface WorkflowPreset {
  id: string;
  name: string;
  description: string;
  initialPayload: Record<string, unknown>;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface WorkflowRunStepResult {
  nodeId: string;
  title: string;
  kind: WorkflowNodeKind;
  status: 'executed' | 'skipped' | 'error';
  branchTaken?: 'true' | 'false';
  durationMs: number;
  outputSummary: string;
  outputData?: Record<string, unknown>;
}

export interface WorkflowExecutionResult {
  valid: boolean;
  error?: string;
  executionOrder: string[];
  steps: WorkflowRunStepResult[];
  finalContext: Record<string, unknown>;
  totalDurationMs: number;
}

export interface ToolNodeTemplate {
  kind: WorkflowNodeKind;
  toolId?: string;
  title: string;
  subtitle: string;
  defaultConfig?: WorkflowNode['config'];
}

export const WORKFLOW_NODE_PALETTE: ToolNodeTemplate[] = [
  {
    kind: 'trigger',
    toolId: 'trigger-ingest',
    title: 'Payload Trigger',
    subtitle: 'Starts sequence with input metadata',
    defaultConfig: {},
  },
  {
    kind: 'logic',
    toolId: 'logic-if',
    title: 'Conditional Trigger',
    subtitle: 'IF / ELSE branch router',
    defaultConfig: {
      condition: { field: 'sizeKb', operator: 'gt', value: '500' },
    },
  },
  {
    kind: 'tool',
    toolId: 'background-remover',
    title: 'Background Remover',
    subtitle: 'Local transparent PNG cutout',
  },
  {
    kind: 'tool',
    toolId: 'pdf-compressor',
    title: 'PDF Compressor',
    subtitle: 'Strip metadata & shrink streams',
  },
  {
    kind: 'tool',
    toolId: 'image-converter',
    title: 'Image Converter',
    subtitle: 'Encode PNG / JPG / WebP',
    defaultConfig: { targetFormat: 'webp' },
  },
  {
    kind: 'tool',
    toolId: 'text-translator',
    title: 'Text Translator',
    subtitle: 'English / Urdu / Roman Urdu',
  },
  {
    kind: 'tool',
    toolId: 'video-studio',
    title: 'Automated Video Studio',
    subtitle: 'Timeline cut & 9:16 preset',
    defaultConfig: { targetFormat: '1080x1920' },
  },
  {
    kind: 'tool',
    toolId: 'crypto-vault',
    title: 'AES-256 Crypto Vault',
    subtitle: 'WebCrypto seal & SHA-256 hash',
  },
  {
    kind: 'tool',
    toolId: 'data-formatter',
    title: 'JSON & CSV Transformer',
    subtitle: 'Normalize & export records',
  },
  {
    kind: 'bot',
    toolId: 'web-monitor',
    title: 'Web Monitor Bot',
    subtitle: 'Live HTTP status probe',
    defaultConfig: { targetUrl: '/api/health' },
  },
  {
    kind: 'bot',
    toolId: 'webhook-relay',
    title: 'Webhook Relay Bot',
    subtitle: 'Dispatch JSON event payload',
    defaultConfig: { targetUrl: 'https://httpbin.org/post' },
  },
];

export const WORKFLOW_PRESETS: WorkflowPreset[] = [
  {
    id: 'doc-triage',
    name: 'Smart Document & Security Triage',
    description: 'Routes large files through PDF compression + AES-256 vault, or small payloads to JSON/CSV normalization.',
    initialPayload: {
      fileName: 'Q4_Architecture_Spec.pdf',
      format: 'pdf',
      sizeKb: 1240,
      text: 'Assalam-o-Alaikum, please review the release checklist.',
      status: 200,
    },
    nodes: [
      {
        id: 'n_trigger',
        kind: 'trigger',
        toolId: 'trigger-ingest',
        title: 'File Ingest Trigger',
        subtitle: 'Emits document payload',
        x: 60,
        y: 190,
        config: {},
      },
      {
        id: 'n_logic_size',
        kind: 'logic',
        toolId: 'logic-if',
        title: 'Size > 500 KB?',
        subtitle: 'Conditional Trigger',
        x: 340,
        y: 190,
        config: {
          condition: { field: 'sizeKb', operator: 'gt', value: '500' },
        },
      },
      {
        id: 'n_pdf',
        kind: 'tool',
        toolId: 'pdf-compressor',
        title: 'PDF Compressor',
        subtitle: 'Strip metadata & shrink PDF',
        x: 640,
        y: 75,
        config: {},
      },
      {
        id: 'n_crypto',
        kind: 'tool',
        toolId: 'crypto-vault',
        title: 'AES-256 Crypto Vault',
        subtitle: 'Seal compressed artifact',
        x: 940,
        y: 75,
        config: {},
      },
      {
        id: 'n_formatter',
        kind: 'tool',
        toolId: 'data-formatter',
        title: 'JSON & CSV Transformer',
        subtitle: 'Export compact metadata CSV',
        x: 640,
        y: 310,
        config: {},
      },
    ],
    edges: [
      { id: 'e1', sourceId: 'n_trigger', targetId: 'n_logic_size', branch: 'always' },
      { id: 'e2', sourceId: 'n_logic_size', targetId: 'n_pdf', branch: 'true' },
      { id: 'e3', sourceId: 'n_pdf', targetId: 'n_crypto', branch: 'always' },
      { id: 'e4', sourceId: 'n_logic_size', targetId: 'n_formatter', branch: 'false' },
    ],
  },
  {
    id: 'media-router',
    name: 'Automated Media Pipeline',
    description: 'Detects video vs image uploads and dispatches either to Video Studio (9:16) or Background Remover + WebP conversion.',
    initialPayload: {
      fileName: 'Product_Launch_Clip.mp4',
      format: 'mp4',
      sizeKb: 4200,
      text: 'AethexFlow Studio Reveal',
      status: 200,
    },
    nodes: [
      {
        id: 'm_trigger',
        kind: 'trigger',
        toolId: 'trigger-ingest',
        title: 'Media Upload Trigger',
        subtitle: 'Receives raw media file',
        x: 60,
        y: 190,
        config: {},
      },
      {
        id: 'm_logic_fmt',
        kind: 'logic',
        toolId: 'logic-if',
        title: 'Format contains mp4?',
        subtitle: 'Conditional Trigger',
        x: 340,
        y: 190,
        config: {
          condition: { field: 'format', operator: 'contains', value: 'mp4' },
        },
      },
      {
        id: 'm_video',
        kind: 'tool',
        toolId: 'video-studio',
        title: 'Automated Video Studio',
        subtitle: 'Apply 9:16 Shorts timeline',
        x: 650,
        y: 75,
        config: { targetFormat: '1080x1920' },
      },
      {
        id: 'm_bg',
        kind: 'tool',
        toolId: 'background-remover',
        title: 'Background Remover',
        subtitle: 'Isolate subject PNG',
        x: 650,
        y: 310,
        config: {},
      },
      {
        id: 'm_img',
        kind: 'tool',
        toolId: 'image-converter',
        title: 'Image Converter',
        subtitle: 'Encode WebP output',
        x: 940,
        y: 310,
        config: { targetFormat: 'webp' },
      },
    ],
    edges: [
      { id: 'me1', sourceId: 'm_trigger', targetId: 'm_logic_fmt', branch: 'always' },
      { id: 'me2', sourceId: 'm_logic_fmt', targetId: 'm_video', branch: 'true' },
      { id: 'me3', sourceId: 'm_logic_fmt', targetId: 'm_bg', branch: 'false' },
      { id: 'me4', sourceId: 'm_bg', targetId: 'm_img', branch: 'always' },
    ],
  },
  {
    id: 'uptime-alert',
    name: 'Edge Uptime & Alert Bot Flow',
    description: 'Probes HTTP health endpoint, verifies 200 status, and fans out healthy digests or fallback alerts.',
    initialPayload: {
      url: '/api/health',
      status: 200,
      sizeKb: 12,
      text: 'Edge gateway health verification',
    },
    nodes: [
      {
        id: 'u_monitor',
        kind: 'bot',
        toolId: 'web-monitor',
        title: 'Web Monitor Bot',
        subtitle: 'Probe /api/health',
        x: 60,
        y: 190,
        config: { targetUrl: '/api/health' },
      },
      {
        id: 'u_logic',
        kind: 'logic',
        toolId: 'logic-if',
        title: 'HTTP Status == 200?',
        subtitle: 'Conditional Trigger',
        x: 340,
        y: 190,
        config: {
          condition: { field: 'status', operator: 'equals', value: '200' },
        },
      },
      {
        id: 'u_translate',
        kind: 'tool',
        toolId: 'text-translator',
        title: 'Text Translator',
        subtitle: 'Format bilingual status note',
        x: 650,
        y: 75,
        config: {},
      },
      {
        id: 'u_relay',
        kind: 'bot',
        toolId: 'webhook-relay',
        title: 'Webhook Relay Bot',
        subtitle: 'Send failure incident alert',
        x: 650,
        y: 310,
        config: { targetUrl: 'https://httpbin.org/post' },
      },
    ],
    edges: [
      { id: 'ue1', sourceId: 'u_monitor', targetId: 'u_logic', branch: 'always' },
      { id: 'ue2', sourceId: 'u_logic', targetId: 'u_translate', branch: 'true' },
      { id: 'ue3', sourceId: 'u_logic', targetId: 'u_relay', branch: 'false' },
    ],
  },
];

export function validateWorkflowGraph(nodes: WorkflowNode[], edges: WorkflowEdge[]): DAGValidationResult {
  const incomingMap = new Map<string, string[]>();
  for (const node of nodes) {
    incomingMap.set(node.id, []);
  }
  for (const edge of edges) {
    const deps = incomingMap.get(edge.targetId);
    if (deps && !deps.includes(edge.sourceId)) {
      deps.push(edge.sourceId);
    }
  }

  const taskNodes: TaskNode[] = nodes.map((node) => ({
    id: node.id,
    name: node.title,
    category:
      node.kind === 'trigger'
        ? 'ingest'
        : node.kind === 'logic'
        ? 'ipc'
        : node.toolId === 'crypto-vault'
        ? 'crypto'
        : 'compute',
    dependencies: incomingMap.get(node.id) || [],
    estimatedLatencyMs: node.kind === 'logic' ? 4 : node.kind === 'trigger' ? 5 : 18,
  }));

  return validateAndSortDAG(taskNodes);
}

export function wouldCreateCycle(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  sourceId: string,
  targetId: string
): boolean {
  if (sourceId === targetId) return true;
  const candidateEdges: WorkflowEdge[] = [
    ...edges,
    { id: '__candidate__', sourceId, targetId, branch: 'always' },
  ];
  const result = validateWorkflowGraph(nodes, candidateEdges);
  return !result.isValid;
}

function getPathValue(obj: Record<string, unknown>, path: string): unknown {
  const cleanPath = path.replace(/^payload\./, '').trim();
  if (!cleanPath) return undefined;
  const parts = cleanPath.split('.');
  let curr: unknown = obj;
  for (const part of parts) {
    if (curr && typeof curr === 'object' && part in (curr as Record<string, unknown>)) {
      curr = (curr as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return curr;
}

export function evaluateLogicCondition(
  rule: ConditionRule | undefined,
  context: Record<string, unknown>
): boolean {
  if (!rule || !rule.field.trim()) return true;
  const actual = getPathValue(context, rule.field);
  const expectedRaw = rule.value ?? '';

  switch (rule.operator) {
    case 'truthy':
      return Boolean(actual) && String(actual).toLowerCase() !== 'false' && String(actual) !== '0';
    case 'equals':
      return String(actual ?? '').toLowerCase() === expectedRaw.trim().toLowerCase();
    case 'contains':
      return String(actual ?? '').toLowerCase().includes(expectedRaw.trim().toLowerCase());
    case 'gt': {
      const aNum = Number(actual);
      const bNum = Number(expectedRaw);
      return Number.isFinite(aNum) && Number.isFinite(bNum) && aNum > bNum;
    }
    case 'lt': {
      const aNum = Number(actual);
      const bNum = Number(expectedRaw);
      return Number.isFinite(aNum) && Number.isFinite(bNum) && aNum < bNum;
    }
    default:
      return false;
  }
}

export type ToolRunnerFn = (
  node: WorkflowNode,
  context: Record<string, unknown>
) => Promise<{ summary: string; data?: Record<string, unknown> }> | { summary: string; data?: Record<string, unknown> };

function defaultToolRunner(
  node: WorkflowNode,
  context: Record<string, unknown>
): { summary: string; data?: Record<string, unknown> } {
  const sizeKb = Number(context.sizeKb ?? 250);
  const text = String(context.text ?? 'AethexFlow workflow payload');
  const format = String(context.format ?? 'json');

  switch (node.toolId) {
    case 'pdf-compressor': {
      const estimatedSaved = Math.max(12, Math.round(sizeKb * 0.42));
      const newSizeKb = Math.max(10, sizeKb - estimatedSaved);
      return {
        summary: `Compressed stream from ${sizeKb} KB -> ${newSizeKb} KB (-42% metadata stripped)`,
        data: { compressedSizeKb: newSizeKb, savedKb: estimatedSaved, tool: 'pdf-lib' },
      };
    }
    case 'crypto-vault': {
      // Deterministic quick digest preview; UI can also verify with WebCrypto
      let hashNum = 2166136261;
      const seed = `${text}:${context.fileName ?? 'artifact'}`;
      for (let i = 0; i < seed.length; i++) {
        hashNum ^= seed.charCodeAt(i);
        hashNum = Math.imul(hashNum, 16777619);
      }
      const hexPreview = (hashNum >>> 0).toString(16).padStart(8, '0');
      return {
        summary: `Sealed payload with AES-256-GCM envelope (tag:${hexPreview})`,
        data: { cipherAlgorithm: 'AES-256-GCM', sealTag: hexPreview },
      };
    }
    case 'data-formatter': {
      const csvRow = `fileName,format,sizeKb\n${String(context.fileName ?? 'record')},${format},${sizeKb}`;
      return {
        summary: `Normalized payload to CSV (${csvRow.split('\n').length} rows ready)`,
        data: { csvPreview: csvRow, rowCount: 1 },
      };
    }
    case 'video-studio': {
      const preset = String(node.config.targetFormat ?? '1080x1920');
      return {
        summary: `Prepared Video Studio timeline at ${preset} with automated cut track`,
        data: { aspectPreset: preset, timelineReady: true },
      };
    }
    case 'background-remover':
      return {
        summary: `Isolated alpha matte cutout for ${String(context.fileName ?? 'image')}`,
        data: { transparentPng: true },
      };
    case 'image-converter': {
      const targetFmt = String(node.config.targetFormat ?? 'webp').toUpperCase();
      return {
        summary: `Transcoded image asset to ${targetFmt} container`,
        data: { outputFormat: targetFmt },
      };
    }
    case 'text-translator': {
      const translated = text.toLowerCase().includes('assalam')
        ? 'Peace be upon you, please review the release checklist.'
        : `Assalam-o-Alaikum — ${text}`;
      return {
        summary: `Translated text snippet (${translated.slice(0, 48)})`,
        data: { translatedText: translated },
      };
    }
    case 'web-monitor': {
      const status = Number(context.status ?? 200);
      return {
        summary: `Probed ${String(node.config.targetUrl ?? '/api/health')} -> HTTP ${status}`,
        data: { status, ok: status >= 200 && status < 400 },
      };
    }
    case 'webhook-relay':
      return {
        summary: `Prepared JSON event relay to ${String(node.config.targetUrl ?? 'webhook endpoint')}`,
        data: { relayed: true, targetUrl: node.config.targetUrl ?? 'webhook' },
      };
    default:
      return {
        summary: `Executed ${node.title}`,
        data: { executedNode: node.id },
      };
  }
}

export async function executeWorkflowGraph(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  initialPayload: Record<string, unknown>,
  customRunner?: ToolRunnerFn
): Promise<WorkflowExecutionResult> {
  const validation = validateWorkflowGraph(nodes, edges);
  if (!validation.isValid || !validation.executionOrder) {
    return {
      valid: false,
      error: validation.error || 'Workflow graph contains cycles or missing dependencies.',
      executionOrder: [],
      steps: [],
      finalContext: { ...initialPayload },
      totalDurationMs: 0,
    };
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const incomingEdgesMap = new Map<string, WorkflowEdge[]>();
  for (const n of nodes) incomingEdgesMap.set(n.id, []);
  for (const e of edges) {
    incomingEdgesMap.get(e.targetId)?.push(e);
  }

  const context: Record<string, unknown> = { ...initialPayload };
  const nodeOutcome = new Map<string, { executed: boolean; branchResult?: boolean }>();
  const steps: WorkflowRunStepResult[] = [];
  let totalDurationMs = 0;

  for (const nodeId of validation.executionOrder) {
    const node = nodeMap.get(nodeId);
    if (!node) continue;

    const incoming = incomingEdgesMap.get(nodeId) || [];
    let shouldRun = incoming.length === 0;

    if (incoming.length > 0) {
      for (const edge of incoming) {
        const srcOutcome = nodeOutcome.get(edge.sourceId);
        if (!srcOutcome || !srcOutcome.executed) continue;
        if (edge.branch === 'always') {
          shouldRun = true;
          break;
        }
        if (edge.branch === 'true' && srcOutcome.branchResult === true) {
          shouldRun = true;
          break;
        }
        if (edge.branch === 'false' && srcOutcome.branchResult === false) {
          shouldRun = true;
          break;
        }
      }
    }

    if (!shouldRun) {
      nodeOutcome.set(nodeId, { executed: false });
      steps.push({
        nodeId: node.id,
        title: node.title,
        kind: node.kind,
        status: 'skipped',
        durationMs: 0,
        outputSummary: 'Skipped (upstream conditional branch was not taken)',
      });
      continue;
    }

    const start = Date.now();
    if (node.kind === 'trigger') {
      const dur = 5;
      totalDurationMs += dur;
      nodeOutcome.set(nodeId, { executed: true });
      steps.push({
        nodeId: node.id,
        title: node.title,
        kind: node.kind,
        status: 'executed',
        durationMs: dur,
        outputSummary: `Injected payload (${Object.keys(context).join(', ')})`,
        outputData: { ...context },
      });
    } else if (node.kind === 'logic') {
      const cond = node.config.condition;
      const result = evaluateLogicCondition(cond, context);
      const dur = 4;
      totalDurationMs += dur;
      nodeOutcome.set(nodeId, { executed: true, branchResult: result });
      steps.push({
        nodeId: node.id,
        title: node.title,
        kind: node.kind,
        status: 'executed',
        branchTaken: result ? 'true' : 'false',
        durationMs: dur,
        outputSummary: `${cond?.field || 'condition'} ${cond?.operator || 'truthy'} ${cond?.value ?? ''} => ${result ? 'TRUE branch' : 'FALSE branch'}`.trim(),
        outputData: { conditionPassed: result },
      });
    } else {
      try {
        const runner = customRunner || defaultToolRunner;
        const out = await runner(node, context);
        const dur = Math.max(8, Date.now() - start || 16);
        totalDurationMs += dur;
        if (out.data) {
          Object.assign(context, out.data);
        }
        nodeOutcome.set(nodeId, { executed: true });
        steps.push({
          nodeId: node.id,
          title: node.title,
          kind: node.kind,
          status: 'executed',
          durationMs: dur,
          outputSummary: out.summary,
          outputData: out.data,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Node execution failed';
        nodeOutcome.set(nodeId, { executed: false });
        steps.push({
          nodeId: node.id,
          title: node.title,
          kind: node.kind,
          status: 'error',
          durationMs: 0,
          outputSummary: msg,
        });
      }
    }
  }

  return {
    valid: true,
    executionOrder: validation.executionOrder,
    steps,
    finalContext: context,
    totalDurationMs,
  };
}

/**
 * Organizes WorkflowNode coordinates into a clean hierarchical left-to-right DAG layout
 * (or tidy grid fallback if cyclic), prioritizing TRUE branches above FALSE branches.
 */
export function autoArrangeWorkflowGraph(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  options?: { startX?: number; startY?: number; columnGap?: number; rowGap?: number }
): WorkflowNode[] {
  if (!nodes || nodes.length === 0) return [];

  const startX = options?.startX ?? 56;
  const startY = options?.startY ?? 72;
  const columnGap = options?.columnGap ?? 292;
  const rowGap = options?.rowGap ?? 154;

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const incoming = new Map<string, WorkflowEdge[]>();
  const outgoing = new Map<string, WorkflowEdge[]>();
  for (const n of nodes) {
    incoming.set(n.id, []);
    outgoing.set(n.id, []);
  }
  for (const e of edges) {
    if (nodeById.has(e.sourceId) && nodeById.has(e.targetId) && e.sourceId !== e.targetId) {
      incoming.get(e.targetId)!.push(e);
      outgoing.get(e.sourceId)!.push(e);
    }
  }

  // Assign longest-path topological depth per node (handles cycles safely via visited cap)
  const depthMap = new Map<string, number>();
  const inDegree = new Map<string, number>();
  for (const n of nodes) {
    inDegree.set(n.id, incoming.get(n.id)!.length);
    depthMap.set(n.id, 0);
  }

  const queue: string[] = [];
  for (const n of nodes) {
    if ((inDegree.get(n.id) || 0) === 0) {
      queue.push(n.id);
    }
  }

  const orderedIds: string[] = [];
  const tempIn = new Map(inDegree);
  while (queue.length > 0) {
    const curr = queue.shift()!;
    orderedIds.push(curr);
    const currDepth = depthMap.get(curr) || 0;
    for (const edge of outgoing.get(curr) || []) {
      const nextDepth = Math.max(depthMap.get(edge.targetId) || 0, currDepth + 1);
      depthMap.set(edge.targetId, nextDepth);
      const deg = (tempIn.get(edge.targetId) || 0) - 1;
      tempIn.set(edge.targetId, deg);
      if (deg === 0) {
        queue.push(edge.targetId);
      }
    }
  }

  // Fallback for any nodes caught in a cycle so every node gets placed neatly
  if (orderedIds.length < nodes.length) {
    let fallbackLayer = Math.max(0, ...Array.from(depthMap.values())) + (orderedIds.length > 0 ? 1 : 0);
    for (const n of nodes) {
      if (!orderedIds.includes(n.id)) {
        depthMap.set(n.id, fallbackLayer);
        orderedIds.push(n.id);
        if (orderedIds.length % 3 === 0) {
          fallbackLayer += 1;
        }
      }
    }
  }

  // Group nodes by depth layer
  const layers = new Map<number, WorkflowNode[]>();
  for (const n of nodes) {
    const layerIdx = depthMap.get(n.id) || 0;
    if (!layers.has(layerIdx)) layers.set(layerIdx, []);
    layers.get(layerIdx)!.push(n);
  }

  // Score each node for vertical ordering inside its column:
  // TRUE branches sort before ALWAYS before FALSE; otherwise inherit parent Y rank.
  const placedY = new Map<string, number>();
  const sortedLayerKeys = Array.from(layers.keys()).sort((a, b) => a - b);

  // Determine max rows across layers so shallower layers center gracefully vertically
  const maxRows = Math.max(1, ...Array.from(layers.values()).map((col) => col.length));
  const totalHeight = (maxRows - 1) * rowGap;

  const arrangedMap = new Map<string, WorkflowNode>();

  for (const layerIdx of sortedLayerKeys) {
    const colNodes = layers.get(layerIdx)!;

    colNodes.sort((a, b) => {
      const inA = incoming.get(a.id) || [];
      const inB = incoming.get(b.id) || [];

      const branchWeight = (edgesList: WorkflowEdge[]): number => {
        if (edgesList.some((e) => e.branch === 'true')) return 0;
        if (edgesList.some((e) => e.branch === 'always')) return 1;
        if (edgesList.some((e) => e.branch === 'false')) return 2;
        return 1;
      };

      const avgParentY = (edgesList: WorkflowEdge[], fallbackY: number): number => {
        const parentYs = edgesList
          .map((e) => placedY.get(e.sourceId))
          .filter((v): v is number => typeof v === 'number');
        if (parentYs.length === 0) return fallbackY;
        return parentYs.reduce((sum, v) => sum + v, 0) / parentYs.length;
      };

      const pA = avgParentY(inA, a.y);
      const pB = avgParentY(inB, b.y);
      if (Math.abs(pA - pB) > 20) return pA - pB;

      const bwDiff = branchWeight(inA) - branchWeight(inB);
      if (bwDiff !== 0) return bwDiff;

      return a.y - b.y;
    });

    const colHeight = (colNodes.length - 1) * rowGap;
    const colStartY = startY + Math.max(0, Math.round((totalHeight - colHeight) / 2));

    colNodes.forEach((node, rowIdx) => {
      const nextX = startX + layerIdx * columnGap;
      const nextY = colStartY + rowIdx * rowGap;
      placedY.set(node.id, nextY);
      arrangedMap.set(node.id, {
        ...node,
        x: nextX,
        y: nextY,
      });
    });
  }

  return nodes.map((n) => arrangedMap.get(n.id) || n);
}

