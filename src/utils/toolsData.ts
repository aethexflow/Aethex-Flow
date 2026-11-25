export interface ToolItem {
  id: string;
  name: string;
  category: 'images' | 'documents' | 'text' | 'developer' | 'utilities';
  categoryLabel: string;
  description: string;
  iconName: string;
  isPinned: boolean;
  isInstalled: boolean;
  status: 'Ready' | 'Processing' | 'Idle';
  permissions: string[];
  actionKeywords: string[];
}

export const INITIAL_TOOLS: ToolItem[] = [
  {
    id: 'background-remover',
    name: 'Background Remover',
    category: 'images',
    categoryLabel: 'Images',
    description: 'Remove image backgrounds locally with one drop.',
    iconName: 'Image',
    isPinned: true,
    isInstalled: true,
    status: 'Ready',
    permissions: ['Local file access', 'Canvas pixel manipulation'],
    actionKeywords: ['background', 'remove bg', 'transparent', 'cutout', 'isolate subject', 'png'],
  },
  {
    id: 'pdf-compressor',
    name: 'PDF Compressor',
    category: 'documents',
    categoryLabel: 'Documents',
    description: 'Strip metadata and compress real PDF files locally via pdf-lib.',
    iconName: 'FileText',
    isPinned: true,
    isInstalled: true,
    status: 'Ready',
    permissions: ['Local document stream', 'Object stream compression'],
    actionKeywords: ['compress', 'shrink pdf', 'reduce size', 'optimize pdf', 'document size'],
  },
  {
    id: 'image-converter',
    name: 'Image Converter',
    category: 'images',
    categoryLabel: 'Images',
    description: 'Convert PNG, JPG, and WebP formats with scaling.',
    iconName: 'RefreshCw',
    isPinned: true,
    isInstalled: true,
    status: 'Ready',
    permissions: ['Format encoding', 'Local export'],
    actionKeywords: ['convert', 'webp', 'jpg', 'png', 'transform image'],
  },
  {
    id: 'text-translator',
    name: 'Text Translator',
    category: 'text',
    categoryLabel: 'Text & language',
    description: 'Translate plain text, Urdu, and Roman Urdu quickly.',
    iconName: 'Languages',
    isPinned: true,
    isInstalled: true,
    status: 'Ready',
    permissions: ['Language parsing', 'Speech synthesis'],
    actionKeywords: ['translate', 'roman urdu', 'urdu', 'english', 'language', 'speech'],
  },
  {
    id: 'video-studio',
    name: 'Automated Video Studio',
    category: 'utilities',
    categoryLabel: 'Media Studio',
    description: 'Edit videos and photos on a multi-track timeline with AI edit plans & WebM export.',
    iconName: 'Film',
    isPinned: false,
    isInstalled: true,
    status: 'Ready',
    permissions: ['Canvas rendering', 'MediaRecorder export'],
    actionKeywords: ['video', 'editor', 'shorts', 'timeline', 'trim', 'cut video', 'photo editor'],
  },
  {
    id: 'crypto-vault',
    name: 'AES-256 Crypto Vault',
    category: 'utilities',
    categoryLabel: 'Security',
    description: 'Encrypt/decrypt payloads with WebCrypto AES-256-GCM and generate SHA-256 hashes.',
    iconName: 'ShieldCheck',
    isPinned: false,
    isInstalled: true,
    status: 'Ready',
    permissions: ['WebCrypto Subtle API', 'Zero-cloud key derivation'],
    actionKeywords: ['encrypt', 'decrypt', 'aes', 'sha256', 'hash', 'cipher', 'crypto'],
  },
  {
    id: 'data-formatter',
    name: 'JSON & CSV Transformer',
    category: 'developer',
    categoryLabel: 'Developer',
    description: 'Validate JSON, convert JSON <-> CSV, minify, and export clean datasets.',
    iconName: 'Braces',
    isPinned: false,
    isInstalled: true,
    status: 'Ready',
    permissions: ['Schema parsing', 'Local download'],
    actionKeywords: ['json', 'csv', 'format', 'minify', 'parse', 'spreadsheet'],
  },
  {
    id: 'workflow-dag',
    name: 'Workflow DAG Visualizer',
    category: 'developer',
    categoryLabel: 'Automation',
    description: 'Connect tools and IF/ELSE conditional triggers into visual deadlock-free workflows.',
    iconName: 'GitBranch',
    isPinned: false,
    isInstalled: true,
    status: 'Ready',
    permissions: ['Kahn DAG verification', 'Conditional branching'],
    actionKeywords: ['workflow', 'dag', 'visualizer', 'conditional trigger', 'branch', 'sequence', 'node graph'],
  },
  {
    id: 'bot-rental',
    name: 'Automation Bots Fleet',
    category: 'developer',
    categoryLabel: 'Automation',
    description: 'Run live Web Monitors, AI Content Digests, Webhook Relays, and Data Normalizers.',
    iconName: 'Bot',
    isPinned: false,
    isInstalled: true,
    status: 'Ready',
    permissions: ['Server fetch runner', 'Scheduled triggers'],
    actionKeywords: ['bot', 'monitor', 'webhook', 'digest', 'automation', 'crawler'],
  },
  {
    id: 'regex-matcher',
    name: 'Regex Pattern & Matcher',
    category: 'developer',
    categoryLabel: 'Developer',
    description: 'Test regular expressions, match lists, and flags client-side instantly.',
    iconName: 'Braces',
    isPinned: false,
    isInstalled: true,
    status: 'Ready',
    permissions: ['RegExp evaluation', 'Local clipboard'],
    actionKeywords: ['regex', 'regular expression', 'match', 'pattern', 'search text', 'validate'],
  },
];

