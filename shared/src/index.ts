// Shared types for VTT application

// ====================
// Data Normalization
// ====================

export * from './dataNormalizer';

// ====================
// User & Authentication
// ====================

export interface User {
  id: string;
  username: string;
  email: string;
  createdAt: Date;
}

export interface AuthPayload {
  userId: string;
  username: string;
}

// ====================
// Sessions
// ====================

export type PlayerRole = 'gm' | 'player';

export interface SessionPlayer {
  userId: string;
  username: string;
  role: PlayerRole;
  joinedAt: Date;
  playerColor: string;  // Color identifier for this player
  controlledTokens: string[];  // Token IDs this player can control
  isOnline: boolean;  // Whether the player is currently online
  profilePicture?: string;  // URL to user's profile picture
}

export interface Session {
  id: string;
  name: string;
  roomCode: string;
  gmId: string;
  players: SessionPlayer[];
  createdAt: Date;
  settings: SessionSettings;
}

export interface SessionSettings {
  gridSize: number;
  gridType: 'square' | 'hex';
  fovEnabled: boolean;
  assetFolder?: string;  // GM's asset folder path for the session
  // Time overlay settings
  gameTimeSeconds?: number;
  timeOverlayEnabled?: boolean;
  timeOverlayOpacity?: number;
  atmosphericFog?: boolean;
}

// User Settings
export interface UserSettings {
  theme?: string;  // Theme preference
  defaultPlayerColor?: string;  // Default color for new sessions
  uiPreferences?: {
    gridSize?: number;
    snapToGrid?: boolean;
    showGrid?: boolean;
  };
}

// ====================
// Boards & Maps
// ====================

export interface Board {
  id: string;
  sessionId: string;
  name: string;
  backgroundUrl: string | null;
  gridSize: number;
  gridType: 'square' | 'hex';
  gridColor?: number;
  gridOffsetX?: number;
  gridOffsetY?: number;
  gridStyle?: 'solid' | 'dashed' | 'dotted';
  gridStyleAmount?: number;
  gridOpacity?: number;
  width: number;
  height: number;
  createdAt: Date;
  audioSources?: AudioSource[]; // Spatial audio sources for this board
  // Audio spatial settings
  audioFadeDuration?: number; // Duration in ms for volume fade transitions (default: 1000)
}

// ====================
// Tokens
// ====================

export interface Token {
  id: string;
  boardId: string;
  ownerId: string | null;
  name: string;
  imageUrl: string;
  x: number;
  y: number;
  size: number;
  visible: boolean;
  locked: boolean;
  status: string;  // JSON string of status emojis array
  layer: 'tokens' | 'tiles' | 'objects';
  properties: Record<string, unknown>;
  label: string;  // Token label text
  showLabel: boolean;  // Whether to show the label
  bars: string;  // JSON string of bar configuration: [{ name: string, current: number, max: number, color: string }]
  creatureId?: string;  // Optional link to creature/monster from DataManager compendium
}

// ====================
// Fog of War
// ====================

export interface FogReveal {
  id: string;
  boardId: string;
  polygon: number[][]; // Array of [x, y] points
  createdBy: string;
  createdAt: Date;
}

export interface FogAdd {
  id: string;
  boardId: string;
  polygon: number[][]; // Array of [x, y] points
  createdBy: string;
  createdAt: Date;
}

// ====================
// Lights
// ====================

export type LightEffectType = 'none' | 'flicker' | 'pulse' | 'colorShift' | 'swirl';

export interface Light {
  id: string;
  boardId: string;
  name: string;
  x: number;
  y: number;
  radius: number;
  color: number; // Hex color
  intensity: number; // 0-1
  alpha: number; // 0-1 - controls transparency/visibility
  effect: LightEffectType; // Type of light animation effect
  effectSpeed: number; // Speed of the effect animation
  effectIntensity: number; // Intensity of the effect (0-1)
  effectColor: number; // Secondary color for color shift effect (hex)
  type: 'point' | 'cone' | 'radiance'; // Point light, cone (like torch), or ambient radiance
  direction: number; // Angle in degrees (0-360), for cone lights
  angle: number; // Cone angle in degrees, for cone lights
  dimRadius: number; // Inner radius where light starts fading
  visible: boolean; // Whether light is visible to players
  blendMode?: 'add' | 'screen' | 'normal' | 'multiply' | 'lighten' | 'overlay' | 'darken' | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light' | 'difference' | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity'; // How the light blends into the scene
}

