import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAndSortDAG, executeAutomatedPipeline, TaskNode } from './dagEngine';

test('valid linear DAG sorts in topological order', () => {
  const nodes: TaskNode[] = [
    { id: 't1', name: 'Cloudflare Ingest', category: 'ingest', dependencies: [], estimatedLatencyMs: 15 },
    { id: 't2', name: 'Argon2id Decrypt', category: 'crypto', dependencies: ['t1'], estimatedLatencyMs: 25 },
    { id: 't3', name: 'Nuitka C Execution', category: 'compute', dependencies: ['t2'], estimatedLatencyMs: 30 },
  ];

  const result = validateAndSortDAG(nodes);
  assert.equal(result.isValid, true);
  assert.equal(result.hasCycle, false);
  assert.deepEqual(result.executionOrder, ['t1', 't2', 't3']);
  assert.equal(result.totalLatencyMs, 70);
  assert.equal(result.stages?.length, 3);
});

test('parallel DAG detects independent stages correctly', () => {
  const nodes: TaskNode[] = [
    { id: 'root', name: 'Input Dispatch', category: 'ingest', dependencies: [], estimatedLatencyMs: 10 },
    { id: 'branchA', name: 'Worker Alpha', category: 'compute', dependencies: ['root'], estimatedLatencyMs: 20 },
    { id: 'branchB', name: 'Worker Beta', category: 'crypto', dependencies: ['root'], estimatedLatencyMs: 40 },
    { id: 'join', name: 'Ed25519 Sign', category: 'biometric', dependencies: ['branchA', 'branchB'], estimatedLatencyMs: 15 },
  ];

  const result = validateAndSortDAG(nodes);
  assert.equal(result.isValid, true);
  assert.equal(result.hasCycle, false);
  assert.equal(result.stages?.length, 3);
  assert.deepEqual(result.stages?.[0], ['root']);
  assert.equal(result.stages?.[1].includes('branchA'), true);
  assert.equal(result.stages?.[1].includes('branchB'), true);
  assert.equal(result.totalLatencyMs, 65);
});

test('cyclic graph is caught and deadlocks prevented', () => {
  const nodes: TaskNode[] = [
    { id: 'n1', name: 'Task 1', category: 'compute', dependencies: ['n3'], estimatedLatencyMs: 10 },
    { id: 'n2', name: 'Task 2', category: 'compute', dependencies: ['n1'], estimatedLatencyMs: 10 },
    { id: 'n3', name: 'Task 3', category: 'compute', dependencies: ['n2'], estimatedLatencyMs: 10 },
  ];

  const result = validateAndSortDAG(nodes);
  assert.equal(result.isValid, false);
  assert.equal(result.hasCycle, true);
  assert.match(result.error || '', /Deadlock detected/);
});

test('missing dependency is rejected safely', () => {
  const nodes: TaskNode[] = [
    { id: 'n1', name: 'Task 1', category: 'compute', dependencies: ['non_existent'], estimatedLatencyMs: 10 },
  ];

  const result = validateAndSortDAG(nodes);
  assert.equal(result.isValid, false);
  assert.match(result.error || '', /Missing dependency/);
});

test('automated pipeline validates and completes headless execution', () => {
  const run = executeAutomatedPipeline('Compress Invoice PDF');
  assert.equal(run.valid, true);
  assert.equal(run.status, 'completed');
  assert.deepEqual(run.stepsExecuted, ['ingest', 'verify', 'exec']);
  assert.equal(run.totalLatencyMs, 28);
});
