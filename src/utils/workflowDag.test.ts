import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKFLOW_PRESETS,
  evaluateLogicCondition,
  wouldCreateCycle,
  validateWorkflowGraph,
  executeWorkflowGraph,
  autoArrangeWorkflowGraph,
} from './workflowDag';

test('evaluates numeric, string, and truthy logic conditions accurately', () => {
  const payload = { sizeKb: 1200, format: 'video/mp4', status: 200, active: true };

  assert.equal(evaluateLogicCondition({ field: 'sizeKb', operator: 'gt', value: '500' }, payload), true);
  assert.equal(evaluateLogicCondition({ field: 'sizeKb', operator: 'lt', value: '500' }, payload), false);
  assert.equal(evaluateLogicCondition({ field: 'payload.format', operator: 'contains', value: 'mp4' }, payload), true);
  assert.equal(evaluateLogicCondition({ field: 'status', operator: 'equals', value: '200' }, payload), true);
  assert.equal(evaluateLogicCondition({ field: 'active', operator: 'truthy', value: '' }, payload), true);
});

test('prevents adding edges that create a cycle', () => {
  const preset = WORKFLOW_PRESETS[0];
  // n_crypto depends on n_pdf which depends on n_logic_size; connecting n_crypto -> n_logic_size forms a cycle
  assert.equal(wouldCreateCycle(preset.nodes, preset.edges, 'n_crypto', 'n_logic_size'), true);
  assert.equal(wouldCreateCycle(preset.nodes, preset.edges, 'n_trigger', 'n_trigger'), true);
  assert.equal(wouldCreateCycle(preset.nodes, preset.edges, 'n_trigger', 'n_crypto'), false);

  const check = validateWorkflowGraph(preset.nodes, preset.edges);
  assert.equal(check.isValid, true);
  assert.equal(check.hasCycle, false);
});

test('executes TRUE branch when condition passes and skips FALSE branch cleanly', async () => {
  const preset = WORKFLOW_PRESETS[0];
  const result = await executeWorkflowGraph(preset.nodes, preset.edges, {
    fileName: 'LargeSpec.pdf',
    format: 'pdf',
    sizeKb: 1200,
  });

  assert.equal(result.valid, true);
  const pdfStep = result.steps.find((s) => s.nodeId === 'n_pdf');
  const cryptoStep = result.steps.find((s) => s.nodeId === 'n_crypto');
  const formatterStep = result.steps.find((s) => s.nodeId === 'n_formatter');
  const logicStep = result.steps.find((s) => s.nodeId === 'n_logic_size');

  assert.equal(logicStep?.branchTaken, 'true');
  assert.equal(pdfStep?.status, 'executed');
  assert.equal(cryptoStep?.status, 'executed');
  assert.equal(formatterStep?.status, 'skipped');
});

test('executes FALSE branch when condition fails and skips downstream nodes on TRUE branch', async () => {
  const preset = WORKFLOW_PRESETS[0];
  const result = await executeWorkflowGraph(preset.nodes, preset.edges, {
    fileName: 'SmallMetadata.json',
    format: 'json',
    sizeKb: 180,
  });

  assert.equal(result.valid, true);
  const pdfStep = result.steps.find((s) => s.nodeId === 'n_pdf');
  const cryptoStep = result.steps.find((s) => s.nodeId === 'n_crypto');
  const formatterStep = result.steps.find((s) => s.nodeId === 'n_formatter');
  const logicStep = result.steps.find((s) => s.nodeId === 'n_logic_size');

  assert.equal(logicStep?.branchTaken, 'false');
  assert.equal(pdfStep?.status, 'skipped');
  assert.equal(cryptoStep?.status, 'skipped');
  assert.equal(formatterStep?.status, 'executed');
});

test('autoArrangeWorkflowGraph lays out DAG hierarchically with TRUE branch above FALSE branch and no overlaps', () => {
  const preset = WORKFLOW_PRESETS[0];
  // Scramble every node onto overlapping coordinates
  const scrambled = preset.nodes.map((n, idx) => ({
    ...n,
    x: 400 + idx * 5,
    y: 400 - idx * 5,
  }));

  const arranged = autoArrangeWorkflowGraph(scrambled, preset.edges);
  const byId = new Map(arranged.map((n) => [n.id, n]));

  const trig = byId.get('n_trigger')!;
  const logic = byId.get('n_logic_size')!;
  const pdf = byId.get('n_pdf')!;
  const crypto = byId.get('n_crypto')!;
  const fmt = byId.get('n_formatter')!;

  // Hierarchical left-to-right column progression
  assert.ok(trig.x < logic.x);
  assert.ok(logic.x < pdf.x);
  assert.equal(pdf.x, fmt.x);
  assert.ok(pdf.x < crypto.x);

  // TRUE branch strictly above FALSE branch in same column
  assert.ok(pdf.y < fmt.y);

  // Zero coordinate collisions across all nodes
  const coords = new Set(arranged.map((n) => `${n.x},${n.y}`));
  assert.equal(coords.size, arranged.length);
});
