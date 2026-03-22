import { io, Socket } from 'socket.io-client';
import { useGameStore } from '../store/gameStore';
import { setAtmosphericFog, setFogEnabled, setFogIntensity, setFogSpeed, setFogShift, setFogDirection, setFogColor1, setFogColor2, setGodRayEnabled, setGodRayAngle, setGodRayLacunarity, setGodRayIntensity } from '../utils/gameTime';
import type {
  ClientToServerMessage,
  DiceRollFinalizeRequest,
  DiceRollPrepareRequest,
  DiceRollRequest,
  ServerToClientMessage,
} from '../../../shared/src/index';

class SocketService {
  private socket: Socket<any, any> | null = null;
  private messageHandlers: Map<string, ((data: unknown) => void)[]> = new Map();

  connect(): void {
    if (this.socket?.connected) return;
    // If socket exists but not connected, clean it up first
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket = null;
    }

    const runtimeOrigin = typeof window !== 'undefined' ? window.location.origin : 'unknown';
    console.info('[socket] connect() starting', {
      runtimeOrigin,
      note: 'Expected dev proxy target for /socket.io is http://localhost:3001',
    });

    // Diagnostic signal: verifies if the Vite -> backend proxy is reachable before socket connect
    void fetch('/api/health')
      .then((response) => {
        console.info('[socket] /api/health probe', {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
        });
      })
      .catch((probeError) => {
        console.error('[socket] /api/health probe failed', probeError);
      });

    this.socket = io(undefined, {
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      // Use WebSocket to avoid 413 payload errors with polling
      transports: ['websocket'],
      forceNew: true,
    });

