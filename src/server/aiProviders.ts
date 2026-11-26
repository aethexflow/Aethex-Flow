import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';

export interface ProviderProfile {
  id: 'auto' | 'fast-edge' | 'deep-reasoning' | 'code-architect' | 'vision-docs';
  label: string;
  description: string;
  available: boolean;
}

export interface NormalizedAttachment {
  name: string;
  mimeType: string;
  sizeBytes: number;
  dataBase64?: string;
  textContent?: string;
}

export interface ChatSiteAction {
  type:
    | 'open_tool'
    | 'navigate_tab'
    | 'draft_video_edit'
    | 'toggle_theme'
    | 'load_workflow_preset'
    | 'run_automation_bot';
  payload: Record<string, unknown>;
}

export interface MultiProviderChatInput {
  message: string;
  history: Array<{ role: string; content: string }>;
  attachments: NormalizedAttachment[];
  profileId?: string;
  siteContext?: Record<string, unknown>;
  runBotCallback: (params: {
    botType?: string;
    target?: string;
    payload?: unknown;
  }) => Promise<{ httpStatus: number; body: Record<string, unknown> }>;
  parseLocalVideoPlan: (instruction: string, sourceName?: string, maxDur?: number) => Record<string, unknown>;
}

export interface MultiProviderChatResult {
  text: string;
  engine: string;
  liveAiConnected: boolean;
  executedActions: ChatSiteAction[];
  toolResults: Array<Record<string, unknown>>;
  suggestedTool?: string;
  videoInstruction?: string;
  videoPlanPreview?: Record<string, unknown>;
}

const SITE_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'open_tool',
    description:
      'Opens a specific built-in tool or studio inside the live AethexFlow workspace.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        toolId: {
          type: Type.STRING,
          description:
            'Must be one of: background-remover, pdf-compressor, image-converter, text-translator, crypto-vault, data-formatter, video-studio, workflow-dag, bot-rental',
        },
        reason: { type: Type.STRING },
      },
      required: ['toolId'],
    },
  },
  {
    name: 'navigate_tab',
    description: 'Switches the active workspace tab cleanly.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        tab: {
          type: Type.STRING,
          description: 'Must be one of: home, chat, studio, workflows, tools, bots, aethi-hub, settings',
        },
      },
      required: ['tab'],
    },
  },
  {
    name: 'draft_video_edit',
    description:
      'Prepares an automated Video & Photo Studio timeline edit instruction so the user can open Video Studio with it ready.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        instruction: {
          type: Type.STRING,
          description: 'Complete editing prompt specifying aspect ratio, trim, duration, or title overlay.',
        },
      },
      required: ['instruction'],
    },
  },
  {
    name: 'load_workflow_preset',
    description: 'Loads a built-in DAG workflow preset onto the Workflow DAG Visualizer canvas.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        presetId: {
          type: Type.STRING,
          description:
            'Must be one of: conditional-media-pipeline, endpoint-monitoring-alert, pdf-translation-chain',
        },
      },
      required: ['presetId'],
    },
  },
  {
    name: 'toggle_theme',
    description: 'Switches workspace visual theme between Obsidian Dark and Studio Light.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        theme: { type: Type.STRING, description: 'dark or light' },
      },
      required: ['theme'],
    },
  },
  {
    name: 'run_automation_bot',
    description:
      'Executes a real live automation bot server-side (HTTP Web Monitor probe, AI Digest, or Data Normalizer) and returns live results.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        botType: {
          type: Type.STRING,
          description: 'Must be one of: web-monitor, ai-digest, data-normalizer',
        },
        target: { type: Type.STRING, description: 'Target URL (e.g. /api/health or https://example.com) for web-monitor' },
        payload: { type: Type.STRING, description: 'Text or CSV/JSON rows for ai-digest or data-normalizer' },
      },
      required: ['botType'],
    },
  },
];

