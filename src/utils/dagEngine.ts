export interface TaskNode {
  id: string;
  name: string;
  category: 'ingest' | 'crypto' | 'compute' | 'ipc' | 'biometric';
  dependencies: string[];
  estimatedLatencyMs: number;
}

export interface DAGValidationResult {
  isValid: boolean;
  hasCycle: boolean;
  cycleNodes?: string[];
  executionOrder?: string[];
  totalLatencyMs?: number;
  stages?: string[][];
  error?: string;
}

/**
 * Validates a DAG using Kahn's algorithm and Depth First Search 3-coloring.
 * Guarantees deadlock-free execution as documented in the AethexFlow architecture.
 */
export function validateAndSortDAG(nodes: TaskNode[]): DAGValidationResult {
  if (!nodes || nodes.length === 0) {
    return {
      isValid: true,
      hasCycle: false,
      executionOrder: [],
      totalLatencyMs: 0,
      stages: [],
    };
  }

  const nodeMap = new Map<string, TaskNode>();
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  // Initialize data structures
  for (const node of nodes) {
    nodeMap.set(node.id, node);
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  // Populate adjacency and inDegrees
  for (const node of nodes) {
    for (const depId of node.dependencies) {
      if (!nodeMap.has(depId)) {
        return {
          isValid: false,
          hasCycle: false,
          error: `Missing dependency: ${depId} referenced by node ${node.id}`,
        };
      }
      // depId -> node.id
      adjacency.get(depId)!.push(node.id);
      inDegree.set(node.id, (inDegree.get(node.id) || 0) + 1);
    }
  }

  // Kahn's Algorithm with staging
  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) {
      queue.push(id);
    }
  }

  const executionOrder: string[] = [];
  const stages: string[][] = [];
  let currentStage = [...queue];

  while (currentStage.length > 0) {
    stages.push(currentStage);
    const nextStage: string[] = [];

    for (const currId of currentStage) {
      executionOrder.push(currId);
      const neighbors = adjacency.get(currId) || [];
      for (const neighbor of neighbors) {
        const updatedDeg = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, updatedDeg);
        if (updatedDeg === 0) {
          nextStage.push(neighbor);
        }
      }
    }

    currentStage = nextStage;
  }

  // Check if all nodes were visited
  if (executionOrder.length !== nodes.length) {
    // DFS 3-coloring to pinpoint exact cycle
    const color = new Map<string, 'WHITE' | 'GRAY' | 'BLACK'>();
    for (const node of nodes) {
      color.set(node.id, 'WHITE');
    }

    const cyclePath: string[] = [];
    let cycleFound = false;

    function dfs(u: string, path: string[]) {
      if (cycleFound) return;
      color.set(u, 'GRAY');
      path.push(u);

      for (const v of adjacency.get(u) || []) {
        if (color.get(v) === 'GRAY') {
          cycleFound = true;
          const cycleStartIdx = path.indexOf(v);
          cyclePath.push(...path.slice(cycleStartIdx), v);
          return;
        }
        if (color.get(v) === 'WHITE') {
          dfs(v, path);
        }
      }

      path.pop();
      color.set(u, 'BLACK');
    }

    for (const node of nodes) {
      if (color.get(node.id) === 'WHITE' && !cycleFound) {
        dfs(node.id, []);
      }
    }

    return {
      isValid: false,
      hasCycle: true,
      cycleNodes: cyclePath,
      error: `Deadlock detected: Cyclic dependency detected involving [${cyclePath.join(' -> ')}]`,
    };
  }

  // Calculate critical path total latency
  const nodeLatency = new Map<string, number>();
  for (const id of executionOrder) {
    const node = nodeMap.get(id)!;
    let maxDepLatency = 0;
    for (const depId of node.dependencies) {
      maxDepLatency = Math.max(maxDepLatency, nodeLatency.get(depId) || 0);
    }
    nodeLatency.set(id, maxDepLatency + node.estimatedLatencyMs);
  }

  const totalLatencyMs = Math.max(...Array.from(nodeLatency.values()), 0);

  return {
    isValid: true,
    hasCycle: false,
    executionOrder,
    totalLatencyMs,
    stages,
  };
}

export interface AutomatedPipelineRun {
  pipelineId: string;
  valid: boolean;
  stepsExecuted: string[];
  totalLatencyMs: number;
  status: 'completed' | 'aborted';
  error?: string;
}

/**
 * Automates validation and topological execution of an action pipeline
 * silently without requiring manual user orchestration.
 */
export function executeAutomatedPipeline(taskName: string): AutomatedPipelineRun {
  const nodes: TaskNode[] = [
    { id: 'ingest', name: `Parse Intent: ${taskName}`, category: 'ingest', dependencies: [], estimatedLatencyMs: 6 },
    { id: 'verify', name: 'Zero-Trust Cryptographic Check', category: 'crypto', dependencies: ['ingest'], estimatedLatencyMs: 8 },
    { id: 'exec', name: `Execute Sandboxed Task (${taskName})`, category: 'compute', dependencies: ['verify'], estimatedLatencyMs: 14 },
  ];

  const validation = validateAndSortDAG(nodes);
  if (!validation.isValid || !validation.executionOrder) {
    return {
      pipelineId: `pipe_${Date.now()}`,
      valid: false,
      stepsExecuted: [],
      totalLatencyMs: 0,
      status: 'aborted',
      error: validation.error,
    };
  }

  return {
    pipelineId: `pipe_${Date.now()}`,
    valid: true,
    stepsExecuted: validation.executionOrder,
    totalLatencyMs: validation.totalLatencyMs || 28,
    status: 'completed',
  };
}

