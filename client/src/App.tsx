import React, { useEffect, useState, useMemo, useCallback, lazy, Suspense } from 'react';
import { useGameStore } from './store/gameStore';
import { socketService } from './services/socket';
import { GameBoard } from './components/GameBoard';
import { ChatPanel } from './components/ChatPanel';
import { Toolbar } from './components/Toolbar';
import { AuthScreen } from './components/AuthScreen';
import { FileBrowser } from './components/FileBrowser';
import { SessionScreen } from './components/SessionScreen';
import { LoginPage } from './components/login';
import { Icon } from './components/Icon';
import { SheetLayer } from './components/SheetLayer';
import { PlayerListPanel } from './components/PlayerListPanel';
import { GameTimeBar } from './components/GameTimeBar';
import { GameTimeline } from './components/GameTimeline';
import { createCssVariables } from './ui/tokens';
import './App.css';

// ============================================
// Optimized Zustand Selectors - Subscribe only to needed state
// ============================================

// Auth and user selectors
const useAuthState = () => useGameStore(state => ({ isAuthenticated: state.isAuthenticated, user: state.user }));
const useUserProfile = () => useGameStore(state => ({ userProfileImage: state.userProfileImage }));

// Session and board selectors
const useSessionBoard = () => useGameStore(state => ({ session: state.session, currentBoard: state.currentBoard }));

// Color scheme selector
const useColorScheme = () => useGameStore(state => state.colorScheme);

// Panel visibility selectors - only re-render when these specific values change
const usePanelVisibility = () => useGameStore(state => ({
  dndManagerVisible: state.dndManagerVisible,
  fileBrowserVisible: state.fileBrowserVisible,
  chatVisible: state.chatVisible,
  profilePanelVisible: state.profilePanelVisible,
  audioPanelVisible: state.audioPanelVisible,
}));

// GM and permissions selector
const useGMPermissions = () => useGameStore(state => ({ isGM: state.isGM }));

// Timeline selectors
const useTimeline = () => useGameStore(state => ({
  timelinePosition: state.timelinePosition,
  timelineStretched: state.timelineStretched,
  timelineAnchor: state.timelineAnchor,
}));

// Lazy load heavy panels to reduce initial bundle size and improve performance
const CombatTracker = lazy(() => import('./components/CombatTracker').then(m => ({ default: m.CombatTracker })));
const CombatTrackerLegacy = lazy(() => import('./components/CombatTrackerLegacy').then(m => ({ default: m.CombatTrackerLegacy })));
const DataManager = lazy(() => import('./components/DataManager').then(m => ({ default: m.DataManager })));
const ProfilePanel = lazy(() => import('./components/ProfilePanel').then(m => ({ default: m.ProfilePanel })));
const SceneManager = lazy(() => import('./components/SceneManager').then(m => ({ default: m.SceneManager })));
const DiceRoller = lazy(() => import('./components/DiceRoller').then(m => ({ default: m.DiceRoller })));
const MacrosPanel = lazy(() => import('./components/MacrosPanel').then(m => ({ default: m.MacrosPanel })));
const RollTablePanel = lazy(() => import('./components/RollTablePanel').then(m => ({ default: m.RollTablePanel })));
const AudioPanel = lazy(() => import('./components/AudioPanel').then(m => ({ default: m.AudioPanel })));
const Dice3DOverlay = lazy(() => import('./components/dice3d/Dice3DOverlay').then(m => ({ default: m.Dice3DOverlay })));

// ============================================
// Theme Helpers - Moved outside component to avoid recreation on every render
// ============================================

