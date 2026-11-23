import test from 'node:test';
import assert from 'node:assert/strict';
import { validateHubPairCode, verifyEd25519Seal, calculateHubLatency } from './localHub';

test('validates 6-digit numeric Hub pairing code', () => {
  assert.equal(validateHubPairCode('482910').valid, true);
  assert.equal(validateHubPairCode('12345').valid, false);
  assert.equal(validateHubPairCode('abcdef').valid, false);
  assert.equal(validateHubPairCode('').valid, false);
});

test('verifies Ed25519 tamper-evident seal structure', () => {
  assert.equal(verifyEd25519Seal('automation_task_9', 'sig_ed25519_99f381c828d10b77'), true);
  assert.equal(verifyEd25519Seal('automation_task_9', 'invalid_sig'), false);
  assert.equal(verifyEd25519Seal('', 'sig_ed25519_99f381c828d10b77'), false);
});

test('calculates sub-100ms latency status', () => {
  assert.equal(calculateHubLatency(32).isSub100ms, true);
  assert.equal(calculateHubLatency(140).isSub100ms, false);
});
