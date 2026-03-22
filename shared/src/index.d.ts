export interface User {
    id: string;
    username: string;
    email: string;
    createdAt: Date;
    settings?: UserSettings;
}
export interface UserSettings {
    theme?: string;
    defaultPlayerColor?: string;
    uiPreferences?: {
        gridSize?: number;
        snapToGrid?: boolean;
        showGrid?: boolean;
    };
}
export interface AuthPayload {
    userId: string;
    username: string;
}
export type PlayerRole = 'gm' | 'player';
export interface SessionPlayer {
    userId: string;
    username: string;
    role: PlayerRole;
    joinedAt: Date;
    playerColor: string;
    controlledTokens: string[];
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
    assetFolder?: string;
    gameTimeSeconds?: number;
    timeOverlayEnabled?: boolean;
    timeOverlayOpacity?: number;
    atmosphericFog?: boolean;
}
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
}
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
    status: string;
    layer: 'tokens' | 'tiles' | 'objects';
    properties: Record<string, unknown>;
    label: string;
    showLabel: boolean;
    bars: string;
    creatureId?: string;
}
export interface FogReveal {
    id: string;
    boardId: string;
    polygon: number[][];
    createdBy: string;
    createdAt: Date;
}
export interface ChatMessage {
    id: string;
    sessionId: string;
    userId: string;
    username: string;
    text: string;
    timestamp: Date;
}
export type ClientToServerMessage = {
    type: 'authenticate';
    token: string;
} | {
    type: 'create_session';
    name: string;
} | {
    type: 'join_session';
    roomCode: string;
} | {
    type: 'leave_session';
} | {
    type: 'kick_player';
    userId: string;
} | {
    type: 'create_board';
    name: string;
} | {
    type: 'select_board';
    boardId: string;
} | {
    type: 'update_board';
    boardId: string;
    updates: {
        gridType?: 'square' | 'hex';
        gridSize?: number;
        gridColor?: number;
        gridOffsetX?: number;
        gridOffsetY?: number;
        gridStyle?: 'solid' | 'dashed' | 'dotted';
        gridStyleAmount?: number;
        gridOpacity?: number;
    };
} | {
    type: 'set_background';
    boardId: string;
    imageUrl: string;
} | {
    type: 'create_token';
    boardId: string;
    token: CreateTokenData;
} | {
    type: 'move_token';
    tokenId: string;
    x: number;
    y: number;
} | {
    type: 'update_token';
    tokenId: string;
    updates: Partial<Token>;
} | {
    type: 'delete_token';
    tokenId: string;
} | {
    type: 'toggle_token_status';
    tokenId: string;
    status: string;
} | {
    type: 'set_token_layer';
    tokenId: string;
    layer: 'tokens' | 'tiles' | 'objects';
} | {
    type: 'reveal_fog';
    boardId: string;
    polygon: number[][];
} | {
    type: 'hide_fog';
    boardId: string;
} | {
    type: 'clear_fog';
    boardId: string;
} | {
    type: 'chat_message';
    text: string;
};
export interface CreateTokenData {
    name: string;
    imageUrl: string;
    x: number;
    y: number;
    size?: number;
    visible?: boolean;
}
export type ServerToClientMessage = {
    type: 'authenticated';
    user: User;
} | {
    type: 'auth_error';
    message: string;
} | {
    type: 'session_created';
    session: Session;
} | {
    type: 'session_joined';
    session: Session;
    board: Board | null;
} | {
    type: 'session_left';
} | {
    type: 'player_joined';
    player: SessionPlayer;
} | {
    type: 'player_left';
    userId: string;
} | {
    type: 'player_updated';
    userId: string;
    role: PlayerRole;
} | {
    type: 'error';
    code: string;
    message: string;
} | {
    type: 'state_sync';
    state: GameState;
} | {
    type: 'board_updated';
    board: Board;
} | {
    type: 'board_selected';
    board: Board;
} | {
    type: 'token_created';
    token: Token;
} | {
    type: 'token_moved';
    tokenId: string;
    x: number;
    y: number;
} | {
    type: 'token_updated';
    token: Token;
} | {
    type: 'token_deleted';
    tokenId: string;
} | {
    type: 'fog_revealed';
    reveal: FogReveal;
} | {
    type: 'fog_hidden';
    revealId: string;
} | {
    type: 'fog_cleared';
    boardId: string;
} | {
    type: 'chat_message';
    message: ChatMessage;
};
export interface GameState {
    session: Session | null;
    currentBoard: Board | null;
    tokens: Token[];
    fogReveals: FogReveal[];
    chatMessages: ChatMessage[];
}
export type ServerEvent = {
    event: 'session_created';
    data: Session;
} | {
    event: 'player_joined';
    data: SessionPlayer;
} | {
    event: 'player_left';
    data: {
        userId: string;
    };
} | {
    event: 'token_moved';
    data: {
        tokenId: string;
        x: number;
        y: number;
    };
} | {
    event: 'chat_message';
    data: ChatMessage;
};
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}
export declare const GRID_TYPES: readonly ["square", "hex"];
export declare const DEFAULT_GRID_SIZE = 50;
export declare const DEFAULT_BOARD_WIDTH = 2000;
export declare const DEFAULT_BOARD_HEIGHT = 2000;
export declare const MAX_TOKEN_SIZE = 5;
export declare const ROOM_CODE_LENGTH = 8;
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
}
export declare const DEFAULT_COLOR_SCHEMES: ColorScheme[];
//# sourceMappingURL=index.d.ts.map