async function withTimeout<T>(promise: Promise<T>, ms = 15000): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Upstream timeout after ${ms}ms`)), ms)
    ),
  ]);
}

export function deriveChatAction(
  message: string,
  replyText = '',
  parseLocalVideoPlan?: (instruction: string, sourceName?: string, maxDur?: number) => Record<string, unknown>
) {
  const combined = `${message} ${replyText}`.toLowerCase();
  const isVideo =
    /\b(video|short|shorts|reel|reels|timeline|caption|srt|clip|trim|aspect ratio|16:9|9:16|1:1|webm)\b/i.test(
      combined
    );
  if (isVideo) {
    return {
      suggestedTool: 'video-studio',
      videoInstruction: message.trim(),
      videoPlanPreview: parseLocalVideoPlan ? parseLocalVideoPlan(message, 'Clip', 20) : undefined,
    };
  }
  if (/\b(workflow|dag|conditional|branch|sequence|visualizer)\b/i.test(combined)) {
    return { suggestedTool: 'workflow-dag' };
  }
  if (/\b(background|cutout|transparent png|remove bg)\b/i.test(combined)) {
    return { suggestedTool: 'background-remover' };
  }
  if (/\b(pdf|compress|shrink pdf|strip metadata)\b/i.test(combined)) {
    return { suggestedTool: 'pdf-compressor' };
  }
  if (/\b(encrypt|decrypt|aes|sha|hash|crypto)\b/i.test(combined)) {
    return { suggestedTool: 'crypto-vault' };
  }
  if (/\b(json|csv|minify|spreadsheet)\b/i.test(combined)) {
    return { suggestedTool: 'data-formatter' };
  }
  if (/\b(translate|urdu|roman urdu)\b/i.test(combined)) {
    return { suggestedTool: 'text-translator' };
  }
  if (/\b(webp|convert image|jpg|jpeg)\b/i.test(combined)) {
    return { suggestedTool: 'image-converter' };
  }
  if (/\b(bot|monitor|webhook|digest|normalizer)\b/i.test(combined)) {
    return { suggestedTool: 'bot-rental' };
  }
  return {};
}

export class MultiProviderAIEngine {
  private readonly geminiClient: GoogleGenAI | null;

  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {
    const rawKey = env.GEMINI_API_KEY?.trim();
    const validKey = rawKey && !rawKey.startsWith('MY_') ? rawKey : undefined;
    this.geminiClient = validKey
      ? new GoogleGenAI({
          apiKey: validKey,
          httpOptions: {
            headers: { 'User-Agent': 'aistudio-build' },
          },
        })
      : null;
  }

  private getConfiguredBackendIds(): Array<'gemini' | 'anthropic' | 'openai' | 'groq' | 'grok' | 'openrouter'> {
    const ids: Array<'gemini' | 'anthropic' | 'openai' | 'groq' | 'grok' | 'openrouter'> = [];
    if (this.geminiClient) ids.push('gemini');
    if (this.env.ANTHROPIC_API_KEY?.trim()) ids.push('anthropic');
    if (this.env.OPENAI_API_KEY?.trim()) ids.push('openai');
    if (this.env.GROQ_API_KEY?.trim()) ids.push('groq');
    if (this.env.XAI_API_KEY?.trim()) ids.push('grok');
    if (this.env.OPENROUTER_API_KEY?.trim()) ids.push('openrouter');
    return ids;
  }

  /**
   * Returns unified Aethi-branded capability profiles for the public UI.
   * Upstream provider names and API keys are never exposed in public responses.
   */
  getPublicCapabilities(): {
    activeLanesCount: number;
    liveCloudReady: boolean;
    profiles: ProviderProfile[];
  } {
    const configured = this.getConfiguredBackendIds();
    const hasCloud = configured.length > 0;
    return {
      activeLanesCount: configured.length,
      liveCloudReady: hasCloud,
      profiles: [
        {
          id: 'auto',
          label: 'Aethi Auto Router',
          description: 'Dynamically selects the optimal AethexFlow engine for the request and attachments.',
          available: true,
        },
        {
          id: 'fast-edge',
          label: 'Aethi Edge Instant',
          description: 'Low-latency pipeline for quick automation triggers and concise commands.',
          available: true,
        },
        {
          id: 'deep-reasoning',
          label: 'Aethi Deep Reasoner',
          description: 'Multi-step planning for DAG workflows, system audits, and structured synthesis.',
          available: true,
        },
        {
          id: 'code-architect',
          label: 'Aethi Code Architect',
          description: 'Focused inspection for ZIP archives, source files, JSON/CSV, and scripts.',
          available: true,
        },
        {
          id: 'vision-docs',
          label: 'Aethi Vision & Docs',
          description: 'Multimodal analysis for images, PDFs, screenshots, and audio transcripts.',
          available: true,
        },
      ],
    };
  }

  private resolveOrderForProfile(
    profileId: string | undefined,
    hasBinaryMedia: boolean
  ): Array<'gemini' | 'anthropic' | 'openai' | 'groq' | 'grok' | 'openrouter'> {
    const configured = this.getConfiguredBackendIds();
    if (configured.length === 0) return [];

    let preference: Array<'gemini' | 'anthropic' | 'openai' | 'groq' | 'grok' | 'openrouter'>;
    if (hasBinaryMedia || profileId === 'vision-docs') {
      preference = ['gemini', 'openai', 'anthropic', 'openrouter', 'groq', 'grok'];
    } else if (profileId === 'deep-reasoning') {
      preference = ['anthropic', 'gemini', 'openai', 'openrouter', 'grok', 'groq'];
    } else if (profileId === 'fast-edge') {
      preference = ['groq', 'gemini', 'openai', 'openrouter', 'grok', 'anthropic'];
    } else if (profileId === 'code-architect') {
      preference = ['anthropic', 'openai', 'gemini', 'openrouter', 'groq', 'grok'];
    } else {
      preference = ['gemini', 'anthropic', 'openai', 'groq', 'openrouter', 'grok'];
    }
    return preference.filter((id) => configured.includes(id));
  }

  private buildSystemInstruction(userName: string, siteContext?: Record<string, unknown>): string {
    const contextSummary = siteContext
      ? `
