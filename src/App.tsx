/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Sidebar, NavTab } from './components/Sidebar';
import { HomeDashboard } from './components/HomeDashboard';
import { ToolsLibrary } from './components/ToolsLibrary';
import { VideoStudioEditor } from './components/VideoStudioEditor';
import { SettingsAndSecurity } from './components/SettingsAndSecurity';
import { AIChatAssistant, ExecutedChatAction } from './components/AIChatAssistant';
import { BotRentalCreator } from './components/BotRentalCreator';
import { MasterControlDashboard } from './components/MasterControlDashboard';
import { AdminGatewayChat } from './components/AdminGatewayChat';
import { CommandPaletteModal } from './components/CommandPaletteModal';
import { BackgroundRemoverModal } from './components/BackgroundRemoverModal';
import { PdfCompressorModal } from './components/PdfCompressorModal';
import { ImageConverterModal } from './components/ImageConverterModal';
import { TextTranslatorModal } from './components/TextTranslatorModal';
import { CryptoVaultModal } from './components/CryptoVaultModal';
import { DataFormatterModal } from './components/DataFormatterModal';
import { WorkflowDagVisualizer } from './components/WorkflowDagVisualizer';
import { INITIAL_TOOLS, ToolItem } from './utils/toolsData';
import { useAuth } from './contexts/AuthContext';
import {
  subscribeWorkspacePreferences,
  saveWorkspacePreferences,
  subscribeUserActivities,
  addUserActivity,
} from './utils/firestoreWorkspace';
import { Menu, Moon, Sun, LogIn, LogOut, PanelLeft } from 'lucide-react';

interface ActivityItem {
  id: string;
  action: string;
  time: string;
  status: string;
}

const ACTIVITY_STORAGE_KEY = 'aethexflow_activity_v42';

function isAdminSecretPath(): boolean {
  return typeof window !== 'undefined' && window.location.pathname.startsWith('/admin-gateway-secret');
}

function isMasterVaultRoute(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window.location.hash === '#control-vault-master' ||
      window.location.pathname.includes('control-vault-master'))
  );
}