export interface CreateLightData {
  name: string;
  x: number;
  y: number;
  radius?: number;
  color?: number;
  intensity?: number;
  alpha?: number;
  effect?: LightEffectType;
  effectSpeed?: number;
  effectIntensity?: number;
  effectColor?: number;
  type?: 'point' | 'cone' | 'radiance';
  direction?: number;
  angle?: number;
  dimRadius?: number;
  blendMode?: 'add' | 'screen' | 'normal' | 'multiply' | 'lighten' | 'overlay' | 'darken' | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light' | 'difference' | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity';
}

// ====================
// Spatial Audio Sources
// ====================

export interface AudioSource {
  id: string;
  boardId: string;
  name: string;
  x: number;
  y: number;
  audioFile: string; // Resolved server path or asset path
  radius: number; // Max audible range
  innerRadius: number; // Inner radius where volume starts fading (like dimRadius for lights)
  baseVolume: number; // Max gain from 0..1
  loop: boolean; // Loop playback
  playing: boolean; // Source active/inactive
}

export interface CreateAudioSourceData {
  name?: string;
  x: number;
  y: number;
  audioFile: string;
  radius?: number;
  innerRadius?: number;
  baseVolume?: number;
  loop?: boolean;
  playing?: boolean;
}

// ====================
// Chat
// ====================

export interface ChatMessage {
  id: string;
  sessionId: string;
  userId: string;
  username: string;
  text: string;
  timestamp: Date;
  // Visibility settings for GM-only, blind GM, self-only rolls
  isPrivate?: boolean;   // GM only
  isBlindGM?: boolean;   // Visible to everyone except GM
  isSelfRoll?: boolean;  // Only visible to sender
}

export type DiceRollVisibility = 'public' | 'gm' | 'blind' | 'self';

export interface DiceRollDieResult {
  dice: string;
  sides: number;
  rolls: number[];
  total: number;
  modifier: number;
}

export interface DiceRollRequest {
  requestId: string;
  formula: string;
  visibility: DiceRollVisibility;
  source: 'dicePanel' | 'chat' | 'inline' | 'macro' | 'initiative' | 'api';
  clientResult?: {
    dice: DiceRollDieResult[];
    total: number;
  };
}

export interface DiceRollDeterminismContext {
  algorithmVersion: 'sha256-seq-v1';
  seedCommitment: string;
  rollNonce: string;
  canonicalHash: string;
}

export interface DiceRollPrepareRequest {
  requestId: string;
  formula: string;
  visibility: DiceRollVisibility;
  source: 'dicePanel' | 'chat' | 'inline' | 'macro' | 'initiative' | 'api';
}

export interface DiceRollPrepareResult {
  requestId: string;
  formula: string;
  visibility: DiceRollVisibility;
  source: 'dicePanel' | 'chat' | 'inline' | 'macro' | 'initiative' | 'api';
  canonicalResult: {
    dice: DiceRollDieResult[];
    total: number;
  };
  determinism: DiceRollDeterminismContext;
  preparedAt: Date;
  expiresAt: Date;
}

export interface DiceRollFinalizeRequest {
  requestId: string;
  telemetry?: {
    provider?: string;
    animationMs?: number;
  };
}

export interface DiceRollResult {
  requestId: string;
  rollId: string;
  userId: string;
  username: string;
  formula: string;
  total: number;
  dice: DiceRollDieResult[];
  timestamp: Date;
  visibility: DiceRollVisibility;
  determinism?: DiceRollDeterminismContext;
  message: ChatMessage;
}

// ====================
// WebSocket Messages - Client -> Server
// ====================

