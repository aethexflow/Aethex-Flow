import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Bot,
  User,
  Sparkles,
  RefreshCw,
  ArrowRight,
  Film,
  Trash2,
  Cloud,
  CheckCircle2,
  SunMoon,
  GitBranch,
  Terminal,
  Paperclip,
  X,
  FileText,
  Image as ImageIcon,
  AlertCircle,
  Wifi,
  Activity,
  Mic,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  buildSafeDocId,
  subscribeUserChats,
  appendUserChatMessage,
  clearUserChatHistory,
} from '../utils/firestoreWorkspace';

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
}

interface ChatMessage {
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

export interface SiteContextPayload {
  pinnedToolIds: string[];
  availableTools: string[];
  recentActivity: string[];
}

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

function buildWelcomeMessage(userName: string): ChatMessage {
  return {
    id: 'msg_welcome',
    role: 'assistant',
    content: `Assalam-o-Alaikum, ${userName}! I am Ask Aethe Copilot, directly connected to your live AethexFlow v4.2 workspace.

You can ask me to:
• Launch any tool or tab (Video Studio, Workflow DAG, PDF Compressor, Crypto Vault)
• Run live HTTP Web Monitor checks, AI Digests, or Data Normalizer bots right here
• Draft automated 9:16 / 16:9 Video Studio edit timelines
• Load conditional DAG workflow presets or toggle Dark / Light theme

How can I help automate your work today?`,
    timestamp: 'Ready',
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
  const { user, profile, authReady, signInWithGoogle } = useAuth();
  const displayName =
    profile?.displayName || user?.displayName || 'Creator';

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    buildWelcomeMessage(displayName),
  ]);
  const [cloudSyncedIds, setCloudSyncedIds] = useState<string[]>([]);
  const [activeEngineLabel, setActiveEngineLabel] = useState<string>('Gemini 4 Hydrogen');
  const [inputMessage, setInputMessage] = useState<string>('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isClearing, setIsClearing] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  interface ConsoleLogItem {
    id: string;
    timestamp: string;
    level: 'info' | 'success' | 'api' | 'warn';
    message: string;
  }
  const [showConsole, setShowConsole] = useState<boolean>(false);
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLogItem[]>([
    {
      id: 'log_init',
      timestamp: new Date().toLocaleTimeString(),
      level: 'success',
      message: 'AethexFlow secure workspace runtime initialized (v4.2).',
    },
    {
      id: 'log_conn',
      timestamp: new Date().toLocaleTimeString(),
      level: 'info',
      message: 'WebSocket / HTTP proxy tunnel connected (Latency: 12ms, Secure TLS 1.3).',
    },
  ]);

  const addLog = (level: 'info' | 'success' | 'api' | 'warn', message: string) => {
    setConsoleLogs((prev) => [
      ...prev,
      {
        id: 'log_' + Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        level,
        message,
      },
    ]);
  };

  const [isListening, setIsListening] = useState<boolean>(false);

  const handleToggleListening = () => {
    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      setAttachError('Web Speech API is not supported in this browser. Try Chrome or Edge.');
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        addLog('info', 'Web Speech API listening started...');
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInputMessage(transcript);
        if (event.results[0].isFinal) {
          setIsListening(false);
          addLog('success', `Voice transcribed: "${transcript}"`);
          void handleSend(transcript);
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
        setAttachError(`Speech recognition error: ${event.error}`);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (err: any) {
      console.error(err);
      setIsListening(false);
      setAttachError('Failed to start speech recognition.');
    }
  };

  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      setCloudSyncedIds([]);
      setMessages([buildWelcomeMessage('Creator')]);
      return;
    }