Live Workspace Context:
- User: ${userName} (${siteContext.isSignedIn ? 'Signed-in Cloud Account' : 'Public Session'})
- Active Tab: ${String(siteContext.activeTab || 'chat')}
- Active Theme: ${String(siteContext.theme || 'dark')}
- Pinned Tools: ${Array.isArray(siteContext.pinnedToolIds) ? siteContext.pinnedToolIds.join(', ') : 'default'}
- Available Tools Catalog: ${Array.isArray(siteContext.availableTools) ? siteContext.availableTools.join(', ') : 'background-remover, pdf-compressor, image-converter, text-translator, crypto-vault, data-formatter, video-studio, workflow-dag, bot-rental'}
- Recent Activity: ${Array.isArray(siteContext.recentActivity) ? siteContext.recentActivity.slice(0, 4).join(' | ') : 'None'}
`
      : '';

    return `You are Aethi Copilot, the unified orchestrator inside AethexFlow v4.2.
You are directly connected to the user's live workspace tools and Zero-Trust on-device Aethi runner, and can inspect uploaded files (images, PDFs, audio, ZIP archive contents, CSV, JSON, code, or text).
${contextSummary}
Rules:
1. Never identify yourself as Gemini, Claude, OpenAI, Grok, Groq, or any third-party vendor name. Refer to yourself solely as Aethi / AethexFlow.
2. When files or ZIP archives are attached, inspect their actual extracted contents carefully and summarize concrete findings.
3. Keep answers practical, concise, accurate, and friendly (greet warmly with "Assalam-o-Alaikum, ${userName}" when appropriate).
4. Never fabricate telemetry or execution numbers.`;
  }

  private buildAttachmentSummaryText(attachments: NormalizedAttachment[]): string {
    return attachments
      .map((att) => {
        if (att.textContent) {
          return `\n[Attached File: ${att.name} (${att.mimeType})]\n\`\`\`\n${att.textContent.slice(0, 24000)}\n\`\`\``;
        }
        return `\n[Attached Binary File: ${att.name} (${att.mimeType}, ${att.sizeBytes} bytes)]`;
      })
      .join('\n');
  }

  async runChat(input: MultiProviderChatInput): Promise<MultiProviderChatResult> {
    const userName = String(input.siteContext?.userName || 'Creator').trim() || 'Creator';
    const cleanMsg = input.message.trim();
    const hasBinaryMedia = input.attachments.some(
      (a) => Boolean(a.dataBase64) && /^(image|audio|video)\/|application\/pdf/.test(a.mimeType)
    );
    const providerOrder = this.resolveOrderForProfile(input.profileId, hasBinaryMedia);
    const systemInstruction = this.buildSystemInstruction(userName, input.siteContext);
    const actionMeta = deriveChatAction(cleanMsg, '', input.parseLocalVideoPlan);

    for (const provider of providerOrder) {
      try {
        if (provider === 'gemini' && this.geminiClient) {
          const result = await this.callGemini(
            input,
            systemInstruction,
            actionMeta
          );
          if (result) return result;
        } else if (provider === 'anthropic' && this.env.ANTHROPIC_API_KEY) {
          const result = await this.callAnthropic(input, systemInstruction, actionMeta);
          if (result) return result;
        } else if (
          (provider === 'openai' || provider === 'groq' || provider === 'grok' || provider === 'openrouter')
        ) {
          const result = await this.callOpenAICompatible(
            provider,
            input,
            systemInstruction,
            actionMeta
          );
          if (result) return result;
        }
      } catch {
        // Fail over transparently to the next configured provider lane
      }
    }

    // Deterministic Aethi Edge Local fallback so workspace actions & file inspection never dead-end
    return await this.runDeterministicFallback(input, userName, actionMeta);
  }

  private async callGemini(
    input: MultiProviderChatInput,
    systemInstruction: string,
    actionMeta: ReturnType<typeof deriveChatAction>
  ): Promise<MultiProviderChatResult | null> {
    if (!this.geminiClient) return null;

    const executedActions: ChatSiteAction[] = [];
    const toolResults: Array<Record<string, unknown>> = [];

    const chatContents: Array<{ role: string; parts: Array<Record<string, unknown>> }> = (
      input.history || []
    )
      .slice(-12)
      .map((h) => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: String(h.content || '') }],
      }));

    const userParts: Array<Record<string, unknown>> = [{ text: input.message }];
    for (const att of input.attachments) {
      if (att.textContent) {
        userParts.push({
          text: `\n[Attached File: ${att.name} (${att.mimeType})]\n\`\`\`\n${att.textContent.slice(0, 24000)}\n\`\`\``,
        });
      } else if (att.dataBase64 && /^(image|audio|video)\/|application\/pdf/.test(att.mimeType)) {
        userParts.push({
          inlineData: {
            mimeType: att.mimeType,
            data: att.dataBase64,
          },
        });
      } else {
        userParts.push({
          text: `\n[Attached File: ${att.name} (${att.mimeType}, ${att.sizeBytes} bytes)]`,
        });
      }
    }
    chatContents.push({ role: 'user', parts: userParts });

    const selectedGeminiModel =
      input.profileId === 'deep-reasoning' || input.profileId === 'code-architect'
        ? 'gemini-4-neon'
        : 'gemini-4-hydrogen';

    const firstResponse = await withTimeout(
      this.geminiClient.models.generateContent({
        model: selectedGeminiModel,
        contents: chatContents,
        config: {
          systemInstruction,
          tools: [{ functionDeclarations: SITE_TOOL_DECLARATIONS }],
        },
      }),
      18000
    );

    const calls = firstResponse.functionCalls || [];
    let finalReplyText = firstResponse.text || '';
    let suggestedTool = actionMeta.suggestedTool;
    let videoInstruction = actionMeta.videoInstruction;
    let videoPlanPreview = actionMeta.videoPlanPreview;

    if (calls.length > 0) {
      const functionResponseParts: Array<Record<string, unknown>> = [];
      for (const call of calls) {
        const args = (call.args || {}) as Record<string, any>;
        if (call.name === 'open_tool' && args.toolId) {
          suggestedTool = String(args.toolId);
          executedActions.push({
            type: 'open_tool',
            payload: { toolId: suggestedTool, reason: args.reason || '' },
          });
          functionResponseParts.push({
            functionResponse: { name: call.name, response: { ok: true, openedToolId: suggestedTool } },
          });
        } else if (call.name === 'navigate_tab' && args.tab) {
          executedActions.push({
            type: 'navigate_tab',
            payload: { tab: String(args.tab) },
          });
          functionResponseParts.push({
            functionResponse: { name: call.name, response: { ok: true, navigatedToTab: String(args.tab) } },
          });
        } else if (call.name === 'toggle_theme' && args.theme) {
          const nextTheme = String(args.theme) === 'light' ? 'light' : 'dark';
          executedActions.push({
            type: 'toggle_theme',
            payload: { theme: nextTheme },
          });
          functionResponseParts.push({
            functionResponse: { name: call.name, response: { ok: true, appliedTheme: nextTheme } },
          });
        } else if (call.name === 'load_workflow_preset' && args.presetId) {
          suggestedTool = 'workflow-dag';
          executedActions.push({
            type: 'load_workflow_preset',
            payload: { presetId: String(args.presetId) },
          });
          functionResponseParts.push({
            functionResponse: { name: call.name, response: { ok: true, loadedPreset: String(args.presetId) } },
          });
        } else if (call.name === 'draft_video_edit' && args.instruction) {
          suggestedTool = 'video-studio';
          videoInstruction = String(args.instruction);
          videoPlanPreview = input.parseLocalVideoPlan(videoInstruction, 'Clip', 20);
          executedActions.push({
            type: 'draft_video_edit',
            payload: { instruction: videoInstruction, plan: videoPlanPreview },
          });
          functionResponseParts.push({
            functionResponse: { name: call.name, response: { ok: true, plan: videoPlanPreview } },
          });
        } else if (call.name === 'run_automation_bot' && args.botType) {
          suggestedTool = 'bot-rental';
          const botRes = await input.runBotCallback({
            botType: String(args.botType),
            target: args.target ? String(args.target) : undefined,
            payload: args.payload ? String(args.payload) : undefined,
          });
          toolResults.push(botRes.body);
          executedActions.push({
            type: 'run_automation_bot',
            payload: { botType: String(args.botType), target: args.target || '' },
          });
          functionResponseParts.push({
            functionResponse: { name: call.name, response: botRes.body },
          });
        }
      }

      if (functionResponseParts.length > 0) {
        const modelContent = firstResponse.candidates?.[0]?.content || {
          role: 'model',
          parts: calls.map((c) => ({ functionCall: { name: c.name, args: c.args } })),
        };
        const secondResponse = await withTimeout(
          this.geminiClient.models.generateContent({
            model: selectedGeminiModel,
            contents: [
              ...chatContents,
              modelContent,
              { role: 'user', parts: functionResponseParts },
            ],
            config: { systemInstruction },
          }),
          8000
        );
        if (secondResponse.text) {
          finalReplyText = secondResponse.text;
        }
      }
    }

    if (!finalReplyText.trim()) {
      finalReplyText =
        executedActions.length > 0
          ? `Executed ${executedActions.length} workspace action(s) for "${input.message}".`
          : `Processed "${input.message}" via AethexFlow.`;
    }

    const postMeta = deriveChatAction(input.message, finalReplyText, input.parseLocalVideoPlan);
    return {
      text: finalReplyText,
      engine: 'aethexflow-engine',
      liveAiConnected: true,
      executedActions,
      toolResults,
      suggestedTool: suggestedTool || postMeta.suggestedTool,
      videoInstruction: videoInstruction || postMeta.videoInstruction,
      videoPlanPreview: videoPlanPreview || postMeta.videoPlanPreview,
    };
  }

  async transcribeAudioBase64(dataBase64: string, mimeType: string, fileName = 'audio.webm'): Promise<{
    ok: boolean;
    text: string;
    engine: string;
  }> {
    if (this.geminiClient && dataBase64) {
      try {
        const res = await withTimeout(
          this.geminiClient.models.generateContent({
            model: 'gemini-3.5-transcribe',
            contents: [
              {
                role: 'user',
                parts: [
                  { text: 'Transcribe this audio accurately in plain text only.' },
                  { inlineData: { mimeType: mimeType || 'audio/webm', data: dataBase64 } },
                ],
              },
            ],
          }),
          15000
        );
        const transcript = String(res.text || '').trim();
        if (transcript) {
          return { ok: true, text: transcript, engine: 'aethi-speech' };
        }
      } catch {
        // fallback below
      }
    }
    return {
      ok: true,
      text: `[Audio attachment "${fileName}" queued for Aethi analysis]`,
      engine: 'aethi-speech-fallback',
    };
  }

  private async callAnthropic(
    input: MultiProviderChatInput,
    systemInstruction: string,
    actionMeta: ReturnType<typeof deriveChatAction>
  ): Promise<MultiProviderChatResult | null> {
    const key = this.env.ANTHROPIC_API_KEY?.trim();
    if (!key) return null;

    const attachmentText = this.buildAttachmentSummaryText(input.attachments);
    const messages = [
      ...input.history.slice(-10).map((h) => ({
        role: h.role === 'user' ? 'user' : 'assistant',
        content: String(h.content || ''),
      })),
      { role: 'user', content: `${input.message}${attachmentText}` },
    ];

    const res = await withTimeout(
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-latest',
          max_tokens: 1024,
          system: systemInstruction,
          messages,
        }),
      }),
      14000
    );

    if (!res.ok) return null;
    const data: any = await res.json();
    const text = String(data?.content?.[0]?.text || '').trim();
    if (!text) return null;

    const postMeta = deriveChatAction(input.message, text, input.parseLocalVideoPlan);
    return {
      text,
      engine: 'aethexflow-engine',
      liveAiConnected: true,
      executedActions: this.deriveLocalActions(input.message),
      toolResults: [],
      suggestedTool: actionMeta.suggestedTool || postMeta.suggestedTool,
      videoInstruction: actionMeta.videoInstruction || postMeta.videoInstruction,
      videoPlanPreview: actionMeta.videoPlanPreview || postMeta.videoPlanPreview,
    };
  }

  private async callOpenAICompatible(
    provider: 'openai' | 'groq' | 'grok' | 'openrouter',
    input: MultiProviderChatInput,
    systemInstruction: string,
    actionMeta: ReturnType<typeof deriveChatAction>
  ): Promise<MultiProviderChatResult | null> {
    const configMap = {
      openai: {
        url: 'https://api.openai.com/v1/chat/completions',
        key: this.env.OPENAI_API_KEY?.trim(),
        model: 'gpt-4o-mini',
      },
      groq: {
        url: 'https://api.groq.com/openai/v1/chat/completions',
        key: this.env.GROQ_API_KEY?.trim(),
        model: 'llama-3.3-70b-versatile',
      },
      grok: {
        url: 'https://api.x.ai/v1/chat/completions',
        key: this.env.XAI_API_KEY?.trim(),
        model: 'grok-3-mini',
      },
      openrouter: {
        url: 'https://openrouter.ai/api/v1/chat/completions',
        key: this.env.OPENROUTER_API_KEY?.trim(),
        model: 'openai/gpt-4o-mini',
      },
    }[provider];

    if (!configMap.key) return null;

    const attachmentText = this.buildAttachmentSummaryText(input.attachments);
    const messages = [
      { role: 'system', content: systemInstruction },
      ...input.history.slice(-10).map((h) => ({
        role: h.role === 'user' ? 'user' : 'assistant',
        content: String(h.content || ''),
      })),
      { role: 'user', content: `${input.message}${attachmentText}` },
    ];

    const res = await withTimeout(
      fetch(configMap.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${configMap.key}`,
        },
        body: JSON.stringify({
          model: configMap.model,
          messages,
        }),
      }),
      14000
    );

    if (!res.ok) return null;
    const data: any = await res.json();
    const text = String(data?.choices?.[0]?.message?.content || '').trim();
    if (!text) return null;

    const postMeta = deriveChatAction(input.message, text, input.parseLocalVideoPlan);
    return {
      text,
      engine: 'aethexflow-engine',
      liveAiConnected: true,
      executedActions: this.deriveLocalActions(input.message),
      toolResults: [],
      suggestedTool: actionMeta.suggestedTool || postMeta.suggestedTool,
      videoInstruction: actionMeta.videoInstruction || postMeta.videoInstruction,
      videoPlanPreview: actionMeta.videoPlanPreview || postMeta.videoPlanPreview,
    };
  }

  private deriveLocalActions(message: string): ChatSiteAction[] {
    const lower = message.toLowerCase();
    const actions: ChatSiteAction[] = [];

    if (/\b(switch|change|set|turn)\b.*\b(light|dark)\b/i.test(lower)) {
      actions.push({
        type: 'toggle_theme',
        payload: { theme: lower.includes('light') ? 'light' : 'dark' },
      });
    }
    if (/\b(workflow|dag)\b/i.test(lower) && /\b(load|preset|open|launch)\b/i.test(lower)) {
      actions.push({
        type: 'load_workflow_preset',
        payload: { presetId: 'conditional-media-pipeline' },
      });
    }
    const meta = deriveChatAction(message);
    if (meta.suggestedTool && /\b(open|launch|go to)\b/i.test(lower)) {
      actions.push({ type: 'open_tool', payload: { toolId: meta.suggestedTool } });
    }
    return actions;
  }

  private async runDeterministicFallback(
    input: MultiProviderChatInput,
    userName: string,
    actionMeta: ReturnType<typeof deriveChatAction>
  ): Promise<MultiProviderChatResult> {
    const lower = input.message.toLowerCase();
    const executedActions = this.deriveLocalActions(input.message);
    const toolResults: Array<Record<string, unknown>> = [];

    if (/\b(health|probe|web monitor|check\s+\/api\/health)\b/i.test(lower)) {
      const botRes = await input.runBotCallback({
        botType: 'web-monitor',
        target: '/api/health',
      });
      toolResults.push(botRes.body);
      executedActions.push({
        type: 'run_automation_bot',
        payload: { botType: 'web-monitor', target: '/api/health' },
      });
    }

    if (actionMeta.suggestedTool === 'video-studio' && !executedActions.some((a) => a.type === 'draft_video_edit')) {
      executedActions.push({
        type: 'draft_video_edit',
        payload: {
          instruction: input.message,
          plan: actionMeta.videoPlanPreview || input.parseLocalVideoPlan(input.message, 'Clip', 20),
        },
      });
    }

    const lines: string[] = [];
    if (input.attachments.length > 0) {
      lines.push(
        `Assalam-o-Alaikum, ${userName}! I inspected ${input.attachments.length} attached file(s) via Aethi Edge Runtime:`
      );
      for (const att of input.attachments) {
        const preview = att.textContent
          ? ` — ${att.textContent.slice(0, 180).replace(/\s+/g, ' ')}...`
          : ` (${Math.max(1, Math.round(att.sizeBytes / 1024))} KB)`;
        lines.push(`- **${att.name}**${preview}`);
      }
    } else if (toolResults.length > 0) {
      lines.push(
        `Assalam-o-Alaikum, ${userName}! Executed the live automation probe and recorded telemetry below.`
      );
    } else if (executedActions.length > 0) {
      lines.push(
        `Assalam-o-Alaikum, ${userName}! Prepared and executed ${executedActions.length} workspace action(s) in AethexFlow.`
      );
    } else {
      lines.push(
        `Assalam-o-Alaikum, ${userName}! Aethi Edge Runtime received your prompt: "${input.message}". All local tools, ZIP analysis, Zero-Trust Aethi execution, and 12-hour D1 history remain active.`
      );
    }

    return {
      text: lines.join('\n'),
      engine: 'aethi-edge',
      liveAiConnected: false,
      executedActions,
      toolResults,
      suggestedTool: actionMeta.suggestedTool,
      videoInstruction: actionMeta.videoInstruction,
      videoPlanPreview: actionMeta.videoPlanPreview,
    };
  }
}
