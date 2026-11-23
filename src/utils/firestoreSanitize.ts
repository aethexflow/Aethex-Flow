import type { WorkflowNode, WorkflowEdge } from './workflowDag';

export interface SanitizedWorkflowGraph {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
}

export function buildSafeDocId(prefix: string): string {
  const randomPart = Math.random().toString(36).slice(2, 8);
  const raw = `${prefix}_${Date.now()}_${randomPart}`;
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
}

/**
 * Recursively strips undefined values so Firestore writes
 * cleanly using native nested maps/arrays (never JSON.stringify blobs).
 */
export function stripUndefinedDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .filter((v) => v !== undefined)
      .map((v) => stripUndefinedDeep(v));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out;
  }
  return value;
}

export function sanitizeWorkflowGraphForFirestore(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): SanitizedWorkflowGraph {
  const cleanNodes = nodes.slice(0, 40).map((n) => ({
    id: String(n.id).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64),
    kind: n.kind,
    toolId: n.toolId ? String(n.toolId).slice(0, 64) : '',
    title: String(n.title).slice(0, 120),
    subtitle: String(n.subtitle || '').slice(0, 200),
    x: Math.round(Number(n.x) || 0),
    y: Math.round(Number(n.y) || 0),
    config: stripUndefinedDeep(n.config || {}) as Record<string, unknown>,
  }));

  const cleanEdges = edges.slice(0, 80).map((e) => ({
    id: String(e.id).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64),
    sourceId: String(e.sourceId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64),
    targetId: String(e.targetId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64),
    branch: e.branch || 'always',
  }));

  return {
    nodes: cleanNodes,
    edges: cleanEdges,
  };
}

/**
 * Converts a Trigger Test Payload (either raw JSON text or plain object)
 * into a native Firestore map capped at 32 top-level keys (no JSON strings).
 */
export function sanitizeSamplePayloadForFirestore(
  input: string | Record<string, unknown> | undefined
): Record<string, unknown> {
  let obj: unknown = input;
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return {};
    try {
      obj = JSON.parse(trimmed);
    } catch {
      return {};
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return {};
  }
  const clean = stripUndefinedDeep(obj) as Record<string, unknown>;
  const capped: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(clean).slice(0, 32)) {
    const safeKey = key.trim().slice(0, 64);
    if (!safeKey) continue;
    capped[safeKey] = typeof val === 'string' ? val.slice(0, 500) : val;
  }
  return capped;
}

/**
 * Normalizes comma-separated or array template tags to <= 8 lowercase tokens (<= 24 chars each).
 */
export function sanitizeTemplateTags(raw: string | string[] | undefined): string[] {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
    ? raw.split(',')
    : [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of list) {
    const clean = String(item)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .slice(0, 24);
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      result.push(clean);
    }
    if (result.length >= 8) break;
  }
  return result;
}

export interface WorkflowTemplateSummary {
  nodesCount: number;
  edgesCount: number;
  logicBranchesCount: number;
  complexity: 'Linear' | 'Branching' | 'Multi-Stage DAG';
  toolTitles: string[];
}

export function summarizeWorkflowTemplate(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): WorkflowTemplateSummary {
  const logicBranchesCount = nodes.filter((n) => n.kind === 'logic').length;
  const conditionalWires = edges.filter((e) => e.branch === 'true' || e.branch === 'false').length;
  const complexity: WorkflowTemplateSummary['complexity'] =
    nodes.length >= 6 || logicBranchesCount >= 2
      ? 'Multi-Stage DAG'
      : logicBranchesCount > 0 || conditionalWires > 0
      ? 'Branching'
      : 'Linear';

  const toolTitles = Array.from(
    new Set(nodes.map((n) => String(n.title || '').trim()).filter(Boolean))
  ).slice(0, 6);

  return {
    nodesCount: nodes.length,
    edgesCount: edges.length,
    logicBranchesCount,
    complexity,
    toolTitles,
  };
}
