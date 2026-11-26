import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ZeroTrustEnvelope, ZeroTrustManager, sanitizeDeviceId } from './zeroTrust';

export const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

export interface D1ChatThreadRecord {
  thread_id: string;
  device_id: string;
  title: string;
  created_at: number;
  updated_at: number;
  aethi_synced: boolean;
  aethi_last_sync_at: number | null;
}

export interface D1ChatMessageRecord {
  id: string;
  thread_id: string;
  device_id: string;
  role: 'user' | 'assistant';
  content: string;
  engine?: string;
  suggestedTool?: string;
  videoInstruction?: string;
  attachments?: Array<{ name: string; mimeType: string; sizeBytes: number }>;
  executedActions?: Array<{ type: string; payload: Record<string, unknown> }>;
  toolResults?: Array<Record<string, unknown>>;
  created_at: number;
}

export interface QueuedAethiCommand {
  command_id: string;
  device_id: string;
  kind: 'task' | 'chat_save' | 'chat_get_thread';
  status: 'queued' | 'dispatched' | 'completed' | 'failed';
  envelope: ZeroTrustEnvelope;
  result?: Record<string, unknown>;
  error?: string;
  created_at: number;
  updated_at: number;
}

interface PersistedD1State {
  threads: D1ChatThreadRecord[];
  messages: D1ChatMessageRecord[];
  commands: QueuedAethiCommand[];
}

export function deriveThreadTitle(content: string): string {
  const cleaned = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#*`>_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'Untitled Session';
  return cleaned.length > 64 ? `${cleaned.slice(0, 61).trimEnd()}...` : cleaned;
}

export class D1ChatStore {
  private readonly storePath: string;
  private state: PersistedD1State;

  constructor(storePath?: string) {
    this.storePath = storePath || path.resolve(process.cwd(), 'd1_chat_history.json');
    this.state = this.loadFromDisk();
    this.pruneExpired();
  }

  private loadFromDisk(): PersistedD1State {
    try {
      if (fs.existsSync(this.storePath)) {
        const raw = fs.readFileSync(this.storePath, 'utf8');
        const parsed = JSON.parse(raw) as Partial<PersistedD1State>;
        return {
          threads: Array.isArray(parsed.threads) ? parsed.threads : [],
          messages: Array.isArray(parsed.messages) ? parsed.messages : [],
          commands: Array.isArray(parsed.commands) ? parsed.commands : [],
        };
      }
    } catch {
      // Recover cleanly with fresh store if disk file corrupt
    }
    return { threads: [], messages: [], commands: [] };
  }

  private saveToDisk(): void {
    try {
      const dir = path.dirname(this.storePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.storePath, JSON.stringify(this.state, null, 2), 'utf8');
    } catch {
      // Non-fatal in read-only edge runtimes
    }
  }

  /**
   * Removes any D1 chat messages and threads older than the 12-hour retention window.
   * Conversations transferred to `aethi` remain permanently stored on the user's device SQLite (`aethi_chat.db`).
   */
  pruneExpired(nowMs = Date.now()): { prunedMessages: number; prunedThreads: number } {
    const cutoff = nowMs - TWELVE_HOURS_MS;
    const beforeMsgs = this.state.messages.length;
    const beforeThreads = this.state.threads.length;

    this.state.messages = this.state.messages.filter((m) => m.created_at >= cutoff);
    const activeThreadIds = new Set(this.state.messages.map((m) => m.thread_id));
    this.state.threads = this.state.threads.filter(
      (t) => t.updated_at >= cutoff || activeThreadIds.has(t.thread_id)
    );
    // Keep command queue bounded to 24h for audit/polling safety
    const cmdCutoff = nowMs - TWELVE_HOURS_MS * 2;
    this.state.commands = this.state.commands.filter((c) => c.updated_at >= cmdCutoff);

    const prunedMessages = beforeMsgs - this.state.messages.length;
    const prunedThreads = beforeThreads - this.state.threads.length;
    if (prunedMessages > 0 || prunedThreads > 0) {
      this.saveToDisk();
    }
    return { prunedMessages, prunedThreads };
  }

  upsertTitle(
    deviceId: string,
    threadId: string,
    title: string,
    nowMs = Date.now()
  ): D1ChatThreadRecord {
    this.pruneExpired(nowMs);
    const cleanDevice = sanitizeDeviceId(deviceId);
    const cleanThread = String(threadId || '').trim() || `thread_${nowMs}`;
    const cleanTitle = deriveThreadTitle(title);

    let existing = this.state.threads.find(
      (t) => t.thread_id === cleanThread && t.device_id === cleanDevice
    );
    if (!existing) {
      existing = {
        thread_id: cleanThread,
        device_id: cleanDevice,
        title: cleanTitle,
        created_at: nowMs,
        updated_at: nowMs,
        aethi_synced: false,
        aethi_last_sync_at: null,
      };
      this.state.threads.unshift(existing);
    } else {
      existing.title = cleanTitle;
      existing.updated_at = nowMs;
    }

    this.saveToDisk();
    return existing;
  }

