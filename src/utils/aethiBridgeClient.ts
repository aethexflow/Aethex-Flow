import type { ChatMessage, ChatThreadTitleItem, ProviderProfile, ZeroTrustStatus } from '../types/chat';

const DEVICE_STORAGE_KEY = 'aethexflow_device_id';

export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'dev-local-01';
  try {
    const existing = window.localStorage.getItem(DEVICE_STORAGE_KEY);
    if (existing && existing.trim()) return existing.trim();
    const generated = `dev-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(DEVICE_STORAGE_KEY, generated);
    return generated;
  } catch {
    return 'dev-local-01';
  }
}

export async function fetchProviderProfiles(): Promise<{
  activeLanesCount: number;
  liveCloudReady: boolean;
  profiles: ProviderProfile[];
}> {
  const res = await fetch('/api/providers');
  if (!res.ok) {
    throw new Error('Failed to load Aethi routing profiles');
  }
  return res.json();
}

export async function fetchChatTitles(
  deviceId: string,
  limit = 50
): Promise<{ titles: ChatThreadTitleItem[]; retentionHours: number }> {
  const res = await fetch(
    `/api/chat/titles?device_id=${encodeURIComponent(deviceId)}&limit=${limit}`
  );
  if (!res.ok) {
    return { titles: [], retentionHours: 12 };
  }
  const json = await res.json();
  return {
    titles: Array.isArray(json.titles) ? json.titles : [],
    retentionHours: Number(json.retention_hours || 12),
  };
}

export async function loadSingleChatThread(
  deviceId: string,
  threadId: string,
  limit = 200
): Promise<{
  ok: boolean;
  threadId: string;
  title: string | null;
  aethiSynced: boolean;
  messages: ChatMessage[];
}> {
  const res = await fetch(
    `/api/chat/thread?device_id=${encodeURIComponent(deviceId)}&thread_id=${encodeURIComponent(
      threadId
    )}&limit=${limit}`
  );
  if (!res.ok) {
    return { ok: false, threadId, title: null, aethiSynced: false, messages: [] };
  }
  const json = await res.json();
  const rawMsgs = Array.isArray(json.messages) ? json.messages : [];
  const messages: ChatMessage[] = rawMsgs.map((m: any) => ({
    id: String(m.id || `msg_${Math.random().toString(36).slice(2, 8)}`),
    role: m.role === 'user' ? 'user' : 'assistant',
    content: String(m.content || ''),
    timestamp: m.created_at
      ? new Date(Number(m.created_at)).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })
      : '12h D1',
    engine: m.engine ? String(m.engine) : 'aethexflow-engine',
    suggestedTool: m.suggestedTool || m.suggested_tool || undefined,
    videoInstruction: m.videoInstruction || undefined,
    attachments: Array.isArray(m.attachments) ? m.attachments : undefined,
    executedActions: Array.isArray(m.executedActions) ? m.executedActions : undefined,
    toolResults: Array.isArray(m.toolResults) ? m.toolResults : undefined,
    liveAiConnected: true,
  }));

  return {
    ok: true,
    threadId,
    title: json.title || null,
    aethiSynced: Boolean(json.aethi_synced),
    messages,
  };
}

export async function deleteChatThread(deviceId: string, threadId: string): Promise<boolean> {
  const res = await fetch(
    `/api/chat/thread?device_id=${encodeURIComponent(deviceId)}&thread_id=${encodeURIComponent(
      threadId
    )}`,
    { method: 'DELETE' }
  );
  if (!res.ok) return false;
  const json = await res.json();
  return Boolean(json.deleted);
}

export async function transferLast12HoursToAethi(
  deviceId: string,
  threadId?: string
): Promise<{
  ok: boolean;
  transferredMessages: number;
  transferredThreads: number;
  commandIds: string[];
  envelopes: unknown[];
  threadsExported: unknown[];
  timestamp: string;
}> {
  const res = await fetch('/api/chat/transfer-aethi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: deviceId, thread_id: threadId }),
  });
  if (!res.ok) {
    throw new Error('Failed to queue 12h D1 history to Aethi');
  }
  return res.json();
}

export async function fetchZeroTrustStatus(deviceId: string): Promise<ZeroTrustStatus> {
  const res = await fetch(`/api/zero-trust/status?device_id=${encodeURIComponent(deviceId)}`);
  if (!res.ok) {
    throw new Error('Failed to verify Zero-Trust device state');
  }
  return res.json();
}

export async function performZeroTrustHandshake(
  deviceId: string,
  transport: 'browser-bridge' | 'polling-tunnel' = 'browser-bridge'
): Promise<ZeroTrustStatus> {
  const res = await fetch('/api/zero-trust/handshake', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      device_id: deviceId,
      transport,
      scopes: ['chat_save', 'chat_get_thread', 'task'],
    }),
  });
  if (!res.ok) {
    throw new Error('Zero-Trust device handshake failed');
  }
  return res.json();
}
