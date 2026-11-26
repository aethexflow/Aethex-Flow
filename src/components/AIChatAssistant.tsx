import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send,
  Bot,
  User,
  Sparkles,
  RefreshCw,
  ArrowRight,
  Film,
  Trash2,
  SunMoon,
  GitBranch,
  Terminal,
  Paperclip,
  X,
  FileText,
  Image as ImageIcon,
  AlertCircle,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  ShieldCheck,
  History,
  FileArchive,
  Headphones,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { buildSafeDocId, appendUserChatMessage } from '../utils/firestoreWorkspace';
import { speakWithAethiTTS, stopAethiTTS } from '../utils/tts';
import { processLocalFiles } from '../utils/fileUploadHandler';
import {
  getOrCreateDeviceId,
  fetchProviderProfiles,
  fetchChatTitles,
  loadSingleChatThread,
  deleteChatThread,
  transferLast12HoursToAethi,
  fetchZeroTrustStatus,
  performZeroTrustHandshake,
} from '../utils/aethiBridgeClient';
import { ChatHistorySidebar } from './ChatHistorySidebar';
import { ZeroTrustPanel } from './ZeroTrustPanel';
import { ChatConsoleDrawer } from './ChatConsoleDrawer';
import type {
  ChatAttachment,
  ChatMessage,
  ChatThreadTitleItem,
  ConsoleLogItem,
  ExecutedChatAction,
  ProviderProfile,
  SiteContextPayload,
  ZeroTrustStatus,
} from '../types/chat';

export type { ExecutedChatAction, ChatAttachment, SiteContextPayload };

interface AIChatAssistantProps {
  theme: 'dark' | 'light';
  onOpenTool: (id: string) => void;
  onSendToVideoStudio?: (instruction: string) => void;
  onExecuteSiteActions?: (actions: ExecutedChatAction[]) => void;
  siteContext: SiteContextPayload;
  pendingChatPrompt?: string | null;
  onConsumePendingChatPrompt?: () => void;
  onLogActivity?: (action: string) => void;
}

