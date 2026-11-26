import React from 'react';
import { Plus, HardDriveDownload, RefreshCw, Trash2, X, ShieldCheck } from 'lucide-react';
import type { ChatThreadTitleItem } from '../types/chat';

interface ChatHistorySidebarProps {
  theme: 'dark' | 'light';
  titles: ChatThreadTitleItem[];
  activeThreadId: string;
  isLoadingTitles: boolean;
  isLoadingThread: boolean;
  isTransferring: boolean;
  transferFeedback: string | null;
  onSelectThread: (threadId: string) => void;
  onNewChat: () => void;
  onDeleteThread: (threadId: string) => void;
  onRefreshTitles: () => void;
  onTransferToAethi: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const ChatHistorySidebar: React.FC<ChatHistorySidebarProps> = ({
  theme,
  titles,
  activeThreadId,
  isLoadingTitles,
  isLoadingThread,
  isTransferring,
  transferFeedback,
  onSelectThread,
  onNewChat,
  onDeleteThread,
  onRefreshTitles,
  onTransferToAethi,
  mobileOpen,
  onCloseMobile,
}) => {
  const isDark = theme === 'dark';

  const sidebarContent = (
    <div
      className={`h-full flex flex-col border rounded-2xl overflow-hidden ${
        isDark
          ? 'bg-[#11131c] border-neutral-800 text-neutral-200'
          : 'bg-white border-neutral-200 text-neutral-800'
      }`}
    >
      {/* Top Action Header */}
      <div
        className={`p-4 border-b space-y-2 ${
          isDark ? 'border-neutral-800' : 'border-neutral-200'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <h2
            className={`text-sm font-semibold tracking-tight whitespace-nowrap ${
              isDark ? 'text-white' : 'text-neutral-900'
            }`}
          >
            Chat History
          </h2>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onRefreshTitles}
              disabled={isLoadingTitles}
              aria-label="Refresh chat titles"
              title="Refresh titles"
              className={`p-1.5 rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 ${
                isDark
                  ? 'border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800/70'
                  : 'border-neutral-200 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingTitles ? 'animate-spin' : ''}`} />
            </button>

            <button
              type="button"
              onClick={onNewChat}
              className="px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-medium flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Chat</span>
              <span className="sm:hidden">New</span>
            </button>

            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Close history sidebar"
              className={`lg:hidden p-2 rounded-lg border transition-colors ${
                isDark
                  ? 'border-neutral-800 text-neutral-400 hover:text-white'
                  : 'border-neutral-200 text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <p className="text-[11px] text-neutral-500 tabular-nums">
          Last 12 hours · Cloudflare D1
        </p>
      </div>

      {/* Titles-Only List */}
      <nav
        aria-label="Past conversation titles"
        className="flex-1 overflow-y-auto p-3 space-y-1"
      >
        {isLoadingTitles && titles.length === 0 ? (
          <div className="space-y-2 p-2">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className={`h-9 rounded-lg animate-pulse ${
                  isDark ? 'bg-neutral-800/60' : 'bg-neutral-100'
                }`}
              />
            ))}
          </div>
        ) : titles.length === 0 ? (
          <div className="py-10 px-4 text-center space-y-2">
            <p className="text-xs font-medium text-neutral-400">
              No saved sessions in the last 12 hours.
            </p>
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              Send a message to create a conversation title synced to D1 and queued for Aethi.
            </p>
          </div>
        ) : (
          titles.map((item) => {
            const isActive = item.thread_id === activeThreadId;
            return (
              <div
                key={item.thread_id}
                className={`group flex items-center justify-between gap-1 rounded-lg transition-colors ${
                  isActive
                    ? isDark
                      ? 'bg-red-600/15 text-white'
                      : 'bg-red-50 text-red-900'
                    : isDark
                    ? 'text-neutral-300 hover:bg-neutral-800/60 hover:text-white'
                    : 'text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelectThread(item.thread_id);
                    onCloseMobile();
                  }}
                  disabled={isLoadingThread}
                  title={item.title}
                  className="flex-1 min-w-0 text-left px-3 py-2.5 text-xs font-medium truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 rounded-lg"
                >
                  {item.title}
                </button>
                <button
                  type="button"
                  aria-label={`Delete conversation ${item.title}`}
                  title="Delete conversation"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteThread(item.thread_id);
                  }}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 mr-1 rounded text-neutral-500 hover:text-red-500 transition-opacity shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </nav>

      {/* Bottom 12h D1 -> Aethi Device Sync Footer */}
      <div
        className={`p-3 border-t space-y-2.5 ${
          isDark ? 'border-neutral-800 bg-neutral-950/50' : 'border-neutral-200 bg-neutral-50/70'
        }`}
      >
        <div className="flex items-center justify-between text-[11px] text-neutral-500 tabular-nums">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>Auto-expires after 12h</span>
          </span>
          <span>{titles.length} active</span>
        </div>

        <button
          type="button"
          onClick={onTransferToAethi}
          disabled={isTransferring || titles.length === 0}
          className={`w-full py-2 px-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 ${
            isDark
              ? 'border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-100'
              : 'border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-900'
          }`}
        >
          <HardDriveDownload className={`w-3.5 h-3.5 ${isTransferring ? 'animate-pulse' : ''}`} />
          <span>{isTransferring ? 'Transferring to Aethi...' : 'Transfer 12h to Aethi'}</span>
        </button>

        {transferFeedback && (
          <p className="text-[11px] text-emerald-500 leading-snug">{transferFeedback}</p>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Dedicated Right Sidebar */}
      <aside
        aria-label="Conversation history right sidebar"
        className="hidden lg:block w-72 shrink-0 h-full"
      >
        {sidebarContent}
      </aside>

      {/* Mobile Slide-Over Right Sidebar Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex justify-end bg-black/60">
          <div className="w-80 max-w-[90vw] h-full p-3">{sidebarContent}</div>
        </div>
      )}
    </>
  );
};
