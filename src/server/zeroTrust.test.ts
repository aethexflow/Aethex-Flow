import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  canonicalJson,
  NonceReplayGuard,
  signEnvelope,
  verifyEnvelopeSignature,
  ZeroTrustManager,
} from './zeroTrust';

describe('Zero-Trust Cryptographic Envelope & Replay Protection', () => {
  it('produces compact recursively sorted canonical JSON matching Python json.dumps', () => {
    const input = {
      z: 1,
      a: { d: 'hello', c: true },
      m: [{ b: 2, a: 1 }, 'x'],
    };
    assert.equal(
      canonicalJson(input),
      '{"a":{"c":true,"d":"hello"},"m":[{"a":1,"b":2},"x"],"z":1}'
    );
  });

  it('signs envelopes excluding wrapper type and command_id to match aethi_hub.py', () => {
    const secret = 'test-aethi-shared-secret';
    const tsSec = Math.floor(Date.now() / 1000);
    const nonce = 'abc123nonce';
    const env = signEnvelope(
      'chat_save',
      {
        thread_id: 'thread_1',
        role: 'user',
        content: 'Hello Aethi',
        title: 'Test Chat',
      },
      secret,
      { tsSec, nonce, commandId: 'cmd_test_1' }
    );

    // Independently compute signature using exact Python formula
    const expectedSignObj = {
      content: 'Hello Aethi',
      role: 'user',
      thread_id: 'thread_1',
      title: 'Test Chat',
    };
    const msg = `${tsSec}|${nonce}|${canonicalJson(expectedSignObj)}`;
    const expectedSig = crypto.createHmac('sha256', secret).update(msg, 'utf8').digest('hex');

    assert.equal(env.sig, expectedSig);
    assert.equal(env.data.type, 'chat_save');
    assert.equal(env.data.command_id, 'cmd_test_1');

    const guard = new NonceReplayGuard(300);
    const firstCheck = verifyEnvelopeSignature(env as unknown as Record<string, unknown>, secret, guard, {
      nowSec: tsSec + 5,
    });
    assert.deepEqual(firstCheck, { valid: true, reason: 'ok' });

    // Replay with identical nonce must fail
    const replayCheck = verifyEnvelopeSignature(env as unknown as Record<string, unknown>, secret, guard, {
      nowSec: tsSec + 6,
    });
    assert.deepEqual(replayCheck, { valid: false, reason: 'replay_nonce' });
  });

  it('rejects tampered payloads and expired timestamps', () => {
    const secret = 'secret-xyz';
    const tsSec = 1700000000;
    const env = signEnvelope(
      'task',
      { steps: [{ action: 'sleep', seconds: 1 }] },
      secret,
      { tsSec, nonce: 'n1' }
    );

    const guard = new NonceReplayGuard(300);
    // Tamper inner content
    const tampered = {
      ...env,
      data: { ...env.data, steps: [{ action: 'run_cmd', command: 'whoami' }] },
    };
    assert.deepEqual(
      verifyEnvelopeSignature(tampered as unknown as Record<string, unknown>, secret, guard, {
        nowSec: tsSec,
      }),
      { valid: false, reason: 'invalid_signature' }
    );

    // Expired timestamp beyond 120s skew window
    assert.deepEqual(
      verifyEnvelopeSignature(env as unknown as Record<string, unknown>, secret, guard, {
        nowSec: tsSec + 200,
      }),
      { valid: false, reason: 'expired_timestamp' }
    );
  });

  it('attests device trust via challenge-response handshake without exposing secret', () => {
    const mgr = new ZeroTrustManager('runtime-secret-42');
    const challenge = mgr.issueChallenge('dev-win-01');
    const proof = crypto
      .createHmac('sha256', 'runtime-secret-42')
      .update(`${challenge.deviceId}|${challenge.challengeNonce}`, 'utf8')
      .digest('hex');

    const trust = mgr.verifyHandshake({
      deviceId: 'dev-win-01',
      challengeNonce: challenge.challengeNonce,
      clientProof: proof,
      transport: 'polling-tunnel',
    });

    assert.equal(trust.trusted, true);
    assert.equal(trust.deviceId, 'dev-win-01');
    assert.equal(trust.transport, 'polling-tunnel');

    const status = mgr.getDeviceStatus('dev-win-01');
    assert.equal(status.trusted, true);
    assert.equal(status.hmacAlgorithm, 'HMAC-SHA256');
    assert.equal(status.replayWindowSec, 300);
    assert.ok(!JSON.stringify(status).includes('runtime-secret-42'));
  });
});