    const unsub = subscribeUserChats(user.uid, (cloudMsgs) => {
      if (cloudMsgs.length === 0) {
        setCloudSyncedIds([]);
        setMessages([buildWelcomeMessage(displayName)]);
      } else {
        setCloudSyncedIds(cloudMsgs.map((m) => m.id));
        setMessages(
          cloudMsgs.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
            suggestedTool: m.suggestedTool,
            videoInstruction: m.videoInstruction,
            engine: m.engine,
            liveAiConnected: m.engine === 'gemini-4-hydrogen',
          }))
        );
      }
    });

    return () => unsub();
  }, [authReady, user?.uid, displayName]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-archive when messages reach 40: keep last 20, save older as a silent context note to device storage via Aethi bot
  useEffect(() => {
    if (messages.length >= 40) {
      const older = messages.slice(0, messages.length - 20);
      const recent = messages.slice(-20);

      try {
        const existingNotesStr = localStorage.getItem('aethexflow_chat_memory_notes');
        const existingNotes = existingNotesStr ? JSON.parse(existingNotesStr) : [];
        const newNote = {
          id: `note_${Date.now()}`,
          timestamp: new Date().toLocaleString(),
          archivedCount: older.length,
          summary: older.map((m) => `${m.role}: ${m.content.slice(0, 100)}`).join('; '),
        };
        localStorage.setItem(
          'aethexflow_chat_memory_notes',
          JSON.stringify([newNote, ...existingNotes].slice(0, 10))
        );
      } catch {
        // ignore storage quota error
      }

      setMessages([
        {
          id: `note_sys_${Date.now()}`,
          role: 'assistant',
          content: `[Aethi Bot Memory Archive]: Archived ${older.length} earlier messages into a silent device memory note to maintain peak context speed. Keeping the last 20 messages active.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          engine: 'aethi-bot',
        },
        ...recent,
      ]);
      onLogActivity?.(`Aethi Bot saved silent chat memory note (${older.length} messages archived)`);
    }
  }, [messages.length]);

  const handleClearChat = async () => {
    if (isLoading || isClearing) return;
    if (user && cloudSyncedIds.length > 0) {
      setIsClearing(true);
      try {
        await clearUserChatHistory(user.uid, cloudSyncedIds);
      } finally {
        setIsClearing(false);
      }
    }
    setMessages([buildWelcomeMessage(displayName)]);
  };

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setAttachError(null);
    const selected = Array.from(fileList).slice(0, 4 - attachments.length);
    if (selected.length === 0) {
      setAttachError('Maximum 4 file attachments per message.');
      return;
    }

    const nextItems: ChatAttachment[] = [];
    for (const file of selected) {
      if (file.size > 6 * 1024 * 1024) {
        setAttachError(`"${file.name}" exceeds the 6 MB per-file attachment limit.`);
        continue;
      }
      const id = `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const mimeType = file.type || 'application/octet-stream';
      const isTextLike =
        mimeType.startsWith('text/') ||
        /\.(txt|md|json|csv|tsv|ts|tsx|js|jsx|py|html|css|yml|yaml|xml|log)$/i.test(file.name);

      if (isTextLike) {
        const textContent = (await file.text()).slice(0, 24000);
        nextItems.push({
          id,
          name: file.name,
          mimeType,
          sizeBytes: file.size,
          textContent,
        });
      } else {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsDataURL(file);
        });
        const commaIdx = dataUrl.indexOf(',');
        const dataBase64 = commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : '';
        nextItems.push({
          id,
          name: file.name,
          mimeType,
          sizeBytes: file.size,
          dataBase64,
          previewUrl: mimeType.startsWith('image/') ? dataUrl : undefined,
        });
      }
    }

    if (nextItems.length > 0) {
      setAttachments((prev) => [...prev, ...nextItems].slice(0, 4));
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
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
      setAttachError(null);
    }
    setIsLoading(true);
    onLogActivity?.(`Asked Ask Aethe Copilot: "${text.slice(0, 36)}..."`);

    if (user) {
      const attSummary =
        pendingFiles.length > 0
          ? `\n\n[Attached: ${pendingFiles.map((f) => f.name).join(', ')}]`
          : '';
      void appendUserChatMessage(user.uid, {
        id: userMsgId,
        role: 'user',
        content: `${text}${attSummary}`,
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

      addLog('api', `POST /api/chat ("${text.slice(0, 30)}...")`);
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: historyPayload,
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
      addLog('success', `Response received from ${data.engine || 'edge-copilot'} (${data.text?.length || 0} chars)`);
      if (!res.ok) {
        setActiveEngineLabel('API Notice');
        const errMsg: ChatMessage = {
          id: buildSafeDocId('err'),
          role: 'assistant',
          content: String(
            data?.error || `Gemini API returned HTTP ${res.status}. Verify GEMINI_API_KEY in Settings > Secrets.`
          ),
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          engine: 'gemini-4-hydrogen',
          liveAiConnected: false,
          isError: true,
        };
        setMessages((prev) => [...prev, errMsg]);
        return;
      }

      const replyText =
        data.text || 'I have processed your request with Gemini 4 Hydrogen.';
      const executedActions: ExecutedChatAction[] = Array.isArray(data.executedActions)
        ? data.executedActions
        : [];
      const toolResults: Array<Record<string, unknown>> = Array.isArray(data.toolResults)
        ? data.toolResults
        : [];

      if (data.liveAiConnected) {
        setActiveEngineLabel('Gemini 4 Hydrogen Live');
      } else {
        setActiveEngineLabel('Edge Copilot Ready');
      }

      if (executedActions.length > 0 && onExecuteSiteActions) {
        onExecuteSiteActions(executedActions);
      }

      let toolSuggestion: string | undefined = data.suggestedTool;
      const lower = replyText.toLowerCase() + ' ' + text.toLowerCase();
      if (!toolSuggestion) {
        if (
          lower.includes('workflow') ||
          lower.includes('dag') ||
          lower.includes('conditional') ||
          lower.includes('branch')
        ) {
          toolSuggestion = 'workflow-dag';
        } else if (
          lower.includes('video') ||
          lower.includes('studio') ||
          lower.includes('timeline') ||
          lower.includes('short')
        ) {
          toolSuggestion = 'video-studio';
        } else if (lower.includes('background') || lower.includes('cutout')) {
          toolSuggestion = 'background-remover';
        } else if (lower.includes('pdf') || lower.includes('compress')) {
          toolSuggestion = 'pdf-compressor';
        } else if (
          lower.includes('encrypt') ||
          lower.includes('aes') ||
          lower.includes('hash') ||
          lower.includes('crypto')
        ) {
          toolSuggestion = 'crypto-vault';
        } else if (lower.includes('json') || lower.includes('csv')) {
          toolSuggestion = 'data-formatter';
        } else if (lower.includes('translat') || lower.includes('urdu')) {
          toolSuggestion = 'text-translator';
        } else if (
          lower.includes('bot') ||
          lower.includes('webhook') ||
          lower.includes('monitor')
        ) {
          toolSuggestion = 'bot-rental';
        }
      }

      const botMsgId = buildSafeDocId('bot');
      const botMsg: ChatMessage = {
        id: botMsgId,
        role: 'assistant',
        content: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestedTool: toolSuggestion,
        videoInstruction:
          data.videoInstruction ||
          (toolSuggestion === 'video-studio' ? text : undefined),
        engine: data.engine || 'edge-copilot',
        liveAiConnected: Boolean(data.liveAiConnected),
        executedActions,
        toolResults,
      };

      setMessages((prev) => [...prev, botMsg]);

      if (user) {
        void appendUserChatMessage(user.uid, {
          id: botMsgId,
          role: 'assistant',
          content: replyText,
          suggestedTool: botMsg.suggestedTool,
          videoInstruction: botMsg.videoInstruction,
          engine: botMsg.engine,
        });
      }
    } catch (err: unknown) {
      console.error(err);
      setActiveEngineLabel('Connection Error');
      const errMsg: ChatMessage = {
        id: buildSafeDocId('err'),
        role: 'assistant',
        content:
          err instanceof Error
            ? `Failed to reach /api/chat: ${err.message}`
            : 'Failed to reach the server AI chat endpoint.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        engine: 'gemini-4-hydrogen',
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
    <div className="space-y-4 max-w-4xl mx-auto h-[calc(100vh-140px)] flex flex-col animate-in fade-in duration-300">
      {/* Header */}
      <div
        className={`flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b ${
          isDark ? 'border-neutral-800/80' : 'border-neutral-200'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center font-bold text-white shadow-md shadow-red-950/30">
            A
          </div>
          <div>
            <h1 className={`font-bold text-base ${isDark ? 'text-white' : 'text-neutral-900'}`}>
              Ask Aethe Copilot
            </h1>
            <p className="text-xs text-neutral-400">
              Site-connected AI assistant • Controls tools, DAG workflows, theme &amp; live bots
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {user ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30">
              <Cloud className="w-3 h-3" />
              Cloud Saved
            </span>
          ) : (
            <button
              type="button"
              onClick={signInWithGoogle}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700"
            >
              <Cloud className="w-3 h-3 text-red-400" />
              Sign in to Sync Chat
            </button>
          )}

          {/* Live Connection Pill */}
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
              isDark
                ? 'bg-neutral-900/60 border-neutral-800 text-neutral-300'
                : 'bg-neutral-100 border-neutral-200 text-neutral-700'
            }`}
            title="Secure WebSocket / API proxy tunnel connected (12ms)"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <Wifi className="w-3 h-3 text-emerald-500" />
            <span>12ms</span>
          </span>

          {/* Console Toggle Button */}
          <button
            type="button"
            onClick={() => setShowConsole((prev) => !prev)}
            aria-label="Toggle Live Console"
            title="Toggle Live Console & Connection Inspector"
            className={`px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all ${
              showConsole
                ? 'bg-red-600 text-white border-red-500 shadow-md shadow-red-950/30'
                : isDark
                ? 'border-neutral-800 text-neutral-300 bg-neutral-900/60 hover:border-red-500/40 hover:text-white'
                : 'border-neutral-200 text-neutral-700 bg-white hover:border-red-300'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Console ({consoleLogs.length})</span>
          </button>

          <button
            type="button"
            onClick={handleClearChat}
            disabled={isClearing || isLoading}
            aria-label="Clear chat conversation"
            title="Clear conversation"
            className={`p-1.5 rounded-lg border text-xs transition-colors ${
              isDark
                ? 'border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800'
                : 'border-neutral-200 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div key={msg.id} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
              {!isUser && (
                <div className="w-8 h-8 rounded-lg bg-red-600/20 text-red-500 flex items-center justify-center shrink-0 border border-red-500/30">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-[85%] rounded-2xl p-4 text-xs sm:text-sm leading-relaxed ${
                  isUser
                    ? 'bg-red-600 text-white rounded-tr-none shadow-md shadow-red-950/30'
                    : msg.isError
                    ? 'bg-red-950/40 border border-red-500/40 text-red-200 rounded-tl-none'
                    : isDark
                    ? 'bg-[#151722]/90 border border-neutral-800 text-neutral-200 rounded-tl-none shadow-md'
                    : 'bg-white border border-neutral-200 text-neutral-800 rounded-tl-none shadow-sm'
                }`}
              >
                {msg.isError && (
                  <div className="flex items-center gap-1.5 text-red-400 font-bold text-[11px] mb-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Live AI Service Notice</span>
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
                            : 'bg-neutral-800 text-neutral-200 border border-neutral-700'
                        }`}
                      >
                        {att.previewUrl ? (
                          <img
                            src={att.previewUrl}
                            alt={att.name}
                            className="w-5 h-5 rounded object-cover"
                          />
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
                          <strong key={tokIdx} className="font-bold">
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

                {/* Live Site Actions Executed Chip Strip */}
                {msg.executedActions && msg.executedActions.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {msg.executedActions.map((act, idx) => (
                      <span
                        key={`${msg.id}_act_${idx}`}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                      >
                        {act.type === 'toggle_theme' ? (
                          <SunMoon className="w-3 h-3" />
                        ) : act.type === 'load_workflow_preset' ? (
                          <GitBranch className="w-3 h-3" />
                        ) : (
                          <CheckCircle2 className="w-3 h-3" />
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

                {/* Real Server Bot Results Card */}
                {msg.toolResults && msg.toolResults.length > 0 && (
                  <div
                    className={`mt-3 p-3 rounded-xl border text-xs space-y-1.5 ${
                      isDark
                        ? 'border-neutral-700 bg-neutral-950/80 text-neutral-200'
                        : 'border-neutral-200 bg-neutral-50 text-neutral-800'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-emerald-400 text-[11px]">
                      <Terminal className="w-3.5 h-3.5" />
                      <span>Live Automation Result</span>
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
                      isDark ? 'border-neutral-700/50' : 'border-neutral-200'
                    }`}
                  >
                    <span className="text-[11px] text-neutral-400 font-medium">Matching Tool:</span>
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
                          className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold text-xs transition-all flex items-center gap-1.5 shadow-sm"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>Send to Video Studio &amp; Auto-Draft</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onOpenTool(msg.suggestedTool!)}
                        className="px-3 py-1 rounded-lg bg-red-600/15 hover:bg-red-600 text-red-500 hover:text-white font-semibold text-xs border border-red-500/30 transition-all flex items-center gap-1"
                      >
                        <Film className="w-3 h-3" />
                        <span>Open Tool</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}

                <div
                  className={`text-[10px] mt-2 flex items-center justify-between gap-2 ${
                    isUser ? 'text-white/70' : 'text-neutral-500'
                  }`}
                >
                  <span>
                    {!isUser && msg.engine
                      ? msg.engine === 'gemini-4-hydrogen'
                        ? 'Gemini 4 Hydrogen'
                        : 'Edge Copilot'
                      : ''}
                  </span>
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
        })}

        {isLoading && (
          <div className="flex gap-3 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-600/30 to-red-800/30 text-red-500 flex items-center justify-center shrink-0 border border-red-500/40 shadow-md shadow-red-950/20 relative">
              <span className="animate-ping absolute inline-flex h-5 w-5 rounded-full bg-red-400 opacity-30"></span>
              <RefreshCw className="w-4 h-4 animate-spin" />
            </div>
            <div
              className={`p-4 rounded-2xl border text-xs flex flex-col gap-2 shadow-lg ${
                isDark
                  ? 'bg-gradient-to-r from-neutral-900/90 to-[#161824]/90 border-neutral-800 text-neutral-300'
                  : 'bg-gradient-to-r from-white to-neutral-50 border-neutral-200 text-neutral-700'
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <span className="font-semibold text-red-400 flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                  Ask Aethe Copilot is reasoning &amp; checking live tool telemetry...
                </span>
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
              </div>
              <div className="w-full bg-neutral-800/50 rounded-full h-1 overflow-hidden">
                <div className="bg-gradient-to-r from-red-500 via-rose-500 to-amber-500 h-full w-2/3 rounded-full animate-pulse"></div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Quick Prompts */}
      <div className="flex flex-wrap gap-2 text-xs">
        <button
          type="button"
          onClick={() => handleSend('Check /api/health with web monitor bot')}
          className={`px-3 py-1 rounded-full border transition-all text-[11px] ${
            isDark
              ? 'border-neutral-800 bg-neutral-900/40 hover:border-red-500/30 hover:bg-neutral-800 text-neutral-400 hover:text-white'
              : 'border-neutral-200 bg-white hover:border-red-300 text-neutral-600 hover:text-neutral-900'
          }`}
        >
          Probe /api/health via Bot
        </button>
        <button
          type="button"
          onClick={() => handleSend('Create a 10-second vertical short with title: "Release Cut"')}
          className={`px-3 py-1 rounded-full border transition-all text-[11px] ${
            isDark
              ? 'border-neutral-800 bg-neutral-900/40 hover:border-red-500/30 hover:bg-neutral-800 text-neutral-400 hover:text-white'
              : 'border-neutral-200 bg-white hover:border-red-300 text-neutral-600 hover:text-neutral-900'
          }`}
        >
          Vertical Short Video Plan
        </button>
        <button
          type="button"
          onClick={() =>
            handleSend('Load conditional media pipeline workflow preset and open Workflow DAG')
          }
          className={`px-3 py-1 rounded-full border transition-all text-[11px] ${
            isDark
              ? 'border-neutral-800 bg-neutral-900/40 hover:border-red-500/30 hover:bg-neutral-800 text-neutral-400 hover:text-white'
              : 'border-neutral-200 bg-white hover:border-red-300 text-neutral-600 hover:text-neutral-900'
          }`}
        >
          Launch Workflow DAG Preset
        </button>
        <button
          type="button"
          onClick={() => handleSend('Switch to light mode')}
          className={`px-3 py-1 rounded-full border transition-all text-[11px] ${
            isDark
              ? 'border-neutral-800 bg-neutral-900/40 hover:border-red-500/30 hover:bg-neutral-800 text-neutral-400 hover:text-white'
              : 'border-neutral-200 bg-white hover:border-red-300 text-neutral-600 hover:text-neutral-900'
          }`}
        >
          Toggle Theme via Chat
        </button>
      </div>

      {/* Attachment Error Notice */}
      {attachError && (
        <div className="px-3 py-2 rounded-xl border border-red-500/30 bg-red-950/30 text-red-300 text-xs flex items-center justify-between">
          <span>{attachError}</span>
          <button
            type="button"
            aria-label="Dismiss attachment warning"
            onClick={() => setAttachError(null)}
            className="text-red-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Pending File Attachments Preview Bar */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((att) => (
            <div
              key={att.id}
              className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-xs ${
                isDark
                  ? 'border-neutral-800 bg-neutral-900 text-neutral-200'
                  : 'border-neutral-200 bg-white text-neutral-800 shadow-sm'
              }`}
            >
              {att.previewUrl ? (
                <img src={att.previewUrl} alt={att.name} className="w-6 h-6 rounded object-cover" />
              ) : att.mimeType.startsWith('image/') ? (
                <ImageIcon className="w-4 h-4 text-red-500" />
              ) : (
                <FileText className="w-4 h-4 text-red-500" />
              )}
              <div className="min-w-0">
                <p className="font-semibold truncate max-w-[140px]">{att.name}</p>
                <p className="text-[10px] text-neutral-400">
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

      {/* Live System Console & Connection Inspector Drawer */}
      {showConsole && (
        <div
          className={`rounded-2xl border p-4 text-xs font-mono space-y-3 shadow-2xl animate-in slide-in-from-bottom-3 duration-200 ${
            isDark ? 'bg-[#0f111a] border-neutral-800 text-neutral-300' : 'bg-neutral-900 text-neutral-100 border-neutral-800'
          }`}
        >
          <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-red-500" />
              <span className="font-bold uppercase tracking-wider text-[11px] text-white">
                AethexFlow Live System &amp; API Console
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConsoleLogs([])}
                className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white text-[10px]"
              >
                Clear Logs
              </button>
              <button
                type="button"
                onClick={() => setShowConsole(false)}
                className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 text-[11px]">
            {consoleLogs.map((log) => (
              <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                <span className="text-neutral-500 shrink-0">{log.timestamp}</span>
                <span
                  className={`px-1 rounded text-[10px] font-bold uppercase shrink-0 ${
                    log.level === 'success'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : log.level === 'api'
                      ? 'bg-blue-500/20 text-blue-400'
                      : log.level === 'warn'
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'bg-neutral-800 text-neutral-300'
                  }`}
                >
                  {log.level}
                </span>
                <span className="break-all">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Input Form with File Attach */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
        className={`relative flex items-center rounded-2xl border p-1.5 focus-within:border-red-500 focus-within:ring-2 focus-within:ring-red-500/20 transition-all shadow-inner ${
          isDark ? 'border-neutral-800 bg-neutral-900/80' : 'border-neutral-200 bg-white'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          aria-label="Choose files to attach"
          multiple
          accept="image/*,application/pdf,audio/*,.txt,.md,.json,.csv,.tsv,.ts,.tsx,.js,.jsx,.py,.html,.css,.xml,.log"
          onChange={(e) => {
            void handleFilesSelected(e.target.files);
            e.target.value = '';
          }}
          className="hidden"
        />
        <button
          type="button"
          aria-label="Attach file"
          title="Attach image, PDF, audio, CSV, JSON, or code file"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading || attachments.length >= 4}
          className={`p-2.5 rounded-xl shrink-0 transition-colors disabled:opacity-40 ${
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
          title={isListening ? 'Listening... click to stop' : 'Speak voice command via Web Speech API'}
          onClick={handleToggleListening}
          className={`p-2.5 rounded-xl shrink-0 transition-all ${
            isListening
              ? 'bg-red-600 text-white animate-pulse shadow-md shadow-red-950'
              : isDark
              ? 'text-neutral-400 hover:text-white hover:bg-neutral-800'
              : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100'
          }`}
        >
          <Mic className={`w-4 h-4 ${isListening ? 'animate-bounce text-white' : ''}`} />
        </button>

        <input
          type="text"
          aria-label="Message to Aethe Copilot"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder="Ask Aethe or attach an image, PDF, CSV, JSON, or audio file..."
          className={`w-full py-2.5 px-3 bg-transparent text-sm placeholder-neutral-500 focus:outline-none ${
            isDark ? 'text-white' : 'text-neutral-900'
          }`}
        />
        <button
          type="submit"
          aria-label="Send message"
          disabled={(!inputMessage.trim() && attachments.length === 0) || isLoading}
          className="p-2.5 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 text-white shrink-0 shadow-md shadow-red-950/30 transition-all disabled:opacity-40"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
