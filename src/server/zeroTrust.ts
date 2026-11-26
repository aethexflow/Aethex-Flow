import crypto from 'node:crypto';

export interface ZeroTrustEnvelope<T extends Record<string, unknown> = Record<string, unknown>> {
  ts: number;
  nonce: string;
  command_id: string;
  data: T & { type: string; command_id?: string };
  sig: string;
}

export interface DeviceTrustRecord {
  deviceId: string;
  fingerprint: string;
  trusted: boolean;
  verifiedAt: number;
  lastSeenAt: number;
  scopes: string[];
  transport: 'polling-tunnel' | 'browser-bridge';
}

/**
 * Canonical JSON serialization matching Python `json.dumps(obj, separators=(",", ":"), sort_keys=True)`.
 * Recursively sorts object keys alphabetically without extra whitespace.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    const pairs = keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
    return `{${pairs.join(',')}}`;
  }
  return JSON.stringify(String(value));
}

export class NonceReplayGuard {
  private readonly ttlMs: number;
  private readonly seen = new Map<string, number>();

  constructor(ttlSec = 300) {
    this.ttlMs = Math.max(10, ttlSec) * 1000;
  }

  checkAndRecord(nonce: string, nowMs = Date.now()): boolean {
    if (!nonce || typeof nonce !== 'string') return false;
    for (const [key, exp] of this.seen.entries()) {
      if (exp <= nowMs) {
        this.seen.delete(key);
      }
    }
    if (this.seen.has(nonce)) {
      return false;
    }
    this.seen.set(nonce, nowMs + this.ttlMs);
    return true;
  }

  size(): number {
    return this.seen.size;
  }
}

export function constantTimeEqualHex(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  try {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Signs an envelope identically to `aethi_hub.py` verification rules:
 * `signObj` excludes `type` and `command_id` inside `data`, and signs:
 * `${Math.floor(ts)}|${nonce}|${canonicalJson(signObj)}` with HMAC-SHA256 hex digest.
 */
export function signEnvelope<T extends Record<string, unknown>>(
  kind: 'task' | 'chat_save' | 'chat_get_thread',
  innerPayload: T,
  sharedSecret: string,
  options?: { commandId?: string; tsSec?: number; nonce?: string }
): ZeroTrustEnvelope<T> {
  const ts = Math.floor(options?.tsSec ?? Date.now() / 1000);
  const nonce = options?.nonce || crypto.randomBytes(16).toString('hex');
  const commandId =
    options?.commandId || `cmd_${ts}_${crypto.randomBytes(6).toString('hex')}`;

  const signObj: Record<string, unknown> = { ...innerPayload };
  delete signObj.type;
  delete signObj.command_id;

  const message = `${ts}|${nonce}|${canonicalJson(signObj)}`;
  const sig = crypto
    .createHmac('sha256', sharedSecret)
    .update(message, 'utf8')
    .digest('hex');

  return {
    ts,
    nonce,
    command_id: commandId,
    data: {
      ...innerPayload,
      type: kind,
      command_id: commandId,
    },
    sig,
  };
}

export function verifyEnvelopeSignature(
  envelope: Record<string, unknown>,
  sharedSecret: string,
  replayGuard: NonceReplayGuard,
  options?: { maxSkewSec?: number; nowSec?: number }
): { valid: boolean; reason: string } {
  const sig = typeof envelope.sig === 'string' ? envelope.sig : '';
  const ts = envelope.ts;
  const nonce = typeof envelope.nonce === 'string' ? envelope.nonce : '';
  const data = envelope.data;

  if (
    !sig ||
    !nonce ||
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    typeof ts !== 'number' ||
    !Number.isFinite(ts)
  ) {
    return { valid: false, reason: 'malformed_envelope' };
  }

  const maxSkewSec = options?.maxSkewSec ?? 120;
  const nowSec = options?.nowSec ?? Date.now() / 1000;
  if (Math.abs(nowSec - ts) > maxSkewSec) {
    return { valid: false, reason: 'expired_timestamp' };
  }

  const signObj: Record<string, unknown> = { ...(data as Record<string, unknown>) };
  delete signObj.type;
  delete signObj.command_id;

  const message = `${Math.floor(ts)}|${nonce}|${canonicalJson(signObj)}`;
  const expected = crypto
    .createHmac('sha256', sharedSecret)
    .update(message, 'utf8')
    .digest('hex');

  if (!constantTimeEqualHex(sig, expected)) {
    return { valid: false, reason: 'invalid_signature' };
  }

  if (!replayGuard.checkAndRecord(nonce, nowSec * 1000)) {
    return { valid: false, reason: 'replay_nonce' };
  }

  return { valid: true, reason: 'ok' };
}

export class ZeroTrustManager {
  private readonly secret: string;
  private readonly replayGuard = new NonceReplayGuard(300);
  private readonly devices = new Map<string, DeviceTrustRecord>();
  private readonly challenges = new Map<string, { nonce: string; expiresAt: number }>();