export function routeNaturalCommandToTool(query: string, tools: ToolItem[]): ToolItem | null {
  const clean = query.toLowerCase().trim();
  if (!clean) return null;

  let bestTool: ToolItem | null = null;
  let bestScore = 0;

  for (const tool of tools) {
    let score = 0;
    const toolNameLower = tool.name.toLowerCase();
    if (toolNameLower === clean) {
      return tool;
    }
    if (toolNameLower.includes(clean) || clean.includes(toolNameLower)) {
      score += 20;
    }

    for (const kw of tool.actionKeywords) {
      const kwLower = kw.toLowerCase();
      if (clean.includes(kwLower)) {
        score += kwLower.length + 3;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestTool = tool;
    }
  }

  if (bestTool && bestScore > 0) {
    return bestTool;
  }

  if (clean.includes('workflow') || clean.includes('dag') || clean.includes('branch') || clean.includes('conditional')) {
    return tools.find((t) => t.id === 'workflow-dag') || null;
  }
  if (clean.includes('cutout') || clean.includes('erase background') || clean.includes('photo')) {
    return tools.find((t) => t.id === 'background-remover') || null;
  }
  if (clean.includes('pdf') || clean.includes('shrink') || clean.includes('file size')) {
    return tools.find((t) => t.id === 'pdf-compressor') || null;
  }
  if (clean.includes('video') || clean.includes('clip') || clean.includes('timeline') || clean.includes('reel') || clean.includes('short')) {
    return tools.find((t) => t.id === 'video-studio') || null;
  }
  if (clean.includes('urdu') || clean.includes('tarjuma') || clean.includes('translation')) {
    return tools.find((t) => t.id === 'text-translator') || null;
  }
  if (clean.includes('encrypt') || clean.includes('decrypt') || clean.includes('hash') || clean.includes('aes')) {
    return tools.find((t) => t.id === 'crypto-vault') || null;
  }
  if (clean.includes('json') || clean.includes('csv')) {
    return tools.find((t) => t.id === 'data-formatter') || null;
  }

  return null;
}
