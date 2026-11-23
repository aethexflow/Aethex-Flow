import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSafeDocId,
  sanitizeWorkflowGraphForFirestore,
  stripUndefinedDeep,
  sanitizeSamplePayloadForFirestore,
  sanitizeTemplateTags,
  summarizeWorkflowTemplate,
} from './firestoreSanitize';
import type { WorkflowNode, WorkflowEdge } from './workflowDag';

test('buildSafeDocId produces Firestore rule-compliant alphanumeric IDs', () => {
  const id = buildSafeDocId('wf');
  assert.match(id, /^[a-zA-Z0-9_-]{1,128}$/);
});

test('stripUndefinedDeep strips undefined properties from nested objects and arrays', () => {
  const dirty = {
    a: 1,
    b: undefined,
    nested: { ok: true, drop: undefined },
    arr: [1, undefined, { keep: 'yes', skip: undefined }],
  };
  assert.deepEqual(stripUndefinedDeep(dirty), {
    a: 1,
    nested: { ok: true },
    arr: [1, { keep: 'yes' }],
  });
});

test('sanitizeWorkflowGraphForFirestore enforces node/edge limits and native map structure', () => {
  const nodes: WorkflowNode[] = Array.from({ length: 45 }, (_, i) => ({
    id: `n_${i}`,
    kind: i === 0 ? 'trigger' : 'tool',
    toolId: 'pdf-compressor',
    title: `Node ${i}`,
    subtitle: 'Test',
    x: i * 10.4,
    y: 50,
    config: { targetFormat: 'pdf', unused: undefined } as any,
  }));
  const edges: WorkflowEdge[] = Array.from({ length: 90 }, (_, i) => ({
    id: `e_${i}`,
    sourceId: 'n_0',
    targetId: `n_${(i % 39) + 1}`,
    branch: 'always',
  }));

  const clean = sanitizeWorkflowGraphForFirestore(nodes, edges);
  assert.equal(clean.nodes.length, 40);
  assert.equal(clean.edges.length, 80);
  assert.equal(typeof clean.nodes[0].x, 'number');
  assert.equal(clean.nodes[0].x, 0);
  assert.equal((clean.nodes[1].config as Record<string, unknown>).unused, undefined);
});

test('sanitizeSamplePayloadForFirestore parses JSON into native Firestore map and caps keys', () => {
  const manyKeys: Record<string, unknown> = {};
  for (let i = 0; i < 40; i++) {
    manyKeys[`k_${i}`] = i === 0 ? 'hello' : i;
  }
  const clean = sanitizeSamplePayloadForFirestore(JSON.stringify(manyKeys));
  assert.equal(Object.keys(clean).length, 32);
  assert.equal(clean.k_0, 'hello');
  assert.deepEqual(sanitizeSamplePayloadForFirestore('{invalid json'), {});
});

test('sanitizeTemplateTags normalizes, deduplicates, and caps at 8 tags', () => {
  const tags = sanitizeTemplateTags('PDF, Crypto Vault, pdf, A, B, C, D, E, F, G');
  assert.equal(tags.length, 8);
  assert.equal(tags[0], 'pdf');
  assert.equal(tags[1], 'crypto-vault');
});

test('summarizeWorkflowTemplate classifies branching and multi-stage DAG templates accurately', () => {
  const nodes: WorkflowNode[] = [
    { id: 'n1', kind: 'trigger', title: 'Trigger', subtitle: '', x: 0, y: 0, config: {} },
    { id: 'n2', kind: 'logic', title: 'Check Size', subtitle: '', x: 200, y: 0, config: {} },
    { id: 'n3', kind: 'tool', title: 'PDF Compressor', subtitle: '', x: 400, y: 0, config: {} },
  ];
  const edges: WorkflowEdge[] = [
    { id: 'e1', sourceId: 'n1', targetId: 'n2', branch: 'always' },
    { id: 'e2', sourceId: 'n2', targetId: 'n3', branch: 'true' },
  ];
  const summary = summarizeWorkflowTemplate(nodes, edges);
  assert.equal(summary.nodesCount, 3);
  assert.equal(summary.logicBranchesCount, 1);
  assert.equal(summary.complexity, 'Branching');
});

