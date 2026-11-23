import React, { useState } from 'react';
import {
  Search,
  Pin,
  ShieldCheck,
  Image,
  FileText,
  Languages,
  Bot,
  RefreshCw,
  ExternalLink,
  Film,
  Braces,
  GitBranch,
  Sparkles,
} from 'lucide-react';
import { ToolItem } from '../utils/toolsData';

interface ToolsLibraryProps {
  tools: ToolItem[];
  onTogglePin: (id: string) => void;
  onOpenTool: (id: string) => void;
  theme: 'dark' | 'light';
}

export const ToolsLibrary: React.FC<ToolsLibraryProps> = ({
  tools,
  onTogglePin,
  onOpenTool,
  theme,
}) => {
  const isDark = theme === 'dark';
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const categories = [
    { id: 'all', label: 'All tools' },
    { id: 'pinned', label: 'Pinned' },
    { id: 'images', label: 'Images' },
    { id: 'documents', label: 'Documents' },
    { id: 'text', label: 'Text & language' },
    { id: 'developer', label: 'Developer' },
    { id: 'utilities', label: 'Utilities' },
  ];

  const filteredTools = tools.filter((tool) => {
    const matchesSearch =
      tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.actionKeywords.some((kw) => kw.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;
    if (selectedCategory === 'all') return true;
    if (selectedCategory === 'pinned') return tool.isPinned;
    return tool.category === selectedCategory;
  });

  const getIcon = (name: string) => {
    switch (name) {
      case 'Image':
        return <Image className="w-5 h-5 text-red-500" />;
      case 'FileText':
        return <FileText className="w-5 h-5 text-red-500" />;
      case 'RefreshCw':
        return <RefreshCw className="w-5 h-5 text-red-500" />;
      case 'Languages':
        return <Languages className="w-5 h-5 text-red-500" />;
      case 'Film':
        return <Film className="w-5 h-5 text-red-500" />;
      case 'Braces':
        return <Braces className="w-5 h-5 text-red-500" />;
      case 'Bot':
        return <Bot className="w-5 h-5 text-red-500" />;
      case 'GitBranch':
        return <GitBranch className="w-5 h-5 text-red-500" />;
      case 'ShieldCheck':
      default:
        return <ShieldCheck className="w-5 h-5 text-red-500" />;
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in duration-300">
      {/* Header & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-black tracking-tight ${isDark ? 'text-white' : 'text-neutral-900'}`}>
            Tools & Utilities Library
          </h1>
          <p className={`text-xs ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>
            Explore, pin, and launch real client-side &amp; edge execution utilities.
          </p>
        </div>

        <div className="relative min-w-[280px]">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            aria-label="Search tools"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tools by name or keyword..."
            className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-xs focus:border-red-500 focus:outline-none transition-all ${
              isDark
                ? 'border-neutral-800 bg-neutral-900/60 text-white placeholder-neutral-500 shadow-inner'
                : 'border-neutral-200 bg-white text-neutral-900 placeholder-neutral-400 shadow-sm'
            }`}
          />
        </div>
      </div>

      {/* Restructured Horizontal Category Pill Filter Bar */}
      <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-neutral-800/60">
        {categories.map((cat) => {
          const count = tools.filter((t) => {
            if (cat.id === 'all') return true;
            if (cat.id === 'pinned') return t.isPinned;
            return t.category === cat.id;
          }).length;

          return (
            <button
              type="button"
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
                selectedCategory === cat.id
                  ? 'bg-red-600 text-white shadow-md shadow-red-950/30 font-bold'
                  : isDark
                  ? 'bg-neutral-900/80 text-neutral-400 hover:text-white hover:bg-neutral-800 border border-neutral-800'
                  : 'bg-neutral-100 text-neutral-600 hover:text-neutral-900 border border-neutral-200'
              }`}
            >
              <span>{cat.label}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  selectedCategory === cat.id
                    ? 'bg-red-700 text-white'
                    : isDark
                    ? 'bg-neutral-800 text-neutral-400'
                    : 'bg-neutral-200 text-neutral-600'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Hero Banner */}
      <div className="p-6 rounded-2xl border border-red-500/25 bg-gradient-to-br from-red-950/50 via-neutral-950/90 to-[#12131b] relative overflow-hidden shadow-xl shadow-red-950/20">
        <div className="absolute -right-10 -bottom-10 w-60 h-60 rounded-full border border-red-600/15 pointer-events-none"></div>
        <div className="relative z-10 space-y-2 max-w-xl">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-red-400">
            <Sparkles className="w-3.5 h-3.5" />
            Zero Mock Stubs • Direct Execution
          </div>
          <h2 className="text-lg font-black text-white">Instant Client-Side &amp; Edge Tools</h2>
          <p className="text-xs text-neutral-300 leading-relaxed">
            All utilities run locally in your browser sandbox or through secure Cloudflare edge worker tunnels with cryptographic verification and zero telemetry.
          </p>
        </div>
      </div>

      {/* Restructured Unified Tool Cards Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className={`text-sm font-bold tracking-tight ${isDark ? 'text-white' : 'text-neutral-900'}`}>
            Available Utilities ({filteredTools.length})
          </h3>
          <span className="text-xs text-neutral-400 font-mono">Permission-First by Default</span>
        </div>

        {filteredTools.length === 0 ? (
          <div className={`p-8 rounded-2xl border text-center text-xs ${isDark ? 'border-neutral-800 bg-neutral-900/40 text-neutral-400' : 'border-neutral-200 bg-white text-neutral-600'}`}>
            No tools match your current search or category filter.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTools.map((tool) => (
              <div
                key={tool.id}
                className={`p-4 rounded-2xl border transition-all flex flex-col justify-between group ${
                  isDark
                    ? 'border-neutral-800/80 bg-neutral-900/40 hover:border-red-500/40 hover:bg-neutral-900/80'
                    : 'border-neutral-200 bg-white hover:border-red-300 shadow-sm'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-red-600/10 border border-red-500/20 flex items-center justify-center shrink-0">
                      {getIcon(tool.iconName)}
                    </div>
                    <button
                      type="button"
                      onClick={() => onTogglePin(tool.id)}
                      aria-label={tool.isPinned ? `Unpin ${tool.name}` : `Pin ${tool.name}`}
                      title={tool.isPinned ? 'Unpin tool' : 'Pin to Home'}
                      className={`p-2 rounded-xl transition-colors ${
                        tool.isPinned
                          ? 'text-red-500 bg-red-500/10'
                          : isDark
                          ? 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                          : 'text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100'
                      }`}
                    >
                      <Pin className={`w-4 h-4 ${tool.isPinned ? 'fill-red-500' : ''}`} />
                    </button>
                  </div>

                  <h4 className={`font-bold text-sm group-hover:text-red-500 transition-colors ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                    {tool.name}
                  </h4>
                  <p className={`text-xs mt-1.5 line-clamp-2 leading-relaxed ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>
                    {tool.description}
                  </p>
                </div>

                <div
                  className={`flex items-center justify-between pt-4 mt-4 border-t text-xs ${
                    isDark ? 'border-neutral-800/60' : 'border-neutral-100'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-500 font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    {tool.status}
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenTool(tool.id)}
                    className="px-3.5 py-1.5 rounded-xl bg-red-600/15 hover:bg-red-600 text-red-500 hover:text-white border border-red-500/30 font-bold text-xs transition-all flex items-center gap-1.5 shadow-sm"
                  >
                    <span>Launch</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
