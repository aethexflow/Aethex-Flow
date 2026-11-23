import React from 'react';
import {
  LayoutDashboard,
  MessageSquare,
  Film,
  LayoutGrid,
  Zap,
  GitBranch,
  Settings,
  Shield,
  LogIn,
  LogOut,
  Cloud,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export type NavTab =
  | 'home'
  | 'chat'
  | 'studio'
  | 'workflows'
  | 'tools'
  | 'bots'
  | 'settings';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  isCompact?: boolean;
  theme: 'dark' | 'light';
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'AF';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  isCompact = false,
  theme,
}) => {
  const isDark = theme === 'dark';
  const { user, profile, authBusy, isAdmin, signInWithGoogle, signOutUser } = useAuth();

  const displayName =
    profile?.displayName || user?.displayName || 'Public Guest';
  const initials = user ? getInitials(displayName) : 'GU';

  const navBtnClass = (isActive: boolean) =>
    `w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all group whitespace-nowrap ${
      isActive
        ? isDark
          ? 'bg-red-600/15 text-red-400 border border-red-500/30 shadow-sm shadow-red-950'
          : 'bg-red-600 text-white font-semibold shadow-md shadow-red-200'
        : isDark
        ? 'hover:bg-neutral-800/60 text-neutral-400 hover:text-white'
        : 'hover:bg-neutral-100 text-neutral-600 hover:text-neutral-900'
    }`;

  const navTabsList: NavTab[] = ['home', 'chat', 'studio', 'workflows', 'tools', 'bots', 'settings'];
  const navRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  const handleNavKeyDown = (e: React.KeyboardEvent, currentTab: NavTab) => {
    const idx = navTabsList.indexOf(currentTab);
    if (idx === -1) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      const nextIdx = (idx + 1) % navTabsList.length;
      const nextTab = navTabsList[nextIdx];
      onSelectTab(nextTab);
      navRefs.current[nextTab]?.focus();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevIdx = (idx - 1 + navTabsList.length) % navTabsList.length;
      const prevTab = navTabsList[prevIdx];
      onSelectTab(prevTab);
      navRefs.current[prevTab]?.focus();
    }
  };

  return (
    <aside
      className={`h-screen flex flex-col justify-between shrink-0 transition-all duration-300 z-30 select-none ${
        isCompact ? 'w-20' : 'w-72'
      } ${
        isDark
          ? 'bg-[#0f1118]/90 border-r border-neutral-800/80 text-neutral-300'
          : 'bg-white/95 border-r border-neutral-200 text-neutral-700 shadow-sm'
      } backdrop-blur-xl`}
    >
      {/* Top Header / Branding */}
      <div className="p-5 pb-3">
        <button
          type="button"
          onClick={() => onSelectTab('home')}
          className="flex items-center gap-3.5 mb-5 text-left w-full cursor-pointer"
        >
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center shadow-lg shadow-red-600/25 font-bold text-xl text-white tracking-wider shrink-0">
            A
          </div>

          {!isCompact && (
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={`font-bold text-lg tracking-tight ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                  AethexFlow
                </span>
              </div>
              <span className="text-[10px] tracking-wider font-semibold text-neutral-400 uppercase truncate">
                Edge Automation Studio
              </span>
            </div>
          )}
        </button>

        {/* Workspace indicator */}
        {!isCompact && (
          <div
            className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium mb-2 ${
              isDark
                ? 'bg-neutral-900/70 border border-neutral-800 text-neutral-400'
                : 'bg-neutral-50 border border-neutral-200 text-neutral-700'
            }`}
          >
            <span className="text-[10px] uppercase font-bold tracking-wider whitespace-nowrap flex items-center gap-1.5">
              <Cloud className="w-3 h-3 text-red-500" />
              {user ? 'Cloud Sync' : 'Public Guest'}
            </span>
          </div>
        )}
      </div>

      {/* Navigation Sections */}
      <nav aria-label="Main workspace navigation" className="flex-1 overflow-y-auto px-3.5 space-y-6">
        {/* Core Platform */}
        <div>
          {!isCompact && (
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-2">
              Core Platform
            </p>
          )}
          <div className="space-y-1">
            <button
              type="button"
              ref={(el) => {
                navRefs.current['home'] = el;
              }}
              onClick={() => onSelectTab('home')}
              onKeyDown={(e) => handleNavKeyDown(e, 'home')}
              className={navBtnClass(activeTab === 'home')}
              title="Home Dashboard (Arrow keys to navigate)"
            >
              <div className="flex items-center gap-3">
                <LayoutDashboard
                  className={`w-4 h-4 transition-transform group-hover:scale-110 ${
                    activeTab === 'home' ? (isDark ? 'text-red-400' : 'text-white') : 'text-neutral-400'
                  }`}
                />
                {!isCompact && <span>Home Dashboard</span>}
              </div>
            </button>

            <button
              type="button"
              ref={(el) => {
                navRefs.current['chat'] = el;
              }}
              onClick={() => onSelectTab('chat')}
              onKeyDown={(e) => handleNavKeyDown(e, 'chat')}
              className={navBtnClass(activeTab === 'chat')}
              title="AI Chat Assistant (Arrow keys to navigate)"
            >
              <div className="flex items-center gap-3">
                <MessageSquare
                  className={`w-4 h-4 transition-transform group-hover:scale-110 ${
                    activeTab === 'chat' ? (isDark ? 'text-red-400' : 'text-white') : 'text-neutral-400'
                  }`}
                />
                {!isCompact && <span>AI Chat Assistant</span>}
              </div>
            </button>
          </div>
        </div>

        {/* Studios & AI Tools */}
        <div>
          {!isCompact && (
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-2">
              Studios & AI Tools
            </p>
          )}
          <div className="space-y-1">
            <button
              type="button"
              ref={(el) => {
                navRefs.current['studio'] = el;
              }}
              onClick={() => onSelectTab('studio')}
              onKeyDown={(e) => handleNavKeyDown(e, 'studio')}
              className={navBtnClass(activeTab === 'studio')}
              title="Video & Photo Studio (Arrow keys to navigate)"
            >
              <div className="flex items-center gap-3">
                <Film
                  className={`w-4 h-4 transition-transform group-hover:scale-110 ${
                    activeTab === 'studio' ? (isDark ? 'text-red-400' : 'text-white') : 'text-neutral-400'
                  }`}
                />
                {!isCompact && <span>Video & Photo Studio</span>}
              </div>
            </button>

            <button
              type="button"
              ref={(el) => {
                navRefs.current['workflows'] = el;
              }}
              onClick={() => onSelectTab('workflows')}
              onKeyDown={(e) => handleNavKeyDown(e, 'workflows')}
              className={navBtnClass(activeTab === 'workflows')}
              title="Workflow DAG Visualizer (Arrow keys to navigate)"
            >
              <div className="flex items-center gap-3">
                <GitBranch
                  className={`w-4 h-4 transition-transform group-hover:scale-110 ${
                    activeTab === 'workflows' ? (isDark ? 'text-red-400' : 'text-white') : 'text-neutral-400'
                  }`}
                />
                {!isCompact && <span>Workflow DAG</span>}
              </div>
            </button>

            <button
              type="button"
              ref={(el) => {
                navRefs.current['tools'] = el;
              }}
              onClick={() => onSelectTab('tools')}
              onKeyDown={(e) => handleNavKeyDown(e, 'tools')}
              className={navBtnClass(activeTab === 'tools')}
              title="Tools & Utilities Grid (Arrow keys to navigate)"
            >
              <div className="flex items-center gap-3">
                <LayoutGrid
                  className={`w-4 h-4 transition-transform group-hover:scale-110 ${
                    activeTab === 'tools' ? (isDark ? 'text-red-400' : 'text-white') : 'text-neutral-400'
                  }`}
                />
                {!isCompact && <span>Tools & Utilities</span>}
              </div>
            </button>

            <button
              type="button"
              ref={(el) => {
                navRefs.current['bots'] = el;
              }}
              onClick={() => onSelectTab('bots')}
              onKeyDown={(e) => handleNavKeyDown(e, 'bots')}
              className={navBtnClass(activeTab === 'bots')}
              title="Automation Bots Fleet (Arrow keys to navigate)"
            >
              <div className="flex items-center gap-3">
                <Zap
                  className={`w-4 h-4 transition-transform group-hover:scale-110 ${
                    activeTab === 'bots' ? (isDark ? 'text-red-400' : 'text-white') : 'text-neutral-400'
                  }`}
                />
                {!isCompact && <span>Automation Bots</span>}
              </div>
            </button>
          </div>
        </div>

        {/* System */}
        <div>
          {!isCompact && (
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-2">
              System
            </p>
          )}
          <div className="space-y-1">
            <button
              type="button"
              ref={(el) => {
                navRefs.current['settings'] = el;
              }}
              onClick={() => onSelectTab('settings')}
              onKeyDown={(e) => handleNavKeyDown(e, 'settings')}
              className={navBtnClass(activeTab === 'settings')}
              title="Settings & Security (Arrow keys to navigate)"
            >
              <div className="flex items-center gap-3">
                <Settings
                  className={`w-4 h-4 transition-transform group-hover:scale-110 ${
                    activeTab === 'settings' ? (isDark ? 'text-red-400' : 'text-white') : 'text-neutral-400'
                  }`}
                />
                {!isCompact && <span>Settings & Security</span>}
              </div>
              {!isCompact && (
                <Shield className={`w-3.5 h-3.5 ${activeTab === 'settings' && !isDark ? 'text-white' : 'text-red-400'}`} />
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* Multi-User Account Footer */}
      <div className={`p-4 border-t ${isDark ? 'border-neutral-800/80 bg-neutral-950/40' : 'border-neutral-200 bg-neutral-50/80'}`}>
        {user ? (
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              className="flex items-center gap-3 cursor-pointer group flex-1 min-w-0 text-left"
              onClick={(e) => {
                if (e.detail === 3) {
                  window.location.hash = '#control-vault-master';
                } else {
                  onSelectTab('settings');
                }
              }}
              title="Account Settings"
            >
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={displayName}
                  referrerPolicy="no-referrer"
                  className="w-10 h-10 rounded-full object-cover shadow-md ring-2 ring-red-500/30 group-hover:ring-red-500 transition-all shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-amber-600 via-orange-600 to-red-600 flex items-center justify-center font-bold text-white text-sm shadow-md ring-2 ring-red-500/30 group-hover:ring-red-500 transition-all shrink-0">
                  {initials}
                </div>
              )}
              {!isCompact && (
                <div className="flex flex-col min-w-0">
                  <span className={`font-semibold text-sm truncate ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                    {displayName}
                  </span>
                  <span className="text-[11px] text-neutral-400 truncate">
                    {isAdmin ? 'Admin Operator' : 'Cloud Member'}
                  </span>
                </div>
              )}
            </button>

            {!isCompact && (
              <button
                type="button"
                onClick={signOutUser}
                disabled={authBusy}
                aria-label="Sign out of account"
                title="Sign out"
                className={`p-2 rounded-lg border transition-colors shrink-0 ${
                  isDark
                    ? 'border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800'
                    : 'border-neutral-200 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
                }`}
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={(e) => {
                if (e.detail === 3) {
                  window.location.hash = '#control-vault-master';
                } else {
                  signInWithGoogle();
                }
              }}
              disabled={authBusy}
              className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 text-white font-bold text-xs shadow-md shadow-red-950/30 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              <LogIn className="w-4 h-4 shrink-0" />
              {!isCompact && <span>{authBusy ? 'Signing in...' : 'Sign in with Google'}</span>}
            </button>
            {!isCompact && (
              <p className="text-[11px] text-center text-neutral-400">
                Save chats, DAGs &amp; preferences across devices
              </p>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
