export type IntentType =
  | 'LAUNCH_TOOL'
  | 'NAVIGATE_TAB'
  | 'BOT_ACTION'
  | 'SYSTEM_ACTION'
  | 'TRANSLATE_TEXT'
  | 'MASTER_VAULT';

export interface ParsedIntent {
  type: IntentType;
  targetId: string;
  confidence: number;
  label: string;
  description: string;
  payload?: Record<string, any>;
}

export const KNOWN_INTENTS: Array<{
  keywords: string[];
  intent: ParsedIntent;
}> = [
  // Tool launches
  {
    keywords: ['remove background', 'cutout', 'bg remove', 'transparent image', 'transparent png', 'isolate photo'],
    intent: {
      type: 'LAUNCH_TOOL',
      targetId: 'background-remover',
      confidence: 0.98,
      label: 'Background Remover',
      description: 'Isolate image subjects locally with transparent PNG output',
    },
  },
  {
    keywords: ['compress pdf', 'shrink pdf', 'reduce pdf', 'optimize pdf', 'pdf size'],
    intent: {
      type: 'LAUNCH_TOOL',
      targetId: 'pdf-compressor',
      confidence: 0.98,
      label: 'PDF Compressor',
      description: 'Strip metadata & optimize PDF byte stream locally',
    },
  },
  {
    keywords: ['convert image', 'webp', 'png to jpg', 'jpg to webp', 'resize image'],
    intent: {
      type: 'LAUNCH_TOOL',
      targetId: 'image-converter',
      confidence: 0.96,
      label: 'Image Converter',
      description: 'Convert between WebP, PNG, and JPEG formats',
    },
  },
  {
    keywords: ['translate', 'roman urdu', 'urdu tarjuma', 'english to urdu', 'transliterate'],
    intent: {
      type: 'LAUNCH_TOOL',
      targetId: 'text-translator',
      confidence: 0.95,
      label: 'Text Translator',
      description: 'Bilingual engine for English, Roman Urdu, and Urdu Script',
    },
  },
  {
    keywords: ['encrypt', 'decrypt', 'aes-256', 'aes', 'sha-256', 'hash text', 'crypto vault'],
    intent: {
      type: 'LAUNCH_TOOL',
      targetId: 'crypto-vault',
      confidence: 0.97,
      label: 'AES-256 Crypto Vault',
      description: 'Encrypt/decrypt payloads or generate SHA-256 hashes locally',
    },
  },
  {
    keywords: ['format json', 'json to csv', 'csv to json', 'minify json', 'validate json'],
    intent: {
      type: 'LAUNCH_TOOL',
      targetId: 'data-formatter',
      confidence: 0.97,
      label: 'JSON & CSV Transformer',
      description: 'Format JSON, convert JSON <-> CSV, and export data',
    },
  },

  // Navigation
  {
    keywords: ['open dashboard', 'go home', 'home screen', 'landing page'],
    intent: {
      type: 'NAVIGATE_TAB',
      targetId: 'home',
      confidence: 0.99,
      label: 'Home Dashboard',
      description: 'Return to primary workspace',
    },
  },
  {
    keywords: ['ask aethe', 'chat', 'ai copilot', 'talk to ai', 'chat assistant'],
    intent: {
      type: 'NAVIGATE_TAB',
      targetId: 'chat',
      confidence: 0.98,
      label: 'AI Chat Assistant',
      description: 'Converse with Aethi Copilot & send tasks to Video Studio',
    },
  },
  {
    keywords: ['workflow dag', 'dag visualizer', 'visual workflow', 'conditional trigger', 'connect nodes', 'workflow builder', 'branching flow'],
    intent: {
      type: 'NAVIGATE_TAB',
      targetId: 'workflows',
      confidence: 0.98,
      label: 'Workflow DAG Visualizer',
      description: 'Connect AethexFlow tools & IF/ELSE triggers into automated sequences',
    },
  },
  {
    keywords: ['video editor', 'video studio', 'edit video', 'create video', 'vertical short', 'shorts', 'timeline', 'photo editor', 'trim video'],
    intent: {
      type: 'NAVIGATE_TAB',
      targetId: 'studio',
      confidence: 0.98,
      label: 'Automated Video Studio',
      description: 'Open multi-track video & photo editor with AI edit plans',
    },
  },
  {
    keywords: ['tools library', 'all tools', 'browse tools', 'installed tools', 'plugin store'],
    intent: {
      type: 'NAVIGATE_TAB',
      targetId: 'tools',
      confidence: 0.97,
      label: 'Tools & Utilities Library',
      description: 'Manage and launch focused local utilities',
    },
  },
  {
    keywords: ['bots', 'bot fleet', 'automation bot', 'web monitor', 'webhook', 'digest bot'],
    intent: {
      type: 'NAVIGATE_TAB',
      targetId: 'bots',
      confidence: 0.97,
      label: 'Automation Bots',
      description: 'Run live Web Monitors, AI Digests, and Webhook Relays',
    },
  },
  {
    keywords: ['settings', 'preferences', 'local hub', 'pair hub', 'hardware vault', 'security'],
    intent: {
      type: 'NAVIGATE_TAB',
      targetId: 'settings',
      confidence: 0.98,
      label: 'Settings & Security',
      description: 'Local automation daemon & cryptographic vault',
    },
  },

  // Master Control Vault (Hidden admin)
  {
    keywords: ['master vault', 'control vault', 'admin console', 'master control', 'super admin', 'root vault'],
    intent: {
      type: 'MASTER_VAULT',
      targetId: 'master-vault',
      confidence: 0.99,
      label: 'Master Control Vault',
      description: 'Discrete administrative engine & telemetry console',
    },
  },

  // System actions
  {
    keywords: ['toggle theme', 'dark mode', 'light mode', 'change theme', 'white glass'],
    intent: {
      type: 'SYSTEM_ACTION',
      targetId: 'toggle_theme',
      confidence: 0.95,
      label: 'Toggle Workspace Theme',
      description: 'Switch between Obsidian Slate and Studio Light',
    },
  },
  {
    keywords: ['ping hub', 'check latency', 'ipc test', 'test ipc', 'test socket'],
    intent: {
      type: 'SYSTEM_ACTION',
      targetId: 'ping_hub',
      confidence: 0.95,
      label: 'Test Zero-Copy IPC Ping',
      description: 'Measure sub-100ms local socket roundtrip latency',
    },
  },
];

