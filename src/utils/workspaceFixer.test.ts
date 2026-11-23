import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_TOOLS } from './toolsData';
import { repairWorkspaceSnapshot } from './workspaceFixer';

test('repairWorkspaceSnapshot restores malformed tool JSON and removes legacy stubs', () => {
  const brokenTools = JSON.stringify([
    { id: 'clean-dubbing', isPinned: true },
    { id: 'pdf-compressor', isPinned: true },
  ]);

  const result = repairWorkspaceSnapshot({
    toolsRaw: brokenTools,
    defaultTools: INITIAL_TOOLS,
    dagRaw: null,
    botsRaw: null,
    themeRaw: 'dark',
  });

  assert.ok(result.repairedKeys.includes('aethexflow_tools'));
  assert.equal(result.cleanedTools.some((t) => t.id === 'video-studio'), true);
  assert.equal(result.cleanedTools.find((t) => t.id === 'pdf-compressor')?.isPinned, true);
});

test('repairWorkspaceSnapshot strips broken/self-loop DAG edges and fixes NaN positions', () => {
  const dagRaw = JSON.stringify({
    nodes: [
      { id: 'n1', kind: 'trigger', title: 'T', subtitle: '', x: null, y: 100, config: {} },
      { id: 'n2', kind: 'tool', title: 'Tool', subtitle: '', x: 300, y: 100, config: {} },
    ],
    edges: [
      { id: 'e_valid', sourceId: 'n1', targetId: 'n2', branch: 'always' },
      { id: 'e_self', sourceId: 'n1', targetId: 'n1', branch: 'always' },
      { id: 'e_dangling', sourceId: 'n1', targetId: 'missing', branch: 'always' },
    ],
  });

  const result = repairWorkspaceSnapshot({
    toolsRaw: null,
    defaultTools: INITIAL_TOOLS,
    dagRaw,
    botsRaw: null,
    themeRaw: 'light',
  });

  assert.ok(result.repairedKeys.includes('aethexflow_workflow_dag_v1'));
  assert.equal(result.cleanedDag?.edges.length, 1);
  assert.equal(result.cleanedDag?.edges[0].id, 'e_valid');
  assert.ok(Number.isFinite(result.cleanedDag?.nodes[0].x));
});

test('repairWorkspaceSnapshot rewrites stale localhost bot monitor URLs to /api/health', () => {
  const botsRaw = JSON.stringify([
    { id: 'bot_web_monitor', botType: 'web-monitor', target: 'http://localhost:3000/api/health' },
  ]);

  const result = repairWorkspaceSnapshot({
    toolsRaw: null,
    defaultTools: INITIAL_TOOLS,
    dagRaw: null,
    botsRaw,
    themeRaw: 'invalid-theme',
  });

  assert.ok(result.repairedKeys.includes('aethexflow_real_bots_v42'));
  assert.ok(result.repairedKeys.includes('aethexflow_theme'));
  assert.equal(result.normalizedTheme, 'dark');
  const parsedBots = JSON.parse(result.repairedBotsJson || '[]');
  assert.equal(parsedBots[0].target, '/api/health');
});
