export interface ProviderProfile {
  id: 'auto' | 'fast-edge' | 'deep-reasoning' | 'code-architect' | 'vision-docs';
  label: string;
  description: string;
  available: boolean;
}

export interface ExecutedChatAction {
  type:
    | 'open_tool'
    | 'navigate_tab'
    | 'draft_video_edit'
    | 'toggle_theme'
    | 'load_workflow_preset'
    | 'run_automation_bot';
  payload: Record<string, unknown>;
}

export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  dataBase64?: string;
  textContent?: string;
  previewUrl?: string;
  kind?: 'zip' | 'audio' | 'image' | 'pdf' | 'text' | 'binary';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  attachments?: Array<{ name: string; mimeType: string; sizeBytes: number; previewUrl?: string }>;
  suggestedTool?: string;
  videoInstruction?: string;
  engine?: string;
  liveAiConnected?: boolean;
  isError?: boolean;
  executedActions?: ExecutedChatAction[];
  toolResults?: Array<Record<string, unknown>>;
}

export interface ChatThreadTitleItem {
  thread_id: string;
  title: string;
  updated_at: number;
  expires_at: number;
  aethi_synced: boolean;
  message_count: number;
}

export interface ZeroTrustStatus {
  deviceId: string;
  trusted: boolean;
  fingerprint: string;
  lastSeenAt: number | null;
  scopes: string[];
  hmacAlgorithm: string;
  replayWindowSec: number;
  maxSkewSec: number;
  envSecretBound?: boolean;
}

export interface ConsoleLogItem {
  id: string;
  timestamp: string;
  level: 'info' | 'success' | 'api' | 'warn';
  message: string;
}

export interface SiteContextPayload {
  pinnedToolIds: string[];
  availableTools: string[];
  recentActivity: string[];
}