export default function App() {
  const {
    user,
    profile,
    authReady,
    authBusy,
    signInWithGoogle,
    signOutUser,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('aethexflow_theme');
    return saved === 'light' ? 'light' : 'dark';
  });
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [tools, setTools] = useState<ToolItem[]>(() => {
    const saved = localStorage.getItem('aethexflow_tools');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as ToolItem[];
        const hasLegacy = parsed.some((t) => t.id === 'clean-dubbing' || t.id === 'dag-builder');
        const hasVideoStudio = parsed.some((t) => t.id === 'video-studio');
        const hasWorkflowDag = parsed.some((t) => t.id === 'workflow-dag');
        if (!Array.isArray(parsed) || hasLegacy || !hasVideoStudio || !hasWorkflowDag) {
          return INITIAL_TOOLS;
        }
        return parsed;
      } catch {
        return INITIAL_TOOLS;
      }
    }
    return INITIAL_TOOLS;
  });

  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  const [isSidebarHidden, setIsSidebarHidden] = useState<boolean>(false);
  const [isMasterVaultOpen, setIsMasterVaultOpen] = useState<boolean>(() => isMasterVaultRoute());
  const [isAdminGatewayOpen, setIsAdminGatewayOpen] = useState<boolean>(() => isAdminSecretPath());
  const [activityLog, setActivityLog] = useState<ActivityItem[]>(() => {
    try {
      const saved = localStorage.getItem(ACTIVITY_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed.slice(0, 12);
      }
    } catch {
      // ignore storage read issue
    }
    return [];
  });
  const [pendingVideoInstruction, setPendingVideoInstruction] = useState<string | null>(null);
  const [pendingChatPrompt, setPendingChatPrompt] = useState<string | null>(null);
  const [pendingWorkflowPreset, setPendingWorkflowPreset] = useState<string | null>(null);

  const isDark = theme === 'dark';

  useEffect(() => {
    localStorage.setItem('aethexflow_tools', JSON.stringify(tools));
  }, [tools]);

  useEffect(() => {
    localStorage.setItem('aethexflow_theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!user) {
      try {
        localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(activityLog.slice(0, 12)));
      } catch {
        // ignore storage quota
      }
    }
  }, [activityLog, user]);

  // Cloud sync preferences & activity feed when signed in
  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      try {
        const saved = localStorage.getItem(ACTIVITY_STORAGE_KEY);
        setActivityLog(saved ? (JSON.parse(saved) as ActivityItem[]).slice(0, 12) : []);
      } catch {
        setActivityLog([]);
      }
      return;
    }

    const unsubPrefs = subscribeWorkspacePreferences(user.uid, (prefs) => {
      setTheme(prefs.theme);
      setDensity(prefs.density);
      if (prefs.pinnedToolIds.length > 0) {
        setTools((prev) =>
          prev.map((t) => ({
            ...t,
            isPinned: prefs.pinnedToolIds.includes(t.id),
          }))
        );
      }
    });

    const unsubAct = subscribeUserActivities(user.uid, (items) => {
      setActivityLog(items);
    });

    return () => {
      unsubPrefs();
      unsubAct();
    };
  }, [authReady, user?.uid]);

  // Listen for hash route #control-vault-master and path /admin-gateway-secret
  useEffect(() => {
    const syncRoutes = () => {
      if (isAdminSecretPath()) {
        setIsAdminGatewayOpen(true);
        setIsMasterVaultOpen(false);
      } else {
        setIsAdminGatewayOpen(false);
        if (isMasterVaultRoute()) {
          setIsMasterVaultOpen(true);
        }
      }
    };
    window.addEventListener('hashchange', syncRoutes);
    window.addEventListener('popstate', syncRoutes);
    return () => {
      window.removeEventListener('hashchange', syncRoutes);
      window.removeEventListener('popstate', syncRoutes);
    };
  }, []);

  // Dynamically enforce <meta name="robots" content="noindex, nofollow"> on unindexed admin routes
  useEffect(() => {
    const head = document.head;
    let robotsMeta = head.querySelector('meta[name="robots"]') as HTMLMetaElement | null;

    if (isAdminGatewayOpen || isMasterVaultOpen) {
      if (!robotsMeta) {
        robotsMeta = document.createElement('meta');
        robotsMeta.name = 'robots';
        head.appendChild(robotsMeta);
      }
      robotsMeta.content = 'noindex, nofollow';
    } else if (robotsMeta) {
      robotsMeta.remove();
    }
  }, [isAdminGatewayOpen, isMasterVaultOpen]);

  // Global hotkeys: Ctrl+Shift+M (Master Vault), Ctrl+K (Command Palette)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setIsMasterVaultOpen((prev) => !prev);
      } else if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === 'k' &&
        !isMasterVaultOpen &&
        !isAdminGatewayOpen
      ) {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMasterVaultOpen, isAdminGatewayOpen]);

  const persistPrefs = (
    nextTheme: 'dark' | 'light',
    nextTools: ToolItem[],
    nextDensity: 'comfortable' | 'compact'
  ) => {
    if (user) {
      void saveWorkspacePreferences(user.uid, {
        theme: nextTheme,
        pinnedToolIds: nextTools.filter((t) => t.isPinned).map((t) => t.id),
        density: nextDensity,
      });
    }
  };

  const handleTogglePin = (toolId: string) => {
    setTools((prev) => {
      const updated = prev.map((t) =>
        t.id === toolId ? { ...t, isPinned: !t.isPinned } : t
      );
      persistPrefs(theme, updated, density);
      return updated;
    });
  };

  const handleOpenTool = (toolId: string) => {
    if (toolId === 'video-studio') {
      setActiveTab('studio');
    } else if (toolId === 'workflow-dag') {
      setActiveTab('workflows');
    } else if (toolId === 'bot-rental') {
      setActiveTab('bots');
    } else if (toolId === 'ed25519-vault') {
      setActiveTab('settings');
    } else {
      setActiveModal(toolId);
    }
  };

  const logActivity = (action: string) => {
    const newItem: ActivityItem = {
      id: `act_${Date.now()}`,
      action,
      time: 'Just now',
      status: 'Completed',
    };
    setActivityLog((prev) => [newItem, ...prev.slice(0, 10)]);
    if (user) {
      void addUserActivity(user.uid, action, 'Completed');
    }
  };

  const toggleTheme = () => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      persistPrefs(next, tools, density);
      return next;
    });
  };

  const handleChangeDensity = (nextDensity: 'comfortable' | 'compact') => {
    setDensity(nextDensity);
    persistPrefs(theme, tools, nextDensity);
  };

  const handleExecuteChatActions = (actions: ExecutedChatAction[]) => {
    for (const act of actions) {
      if (act.type === 'toggle_theme') {
        const nextTheme = act.payload.theme === 'light' ? 'light' : 'dark';
        setTheme(nextTheme);
        persistPrefs(nextTheme, tools, density);
      } else if (act.type === 'load_workflow_preset' && act.payload.presetId) {
        setPendingWorkflowPreset(String(act.payload.presetId));
        setActiveTab('workflows');
      } else if (act.type === 'navigate_tab' && act.payload.tab) {
        const validTabs: NavTab[] = ['home', 'chat', 'studio', 'workflows', 'tools', 'bots', 'settings'];
        const target = String(act.payload.tab) as NavTab;
        if (validTabs.includes(target)) {
          setActiveTab(target);
        }
      } else if (act.type === 'open_tool' && act.payload.toolId) {
        handleOpenTool(String(act.payload.toolId));
      } else if (act.type === 'draft_video_edit' && act.payload.instruction) {
        setPendingVideoInstruction(String(act.payload.instruction));
      }
    }
  };

  const handleEnterAdminGateway = () => {
    window.history.pushState({}, '', '/admin-gateway-secret');
    setIsMasterVaultOpen(false);
    setIsAdminGatewayOpen(true);
  };

  const handleExitAdminGateway = () => {
    window.history.pushState({}, '', '/');
    setIsAdminGatewayOpen(false);
    setActiveTab('home');
  };

  // Dedicated isolated route for /admin-gateway-secret (no public nav chrome)
  if (isAdminGatewayOpen) {
    return (
      <div
        className={`min-h-screen w-full transition-colors duration-300 font-sans ${
          isDark ? 'bg-[#0b0d13] text-[#f1f3f9]' : 'bg-[#f6f8fc] text-neutral-900'
        }`}
      >
        <AdminGatewayChat
          theme={theme}
          onExit={handleExitAdminGateway}
          onLogActivity={logActivity}
        />
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen flex w-full transition-colors duration-300 font-sans ${
        isDark ? 'bg-[#0a0b0f] text-[#f1f3f9]' : 'bg-[#fafafa] text-neutral-900'
      }`}
    >
      {/* Desktop Sidebar */}
      {!isSidebarHidden && (
        <div className="hidden md:block">
          <Sidebar
            activeTab={activeTab}
            onSelectTab={(tab) => {
              setActiveTab(tab);
              setIsMasterVaultOpen(false);
            }}
            isCompact={density === 'compact'}
            theme={theme}
          />
        </div>
      )}

      {/* Mobile Drawer Navigation */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="relative z-10 w-72">
            <Sidebar
              activeTab={activeTab}
              onSelectTab={(tab) => {
                setActiveTab(tab);
                setIsMasterVaultOpen(false);
                setIsMobileMenuOpen(false);
              }}
              theme={theme}
            />
          </div>
        </div>
      )}

      {/* Main App Content Viewport */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header Bar */}
        <header
          className={`h-16 px-4 sm:px-6 flex items-center justify-between border-b shrink-0 backdrop-blur-xl z-20 ${
            isDark
              ? 'bg-[#0e1017]/90 border-neutral-800/80'
              : 'bg-white/90 border-neutral-200 shadow-sm'
          }`}
        >
          {/* Left: Mobile hamburger & Sidebar toggle */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              title="Open navigation menu"
              className={`p-2 rounded-lg md:hidden ${
                isDark
                  ? 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                  : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
              }`}
            >
              <Menu className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => setIsSidebarHidden((prev) => !prev)}
              aria-label={isSidebarHidden ? 'Show sidebar' : 'Hide sidebar'}
              title={isSidebarHidden ? 'Show sidebar' : 'Hide sidebar'}
              className={`p-2 rounded-xl border transition-all hidden md:flex items-center justify-center ${
                isDark
                  ? 'border-neutral-800 bg-neutral-900/60 hover:border-neutral-700 text-neutral-400 hover:text-white'
                  : 'border-neutral-200 bg-neutral-50 hover:border-neutral-300 text-neutral-700'
              }`}
            >
              <PanelLeft className="w-4 h-4" />
            </button>
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-2.5">

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={`Switch to ${isDark ? 'Light' : 'Dark'} mode`}
              title={`Switch to ${isDark ? 'Studio Light' : 'Obsidian Dark'}`}
              className={`p-2 rounded-xl border transition-all ${
                isDark
                  ? 'border-neutral-800 bg-neutral-900/60 hover:border-neutral-700 text-neutral-400 hover:text-white'
                  : 'border-neutral-200 bg-neutral-50 hover:border-neutral-300 text-neutral-700'
              }`}
            >
              {isDark ? (
                <Sun className="w-[15.9844px] h-4 font-bold text-amber-400" />
              ) : (
                <Moon className="w-[15.9844px] h-4 font-bold text-neutral-700" />
              )}
            </button>

            {user ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveTab('settings')}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                    isDark
                      ? 'border-neutral-800 bg-neutral-900/70 hover:border-neutral-700 text-white'
                      : 'border-neutral-200 bg-neutral-50 hover:border-neutral-300 text-neutral-900'
                  }`}
                >
                  {user.photoURL && (
                    <img
                      src={user.photoURL}
                      alt={profile?.displayName || user.displayName || 'User'}
                      referrerPolicy="no-referrer"
                      className="w-5 h-5 rounded-full object-cover"
                    />
                  )}
                  <span className="max-w-[110px] truncate hidden sm:inline">
                    {profile?.displayName || user.displayName || 'Account'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={signOutUser}
                  aria-label="Sign out"
                  title="Sign out"
                  className={`p-2 rounded-xl border transition-all ${
                    isDark
                      ? 'border-neutral-800 bg-neutral-900/60 hover:border-neutral-700 text-neutral-400 hover:text-white'
                      : 'border-neutral-200 bg-neutral-50 hover:border-neutral-300 text-neutral-600'
                  }`}
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={signInWithGoogle}
                disabled={authBusy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-sm transition-all disabled:opacity-50"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>{authBusy ? 'Signing in...' : 'Sign in'}</span>
              </button>
            )}
          </div>
        </header>

        {/* Dynamic Main Body Content */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">
          {isMasterVaultOpen ? (
            <MasterControlDashboard
              theme={theme}
              onClose={() => setIsMasterVaultOpen(false)}
              onOpenTool={handleOpenTool}
              onNavigateTab={(tab) => {
                setActiveTab(tab);
                setIsMasterVaultOpen(false);
              }}
              onOpenAdminGateway={handleEnterAdminGateway}
              onLogActivity={logActivity}
            />
          ) : (
            <>
              {activeTab === 'home' && (
                <HomeDashboard
                  tools={tools}
                  onOpenTool={handleOpenTool}
                  onNavigateTab={setActiveTab}
                  theme={theme}
                  activityLog={activityLog}
                  onLogActivity={logActivity}
                />
              )}

              {activeTab === 'chat' && (
                <AIChatAssistant
                  theme={theme}
                  onOpenTool={handleOpenTool}
                  onSendToVideoStudio={(instruction) => {
                    setPendingVideoInstruction(instruction);
                    setIsMasterVaultOpen(false);
                    setActiveTab('studio');
                    logActivity('Sent AI Chat brief to Video Studio');
                  }}
                  onExecuteSiteActions={handleExecuteChatActions}
                  siteContext={{
                    pinnedToolIds: tools.filter((t) => t.isPinned).map((t) => t.id),
                    availableTools: tools.map((t) => `${t.id} (${t.name})`),
                    recentActivity: activityLog.slice(0, 4).map((a) => a.action),
                  }}
                  pendingChatPrompt={pendingChatPrompt}
                  onConsumePendingChatPrompt={() => setPendingChatPrompt(null)}
                  onLogActivity={logActivity}
                />
              )}

              {activeTab === 'studio' && (
                <VideoStudioEditor
                  theme={theme}
                  pendingVideoInstruction={pendingVideoInstruction}
                  onConsumePendingInstruction={() => setPendingVideoInstruction(null)}
                  onAskCopilot={(prompt) => {
                    setPendingChatPrompt(prompt);
                    setActiveTab('chat');
                  }}
                  onLogActivity={logActivity}
                />
              )}

              {activeTab === 'workflows' && (
                <WorkflowDagVisualizer
                  theme={theme}
                  onOpenTool={handleOpenTool}
                  pendingPresetId={pendingWorkflowPreset}
                  onConsumePendingPreset={() => setPendingWorkflowPreset(null)}
                  onLogActivity={logActivity}
                />
              )}

              {activeTab === 'tools' && (
                <ToolsLibrary
                  tools={tools}
                  onTogglePin={handleTogglePin}
                  onOpenTool={handleOpenTool}
                  theme={theme}
                />
              )}

              {activeTab === 'bots' && (
                <BotRentalCreator
                  theme={theme}
                  onLogActivity={logActivity}
                />
              )}

              {activeTab === 'settings' && (
                <SettingsAndSecurity
                  theme={theme}
                  density={density}
                  onChangeDensity={handleChangeDensity}
                  onToggleTheme={toggleTheme}
                  onWorkspaceRepaired={({ tools: nextTools, theme: nextTheme }) => {
                    setTools(nextTools);
                    setTheme(nextTheme);
                  }}
                  onLogActivity={logActivity}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Global ⌘K Command Palette */}
      <CommandPaletteModal
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onOpenTool={handleOpenTool}
        onNavigateTab={(tab) => {
          setActiveTab(tab);
          setIsMasterVaultOpen(false);
        }}
        onToggleTheme={toggleTheme}
        onOpenMasterVault={() => {
          window.location.hash = '#control-vault-master';
          setIsMasterVaultOpen(true);
        }}
        onLogActivity={logActivity}
      />

      {/* Interactive Real Tool Modals */}
      <BackgroundRemoverModal
        isOpen={activeModal === 'background-remover'}
        onClose={() => setActiveModal(null)}
        theme={theme}
        onLogActivity={logActivity}
      />

      <PdfCompressorModal
        isOpen={activeModal === 'pdf-compressor'}
        onClose={() => setActiveModal(null)}
        theme={theme}
        onLogActivity={logActivity}
      />

      <ImageConverterModal
        isOpen={activeModal === 'image-converter'}
        onClose={() => setActiveModal(null)}
        theme={theme}
        onLogActivity={logActivity}
      />

      <TextTranslatorModal
        isOpen={activeModal === 'text-translator'}
        onClose={() => setActiveModal(null)}
        theme={theme}
        onLogActivity={logActivity}
      />

      <CryptoVaultModal
        isOpen={activeModal === 'crypto-vault'}
        onClose={() => setActiveModal(null)}
        theme={theme}
        onLogActivity={logActivity}
      />

      <DataFormatterModal
        isOpen={activeModal === 'data-formatter'}
        onClose={() => setActiveModal(null)}
        theme={theme}
        onLogActivity={logActivity}
      />
    </div>
  );
}