    this.socket.on('connect', () => {
      console.log('Connected to server');
      this.emit('connect', null);
      
      // Re-authenticate if we have a token
      const token = useGameStore.getState().token;
      if (token) {
        this.socket?.emit('authenticate', { token });
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason);
      this.emit('disconnect', null);
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', {
        message: error.message,
        description: (error as any).description,
        context: (error as any).context,
        transports: this.socket?.io?.opts?.transports,
      });
    });

    this.socket.on('error', (data: any) => {
      console.error('Socket error:', data);
    });

    // Setup message handlers
    this.setupMessageHandlers();
  }

  disconnect(): void {
    if (this.socket) {
      // Remove all event listeners to prevent memory leaks
      this.socket.removeAllListeners();
      this.socket.disconnect();
    }
    this.socket = null;
    this.messageHandlers.clear();
  }

  authenticate(token: string): void {
    this.socket?.emit('authenticate', { token });
  }

  // Session methods
  createSession(name: string): void {
    this.socket?.emit('create_session', { name });
  }

  joinSession(roomCode: string): void {
    this.socket?.emit('join_session', { roomCode });
  }

  leaveSession(): void {
    this.socket?.emit('leave_session');
  }

  // Board methods
  createBoard(name: string): void {
    this.socket?.emit('create_board', { name });
  }

  selectBoard(boardId: string): void {
    this.socket?.emit('select_board', { boardId });
  }

  updateBoard(boardId: string, updates: {
    gridType?: 'square' | 'hex';
    gridSize?: number;
    gridColor?: number;
    gridOffsetX?: number;
    gridOffsetY?: number;
    gridStyle?: 'solid' | 'dashed' | 'dotted';
    gridStyleAmount?: number;
    gridOpacity?: number;
  }): void {
    this.socket?.emit('update_board', { boardId, updates });
  }

  setBackground(boardId: string, imageUrl: string): void {
    this.socket?.emit('set_background', { boardId, imageUrl });
  }

  clearBackground(boardId: string): void {
    this.socket?.emit('set_background', { boardId, imageUrl: null });
  }

  // Token methods
  createToken(boardId: string, token: { name: string; imageUrl: string; x: number; y: number; size?: number; showLabel?: boolean; bars?: string; creatureId?: string; properties?: Record<string, unknown> }): void {
    this.socket?.emit('create_token', { boardId, token });
  }

  moveToken(tokenId: string, x: number, y: number): void {
    this.socket?.emit('move_token', { tokenId, x, y });
  }

  updateToken(tokenId: string, updates: Record<string, unknown>): void {
    this.socket?.emit('update_token', { tokenId, updates });
  }

  addTokenControl(playerId: string, tokenId: string): void {
    this.socket?.emit('add_token_control', { playerId, tokenId });
  }

  removeTokenControl(playerId: string, tokenId: string): void {
    this.socket?.emit('remove_token_control', { playerId, tokenId });
  }

  deleteToken(tokenId: string): void {
    this.socket?.emit('delete_token', { tokenId });
  }

  createLight(boardId: string, light: Record<string, unknown>): void {
    this.socket?.emit('create_light', { boardId, light });
  }

  updateLight(lightId: string, updates: Record<string, unknown>): void {
    this.socket?.emit('update_light', { lightId, updates });
  }

  deleteLight(lightId: string): void {
    this.socket?.emit('delete_light', { lightId });
  }

  // Audio source methods
  createAudioSource(boardId: string, audioSource: Record<string, unknown>): void {
    this.socket?.emit('create_audio_source', { boardId, audioSource });
  }

  updateAudioSource(audioSourceId: string, updates: Record<string, unknown>): void {
    this.socket?.emit('update_audio_source', { audioSourceId, updates });
  }

  deleteAudioSource(audioSourceId: string): void {
    this.socket?.emit('delete_audio_source', { audioSourceId });
  }

  toggleTokenStatus(tokenId: string, status: string): void {
    this.socket?.emit('toggle_token_status', { tokenId, status });
  }

  setTokenLayer(tokenId: string, layer: 'tokens' | 'tiles' | 'objects'): void {
    this.socket?.emit('set_token_layer', { tokenId, layer });
  }

  // Fog methods
  revealFog(boardId: string, polygon: number[][]): void {
    this.socket?.emit('reveal_fog', { boardId, polygon });
  }

  hideFog(revealId: string): void {
    this.socket?.emit('hide_fog', { revealId });
  }

  addFog(boardId: string, polygon: number[][]): void {
    this.socket?.emit('add_fog', { boardId, polygon });
  }

  removeFogAdd(fogAddId: string): void {
    this.socket?.emit('remove_fog_add', { fogAddId });
  }

  clearFog(boardId: string): void {
    this.socket?.emit('clear_fog', { boardId });
  }

  // Chat
  sendChatMessage(text: string, isPrivate?: boolean, isBlindGM?: boolean, isSelfRoll?: boolean): void {
    this.socket?.emit('chat_message', { text, isPrivate, isBlindGM, isSelfRoll });
  }

  sendDiceRollRequest(payload: DiceRollRequest): void {
    this.socket?.emit('dice_roll_request', { payload });
  }

  sendDiceRollPrepareRequest(payload: DiceRollPrepareRequest): void {
    this.socket?.emit('dice_roll_prepare_request', { payload });
  }

  sendDiceRollFinalizeRequest(payload: DiceRollFinalizeRequest): void {
    this.socket?.emit('dice_roll_finalize_request', { payload });
  }

  // Profile image sync
  sendProfileImageUpdate(userId: string, imageUrl: string): void {
    this.socket?.emit('profile_image_update', { userId, imageUrl });
  }

  // Event system for components
  on(event: string, handler: (data: unknown) => void): void {
    const handlers = this.messageHandlers.get(event) || [];
    handlers.push(handler);
    this.messageHandlers.set(event, handlers);
  }

  off(event: string, handler: (data: unknown) => void): void {
    const handlers = this.messageHandlers.get(event) || [];
    const index = handlers.indexOf(handler);
    if (index > -1) {
      handlers.splice(index, 1);
    }
  }

  private emit(event: string, data: unknown): void {
    const handlers = this.messageHandlers.get(event) || [];
    handlers.forEach((handler) => handler(data));
  }

  private setupMessageHandlers(): void {
    if (!this.socket) return;

    // Auth
    this.socket.on('authenticated', (data: any) => {
      if (data.type === 'authenticated') {
        useGameStore.getState().setUser(data.user);
      }
    });

    this.socket.on('auth_error', (data: any) => {
      console.error('Auth error:', data);
    });

    // Session
    this.socket.on('session_created', (data: any) => {
      if (data.type === 'session_created') {
        useGameStore.getState().setSession(data.session);
      }
    });

    this.socket.on('session_joined', (data: any) => {
      if (data.type === 'session_joined') {
        useGameStore.getState().setSession(data.session);
        if (data.board) {
          useGameStore.getState().setCurrentBoard(data.board);
        }
        // Initialize time settings from session
        if (data.session?.settings) {
          const { setGameTime, setTimeOverlayEnabled, setTimeOverlayOpacity } = useGameStore.getState();
          const settings = data.session.settings;
          if (settings.gameTimeSeconds !== undefined) {
            setGameTime(settings.gameTimeSeconds);
          }
          if (settings.timeOverlayEnabled !== undefined) {
            setTimeOverlayEnabled(settings.timeOverlayEnabled);
          }
          if (settings.timeOverlayOpacity !== undefined) {
            setTimeOverlayOpacity(settings.timeOverlayOpacity);
          }
          if (settings.atmosphericFog !== undefined) {
            console.log('socket.ts: Received atmosphericFog from server:', settings.atmosphericFog);
            setAtmosphericFog(settings.atmosphericFog);
          }
        }
      }
    });

    this.socket.on('session_left', () => {
      useGameStore.getState().setSession(null);
      useGameStore.getState().setCurrentBoard(null);
    });

    this.socket.on('player_joined', (data: any) => {
      if (data.type === 'player_joined') {
        const players = [...useGameStore.getState().players, data.player];
        useGameStore.getState().setPlayers(players);
      }
    });

    this.socket.on('player_left', (data: any) => {
      if (data.type === 'player_left') {
        const players = useGameStore.getState().players.filter(
          (p) => p.userId !== data.userId
        );
        useGameStore.getState().setPlayers(players);
      }
    });

    // Player online status changes
    this.socket.on('player_online_status', (data: any) => {
      if (data.type === 'player_online_status') {
        const players = useGameStore.getState().players.map((p) =>
          p.userId === data.userId ? { ...p, isOnline: data.isOnline } : p
        );
        useGameStore.getState().setPlayers(players);
      }
    });

    // Profile image sync
    this.socket.on('profile_image_update', (data: any) => {
      if (data.type === 'profile_image_update') {
        console.log('[Socket] Received profile_image_update:', data);
        const state = useGameStore.getState();
        state.setPlayerProfileImage(data.userId, data.imageUrl);
        if (state.user?.id === data.userId) {
          state.setUserProfileImage(data.imageUrl);
        }
        // Also save to localStorage for persistence across sessions
        const stored = JSON.parse(localStorage.getItem('vtt_playerProfileImages') || '{}');
        stored[data.userId] = data.imageUrl;
        localStorage.setItem('vtt_playerProfileImages', JSON.stringify(stored));
      }
    });

    // State sync
    this.socket.on('state_sync', (data: any) => {
      if (data.type === 'state_sync' && data.state) {
        if (data.state.session) {
          useGameStore.getState().setSession(data.state.session);
          // Also set players from session data with online status
          if (data.state.session.players) {
            useGameStore.getState().setPlayers(data.state.session.players);
          }
        }
        if (data.state.currentBoard) {
          useGameStore.getState().setCurrentBoard(data.state.currentBoard);
        }
        if (data.state.tokens) {
          useGameStore.getState().setTokens(data.state.tokens);
        }
        if (data.state.fogReveals) {
          useGameStore.getState().setFogReveals(data.state.fogReveals || []);
        }
        if (data.state.lights) {
          useGameStore.getState().setLights(data.state.lights || []);
        }
        // Sync player profile images
        if (data.state.playerProfileImages) {
          Object.entries(data.state.playerProfileImages).forEach(([userId, imageUrl]) => {
            useGameStore.getState().setPlayerProfileImage(userId, imageUrl as string);
          });
          const currentUserId = useGameStore.getState().user?.id;
          if (currentUserId) {
            const currentUserImage = data.state.playerProfileImages[currentUserId];
            if (typeof currentUserImage === 'string') {
              useGameStore.getState().setUserProfileImage(currentUserImage);
            }
          }
          // Save to localStorage for persistence
          localStorage.setItem('vtt_playerProfileImages', JSON.stringify(data.state.playerProfileImages));
        }
      }
    });

    // Board
    this.socket.on('board_updated', (data: any) => {
      if (data.type === 'board_updated') {
        useGameStore.getState().updateCurrentBoard(data.board);
      }
    });

    this.socket.on('board_selected', (data: any) => {
      if (data.type === 'board_selected') {
        // Reset board-scoped state before board-specific entities stream in.
        useGameStore.getState().setLights([]);
        useGameStore.getState().setCurrentBoard(data.board);
      }
    });

    // Tokens
    this.socket.on('token_created', (data: any) => {
      if (data.type === 'token_created') {
        useGameStore.getState().addToken(data.token);
      }
    });

    this.socket.on('token_moved', (data: any) => {
      if (data.type === 'token_moved') {
        useGameStore.getState().updateToken(data.tokenId, { x: data.x, y: data.y });
      }
    });

    this.socket.on('token_updated', (data: any) => {
      if (data.type === 'token_updated') {
        useGameStore.getState().updateToken(data.token.id, data.token);
      }
    });

    this.socket.on('token_deleted', (data: any) => {
      if (data.type === 'token_deleted') {
        useGameStore.getState().removeToken(data.tokenId);
      }
    });

    // Fog
    this.socket.on('fog_revealed', (data: any) => {
      if (data.type === 'fog_revealed') {
        useGameStore.getState().addFogReveal(data.reveal);
      }
    });

    this.socket.on('fog_hidden', (data: any) => {
      if (data.type === 'fog_hidden') {
        useGameStore.getState().removeFogReveal(data.revealId);
      }
    });

    this.socket.on('fog_cleared', (data: any) => {
      if (data.type === 'fog_cleared') {
        useGameStore.getState().clearFogReveals();
      }
    });

    this.socket.on('fog_added', (data: any) => {
      if (data.type === 'fog_added') {
        useGameStore.getState().addFogAdd(data.fogAdd);
      }
    });

    this.socket.on('fog_add_removed', (data: any) => {
      if (data.type === 'fog_add_removed') {
        useGameStore.getState().removeFogAdd(data.fogAddId);
      }
    });

    // Lights
    this.socket.on('light_created', (data: any) => {
      if (data.type === 'light_created') {
        useGameStore.getState().addLight(data.light);
      }
    });

    this.socket.on('light_updated', (data: any) => {
      if (data.type === 'light_updated') {
        useGameStore.getState().updateLight(data.light.id, data.light);
      }
    });

    this.socket.on('light_deleted', (data: any) => {
      if (data.type === 'light_deleted') {
        useGameStore.getState().removeLight(data.lightId);
      }
    });

    // Audio sources
    this.socket.on('audio_source_created', (data: any) => {
      if (data.type === 'audio_source_created') {
        useGameStore.getState().addAudioSource(data.audioSource);
      }
    });

    this.socket.on('audio_source_updated', (data: any) => {
      if (data.type === 'audio_source_updated') {
        useGameStore.getState().updateAudioSource(data.audioSource.id, data.audioSource);
      }
    });

    this.socket.on('audio_source_deleted', (data: any) => {
      if (data.type === 'audio_source_deleted') {
        useGameStore.getState().removeAudioSource(data.audioSourceId);
      }
    });

    // Chat
    this.socket.on('chat_message', (data: any) => {
      if (data.type === 'chat_message') {
        useGameStore.getState().addChatMessage(data.message);
      }
    });

    this.socket.on('dice_roll_result', (data: any) => {
      if (data.type === 'dice_roll_result') {
        useGameStore.getState().setLastAuthoritativeDiceRoll(data.payload);
        useGameStore.getState().addChatMessage(data.payload.message);
        this.emit('dice_roll_result', data.payload);
      }
    });

    this.socket.on('dice_roll_prepared', (data: any) => {
      if (data.type === 'dice_roll_prepared') {
        this.emit('dice_roll_prepared', data.payload);
      }
    });

    // Errors
    this.socket.on('error', (data: any) => {
      console.error('Game error:', data);
    });

    // Time settings
    this.socket.on('time_settings_updated', (data: any) => {
      if (data.type === 'time_settings_updated') {
        const { setGameTime, setTimeOverlayEnabled, setTimeOverlayOpacity } = useGameStore.getState();
        if (data.gameTimeSeconds !== undefined) {
          setGameTime(data.gameTimeSeconds);
        }
        if (data.timeOverlayEnabled !== undefined) {
          setTimeOverlayEnabled(data.timeOverlayEnabled);
        }
        if (data.timeOverlayOpacity !== undefined) {
          setTimeOverlayOpacity(data.timeOverlayOpacity);
        }
        // Only update atmosphericFog when it's NOT a partial update (like intensity slider change)
        // When fogIntensity is sent alone, the server broadcasts default atmosphericFog: false
        // which disables fog. We skip updating atmosphericFog in this case.
        // Only update if fogIntensity is NOT in the data (meaning this was an explicit fog on/off change)
        if (data.atmosphericFog !== undefined && data.fogIntensity === undefined) {
          console.log('socket.ts: Received atmosphericFog from server:', data.atmosphericFog);
          setAtmosphericFog(data.atmosphericFog);
        }
        // Update fog settings
        if (data.fogEnabled !== undefined) {
          setFogEnabled(data.fogEnabled);
        }
        if (data.fogIntensity !== undefined) {
          setFogIntensity(data.fogIntensity);
        }
        if (data.fogSpeed !== undefined) {
          setFogSpeed(data.fogSpeed);
        }
        if (data.fogShift !== undefined) {
          setFogShift(data.fogShift);
        }
        if (data.fogDirection !== undefined) {
          setFogDirection(data.fogDirection);
        }
        if (data.fogColor1 !== undefined) {
          setFogColor1(data.fogColor1);
        }
        if (data.fogColor2 !== undefined) {
          setFogColor2(data.fogColor2);
        }
        // Update god ray settings
        if (data.godRayEnabled !== undefined) {
          setGodRayEnabled(data.godRayEnabled);
        }
        if (data.godRayAngle !== undefined) {
          setGodRayAngle(data.godRayAngle);
        }
        if (data.godRayLacunarity !== undefined) {
          setGodRayLacunarity(data.godRayLacunarity);
        }
        if (data.godRayIntensity !== undefined) {
          setGodRayIntensity(data.godRayIntensity);
        }
      }
    });
  }

  // Update time settings (called by GM)
  updateTimeSettings(settings: {
    gameTimeSeconds?: number;
    timeOverlayEnabled?: boolean;
    timeOverlayOpacity?: number;
    atmosphericFog?: boolean;
    fogEnabled?: boolean;
    fogIntensity?: number;
    fogSpeed?: number;
    fogShift?: number;
    fogDirection?: number;
    fogColor1?: string;
    fogColor2?: string;
    // God Ray settings
    godRayEnabled?: boolean;
    godRayAngle?: number;
    godRayLacunarity?: number;
    godRayIntensity?: number;
  }) {
    if (this.socket) {
      this.socket.emit('update_time_settings', settings);
    }
  }
}

export const socketService = new SocketService();