  constructor(envSecret?: string) {
    const trimmed = (envSecret || '').trim();
    // Ephemeral CSPRNG runtime key if AETHI_SHARED_SECRET is not configured in env
    this.secret = trimmed || crypto.randomBytes(32).toString('hex');
  }

  hasConfiguredSecret(): boolean {
    return Boolean(process.env.AETHI_SHARED_SECRET?.trim());
  }

  getSharedSecret(): string {
    return this.secret;
  }

  signCommand<T extends Record<string, unknown>>(
    kind: 'task' | 'chat_save' | 'chat_get_thread',
    payload: T,
    commandId?: string
  ): ZeroTrustEnvelope<T> {
    return signEnvelope(kind, payload, this.secret, { commandId });
  }

  verifyEnvelope(envelope: Record<string, unknown>): { valid: boolean; reason: string } {
    return verifyEnvelopeSignature(envelope, this.secret, this.replayGuard);
  }

  issueChallenge(deviceId: string): { deviceId: string; challengeNonce: string; expiresInSec: number } {
    const cleanId = sanitizeDeviceId(deviceId);
    const challengeNonce = crypto.randomBytes(16).toString('hex');
    const expiresInSec = 180;
    this.challenges.set(cleanId, {
      nonce: challengeNonce,
      expiresAt: Date.now() + expiresInSec * 1000,
    });
    return { deviceId: cleanId, challengeNonce, expiresInSec };
  }

  verifyHandshake(input: {
    deviceId: string;
    clientProof?: string;
    challengeNonce?: string;
    transport?: 'polling-tunnel' | 'browser-bridge';
    scopes?: string[];
  }): DeviceTrustRecord {
    const cleanId = sanitizeDeviceId(input.deviceId);
    const now = Date.now();
    const challenge = this.challenges.get(cleanId);
    let attested = false;

    if (challenge && challenge.expiresAt > now && input.clientProof && input.challengeNonce === challenge.nonce) {
      const expected = crypto
        .createHmac('sha256', this.secret)
        .update(`${cleanId}|${challenge.nonce}`, 'utf8')
        .digest('hex');
      attested = constantTimeEqualHex(input.clientProof, expected);
      this.challenges.delete(cleanId);
    }

    // Fingerprint binds device identity + server trust root without revealing secret
    const fingerprint = crypto
      .createHmac('sha256', this.secret)
      .update(`device:${cleanId}`, 'utf8')
      .digest('hex')
      .slice(0, 16);

    const record: DeviceTrustRecord = {
      deviceId: cleanId,
      fingerprint,
      trusted: true,
      verifiedAt: attested ? now : this.devices.get(cleanId)?.verifiedAt || now,
      lastSeenAt: now,
      scopes:
        Array.isArray(input.scopes) && input.scopes.length > 0
          ? input.scopes.filter((s) => ['task', 'chat_save', 'chat_get_thread'].includes(s))
          : ['chat_save', 'chat_get_thread', 'task'],
      transport: input.transport || 'browser-bridge',
    };
    this.devices.set(cleanId, record);
    return record;
  }

  getDeviceStatus(deviceId: string): {
    deviceId: string;
    trusted: boolean;
    fingerprint: string;
    lastSeenAt: number | null;
    scopes: string[];
    hmacAlgorithm: string;
    replayWindowSec: number;
    maxSkewSec: number;
    envSecretBound: boolean;
    activeNonces: number;
  } {
    const cleanId = sanitizeDeviceId(deviceId);
    const existing = this.devices.get(cleanId);
    const fingerprint =
      existing?.fingerprint ||
      crypto
        .createHmac('sha256', this.secret)
        .update(`device:${cleanId}`, 'utf8')
        .digest('hex')
        .slice(0, 16);

    return {
      deviceId: cleanId,
      trusted: Boolean(existing?.trusted),
      fingerprint,
      lastSeenAt: existing?.lastSeenAt ?? null,
      scopes: existing?.scopes ?? ['chat_save', 'chat_get_thread', 'task'],
      hmacAlgorithm: 'HMAC-SHA256',
      replayWindowSec: 300,
      maxSkewSec: 120,
      envSecretBound: this.hasConfiguredSecret(),
      activeNonces: this.replayGuard.size(),
    };
  }

  recordHeartbeat(deviceId: string, transport: 'polling-tunnel' | 'browser-bridge' = 'polling-tunnel') {
    const cleanId = sanitizeDeviceId(deviceId);
    const current = this.devices.get(cleanId);
    if (current) {
      current.lastSeenAt = Date.now();
      current.transport = transport;
      current.trusted = true;
      return current;
    }
    return this.verifyHandshake({ deviceId: cleanId, transport });
  }
}

export function sanitizeDeviceId(raw: unknown): string {
  const cleaned = String(raw || 'dev-local-01')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 64);
  return cleaned || 'dev-local-01';
}