function getBaseThemeId(id: string): string {
  const baseTheme = id.split('-custom-')[0];
  return baseTheme || id;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function App() {
  // Use optimized selectors to only subscribe to needed state
  const { isAuthenticated, user } = useAuthState();
  const { userProfileImage } = useUserProfile();
  const { session, currentBoard } = useSessionBoard();
  const colorScheme = useColorScheme();
  const { dndManagerVisible, fileBrowserVisible, chatVisible, profilePanelVisible, audioPanelVisible } = usePanelVisibility();
  const rollTablePanelVisible = useGameStore(state => state.rollTablePanelVisible);
  const { isGM } = useGMPermissions();
  const { timelinePosition, timelineStretched, timelineAnchor } = useTimeline();
  const dice3dEnabled = useGameStore(state => state.dice3dEnabled);
  const fileBrowserSelectCallback = useGameStore(state => state.fileBrowserSelectCallback);
  
  // Get actions from store (these don't cause re-renders)
  const toggleDndManager = useGameStore(state => state.toggleDndManager);
  const toggleChat = useGameStore(state => state.toggleChat);
  const toggleProfilePanel = useGameStore(state => state.toggleProfilePanel);
  const setUserProfileImage = useGameStore(state => state.setUserProfileImage);
  const setPlayerProfileImage = useGameStore(state => state.setPlayerProfileImage);
  const setFileBrowserVisible = useGameStore(state => state.setFileBrowserVisible);
  const setFileBrowserSelectCallback = useGameStore(state => state.setFileBrowserSelectCallback);
  
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;

    const savedImage = localStorage.getItem('vtt_profileImage');
    if (!savedImage) return;

    if (savedImage !== userProfileImage) {
      setUserProfileImage(savedImage);
    }

    setPlayerProfileImage(user.id, savedImage);
  }, [user?.id, userProfileImage, setPlayerProfileImage, setUserProfileImage]);

  useEffect(() => {
    if (!session?.id || !user?.id || !userProfileImage) return;

    socketService.sendProfileImageUpdate(user.id, userProfileImage);
  }, [session?.id, user?.id, userProfileImage]);

  // Memoize theme class and style to avoid recalculation on every render
  const themeClass = useMemo(() => `theme-${getBaseThemeId(colorScheme.id)}`, [colorScheme.id]);
  
  const themeStyle = useMemo((): React.CSSProperties & Record<string, string> => {
    const isCustomized = colorScheme.id.includes('-custom-') || colorScheme.id === 'custom';
    const panelBlurValue = colorScheme.panelBlur || 0;
    const surfaceAlpha = colorScheme.surfaceAlpha ?? 1;
    const tokenVariables = createCssVariables();
    
    const surfaceColor = hexToRgba(colorScheme.surface, surfaceAlpha);
    const surfaceTranslucent = hexToRgba(colorScheme.surface, Math.min(1, surfaceAlpha + 0.05));
    const accentColor = isCustomized ? colorScheme.accent : '#e94560';
    const textColor = isCustomized ? colorScheme.text : '#eee';
    
    return {
      ...tokenVariables,
      ...(colorScheme.fontFamily ? { fontFamily: colorScheme.fontFamily } : {}),
      '--bg-primary': hexToRgba(colorScheme.background, surfaceAlpha),
      '--bg-secondary': surfaceColor,
      '--bg-tertiary': surfaceColor,
      '--surface': surfaceColor,
      '--color-surface-translucent': surfaceTranslucent,
      '--color-surface-overlay': surfaceTranslucent,
      '--color-border-subtle': isCustomized ? hexToRgba(colorScheme.accent, 0.3) : 'rgba(255, 255, 255, 0.1)',
      '--color-border-strong': accentColor,
      '--color-accent-primary': accentColor,
      '--color-accent-hover': accentColor,
      '--color-state-hover': isCustomized ? hexToRgba(colorScheme.surface, Math.min(1, surfaceAlpha + 0.1)) : 'rgba(255, 255, 255, 0.1)',
      '--accent': accentColor,
      '--border': accentColor,
      '--text-primary': textColor,
      '--text-secondary': textColor,
      '--panel-blur': `${panelBlurValue}px`,
      ...(isCustomized ? {} : {
        '--bg-primary': '#1a1a2e',
        '--bg-secondary': '#16213e',
        '--surface': '#2d3748',
      }),
    };
  }, [colorScheme]);
  
  useEffect(() => {
    // Check for existing token
    const token = localStorage.getItem('vtt_token');
    if (token) {
      socketService.connect();
      socketService.authenticate(token);
    } else {
      socketService.connect();
    }

    // Verify token on mount
    const verifyToken = async () => {
      const storedToken = localStorage.getItem('vtt_token');
      if (storedToken) {
        try {
          const res = await fetch('/api/auth/verify', {
            headers: { Authorization: `Bearer ${storedToken}` },
          });
          if (res.ok) {
            const data = await res.json();
            useGameStore.getState().setUser(data.user, storedToken);

            // Load saved player color from localStorage
            const savedColor = localStorage.getItem('vtt_playerColor');
            if (savedColor) {
              useGameStore.getState().setPlayerColor(savedColor);
            }

            socketService.authenticate(storedToken);
          } else {
            localStorage.removeItem('vtt_token');
          }
        } catch {
          localStorage.removeItem('vtt_token');
        }
      }
      setLoading(false);
    };

    verifyToken();

    return () => {
      // Cleanup if needed
    };
  }, []);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  if (!session) {
    return <LoginPage />;
  }

  return (
    <div className={`app ${themeClass}`} style={themeStyle}>
      {/* Container for hover detection - wraps trigger and toolbar */}
      <div 
        className="toolbar-hover-container"
        onMouseEnter={() => {
          // Clear any pending close timeout when mouse enters
        }}
        onMouseLeave={(e) => {
          // Use a small delay to allow for panel detection
          // This gives time for panels to render before we decide to close
          const relatedTarget = e.relatedTarget;
          
          // If mouse is going to something interactive in the toolbar area, don't close
          if (relatedTarget && relatedTarget instanceof Node) {
            // Check if it's inside portal wrapper
            const portalWrapper = document.querySelector('.portal-wrapper');
            if (portalWrapper && portalWrapper.contains(relatedTarget)) {
              return;
            }
            
            // Check if it's inside toolbar panels container
            const toolbarPanels = document.getElementById('toolbar-panels');
            if (toolbarPanels && toolbarPanels.contains(relatedTarget)) {
              return;
            }
            
            // Check if it's a color input or its picker (they may be outside normal DOM hierarchy)
            if (relatedTarget instanceof HTMLElement) {
              const tagName = relatedTarget.tagName.toLowerCase();
              // Color inputs and their associated elements
              if (tagName === 'input' && (relatedTarget as HTMLInputElement).type === 'color') {
                return;
              }
              // Check if inside a label or wrapper that might contain color pickers
              const closestColorInput = relatedTarget.closest('input[type="color"]');
              if (closestColorInput) {
                return;
              }
            }
          }
          
          // Check if any floating panels are open
          const floatingPanels = document.querySelector('.portal-wrapper');
          if (floatingPanels && floatingPanels.children.length > 0) {
            return;
          }
          
          // Check for any visible popups/dropdowns that might be color pickers
          // Common patterns for color pickers
          const activeElement = document.activeElement;
          if (activeElement instanceof HTMLInputElement && activeElement.type === 'color') {
            return;
          }
          
          // Delay the close to allow for panel rendering
          setTimeout(() => {
            // Double-check before actually closing
            const stillFloatingPanels = document.querySelector('.portal-wrapper');
            if (stillFloatingPanels && stillFloatingPanels.children.length > 0) {
              return;
            }
            
            const activeEl = document.activeElement;
            if (activeEl instanceof HTMLInputElement && (activeEl.type === 'color' || activeEl.type === 'file')) {
              return;
            }
            
            if (activeEl?.closest('.toolbar-settings')) {
              return;
            }
            
            // Check if there are any focused elements inside the toolbar
            if (document.activeElement?.closest('.toolbar-wrapper')) {
              return;
            }
          }, 100);
        }}
      >
        <div className="header-hover-trigger" />
        <div className="toolbar-wrapper">
          <Toolbar />
        </div>
      </div>

      <main className="main-content">
        {currentBoard ? (
          <GameBoard />
        ) : (
          <div className="no-board">
            <p>No board selected. Create or select a board to start.</p>
          </div>
        )}
      </main>

      {/* Container for toolbar panels - rendered outside header to appear above map/canvas */}
      <div id="toolbar-panels" className="toolbar-panels-container"></div>

      <PlayerListPanel />

      {/* Chat Toggle Button - on left edge of chat panel */}
      <button
        onClick={toggleChat}
        title={chatVisible ? "Hide Chat" : "Show Chat"}
        className={`app-edge-toggle chat-panel-toggle ${chatVisible ? 'is-open' : ''}`}
        style={{
          left: chatVisible ? 'calc(100vw - 300px)' : 'calc(100vw - 38px)',
        }}
      >
        <Icon name={chatVisible ? "chevron-right" : "chevron-left"} />
      </button>

      <ChatPanel />

      {/* Profile Button - Always visible when authenticated */}
      <button
        onClick={() => toggleProfilePanel()}
        title="Profile"
        className="app-edge-toggle profile-trigger"
        style={{
          background: colorScheme && (colorScheme.id.includes('-custom-') || colorScheme.id === 'custom') ? colorScheme.primary : 'var(--color-accent-primary)',
        }}
      >
        {userProfileImage ? (
          <img
            src={userProfileImage}
            alt={user?.username || 'Profile'}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : (
          <Icon name="user" />
        )}
      </button>

      <SheetLayer />

      {/* Lazy-loaded panels with Suspense for code splitting */}
      <Suspense fallback={null}>
        {dndManagerVisible && <DataManager />}
        <CombatTracker />
        <CombatTrackerLegacy />

        {profilePanelVisible && <ProfilePanel />}

        <SceneManager />

        <DiceRoller />

        <MacrosPanel />

        {rollTablePanelVisible && <RollTablePanel />}

        {audioPanelVisible && <AudioPanel />}
      </Suspense>

      {/* Asset File Browser */}
      {fileBrowserVisible && (
        <FileBrowser
          onFileSelect={(fileUrl) => {
            fileBrowserSelectCallback?.(fileUrl);
            setFileBrowserVisible(false);
            setFileBrowserSelectCallback(null);
          }}
        />
      )}

      {/* Game Time Controls - GM only */}
      <GameTimeBar />
      <GameTimeline />

      {/* Non-interactive 3D dice overlay runtime (lazy loaded only when enabled) */}
      <Suspense fallback={null}>
        <Dice3DOverlay />
      </Suspense>
    </div>
  );
}

export default App;