export type ClientToServerMessage =
  | { type: 'authenticate'; token: string }
  | { type: 'create_session'; name: string }
  | { type: 'join_session'; roomCode: string }
  | { type: 'leave_session' }
  | { type: 'kick_player'; userId: string }
  | { type: 'create_board'; name: string }
  | { type: 'select_board'; boardId: string }
  | { type: 'update_board'; boardId: string; updates: {
      gridType?: 'square' | 'hex';
      gridSize?: number;
      gridColor?: number;
      gridOffsetX?: number;
      gridOffsetY?: number;
      gridStyle?: 'solid' | 'dashed' | 'dotted';
      gridStyleAmount?: number;
      gridOpacity?: number;
    } }
  | { type: 'set_background'; boardId: string; imageUrl: string }
  | { type: 'create_token'; boardId: string; token: CreateTokenData }
  | { type: 'move_token'; tokenId: string; x: number; y: number }
  | { type: 'update_token'; tokenId: string; updates: Partial<Token> }
  | { type: 'delete_token'; tokenId: string }
  | { type: 'toggle_token_status'; tokenId: string; status: string }
  | { type: 'set_token_layer'; tokenId: string; layer: 'tokens' | 'tiles' | 'objects' }
  | { type: 'reveal_fog'; boardId: string; polygon: number[][] }
  | { type: 'hide_fog'; boardId: string }
  | { type: 'clear_fog'; boardId: string }
  | { type: 'create_light'; boardId: string; light: CreateLightData }
  | { type: 'update_light'; lightId: string; updates: Partial<Light> }
  | { type: 'delete_light'; lightId: string }
  | { type: 'create_audio_source'; boardId: string; audioSource: CreateAudioSourceData }
  | { type: 'update_audio_source'; audioSourceId: string; updates: Partial<AudioSource> }
  | { type: 'delete_audio_source'; audioSourceId: string }
  | { type: 'chat_message'; text: string; isPrivate?: boolean; isBlindGM?: boolean; isSelfRoll?: boolean }
  | { type: 'dice_roll_request'; payload: DiceRollRequest }
  | { type: 'dice_roll_prepare_request'; payload: DiceRollPrepareRequest }
  | { type: 'dice_roll_finalize_request'; payload: DiceRollFinalizeRequest };

export interface CreateTokenData {
  name: string;
  imageUrl: string;
  x: number;
  y: number;
  size?: number;
  visible?: boolean;
}

// ====================
// WebSocket Messages - Server -> Client
// ====================

export type ServerToClientMessage =
  | { type: 'authenticated'; user: User }
  | { type: 'auth_error'; message: string }
  | { type: 'session_created'; session: Session }
  | { type: 'session_joined'; session: Session; board: Board | null }
  | { type: 'session_left' }
  | { type: 'player_joined'; player: SessionPlayer }
  | { type: 'player_left'; userId: string }
  | { type: 'player_updated'; userId: string; role: PlayerRole }
  | { type: 'player_online_status'; userId: string; isOnline: boolean }
  | { type: 'online_users'; users: Array<{ userId: string; username: string; isOnline: boolean }> }
  | { type: 'error'; code: string; message: string }
  | { type: 'state_sync'; state: GameState }
  | { type: 'board_updated'; board: Board }
  | { type: 'board_selected'; board: Board }
  | { type: 'token_created'; token: Token }
  | { type: 'token_moved'; tokenId: string; x: number; y: number }
  | { type: 'token_updated'; token: Token }
  | { type: 'token_deleted'; tokenId: string }
  | { type: 'fog_revealed'; reveal: FogReveal }
  | { type: 'fog_hidden'; revealId: string }
  | { type: 'fog_cleared'; boardId: string }
  | { type: 'fog_added'; fogAdd: FogAdd }
  | { type: 'fog_add_removed'; fogAddId: string }
  | { type: 'light_created'; light: Light }
  | { type: 'light_updated'; light: Light }
  | { type: 'light_deleted'; lightId: string }
  | { type: 'audio_source_created'; audioSource: AudioSource }
  | { type: 'audio_source_updated'; audioSource: AudioSource }
  | { type: 'audio_source_deleted'; audioSourceId: string }
  | { type: 'chat_message'; message: ChatMessage }
  | { type: 'dice_roll_prepared'; payload: DiceRollPrepareResult }
  | { type: 'dice_roll_result'; payload: DiceRollResult };

// ====================
// Game State
// ====================

export interface GameState {
  session: Session | null;
  currentBoard: Board | null;
  tokens: Token[];
  fogReveals: FogReveal[];
  lights: Light[];
  audioSources: AudioSource[];
  chatMessages: ChatMessage[];
  playerProfileImages?: Record<string, string>;
}