function createThreadId(): string {
  return `thread_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function buildWelcomeMessage(userName: string): ChatMessage {
  return {
    id: 'msg_welcome',
    role: 'assistant',
    content: `Assalam-o-Alaikum, ${userName}! I am Aethi Copilot, connected to your AethexFlow workspace and Zero-Trust on-device runner.

You can ask me to:
- Launch any studio or tool (Video Studio, Workflow DAG, PDF Compressor, Crypto Vault)
- Inspect local files including .zip archives, CSV, JSON, code, PDFs, images, and audio
- Run live Web Monitor probes, AI Digests, or Data Normalizer automations
- Save the last 12 hours of chat history in Cloudflare D1 and transfer sessions to Aethi on your device

How can I assist your workflow today?`,
    timestamp: 'Ready',
    engine: 'aethexflow-engine',
  };
}

export const AIChatAssistant: React.FC<AIChatAssistantProps> = ({
  theme,
  onOpenTool,
  onSendToVideoStudio,
  onExecuteSiteActions,
  siteContext,
  pendingChatPrompt,
  onConsumePendingChatPrompt,
  onLogActivity,
}) => {
  const isDark = theme === 'dark';
  const { user, profile } = useAuth();
  const displayName = profile?.displayName || user?.displayName || 'Creator';

  const [deviceId] = useState<string>(() => getOrCreateDeviceId());
  const [activeThreadId, setActiveThreadId] = useState<string>(() => createThreadId());
  const [activeThreadTitle, setActiveThreadTitle] = useState<string>('New Conversation');
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    buildWelcomeMessage(displayName),
  ]);

  const [providerProfiles, setProviderProfiles] = useState<ProviderProfile[]>([
    {
      id: 'auto',
      label: 'Aethi Auto Router',
      description: 'Dynamically selects the optimal AethexFlow engine.',
      available: true,
    },
  ]);
  const [selectedProfile, setSelectedProfile] = useState<string>('auto');

  const [chatTitles, setChatTitles] = useState<ChatThreadTitleItem[]>([]);
  const [isLoadingTitles, setIsLoadingTitles] = useState<boolean>(false);
  const [isLoadingThread, setIsLoadingThread] = useState<boolean>(false);
  const [isTransferring, setIsTransferring] = useState<boolean>(false);
  const [transferFeedback, setTransferFeedback] = useState<string | null>(null);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState<boolean>(false);

  const [zeroTrustStatus, setZeroTrustStatus] = useState<ZeroTrustStatus | null>(null);
  const [showZeroTrust, setShowZeroTrust] = useState<boolean>(false);
  const [isVerifyingZeroTrust, setIsVerifyingZeroTrust] = useState<boolean>(false);

  const [inputMessage, setInputMessage] = useState<string>('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [noticeBanner, setNoticeBanner] = useState<{
    message: string;
    showAudioUploadFallback?: boolean;
  } | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const [autoSpeakReplies, setAutoSpeakReplies] = useState<boolean>(false);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [isListening, setIsListening] = useState<boolean>(false);

  const [showConsole, setShowConsole] = useState<boolean>(false);
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLogItem[]>([
    {
      id: 'log_init',
      timestamp: new Date().toLocaleTimeString(),
      level: 'success',
      message: 'AethexFlow modular AI router & Zero-Trust Aethi runtime initialized.',
    },
    {
      id: 'log_d1',
      timestamp: new Date().toLocaleTimeString(),
      level: 'info',
      message: 'Cloudflare D1 12-hour chat retention window active.',
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioFallbackInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<any>(null);

  const addLog = useCallback((level: ConsoleLogItem['level'], message: string) => {
    setConsoleLogs((prev) => [
      ...prev.slice(-49),
      {
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toLocaleTimeString(),
        level,
        message,
      },
    ]);
  }, []);

  const refreshTitles = useCallback(async () => {
    setIsLoadingTitles(true);
    try {
      const data = await fetchChatTitles(deviceId, 50);
      setChatTitles(data.titles);
    } finally {
      setIsLoadingTitles(false);
    }
  }, [deviceId]);

  useEffect(() => {
    void refreshTitles();
    void fetchProviderProfiles()
      .then((res) => {
        if (Array.isArray(res.profiles) && res.profiles.length > 0) {
          setProviderProfiles(res.profiles);
        }
      })
      .catch(() => {});

    void fetchZeroTrustStatus(deviceId)
      .then((zt) => setZeroTrustStatus(zt))
      .catch(() => {});
  }, [deviceId, refreshTitles]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    return () => {
      stopAethiTTS();
      try {
        recognitionRef.current?.stop?.();
      } catch {
        // ignore cleanup error
      }
    };
  }, []);

  // Context compaction at 40 messages: preserve last 20 and archive older context silently
  useEffect(() => {
    if (messages.length >= 40) {
      const older = messages.slice(0, messages.length - 20);
      const recent = messages.slice(-20);
      try {
        const existingStr = localStorage.getItem('aethexflow_chat_memory_notes');
        const existing = existingStr ? JSON.parse(existingStr) : [];
        const note = {
          id: `note_${Date.now()}`,
          threadId: activeThreadId,
          timestamp: new Date().toLocaleString(),
          archivedCount: older.length,
          summary: older.map((m) => `${m.role}: ${m.content.slice(0, 100)}`).join('; '),
        };
        localStorage.setItem(
          'aethexflow_chat_memory_notes',
          JSON.stringify([note, ...existing].slice(0, 10))
        );
      } catch {
        // ignore quota errors
      }
      setMessages([
        {
          id: `note_sys_${Date.now()}`,
          role: 'assistant',
          content: `Archived ${older.length} earlier messages into silent device context memory. Keeping the last 20 messages active.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          engine: 'aethi-bot',
        },
        ...recent,
      ]);
      onLogActivity?.(`Aethi archived ${older.length} messages to local memory`);
    }
  }, [messages.length, activeThreadId, onLogActivity]);

  const handleToggleSpeaking = (msg: ChatMessage) => {
    if (speakingMsgId === msg.id) {
      stopAethiTTS();
      setSpeakingMsgId(null);
      return;
    }
    speakWithAethiTTS(
      msg.content,
      () => setSpeakingMsgId(msg.id),
      () => setSpeakingMsgId(null)
    );
  };

  const handleToggleListening = async () => {
    if (isListening) {
      try {
        recognitionRef.current?.stop?.();
      } catch {
        // ignore stop failure
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      addLog('warn', 'Browser Web Speech API unavailable; offered audio file transcription fallback.');
      setNoticeBanner({
        message:
          'Live microphone speech recognition is unavailable in this browser context. Attach an audio recording (.wav, .mp3, .webm) to transcribe via Aethi Speech.',
        showAudioUploadFallback: true,
      });
      return;
    }

    // Check mic permission proactively when browser Permissions API supports it
    try {
      if (navigator.permissions?.query) {
        const permStatus = await navigator.permissions.query({
          name: 'microphone' as PermissionName,
        });
        if (permStatus.state === 'denied') {
          addLog('warn', 'Microphone permission is currently denied in browser settings.');
          setNoticeBanner({
            message:
              'Microphone permission is blocked in browser settings. Enable microphone access for this site or upload an audio clip instead.',
            showAudioUploadFallback: true,
          });
          return;
        }
      }
    } catch {
      // Permissions API check optional across browsers
    }

    try {
      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognitionRef.current = recognition;

      recognition.onstart = () => {
        setNoticeBanner(null);
        setIsListening(true);
        addLog('info', 'Voice capture started.');
      };

      recognition.onresult = (event: any) => {
        const result = event.results?.[0];
        if (!result?.[0]) return;
        const transcript = String(result[0].transcript || '');
        setInputMessage(transcript);
        if (result.isFinal && transcript.trim()) {
          setIsListening(false);
          addLog('success', `Voice transcribed: "${transcript.trim()}"`);
          void handleSend(transcript.trim());
        }
      };

      recognition.onerror = (event: any) => {
        const code = String(event?.error || 'unknown');
        setIsListening(false);
        recognitionRef.current = null;
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          addLog('warn', `Microphone access blocked (${code}); audio upload fallback available.`);
          setNoticeBanner({
            message:
              'Microphone access is blocked or unavailable inside this embedded view. Allow microphone permission in your browser or attach an audio file instead.',
            showAudioUploadFallback: true,
          });
        } else if (code === 'no-speech') {
          addLog('info', 'No speech detected before timeout.');
          setNoticeBanner({
            message: 'No speech was detected. Try speaking closer to your microphone or attach an audio file.',
            showAudioUploadFallback: true,
          });
        } else {
          addLog('warn', `Voice recognition interrupted (${code}).`);
          setNoticeBanner({
            message: `Voice input stopped (${code}). You can type your command or attach an audio file.`,
            showAudioUploadFallback: true,
          });
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognition.start();
    } catch {
      setIsListening(false);
      recognitionRef.current = null;
      addLog('warn', 'Could not open microphone stream; offering audio attachment.');
      setNoticeBanner({
        message:
          'Unable to initialize live microphone capture here. Attach an audio file to transcribe via Aethi Speech.',
        showAudioUploadFallback: true,
      });
    }
  };

  const handleFilesSelected = async (fileList: FileList | null) => {
    setNoticeBanner(null);
    const result = await processLocalFiles(fileList, attachments.length);
    for (const msg of result.logs) {
      addLog('info', msg);
    }
    if (result.errors.length > 0) {
      setNoticeBanner({ message: result.errors[0] });
    }
    if (result.items.length > 0) {
      setAttachments((prev) => [...prev, ...result.items].slice(0, 4));
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSelectThread = async (threadId: string) => {
    if (isLoading || isLoadingThread) return;
    stopAethiTTS();
    setSpeakingMsgId(null);
    setIsLoadingThread(true);
    setNoticeBanner(null);
    addLog('api', `GET /api/chat/thread?thread_id=${threadId}`);

    try {
      const loaded = await loadSingleChatThread(deviceId, threadId);
      setActiveThreadId(threadId);
      setActiveThreadTitle(loaded.title || 'Loaded Conversation');
      if (loaded.messages.length > 0) {
        setMessages(loaded.messages);
        addLog('success', `Loaded ${loaded.messages.length} message(s) for thread "${loaded.title || threadId}".`);
      } else {
        setMessages([buildWelcomeMessage(displayName)]);
        addLog('info', `Thread "${threadId}" is empty or expired.`);
      }
    } catch (err: any) {
      addLog('warn', `Failed to load thread: ${err?.message || 'error'}`);
    } finally {
      setIsLoadingThread(false);
    }
  };

  const handleNewChat = () => {
    stopAethiTTS();
    setSpeakingMsgId(null);
    const nextId = createThreadId();
    setActiveThreadId(nextId);
    setActiveThreadTitle('New Conversation');
    setMessages([buildWelcomeMessage(displayName)]);
    setAttachments([]);
    setNoticeBanner(null);
    addLog('info', `Started fresh conversation (${nextId}).`);
  };

  const handleDeleteThread = async (threadId: string) => {
    const ok = await deleteChatThread(deviceId, threadId);
    if (ok) {
      setChatTitles((prev) => prev.filter((t) => t.thread_id !== threadId));
      addLog('info', `Deleted thread ${threadId} from D1 12h store.`);
      if (threadId === activeThreadId) {
        handleNewChat();
      }
    }
  };

  const handleTransferToAethi = async () => {
    if (isTransferring) return;
    setIsTransferring(true);
    setTransferFeedback(null);
    addLog('api', 'POST /api/chat/transfer-aethi (Zero-Trust HMAC signed batch)');

    try {
      const res = await transferLast12HoursToAethi(deviceId);
      const summary = `Queued ${res.transferredMessages} message(s) across ${res.transferredThreads} chat(s) to Aethi on-device store.`;
      setTransferFeedback(summary);
      addLog('success', summary);

      // Persist clean local device snapshot alongside signed Aethi daemon queue
      try {
        localStorage.setItem(
          'aethexflow_aethi_device_archive',
          JSON.stringify({
            deviceId,
            syncedAt: res.timestamp,
            retentionWindowHours: 12,
            threads: res.threadsExported,
          })
        );
      } catch {
        // ignore storage quota errors
      }

      onLogActivity?.(`Transferred ${res.transferredThreads} D1 conversation(s) to Aethi`);
      await refreshTitles();
    } catch (err: any) {
      setTransferFeedback(err?.message || 'Transfer failed.');
      addLog('warn', 'Failed to transfer 12h D1 history to Aethi.');
    } finally {
      setIsTransferring(false);
    }
  };

  const handleVerifyZeroTrust = async () => {
    setIsVerifyingZeroTrust(true);
    addLog('api', 'POST /api/zero-trust/handshake');
    try {
      const status = await performZeroTrustHandshake(deviceId, 'browser-bridge');
      setZeroTrustStatus(status);
      addLog('success', `Zero-Trust verified for ${status.deviceId} (${status.fingerprint}).`);
      onLogActivity?.(`Verified Zero-Trust Aethi handshake (${status.deviceId})`);
    } catch {
      addLog('warn', 'Zero-Trust verification handshake failed.');
    } finally {
      setIsVerifyingZeroTrust(false);
    }
  };

  const handleSend = async (textToSend?: string) => {
    const rawText = (textToSend || inputMessage).trim();
    const pendingFiles = textToSend ? [] : attachments;
    const text =
      rawText ||
      (pendingFiles.length > 0
        ? `Analyze attached file${pendingFiles.length > 1 ? 's' : ''}: ${pendingFiles.map((f) => f.name).join(', ')}`
        : '');
    if (!text || isLoading) return;

    const userMsgId = buildSafeDocId('usr');
    const userMsg: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content: text,
      attachments: pendingFiles.map((f) => ({
        name: f.name,
        mimeType: f.mimeType,
        sizeBytes: f.sizeBytes,
        previewUrl: f.previewUrl,
      })),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) {
      setInputMessage('');
      setAttachments([]);
      setNoticeBanner(null);
    }
    setIsLoading(true);
    onLogActivity?.(`Asked Aethi Copilot: "${text.slice(0, 36)}..."`);

    if (user) {
      void appendUserChatMessage(user.uid, {
        id: userMsgId,
        role: 'user',
        content: text,
      });
    }

    try {
      const historyPayload = messages
        .filter((m) => m.id !== 'msg_welcome' && !m.isError)
        .slice(-10)
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      addLog('api', `POST /api/chat [profile=${selectedProfile}, thread=${activeThreadId}]`);
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: historyPayload,
          providerProfile: selectedProfile,
          threadId: activeThreadId,
          deviceId,
          attachments: pendingFiles.map((f) => ({
            name: f.name,
            mimeType: f.mimeType,
            sizeBytes: f.sizeBytes,
            dataBase64: f.dataBase64,
            textContent: f.textContent,
          })),
          siteContext: {
            userName: displayName,
            isSignedIn: Boolean(user),
            activeTab: 'chat',
            theme,
            pinnedToolIds: siteContext.pinnedToolIds,
            availableTools: siteContext.availableTools,
            recentActivity: siteContext.recentActivity,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const errMsg: ChatMessage = {
          id: buildSafeDocId('err'),
          role: 'assistant',
          content: String(data?.error || `AethexFlow request failed (HTTP ${res.status}).`),
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          engine: 'aethi-edge',
          liveAiConnected: false,
          isError: true,
        };
        setMessages((prev) => [...prev, errMsg]);
        return;
      }

      if (data.threadTitle) {
        setActiveThreadTitle(String(data.threadTitle));
      }

      const replyText = String(data.text || 'Processed your request in AethexFlow.');
      const executedActions: ExecutedChatAction[] = Array.isArray(data.executedActions)
        ? data.executedActions
        : [];
      const toolResults: Array<Record<string, unknown>> = Array.isArray(data.toolResults)
        ? data.toolResults
        : [];

      if (executedActions.length > 0 && onExecuteSiteActions) {
        onExecuteSiteActions(executedActions);
      }

      const botMsgId = buildSafeDocId('bot');
      const botMsg: ChatMessage = {
        id: botMsgId,
        role: 'assistant',
        content: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestedTool: data.suggestedTool,
        videoInstruction: data.videoInstruction,
        engine: 'aethexflow-engine',
        liveAiConnected: Boolean(data.liveAiConnected),
        executedActions,
        toolResults,
      };

      setMessages((prev) => [...prev, botMsg]);
      addLog('success', `Reply saved to 12h D1 & queued for Aethi (${replyText.length} chars).`);
      void refreshTitles();

      if (autoSpeakReplies) {
        speakWithAethiTTS(
          replyText,
          () => setSpeakingMsgId(botMsgId),
          () => setSpeakingMsgId(null)
        );
      }

      if (user) {
        void appendUserChatMessage(user.uid, {
          id: botMsgId,
          role: 'assistant',
          content: replyText,
          suggestedTool: botMsg.suggestedTool,
          videoInstruction: botMsg.videoInstruction,
          engine: 'aethexflow-engine',
        });
      }
    } catch (err: unknown) {
      const errMsg: ChatMessage = {
        id: buildSafeDocId('err'),
        role: 'assistant',
        content:
          err instanceof Error
            ? `Unable to reach AethexFlow backend: ${err.message}`
            : 'Unable to reach AethexFlow backend.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        engine: 'aethi-edge',
        isError: true,
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (pendingChatPrompt && !isLoading) {
      void handleSend(pendingChatPrompt);
      onConsumePendingChatPrompt?.();
    }
  }, [pendingChatPrompt]);

  return (
    <div className="max-w-7xl mx-auto min-h-[calc(100vh-132px)] lg:h-[calc(100vh-132px)] flex gap-5">
      {/* Main Live Chat Column */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        {/* Clean Single-Row Workspace Toolbar */}
        <div
          className={`flex flex-wrap items-center justify-between gap-3 pb-3 border-b ${
            isDark ? 'border-neutral-800' : 'border-neutral-200'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-red-600 flex items-center justify-center font-bold text-white shrink-0">
              A
            </div>
            <div className="min-w-0">
              <h1
                className={`font-semibold text-base tracking-tight truncate ${
                  isDark ? 'text-white' : 'text-neutral-900'
                }`}
              >
                {activeThreadTitle || 'Aethi Copilot'}
              </h1>
              <p className="text-xs text-neutral-500 truncate">
                AethexFlow Unified Engine · Multi-Provider Router · Zero-Trust On-Device Bridge
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Unified Aethi Engine Profile Selector (Masked) */}
            <label htmlFor="aethi-profile-select" className="sr-only">
              Select Aethi Engine Profile
            </label>
            <select
              id="aethi-profile-select"
              value={selectedProfile}
              onChange={(e) => {
                setSelectedProfile(e.target.value);
                addLog('info', `Switched routing profile to "${e.target.value}".`);
              }}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 ${
                isDark
                  ? 'border-neutral-800 bg-neutral-900 text-neutral-200'
                  : 'border-neutral-200 bg-white text-neutral-800'
              }`}
            >
              {providerProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setShowZeroTrust((prev) => !prev)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                showZeroTrust
                  ? 'bg-emerald-600 text-white border-emerald-500'
                  : isDark
                  ? 'border-neutral-800 bg-neutral-900 text-neutral-300 hover:text-white'
                  : 'border-neutral-200 bg-white text-neutral-700 hover:text-neutral-900'
              }`}
            >
              <ShieldCheck
                className={`w-3.5 h-3.5 ${showZeroTrust ? 'text-white' : 'text-emerald-500'}`}
              />
              <span>Zero-Trust</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const next = !autoSpeakReplies;
                setAutoSpeakReplies(next);
                if (!next) {
                  stopAethiTTS();
                  setSpeakingMsgId(null);
                }
              }}
              aria-label="Toggle natural voice playback"
              title="Toggle automatic natural TTS playback for replies"
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                autoSpeakReplies
                  ? 'bg-red-600 text-white border-red-500'
                  : isDark
                  ? 'border-neutral-800 bg-neutral-900 text-neutral-300 hover:text-white'
                  : 'border-neutral-200 bg-white text-neutral-700 hover:text-neutral-900'
              }`}
            >
              {autoSpeakReplies ? (
                <Volume2 className="w-3.5 h-3.5" />
              ) : (
                <VolumeX className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">Voice</span>
            </button>

            <button
              type="button"
              onClick={() => setShowConsole((prev) => !prev)}
              aria-label="Toggle Runtime Console"
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                showConsole
                  ? 'bg-red-600 text-white border-red-500'
                  : isDark
                  ? 'border-neutral-800 bg-neutral-900 text-neutral-300 hover:text-white'
                  : 'border-neutral-200 bg-white text-neutral-700 hover:text-neutral-900'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span className="tabular-nums">Console ({consoleLogs.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setMobileHistoryOpen(true)}
              aria-label="Open conversation history"
              className={`lg:hidden px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                isDark
                  ? 'border-neutral-800 bg-neutral-900 text-neutral-200'
                  : 'border-neutral-200 bg-white text-neutral-800'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>History</span>
            </button>

            <button
              type="button"
              onClick={handleNewChat}
              disabled={isLoading}
              aria-label="Clear active chat view"
              title="Start new conversation"
              className={`p-2 rounded-lg border text-xs transition-colors ${
                isDark
                  ? 'border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800'
                  : 'border-neutral-200 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Collapsible Zero-Trust Device Framework Panel */}
        {showZeroTrust && (
          <ZeroTrustPanel
            theme={theme}
            status={zeroTrustStatus}
            isVerifying={isVerifyingZeroTrust}
            onVerifyHandshake={handleVerifyZeroTrust}
            onClose={() => setShowZeroTrust(false)}
          />
        )}

        {/* Messages Feed */}
        <div className="flex-1 min-h-[260px] overflow-y-auto space-y-4 pr-2">
          {isLoadingThread ? (
            <div className="space-y-3 py-4">
              <div
                className={`h-16 rounded-xl animate-pulse ${
                  isDark ? 'bg-neutral-900' : 'bg-neutral-100'
                }`}
              />
              <div
                className={`h-24 rounded-xl animate-pulse ${
                  isDark ? 'bg-neutral-900' : 'bg-neutral-100'
                }`}
              />
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <div className="w-8 h-8 rounded-lg bg-red-600/15 text-red-500 flex items-center justify-center shrink-0 border border-red-500/25">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}

                  <div
                    className={`max-w-[85%] rounded-2xl p-4 text-xs sm:text-sm leading-relaxed ${
                      isUser
                        ? 'bg-red-600 text-white rounded-tr-none'
                        : msg.isError
                        ? 'bg-red-950/40 border border-red-500/40 text-red-200 rounded-tl-none'
                        : isDark
                        ? 'bg-[#151722] border border-neutral-800 text-neutral-200 rounded-tl-none'
                        : 'bg-white border border-neutral-200 text-neutral-800 rounded-tl-none'
                    }`}
                  >
                    {msg.isError && (
                      <div className="flex items-center gap-1.5 text-red-400 font-semibold text-[11px] mb-1.5">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>AethexFlow Notice</span>
                      </div>
                    )}

                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="mb-2.5 flex flex-wrap gap-2">
                        {msg.attachments.map((att, aIdx) => (
                          <div
                            key={`${msg.id}_att_${aIdx}`}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium ${
                              isUser
                                ? 'bg-red-700/70 text-white border border-red-400/30'
                                : isDark
                                ? 'bg-neutral-800 text-neutral-200 border border-neutral-700'
                                : 'bg-neutral-100 text-neutral-800 border border-neutral-200'
                            }`}
                          >
                            {att.previewUrl ? (
                              <img
                                src={att.previewUrl}
                                alt={att.name}
                                referrerPolicy="no-referrer"
                                className="w-5 h-5 rounded object-cover"
                              />
                            ) : att.name.toLowerCase().endsWith('.zip') ? (
                              <FileArchive className="w-3.5 h-3.5 shrink-0" />
                            ) : att.mimeType.startsWith('audio/') ? (
                              <Headphones className="w-3.5 h-3.5 shrink-0" />
                            ) : (
                              <FileText className="w-3.5 h-3.5 shrink-0" />
                            )}
                            <span className="truncate max-w-[160px]">{att.name}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="space-y-1.5 leading-relaxed">
                      {msg.content.split('\n').map((line, lineIdx) => {
                        const isBullet = /^\s*[-•*]\s+/.test(line);
                        const cleanLine = isBullet ? line.replace(/^\s*[-•*]\s+/, '') : line;
                        const tokens = cleanLine.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
                        const rendered = tokens.map((tok, tokIdx) => {
                          if (tok.startsWith('**') && tok.endsWith('**')) {
                            return (
                              <strong key={tokIdx} className="font-semibold">
                                {tok.slice(2, -2)}
                              </strong>
                            );
                          }
                          if (tok.startsWith('`') && tok.endsWith('`')) {
                            return (
                              <code
                                key={tokIdx}
                                className={`px-1.5 py-0.5 rounded font-mono text-[11px] ${
                                  isUser
                                    ? 'bg-red-700/60 text-white'
                                    : isDark
                                    ? 'bg-neutral-800 text-emerald-300'
                                    : 'bg-neutral-100 text-neutral-900'
                                }`}
                              >
                                {tok.slice(1, -1)}
                              </code>
                            );
                          }
                          return <React.Fragment key={tokIdx}>{tok}</React.Fragment>;
                        });
                        if (!cleanLine.trim()) {
                          return <div key={lineIdx} className="h-1.5" />;
                        }
                        return isBullet ? (
                          <div key={lineIdx} className="flex items-start gap-2 pl-1">
                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-current opacity-60 shrink-0" />
                            <span>{rendered}</span>
                          </div>
                        ) : (
                          <p key={lineIdx}>{rendered}</p>
                        );
                      })}
                    </div>

                    {msg.executedActions && msg.executedActions.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-3 text-[11px] text-emerald-500 font-medium">
                        {msg.executedActions.map((act, idx) => (
                          <span key={`${msg.id}_act_${idx}`} className="inline-flex items-center gap-1">
                            {act.type === 'toggle_theme' ? (
                              <SunMoon className="w-3.5 h-3.5" />
                            ) : (
                              <GitBranch className="w-3.5 h-3.5" />
                            )}
                            <span>
                              {act.type === 'toggle_theme'
                                ? `Theme set to ${String(act.payload.theme || '')}`
                                : act.type === 'load_workflow_preset'
                                ? `Loaded DAG: ${String(act.payload.presetId || '')}`
                                : act.type === 'run_automation_bot'
                                ? `Ran Bot: ${String(act.payload.botType || '')}`
                                : act.type === 'draft_video_edit'
                                ? 'Prepared Video Studio Edit'
                                : `Opened ${String(act.payload.toolId || act.payload.tab || 'action')}`}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}

                    {msg.toolResults && msg.toolResults.length > 0 && (
                      <div
                        className={`mt-3 p-3 rounded-xl border text-xs space-y-1.5 ${
                          isDark
                            ? 'border-neutral-700 bg-neutral-950 text-neutral-200'
                            : 'border-neutral-200 bg-neutral-50 text-neutral-800'
                        }`}
                      >
                        <div className="font-semibold text-emerald-500 text-[11px]">
                          Automation Output
                        </div>
                        {msg.toolResults.map((res, rIdx) => (
                          <div key={`${msg.id}_res_${rIdx}`} className="font-mono text-[11px] space-y-1">
                            <div>
                              {String(res.botType || 'bot')}: <strong>{String(res.summary || 'Done')}</strong>
                            </div>
                            {Boolean(res.data) && (
                              <pre className="whitespace-pre-wrap break-all opacity-80 text-[10px]">
                                {JSON.stringify(res.data, null, 2).slice(0, 420)}
                              </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {msg.suggestedTool && (
                      <div
                        className={`mt-3 pt-2.5 border-t flex flex-wrap items-center justify-between gap-2 ${
                          isDark ? 'border-neutral-800' : 'border-neutral-200'
                        }`}
                      >
                        <span className="text-[11px] text-neutral-500 font-medium">
                          Workspace Tool
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          {msg.suggestedTool === 'video-studio' && onSendToVideoStudio && (
                            <button
                              type="button"
                              onClick={() =>
                                onSendToVideoStudio(
                                  msg.videoInstruction ||
                                    'Create a 12-second vertical short with title: "Studio Auto Cut"'
                                )
                              }
                              className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium text-xs transition-colors flex items-center gap-1.5"
                            >
                              <Sparkles className="w-3 h-3" />
                              <span>Send to Video Studio</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onOpenTool(msg.suggestedTool!)}
                            className="px-3 py-1 rounded-lg bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white font-medium text-xs border border-red-500/30 transition-colors flex items-center gap-1"
                          >
                            <Film className="w-3 h-3" />
                            <span>Open Tool</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Clean Unboxed Metadata Footer + Natural TTS Playback Button */}
                    <div
                      className={`text-[11px] mt-2.5 flex items-center justify-between gap-3 tabular-nums ${
                        isUser ? 'text-white/75' : 'text-neutral-500'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {!isUser && (
                          <>
                            <span>AethexFlow</span>
                            <span aria-hidden="true">·</span>
                            <button
                              type="button"
                              onClick={() => handleToggleSpeaking(msg)}
                              aria-label={
                                speakingMsgId === msg.id ? 'Stop reading message' : 'Read message aloud'
                              }
                              className="inline-flex items-center gap-1 hover:text-red-500 transition-colors font-medium"
                            >
                              <Volume2 className="w-3 h-3" />
                              <span>{speakingMsgId === msg.id ? 'Stop' : 'Speak'}</span>
                            </button>
                          </>
                        )}
                      </div>
                      <span>{msg.timestamp}</span>
                    </div>
                  </div>

                  {isUser && (
                    <div className="w-8 h-8 rounded-lg bg-neutral-800 text-white flex items-center justify-center shrink-0">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              );
            })
          )}

          {isLoading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-red-600/20 text-red-500 flex items-center justify-center shrink-0 border border-red-500/30">
                <RefreshCw className="w-4 h-4 animate-spin" />
              </div>
              <div
                className={`p-3.5 rounded-xl border text-xs ${
                  isDark
                    ? 'bg-neutral-900 border-neutral-800 text-neutral-300'
                    : 'bg-white border-neutral-200 text-neutral-700'
                }`}
              >
                Aethi Copilot is processing your request...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Actions Bar */}
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            onClick={() => handleSend('Check /api/health with web monitor bot')}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap transition-colors ${
              isDark
                ? 'border-neutral-800 bg-neutral-900/60 hover:border-neutral-700 text-neutral-300 hover:text-white'
                : 'border-neutral-200 bg-white hover:border-neutral-300 text-neutral-700 hover:text-neutral-900'
            }`}
          >
            Probe /api/health
          </button>
          <button
            type="button"
            onClick={() => handleSend('Create a 10-second vertical short with title: "Release Cut"')}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap transition-colors ${
              isDark
                ? 'border-neutral-800 bg-neutral-900/60 hover:border-neutral-700 text-neutral-300 hover:text-white'
                : 'border-neutral-200 bg-white hover:border-neutral-300 text-neutral-700 hover:text-neutral-900'
            }`}
          >
            Video Short Plan
          </button>
          <button
            type="button"
            onClick={() =>
              handleSend('Load conditional media pipeline workflow preset and open Workflow DAG')
            }
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap transition-colors ${
              isDark
                ? 'border-neutral-800 bg-neutral-900/60 hover:border-neutral-700 text-neutral-300 hover:text-white'
                : 'border-neutral-200 bg-white hover:border-neutral-300 text-neutral-700 hover:text-neutral-900'
            }`}
          >
            Launch DAG Preset
          </button>
        </div>

        {/* Hidden Audio Fallback Picker */}
        <input
          ref={audioFallbackInputRef}
          type="file"
          accept="audio/*,.wav,.mp3,.webm,.ogg,.m4a"
          className="hidden"
          onChange={(e) => {
            void handleFilesSelected(e.target.files);
            e.target.value = '';
          }}
        />

        {/* Speech / Upload Notice Banner */}
        {noticeBanner && (
          <div
            role="status"
            className={`px-3 py-2.5 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 ${
              isDark
                ? 'border-amber-500/30 bg-amber-950/30 text-amber-200'
                : 'border-amber-300 bg-amber-50 text-amber-900'
            }`}
          >
            <span className="flex-1 min-w-[200px]">{noticeBanner.message}</span>
            <div className="flex items-center gap-2 shrink-0">
              {noticeBanner.showAudioUploadFallback && (
                <button
                  type="button"
                  onClick={() => audioFallbackInputRef.current?.click()}
                  className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium text-[11px] whitespace-nowrap"
                >
                  Attach Audio File
                </button>
              )}
              <button
                type="button"
                aria-label="Dismiss notice"
                onClick={() => setNoticeBanner(null)}
                className="p-1 rounded hover:bg-black/10"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Pending File Attachments Bar */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map((att) => (
              <div
                key={att.id}
                className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-xs ${
                  isDark
                    ? 'border-neutral-800 bg-neutral-900 text-neutral-200'
                    : 'border-neutral-200 bg-white text-neutral-800'
                }`}
              >
                {att.previewUrl ? (
                  <img
                    src={att.previewUrl}
                    alt={att.name}
                    referrerPolicy="no-referrer"
                    className="w-6 h-6 rounded object-cover"
                  />
                ) : att.kind === 'zip' ? (
                  <FileArchive className="w-4 h-4 text-red-500" />
                ) : att.kind === 'audio' ? (
                  <Headphones className="w-4 h-4 text-red-500" />
                ) : att.mimeType.startsWith('image/') ? (
                  <ImageIcon className="w-4 h-4 text-red-500" />
                ) : (
                  <FileText className="w-4 h-4 text-red-500" />
                )}
                <div className="min-w-0">
                  <p className="font-medium truncate max-w-[140px]">{att.name}</p>
                  <p className="text-[10px] text-neutral-500 tabular-nums">
                    {att.sizeBytes >= 1024 * 1024
                      ? `${(att.sizeBytes / (1024 * 1024)).toFixed(1)} MB`
                      : `${Math.max(1, Math.round(att.sizeBytes / 1024))} KB`}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Remove attachment ${att.name}`}
                  onClick={() => removeAttachment(att.id)}
                  className="p-0.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Modular Console Drawer */}
        {showConsole && (
          <ChatConsoleDrawer
            logs={consoleLogs}
            onClear={() => setConsoleLogs([])}
            onClose={() => setShowConsole(false)}
          />
        )}

        {/* Input Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend();
          }}
          className={`relative flex items-center rounded-xl border p-1.5 focus-within:border-red-500 focus-within:ring-2 focus-within:ring-red-500/20 transition-all ${
            isDark ? 'border-neutral-800 bg-neutral-900/90' : 'border-neutral-200 bg-white'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            aria-label="Choose files to attach"
            multiple
            accept="image/*,application/pdf,audio/*,.zip,.txt,.md,.json,.csv,.tsv,.ts,.tsx,.js,.jsx,.py,.html,.css,.xml,.log,.sql"
            onChange={(e) => {
              void handleFilesSelected(e.target.files);
              e.target.value = '';
            }}
            className="hidden"
          />
          <button
            type="button"
            aria-label="Attach file"
            title="Attach .zip, image, PDF, audio, CSV, JSON, or code"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || attachments.length >= 4}
            className={`p-2.5 rounded-lg shrink-0 transition-colors disabled:opacity-40 ${
              isDark
                ? 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100'
            }`}
          >
            <Paperclip className="w-4 h-4" />
          </button>

          <button
            type="button"
            aria-label={isListening ? 'Stop voice recording' : 'Start voice command'}
            title={isListening ? 'Listening... click to stop' : 'Speak voice command'}
            onClick={() => void handleToggleListening()}
            className={`p-2.5 rounded-lg shrink-0 transition-colors ${
              isListening
                ? 'bg-red-600 text-white'
                : isDark
                ? 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100'
            }`}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          <input
            type="text"
            aria-label="Message to Aethi Copilot"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="Ask Aethi or attach a .zip, audio, image, PDF, CSV, or code file..."
            className={`w-full py-2.5 px-3 bg-transparent text-sm placeholder-neutral-500 focus:outline-none ${
              isDark ? 'text-white' : 'text-neutral-900'
            }`}
          />

          <button
            type="submit"
            aria-label="Send message"
            disabled={(!inputMessage.trim() && attachments.length === 0) || isLoading}
            className="p-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white shrink-0 transition-colors disabled:opacity-40"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>

      {/* Dedicated Right Chat History Sidebar (Titles Only) */}
      <ChatHistorySidebar
        theme={theme}
        titles={chatTitles}
        activeThreadId={activeThreadId}
        isLoadingTitles={isLoadingTitles}
        isLoadingThread={isLoadingThread}
        isTransferring={isTransferring}
        transferFeedback={transferFeedback}
        onSelectThread={(id) => void handleSelectThread(id)}
        onNewChat={handleNewChat}
        onDeleteThread={(id) => void handleDeleteThread(id)}
        onRefreshTitles={() => void refreshTitles()}
        onTransferToAethi={() => void handleTransferToAethi()}
        mobileOpen={mobileHistoryOpen}
        onCloseMobile={() => setMobileHistoryOpen(false)}
      />
    </div>
  );
};
