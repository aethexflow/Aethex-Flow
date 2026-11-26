import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { D1ChatStore, TWELVE_HOURS_MS } from './d1ChatStore';
import { ZeroTrustManager } from './zeroTrust';

function createTempStorePath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aethex-d1-test-'));
  return path.join(dir, 'd1_store.json');
}

describe('Cloudflare D1 12-Hour Chat Retention & Aethi Device Transfer', () => {
  it('lists only titles and isolates single-thread loading', () => {
    const store = new D1ChatStore(createTempStorePath());
    const t0 = 1_700_000_000_000;

    store.saveMessage(
      {
        thread_id: 'thread_alpha',
        device_id: 'dev-01',
        role: 'user',
        content: 'Alpha secret body message one',
        title: 'Alpha Architecture Review',
      },
      t0
    );
    store.saveMessage(
      {
        thread_id: 'thread_beta',
        device_id: 'dev-01',
        role: 'user',
        content: 'Beta secret body message two',
        title: 'Beta Video Cut Plan',
      },
      t0 + 1000
    );

    const titles = store.getChatTitles('dev-01', 20, t0 + 2000);
    assert.equal(titles.length, 2);
    assert.equal(titles[0].title, 'Beta Video Cut Plan');
    assert.equal(titles[1].title, 'Alpha Architecture Review');
    assert.ok(!('content' in titles[0]));

    // Clicking Alpha loads ONLY Alpha messages
    const alpha = store.getThreadMessages('dev-01', 'thread_alpha', 200, t0 + 2000);
    assert.equal(alpha.messages.length, 1);
    assert.equal(alpha.messages[0].content, 'Alpha secret body message one');
  });

  it('prunes conversations older than 12 hours while retaining recent ones', () => {
    const store = new D1ChatStore(createTempStorePath());
    const t0 = 1_700_000_000_000;

    store.saveMessage(
      {
        thread_id: 'old_thread',
        device_id: 'dev-01',
        role: 'user',
        content: 'Old prompt from 13 hours ago',
        title: 'Expired Session',
      },
      t0
    );

    const thirteenHoursLater = t0 + TWELVE_HOURS_MS + 3600_000;
    store.saveMessage(
      {
        thread_id: 'fresh_thread',
        device_id: 'dev-01',
        role: 'user',
        content: 'Fresh prompt within 12h',
        title: 'Fresh Session',
      },
      thirteenHoursLater
    );

    const titles = store.getChatTitles('dev-01', 20, thirteenHoursLater + 1000);
    assert.equal(titles.length, 1);
    assert.equal(titles[0].thread_id, 'fresh_thread');
    assert.equal(titles[0].title, 'Fresh Session');
  });

  it('transfers last 12h D1 messages to signed Zero-Trust Aethi queue', () => {
    const store = new D1ChatStore(createTempStorePath());
    const zt = new ZeroTrustManager('unit-test-secret');
    const t0 = 1_700_000_000_000;

    store.saveMessage(
      {
        thread_id: 'thread_sync',
        device_id: 'dev-sync',
        role: 'user',
        content: 'Sync this conversation to Aethi',
        title: 'Device Sync Chat',
      },
      t0
    );
    store.saveMessage(
      {
        thread_id: 'thread_sync',
        device_id: 'dev-sync',
        role: 'assistant',
        content: 'Synced safely!',
      },
      t0 + 500
    );

    const transfer = store.transferLast12HoursToAethi(zt, 'dev-sync', undefined, t0 + 1000);
    assert.equal(transfer.transferredThreads, 1);
    assert.equal(transfer.transferredMessages, 2);
    assert.equal(transfer.envelopes.length, 2);
    assert.equal(transfer.envelopes[0].data.type, 'chat_save');

    const polled = store.pollQueuedEnvelopes('dev-sync', 10, t0 + 1500);
    assert.equal(polled.length, 2);
    const titles = store.getChatTitles('dev-sync', 10, t0 + 1500);
    assert.equal(titles[0].aethi_synced, true);
  });
});
