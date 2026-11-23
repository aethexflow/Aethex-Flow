import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNaturalIntent } from './intentParser';

test('parses PDF compression commands correctly', () => {
  const result = parseNaturalIntent('compress pdf');
  assert.equal(result.type, 'LAUNCH_TOOL');
  assert.equal(result.targetId, 'pdf-compressor');
  assert.ok(result.confidence > 0.8);
});

test('parses background remover commands correctly', () => {
  const result = parseNaturalIntent('remove background from product picture');
  assert.equal(result.type, 'LAUNCH_TOOL');
  assert.equal(result.targetId, 'background-remover');
  assert.ok(result.confidence > 0.8);
});

test('parses video editing commands to Video Studio', () => {
  const result = parseNaturalIntent('create a 30 second vertical short video');
  assert.equal(result.type, 'NAVIGATE_TAB');
  assert.equal(result.targetId, 'studio');
  assert.ok(result.confidence > 0.8);
});

test('parses crypto and json commands to real tools', () => {
  const cryptoRes = parseNaturalIntent('encrypt payload with aes');
  assert.equal(cryptoRes.type, 'LAUNCH_TOOL');
  assert.equal(cryptoRes.targetId, 'crypto-vault');

  const jsonRes = parseNaturalIntent('convert json to csv');
  assert.equal(jsonRes.type, 'LAUNCH_TOOL');
  assert.equal(jsonRes.targetId, 'data-formatter');
});

test('parses translation to Roman Urdu correctly', () => {
  const result = parseNaturalIntent('translate to roman urdu');
  assert.equal(result.type, 'LAUNCH_TOOL');
  assert.equal(result.targetId, 'text-translator');
});

test('routes master vault administrative triggers securely', () => {
  const r1 = parseNaturalIntent('vault');
  assert.equal(r1.type, 'MASTER_VAULT');
  assert.equal(r1.targetId, 'master-vault');

  const r2 = parseNaturalIntent('open master control vault');
  assert.equal(r2.type, 'MASTER_VAULT');
});

test('routes conversational questions to Ask Aethe copilot', () => {
  const result = parseNaturalIntent('What is the weather in Tokyo?');
  assert.equal(result.type, 'NAVIGATE_TAB');
  assert.equal(result.targetId, 'chat');
});

test('routes workflow and conditional trigger queries to Workflow DAG Visualizer', () => {
  const r1 = parseNaturalIntent('open workflow dag visualizer with conditional trigger');
  assert.equal(r1.type, 'NAVIGATE_TAB');
  assert.equal(r1.targetId, 'workflows');

  const r2 = parseNaturalIntent('build branching dag workflow');
  assert.equal(r2.type, 'NAVIGATE_TAB');
  assert.equal(r2.targetId, 'workflows');
});