  saveMessage(
    input: {
      id?: string;
      thread_id: string;
      device_id: string;
      role: 'user' | 'assistant';
      content: string;
      title?: string;
      engine?: string;
      suggestedTool?: string;
      videoInstruction?: string;
      attachments?: Array<{ name: string; mimeType: string; sizeBytes: number }>;
      executedActions?: Array<{ type: string; payload: Record<string, unknown> }>;
      toolResults?: Array<Record<string, unknown>>;
    },
    nowMs = Date.now()
  ): { thread: D1ChatThreadRecord; message: D1ChatMessageRecord } {
    this.pruneExpired(nowMs);
    const cleanDevice = sanitizeDeviceId(input.device_id);
    const cleanThread = String(input.thread_id || '').trim() || `thread_${nowMs}`;
    const msgId =
      input.id || `msg_${nowMs}_${crypto.randomBytes(4).toString('hex')}`;

    let thread = this.state.threads.find(
      (t) => t.thread_id === cleanThread && t.device_id === cleanDevice
    );
    if (!thread) {
      thread = {
        thread_id: cleanThread,
        device_id: cleanDevice,
        title: deriveThreadTitle(input.title || input.content),
        created_at: nowMs,
        updated_at: nowMs,
        aethi_synced: false,
        aethi_last_sync_at: null,
      };
      this.state.threads.unshift(thread);
    } else {
      thread.updated_at = nowMs;
      if (input.title && input.title.trim()) {
        thread.title = deriveThreadTitle(input.title);
      }
    }

    const msg: D1ChatMessageRecord = {
      id: msgId,
      thread_id: cleanThread,
      device_id: cleanDevice,
      role: input.role,
      content: String(input.content || ''),
      engine: input.engine,
      suggestedTool: input.suggestedTool,
      videoInstruction: input.videoInstruction,
      attachments: input.attachments,
      executedActions: input.executedActions,
      toolResults: input.toolResults,
      created_at: nowMs,
    };
    this.state.messages.push(msg);
    this.saveToDisk();
    return { thread, message: msg };
  }