// ====================
// Events
// ====================

export type ServerEvent =
  | { event: 'session_created'; data: Session }
  | { event: 'player_joined'; data: SessionPlayer }
  | { event: 'player_left'; data: { userId: string } }
  | { event: 'token_moved'; data: { tokenId: string; x: number; y: number } }
  | { event: 'chat_message'; data: ChatMessage };

// ====================
// API Response Types
// ====================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ====================
// Constants
// ====================

export const GRID_TYPES = ['square', 'hex'] as const;
export const DEFAULT_GRID_SIZE = 50;
export const DEFAULT_BOARD_WIDTH = 2000;
export const DEFAULT_BOARD_HEIGHT = 2000;
export const MAX_TOKEN_SIZE = 5;
export const ROOM_CODE_LENGTH = 8;

// ====================
// Color Schemes
// ====================

export interface ColorScheme {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  gridColor: string;
  gridBackground: string;
  fontFamily?: string;
  panelBlur?: number;
  surfaceAlpha?: number;
}

export const DEFAULT_COLOR_SCHEMES: ColorScheme[] = [
  {
    id: 'classic',
    name: 'Classic Dark',
    primary: '#4a5568',
    secondary: '#2d3748',
    accent: '#ed8936',
    background: '#1a202c',
    surface: '#2d3748',
    text: '#f7fafc',
    textSecondary: '#a0aec0',
    gridColor: 'rgba(255, 255, 255, 0.15)',
    gridBackground: 'transparent',
    panelBlur: 0,
    surfaceAlpha: 1
  },
  {
    id: 'nord',
    name: 'Nord',
    primary: '#5e81ac',
    secondary: '#434c5e',
    accent: '#88c0d0',
    background: '#2e3440',
    surface: '#3b4252',
    text: '#eceff4',
    textSecondary: '#d8dee9',
    gridColor: 'rgba(136, 192, 208, 0.1)',
    gridBackground: 'transparent',
    panelBlur: 0,
    surfaceAlpha: 1
  },
  {
    id: 'gruvbox',
    name: 'Gruvbox',
    primary: '#cc241d',
    secondary: '#98971a',
    accent: '#fabd2f',
    background: '#282828',
    surface: '#3c3836',
    text: '#ebdbb2',
    textSecondary: '#d5c4a1',
    gridColor: 'rgba(250, 189, 47, 0.1)',
    gridBackground: 'transparent',
    panelBlur: 0,
    surfaceAlpha: 1
  },
  {
    id: 'dracula',
    name: 'Dracula',
    primary: '#bd93f9',
    secondary: '#6272a4',
    accent: '#ff79c6',
    background: '#282a36',
    surface: '#44475a',
    text: '#f8f8f2',
    textSecondary: '#bfc7d5',
    gridColor: 'rgba(189, 147, 249, 0.15)',
    gridBackground: 'transparent',
    panelBlur: 0,
    surfaceAlpha: 1
  },
  {
    id: 'monokai',
    name: 'Monokai',
    primary: '#f92672',
    secondary: '#ae81ff',
    accent: '#a1fe66',
    background: '#272822',
    surface: '#3e3d32',
    text: '#f8f8f2',
    textSecondary: '#cfcfc2',
    gridColor: 'rgba(166, 226, 46, 0.1)',
    gridBackground: 'transparent',
    panelBlur: 0,
    surfaceAlpha: 1
  },
  {
    id: 'one-dark',
    name: 'One Dark',
    primary: '#61afef',
    secondary: '#c678dd',
    accent: '#98c379',
    background: '#282c34',
    surface: '#21252b',
    text: '#abb2bf',
    textSecondary: '#5c6370',
    gridColor: 'rgba(97, 175, 239, 0.1)',
    gridBackground: 'transparent',
    panelBlur: 0,
    surfaceAlpha: 1
  },
  {
    id: 'material-dark',
    name: 'Material Dark',
    primary: '#82aaff',
    secondary: '#c792ea',
    accent: '#c3e88d',
    background: '#1a1b26',
    surface: '#24283b',
    text: '#a9b1d6',
    textSecondary: '#565f89',
    gridColor: 'rgba(130, 170, 255, 0.1)',
    gridBackground: 'transparent',
    panelBlur: 0,
    surfaceAlpha: 1
  },
  {
    id: 'carbon',
    name: 'Carbon',
    primary: '#78a659',
    secondary: '#519aba',
    accent: '#e3c58e',
    background: '#171717',
    surface: '#262626',
    text: '#d4d4d4',
    textSecondary: '#8c8c8c',
    gridColor: 'rgba(120, 166, 89, 0.1)',
    gridBackground: 'transparent',
    panelBlur: 0,
    surfaceAlpha: 1
  },
  {
    id: 'deep-blue',
    name: 'Deep Blue',
    primary: '#7aa2f7',
    secondary: '#bb9af7',
    accent: '#7dcfff',
    background: '#0f0f23',
    surface: '#1a1b2e',
    text: '#a9b1d6',
    textSecondary: '#565f89',
    gridColor: 'rgba(122, 162, 247, 0.1)',
    gridBackground: 'transparent',
    panelBlur: 0,
    surfaceAlpha: 1
  },
  {
    id: 'night-owl',
    name: 'Night Owl',
    primary: '#82aaff',
    secondary: '#c792ea',
    accent: '#c3e88d',
    background: '#011627',
    surface: '#0b2942',
    text: '#d6deeb',
    textSecondary: '#637777',
    gridColor: 'rgba(130, 170, 255, 0.1)',
    gridBackground: 'transparent',
    fontFamily: 'JetBrains Mono, monospace',
    panelBlur: 0,
    surfaceAlpha: 1
  },
  {
    id: 'synthwave',
    name: 'Synthwave 84',
    primary: '#f75189',
    secondary: '#bd93f9',
    accent: '#f7718c',
    background: '#241b2f',
    surface: '#2d1b3d',
    text: '#f7d4ff',
    textSecondary: '#9d8bb4',
    gridColor: 'rgba(247, 113, 140, 0.15)',
    gridBackground: 'transparent',
    fontFamily: 'Space Mono, monospace',
    panelBlur: 0,
    surfaceAlpha: 1
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    primary: '#7aa2f7',
    secondary: '#bb9af7',
    accent: '#7dcfff',
    background: '#1a1b26',
    surface: '#24283b',
    text: '#c0caf5',
    textSecondary: '#565f89',
    gridColor: 'rgba(122, 162, 247, 0.1)',
    gridBackground: 'transparent',
    fontFamily: 'Fira Code, monospace',
    panelBlur: 0,
    surfaceAlpha: 1
  },
  {
    id: 'hyper',
    name: 'Hyper Dark',
    primary: '#fc6d6e',
    secondary: '#a167e5',
    accent: '#6cff95',
    background: '#0d0d0d',
    surface: '#1a1a1a',
    text: '#ffffff',
    textSecondary: '#666666',
    gridColor: 'rgba(108, 255, 149, 0.1)',
    gridBackground: 'transparent',
    fontFamily: 'Menlo, monospace',
    panelBlur: 0,
    surfaceAlpha: 1
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    primary: '#6b8afd',
    secondary: '#9d7cd8',
    accent: '#9ece6a',
    background: '#0d1117',
    surface: '#161b22',
    text: '#c9d1d9',
    textSecondary: '#8b949e',
    gridColor: 'rgba(107, 138, 253, 0.1)',
    gridBackground: 'transparent',
    fontFamily: 'SF Mono, Monaco, monospace',
    panelBlur: 0,
    surfaceAlpha: 1
  },
  // New dark themes
  {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    primary: '#89b4fa',
    secondary: '#f38ba8',
    accent: '#a6e3a1',
    background: '#1e1e2e',
    surface: '#313244',
    text: '#cdd6f4',
    textSecondary: '#a6adc8',
    gridColor: 'rgba(137, 180, 250, 0.1)',
    gridBackground: 'transparent',
    panelBlur: 0,
    surfaceAlpha: 1
  },
  {
    id: 'rose-pine',
    name: 'Rose Pine',
    primary: '#ebbcba',
    secondary: '#c4a7e7',
    accent: '#9ccfd8',
    background: '#191724',
    surface: '#26233a',
    text: '#e0def4',
    textSecondary: '#908caa',
    gridColor: 'rgba(156, 207, 216, 0.1)',
    gridBackground: 'transparent',
    panelBlur: 0,
    surfaceAlpha: 1
  },
  {
    id: 'gruvbox-material',
    name: 'Gruvbox Material',
    primary: '#d79921',
    secondary: '#98971a',
    accent: '#fabd2f',
    background: '#282828',
    surface: '#3c3836',
    text: '#ebdbb2',
    textSecondary: '#d5c4a1',
    gridColor: 'rgba(250, 189, 47, 0.1)',
    gridBackground: 'transparent',
    panelBlur: 0,
    surfaceAlpha: 1
  },
  {
    id: 'ayu-dark',
    name: 'Ayu Dark',
    primary: '#39bae6',
    secondary: '#f07178',
    accent: '#ff8f40',
    background: '#0a0e14',
    surface: '#141b24',
    text: '#e6e6e6',
    textSecondary: '#8b9199',
    gridColor: 'rgba(57, 186, 230, 0.1)',
    gridBackground: 'transparent',
    panelBlur: 0,
    surfaceAlpha: 1
  },
  {
    id: 'palenight',
    name: 'Palenight',
    primary: '#82aaff',
    secondary: '#c792ea',
    accent: '#c3e88d',
    background: '#292d3e',
    surface: '#1e2130',
    text: '#959dcb',
    textSecondary: '#676e95',
    gridColor: 'rgba(130, 170, 255, 0.1)',
    gridBackground: 'transparent',
    panelBlur: 0,
    surfaceAlpha: 1
  },
  {
    id: 'purple-pro',
    name: 'Purple Pro',
    primary: '#a855f7',
    secondary: '#ec4899',
    accent: '#22d3ee',
    background: '#1a1625',
    surface: '#2d2640',
    text: '#e9d5ff',
    textSecondary: '#a78bfa',
    gridColor: 'rgba(168, 85, 247, 0.15)',
    gridBackground: 'transparent',
    panelBlur: 0,
    surfaceAlpha: 1
  },
  {
    id: 'github-dark',
    name: 'GitHub Dark',
    primary: '#58a6ff',
    secondary: '#8b949e',
    accent: '#7ee787',
    background: '#0d1117',
    surface: '#161b22',
    text: '#c9d1d9',
    textSecondary: '#8b949e',
    gridColor: 'rgba(88, 166, 255, 0.1)',
    gridBackground: 'transparent',
    panelBlur: 0,
    surfaceAlpha: 1
  },
  {
    id: 'vitalized-dark',
    name: 'Vitalized Dark',
    primary: '#3b82f6',
    secondary: '#10b981',
    accent: '#f59e0b',
    background: '#0f172a',
    surface: '#1e293b',
    text: '#e2e8f0',
    textSecondary: '#94a3b8',
    gridColor: 'rgba(59, 130, 246, 0.1)',
    gridBackground: 'transparent',
    panelBlur: 0,
    surfaceAlpha: 1
  },
  {
    id: 'ember',
    name: 'Ember',
    primary: '#ff7b00',
    secondary: '#ff4500',
    accent: '#ffd700',
    background: '#1a0f0a',
    surface: '#2d1f14',
    text: '#ffb347',
    textSecondary: '#cc8844',
    gridColor: 'rgba(255, 123, 0, 0.15)',
    gridBackground: 'transparent',
    panelBlur: 0,
    surfaceAlpha: 1
  },
  {
    id: 'void',
    name: 'Void',
    primary: '#b387fa',
    secondary: '#2ac3de',
    accent: '#9ece6a',
    background: '#08080a',
    surface: '#111114',
    text: '#a9b1d6',
    textSecondary: '#565f89',
    gridColor: 'rgba(179, 135, 250, 0.1)',
    gridBackground: 'transparent',
    fontFamily: 'JetBrains Mono, monospace',
    panelBlur: 0,
    surfaceAlpha: 1
  },
  {
    id: 'midnight-purple',
    name: 'Midnight Purple',
    primary: '#d53f8c',
    secondary: '#805ad5',
    accent: '#ed8936',
    background: '#130f20',
    surface: '#1f182e',
    text: '#e9d8fd',
    textSecondary: '#b794f4',
    gridColor: 'rgba(213, 63, 140, 0.15)',
    gridBackground: 'transparent',
    panelBlur: 0,
    surfaceAlpha: 1
  }
];