/**
 * Parses freeform natural language query into a typed executable intent.
 */
export function parseNaturalIntent(query: string): ParsedIntent {
  const clean = query.toLowerCase().trim();
  if (!clean) {
    return {
      type: 'NAVIGATE_TAB',
      targetId: 'home',
      confidence: 0.1,
      label: 'Default Landing',
      description: 'Empty query',
    };
  }

  if (clean === 'vault' || clean === 'admin' || clean === 'root' || clean.includes('control-vault')) {
    return {
      type: 'MASTER_VAULT',
      targetId: 'master-vault',
      confidence: 1.0,
      label: 'Master Control Vault',
      description: 'Administrative master control panel',
    };
  }

  let bestMatch: ParsedIntent | null = null;
  let highestScore = 0;

  for (const entry of KNOWN_INTENTS) {
    for (const kw of entry.keywords) {
      if (clean === kw) {
        return { ...entry.intent, confidence: 1.0 };
      }
      if (clean.includes(kw)) {
        const lengthRatio = kw.length / clean.length;
        const score = 0.82 + lengthRatio * 0.17;
        if (score > highestScore) {
          highestScore = score;
          bestMatch = entry.intent;
        }
      }
    }
  }

  if (bestMatch && highestScore >= 0.82) {
    return { ...bestMatch, confidence: Math.min(0.99, Number(highestScore.toFixed(2))) };
  }

  if (clean.includes('pdf')) {
    return {
      type: 'LAUNCH_TOOL',
      targetId: 'pdf-compressor',
      confidence: 0.85,
      label: 'PDF Compressor',
      description: 'Matched "pdf" keyword',
    };
  }
  if (clean.includes('video') || clean.includes('clip') || clean.includes('reel') || clean.includes('short')) {
    return {
      type: 'NAVIGATE_TAB',
      targetId: 'studio',
      confidence: 0.88,
      label: 'Automated Video Studio',
      description: 'Matched video editing keyword',
    };
  }
  if (clean.includes('background') || clean.includes('photo') || clean.includes('image')) {
    return {
      type: 'LAUNCH_TOOL',
      targetId: 'background-remover',
      confidence: 0.82,
      label: 'Background Remover',
      description: 'Matched image/photo keyword',
    };
  }
  if (clean.includes('urdu') || clean.includes('translate') || clean.includes('language')) {
    return {
      type: 'LAUNCH_TOOL',
      targetId: 'text-translator',
      confidence: 0.88,
      label: 'Text Translator',
      description: 'Matched language keyword',
    };
  }
  if (clean.includes('encrypt') || clean.includes('decrypt') || clean.includes('hash') || clean.includes('aes')) {
    return {
      type: 'LAUNCH_TOOL',
      targetId: 'crypto-vault',
      confidence: 0.86,
      label: 'AES-256 Crypto Vault',
      description: 'Matched cryptography keyword',
    };
  }
  if (clean.includes('json') || clean.includes('csv')) {
    return {
      type: 'LAUNCH_TOOL',
      targetId: 'data-formatter',
      confidence: 0.86,
      label: 'JSON & CSV Transformer',
      description: 'Matched structured data keyword',
    };
  }
  if (clean.includes('workflow') || clean.includes('dag') || clean.includes('conditional')) {
    return {
      type: 'NAVIGATE_TAB',
      targetId: 'workflows',
      confidence: 0.87,
      label: 'Workflow DAG Visualizer',
      description: 'Matched workflow automation keyword',
    };
  }
  if (clean.includes('bot') || clean.includes('monitor') || clean.includes('webhook')) {
    return {
      type: 'NAVIGATE_TAB',
      targetId: 'bots',
      confidence: 0.85,
      label: 'Automation Bots',
      description: 'Matched bot keyword',
    };
  }

  return {
    type: 'NAVIGATE_TAB',
    targetId: 'chat',
    confidence: 0.75,
    label: 'Ask Aethe Copilot',
    description: `Route "${query}" to intelligent conversational model`,
    payload: { query },
  };
}