  /**
   * Returns ONLY the titles and minimal thread metadata for conversations within the 12-hour D1 window.
   * Never leaks message bodies in the titles list.
   */
  getChatTitles(
    deviceId: string,
    limit = 50,
    nowMs = Date.now()
  ): Array<{
    thread_id: string;
    title: string;
    updated_at: number;
    expires_at: number;
    aethi_synced: boolean;
    message_count: number;
  }> {
    this.pruneExpired(nowMs);
    const cleanDevice = sanitizeDeviceId(deviceId);
    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));

    const msgCounts = new Map<string, number>();
    for (const msg of this.state.messages) {
      if (msg.device_id === cleanDevice) {
        msgCounts.set(msg.thread_id, (msgCounts.get(msg.thread_id) || 0) + 1);
      }
    }

    return this.state.threads
      .filter((t) => t.device_id === cleanDevice)
      .sort((a, b) => b.updated_at - a.updated_at)
      .slice(0, safeLimit)
      .map((t) => ({
        thread_id: t.thread_id,
        title: t.title,
        updated_at: t.updated_at,
        expires_at: t.updated_at + TWELVE_HOURS_MS,
        aethi_synced: t.aethi_synced,
        message_count: msgCounts.get(t.thread_id) || 0,
      }));
  }

  /**
   * Loads ONLY the messages for a single specific conversation thread.
   */
  getThreadMessages(
    deviceId: string,
    threadId: string,
    limit = 200,
    nowMs = Date.now()
  ): {
    thread: D1ChatThreadRecord | null;
    messages: D1ChatMessageRecord[];
  } {
    this.pruneExpired(nowMs);
    const cleanDevice = sanitizeDeviceId(deviceId);
    const cleanThread = String(threadId || '').trim();
    const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 200));

    const thread =
      this.state.threads.find(
        (t) => t.thread_id === cleanThread && t.device_id === cleanDevice
      ) || null;

    const messages = this.state.messages
      .filter((m) => m.device_id === cleanDevice && m.thread_id === cleanThread)
      .sort((a, b) => a.created_at - b.created_at)
      .slice(-safeLimit);

    return { thread, messages };
  }

  deleteThread(deviceId: string, threadId: string): boolean {
    const cleanDevice = sanitizeDeviceId(deviceId);
    const cleanThread = String(threadId || '').trim();
    const prevCount = this.state.threads.length;
    this.state.threads = this.state.threads.filter(
      (t) => !(t.device_id === cleanDevice && t.thread_id === cleanThread)
    );
    this.state.messages = this.state.messages.filter(
      (m) => !(m.device_id === cleanDevice && m.thread_id === cleanThread)
    );
    const deleted = this.state.threads.length < prevCount;
    if (deleted) {
      this.saveToDisk();
    }
    return deleted;
  }

  queueCommand(
    zeroTrust: ZeroTrustManager,
    deviceId: string,
    kind: 'task' | 'chat_save' | 'chat_get_thread',
    data: Record<string, unknown>,
    nowMs = Date.now()
  ): QueuedAethiCommand {
    const cleanDevice = sanitizeDeviceId(deviceId);
    const envelope = zeroTrust.signCommand(kind, data);
    const cmd: QueuedAethiCommand = {
      command_id: envelope.command_id,
      device_id: cleanDevice,
      kind,
      status: 'queued',
      envelope,
      created_at: nowMs,
      updated_at: nowMs,
    };
    this.state.commands.push(cmd);
    this.saveToDisk();
    return cmd;
  }

  pollQueuedEnvelopes(deviceId: string, maxItems = 10, nowMs = Date.now()): ZeroTrustEnvelope[] {
    const cleanDevice = sanitizeDeviceId(deviceId);
    const pending = this.state.commands
      .filter((c) => c.device_id === cleanDevice && c.status === 'queued')
      .slice(0, maxItems);

    if (pending.length > 0) {
      for (const cmd of pending) {
        cmd.status = 'dispatched';
        cmd.updated_at = nowMs;
      }
      this.saveToDisk();
    }
    return pending.map((c) => c.envelope);
  }

  completeCommand(
    commandId: string,
    result: Record<string, unknown>,
    ok = true,
    nowMs = Date.now()
  ): QueuedAethiCommand | null {
    const cmd = this.state.commands.find((c) => c.command_id === commandId);
    if (!cmd) return null;
    cmd.status = ok ? 'completed' : 'failed';
    cmd.result = result;
    if (!ok && typeof result.error === 'string') {
      cmd.error = result.error;
    }
    cmd.updated_at = nowMs;
    this.saveToDisk();
    return cmd;
  }

  getCommandStatus(commandId: string): QueuedAethiCommand | null {
    return this.state.commands.find((c) => c.command_id === commandId) || null;
  }

  /**
   * Batches the last 12 hours of D1 conversations into Zero-Trust signed `chat_save`
   * envelopes queued for `aethi_hub` to persist permanently on the user's device (`aethi_chat.db`).
   */
  transferLast12HoursToAethi(
    zeroTrust: ZeroTrustManager,
    deviceId: string,
    specificThreadId?: string,
    nowMs = Date.now()
  ): {
    transferredMessages: number;
    transferredThreads: number;
    commandIds: string[];
    envelopes: ZeroTrustEnvelope[];
    threadsExported: Array<{ thread_id: string; title: string; messages: D1ChatMessageRecord[] }>;
  } {
    this.pruneExpired(nowMs);
    const cleanDevice = sanitizeDeviceId(deviceId);
    const cutoff = nowMs - TWELVE_HOURS_MS;

    const eligibleMessages = this.state.messages.filter(
      (m) =>
        m.device_id === cleanDevice &&
        m.created_at >= cutoff &&
        (!specificThreadId || m.thread_id === specificThreadId)
    );

    const threadMap = new Map<string, D1ChatThreadRecord>();
    for (const t of this.state.threads) {
      if (t.device_id === cleanDevice) {
        threadMap.set(t.thread_id, t);
      }
    }

    const commandIds: string[] = [];
    const envelopes: ZeroTrustEnvelope[] = [];
    const grouped = new Map<string, { thread_id: string; title: string; messages: D1ChatMessageRecord[] }>();

    for (const msg of eligibleMessages) {
      const thread = threadMap.get(msg.thread_id);
      const title = thread?.title || deriveThreadTitle(msg.content);
      const queued = this.queueCommand(
        zeroTrust,
        cleanDevice,
        'chat_save',
        {
          thread_id: msg.thread_id,
          role: msg.role,
          content: msg.content,
          title,
        },
        nowMs
      );
      commandIds.push(queued.command_id);
      envelopes.push(queued.envelope);

      if (thread) {
        thread.aethi_synced = true;
        thread.aethi_last_sync_at = nowMs;
      }

      if (!grouped.has(msg.thread_id)) {
        grouped.set(msg.thread_id, {
          thread_id: msg.thread_id,
          title,
          messages: [],
        });
      }
      grouped.get(msg.thread_id)!.messages.push(msg);
    }

    this.saveToDisk();

    return {
      transferredMessages: eligibleMessages.length,
      transferredThreads: grouped.size,
      commandIds,
      envelopes,
      threadsExported: Array.from(grouped.values()),
    };
  }
}
