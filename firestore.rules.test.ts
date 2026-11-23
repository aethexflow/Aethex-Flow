import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rulesText = fs.readFileSync('firestore.rules', 'utf8');

test('firestore.rules enforces default-deny catch-all at top', () => {
  assert.match(rulesText, /match \/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}/);
});

test('firestore.rules validates document IDs, server timestamps, and native maps without JSON string blobs', () => {
  assert.match(rulesText, /function isValidId\(id\)/);
  assert.match(rulesText, /incoming\(\)\.role == 'member'/);
  assert.match(rulesText, /incoming\(\)\.createdAt == request\.time/);
  assert.match(rulesText, /function isValidGraph\(graph\)/);
  assert.match(rulesText, /graph is map/);
  assert.match(rulesText, /graph\.nodes is list &&/);
  assert.match(rulesText, /graph\.nodes\.size\(\) <= 40/);
});

test('firestore.rules protects PII under /users/{userId}/private/{docId} and locks role updates', () => {
  assert.match(rulesText, /match \/private\/\{docId\}/);
  assert.match(rulesText, /incoming\(\)\.role == existing\(\)\.role/);
  assert.doesNotMatch(rulesText, /allow\s+\w+\s*:\s*if\s*request\.auth\s*!=\s*null\s*;/);
});

test('firestore.rules secures list queries on user subcollections and publicWorkflows', () => {
  assert.match(rulesText, /allow list: if isSignedIn\(\) && \(request\.auth\.uid == userId \|\| isAdmin\(\)\);/);
  assert.match(rulesText, /allow list: if resource\.data\.runsCount >= 0;/);
});

test('firestore.rules validates reusable template tags and samplePayload native maps', () => {
  assert.match(rulesText, /function isValidTagList\(tags\)/);
  assert.match(rulesText, /tags\.size\(\) <= 8/);
  assert.match(rulesText, /function isValidSamplePayload\(samplePayload\)/);
  assert.match(rulesText, /samplePayload is map/);
});

