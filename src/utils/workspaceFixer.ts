import type { ToolItem } from './toolsData';
import type { WorkflowEdge, WorkflowNode } from './workflowDag';

export interface FixerRepairReport {
  repairedKeys: string[];
  issuesResolved: string[];
  cleanedTools: ToolItem[];
  cleanedDag: { nodes: WorkflowNode[]; edges: WorkflowEdge[] } | null;
}

export interface DiagnosticCheckItem {
  id: string;
  label: string;
  status: 'passed' | 'repaired' | 'warning' | 'action_needed';
  detail: string;
}

/**
 * Pure deterministic local-state sanitizer for AethexFlow Settings 1-Click Fixer
 * and Owner Go-Live Autopilot. Inspects tool catalogs, DAG graphs, and bot payloads
 * without side effects so every repair rule can be unit-tested cleanly.
 */
export function repairWorkspaceSnapshot(input: {
  toolsRaw: string | null;
  defaultTools: ToolItem[];
  dagRaw: string | null;
  botsRaw: string | null;
  themeRaw: string | null;
}): FixerRepairReport & {
  normalizedTheme: 'dark' | 'light';
  repairedBotsJson: string | null;
} {
  const repairedKeys: string[] = [];
  const issuesResolved: string[] = [];

  // 1. Repair Tools Catalog (preserving user pins while guaranteeing all core tools exist)
  let cleanedTools: ToolItem[] = input.defaultTools.map((t) => ({ ...t }));
  if (input.toolsRaw) {
    try {
      const parsed = JSON.parse(input.toolsRaw);
      if (!Array.isArray(parsed)) {
        repairedKeys.push('aethexflow_tools');
        issuesResolved.push('Restored corrupted tools registry JSON array');
      } else {
        const pinnedIds = new Set(
          parsed
            .filter((item: any) => item && typeof item.id === 'string' && item.isPinned)
            .map((item: any) => String(item.id))
        );
        const hasLegacy = parsed.some(
          (item: any) => item?.id === 'clean-dubbing' || item?.id === 'dag-builder'
        );
        const missingCore = input.defaultTools.some(
          (def) => !parsed.some((p: any) => p?.id === def.id)
        );
        if (hasLegacy || missingCore) {
          cleanedTools = input.defaultTools.map((def) => ({
            ...def,
            isPinned: pinnedIds.size > 0 ? pinnedIds.has(def.id) : def.isPinned,
          }));
          repairedKeys.push('aethexflow_tools');
          issuesResolved.push('Upgraded legacy tool catalog entries while preserving your pinned tools');
        } else {
          cleanedTools = parsed as ToolItem[];
        }
      }
    } catch {
      repairedKeys.push('aethexflow_tools');
      issuesResolved.push('Cleared malformed JSON in aethexflow_tools and restored catalog');
    }
  }

  // 2. Repair DAG Workflow Graph (remove orphaned/self-loop edges and NaN coordinates)
  let cleanedDag: { nodes: WorkflowNode[]; edges: WorkflowEdge[] } | null = null;
  if (input.dagRaw) {
    try {
      const parsed = JSON.parse(input.dagRaw);
      if (parsed && Array.isArray(parsed.nodes)) {
        const rawNodes = parsed.nodes as WorkflowNode[];
        const validNodes = rawNodes.map((n, idx) => ({
          ...n,
          x: Number.isFinite(Number(n.x)) ? Number(n.x) : 60 + idx * 240,
          y: Number.isFinite(Number(n.y)) ? Number(n.y) : 120,
        }));
        const nodeIdSet = new Set(validNodes.map((n) => n.id));
        const rawEdges = Array.isArray(parsed.edges) ? (parsed.edges as WorkflowEdge[]) : [];
        const validEdges = rawEdges.filter(
          (e) =>
            e &&
            typeof e.sourceId === 'string' &&
            typeof e.targetId === 'string' &&
            e.sourceId !== e.targetId &&
            nodeIdSet.has(e.sourceId) &&
            nodeIdSet.has(e.targetId)
        );
        const coordsFixed = validNodes.some(
          (n, i) => n.x !== rawNodes[i].x || n.y !== rawNodes[i].y
        );
        if (validEdges.length !== rawEdges.length || coordsFixed) {
          repairedKeys.push('aethexflow_workflow_dag_v1');
          issuesResolved.push(
            `Removed ${rawEdges.length - validEdges.length} broken/self-loop DAG wire(s) & normalized coordinates`
          );
        }
        cleanedDag = { nodes: validNodes, edges: validEdges };
      } else {
        repairedKeys.push('aethexflow_workflow_dag_v1');
        issuesResolved.push('Reset invalid stored DAG graph structure');
      }
    } catch {
      repairedKeys.push('aethexflow_workflow_dag_v1');
      issuesResolved.push('Cleared malformed workflow DAG cache');
    }
  }

  // 3. Repair Automation Bots stale localhost targets -> relative /api/health
  let repairedBotsJson: string | null = input.botsRaw;
  if (input.botsRaw) {
    try {
      const parsed = JSON.parse(input.botsRaw);
      if (!Array.isArray(parsed)) {
        repairedBotsJson = null;
        repairedKeys.push('aethexflow_real_bots_v42');
        issuesResolved.push('Reset invalid automation bot storage array');
      } else {
        let changed = false;
        const normalized = parsed.map((b: any) => {
          if (
            b &&
            typeof b.target === 'string' &&
            /^http:\/\/localhost:\d+\/api\/health$/i.test(b.target.trim())
          ) {
            changed = true;
            return { ...b, target: '/api/health' };
          }
          return b;
        });
        if (changed) {
          repairedBotsJson = JSON.stringify(normalized);
          repairedKeys.push('aethexflow_real_bots_v42');
          issuesResolved.push('Rewrote stale localhost monitor URL to portable /api/health endpoint');
        }
      }
    } catch {
      repairedBotsJson = null;
      repairedKeys.push('aethexflow_real_bots_v42');
      issuesResolved.push('Cleared malformed automation bots configuration cache');
    }
  }

  // 4. Normalize Theme
  const normalizedTheme: 'dark' | 'light' =
    input.themeRaw === 'light' ? 'light' : 'dark';
  if (input.themeRaw && input.themeRaw !== 'dark' && input.themeRaw !== 'light') {
    repairedKeys.push('aethexflow_theme');
    issuesResolved.push(`Normalized invalid theme token "${input.themeRaw}" to "dark"`);
  }

  return {
    repairedKeys,
    issuesResolved,
    cleanedTools,
    cleanedDag,
    normalizedTheme,
    repairedBotsJson,
  };
}
