import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { createHash, randomBytes } from 'crypto';
import { prisma } from '../db.js';
import type {
  ClientToServerMessage,
  ServerToClientMessage,
  Session,
  Board,
  Token,
  FogReveal,
  Light,
  AudioSource,
  ChatMessage,
  PlayerRole,
  GameState,
  SessionPlayer,
  DiceRollRequest,
  DiceRollResult,
  DiceRollVisibility,
  DiceRollDeterminismContext,
  DiceRollPrepareRequest,
  DiceRollPrepareResult,
  DiceRollFinalizeRequest,
} from '../../../shared/src/index.js';

// Prisma type with user relation included
type SessionPlayerWithUser = SessionPlayer & { user: { id: string; username: string } };

// Session state stored in memory for fast access
interface SessionState {
  sessionId: string;
  roomCode: string;
  players: Map<string, { userId: string; username: string; role: PlayerRole; socketId: string }>;
  currentBoardId: string | null;
  playerProfileImages: Record<string, string>;
}

const sessions = new Map<string, SessionState>();
const boardLights = new Map<string, Light[]>();
const boardAudioSources = new Map<string, AudioSource[]>();

interface PreparedAuthoritativeRoll {
  requestId: string;
  sessionId: string;
  userId: string;
  username: string;
  formula: string;
  source: DiceRollPrepareRequest['source'];
  visibility: DiceRollVisibility;
  rolled: { dice: DiceRollResult['dice']; total: number };
  determinism: DiceRollDeterminismContext;
  preparedAt: Date;
  expiresAt: Date;
}

const preparedRolls = new Map<string, PreparedAuthoritativeRoll>();

// Connected users
const connectedUsers = new Map<string, { userId: string; username: string }>();

// Helper: Generate room code
function generateRoomCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Helper: Verify JWT
function verifyToken(token: string): { userId: string; username: string } | null {
  try {
    const secret = process.env.JWT_SECRET || 'default-secret';
    const decoded = jwt.verify(token, secret) as { userId: string; username: string };
    return decoded;
  } catch {
    return null;
  }
}

// Helper: Get session state
function getSessionState(sessionId: string): SessionState | undefined {
  return sessions.get(sessionId);
}

function getLightsForBoard(boardId: string): Light[] {
  return boardLights.get(boardId) || [];
}

function getAudioSourcesForBoard(boardId: string): AudioSource[] {
  return boardAudioSources.get(boardId) || [];
}

// Helper: Build game state for a session
async function buildGameState(sessionId: string, socket: Socket, requestingUserId?: string): Promise<GameState | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      gm: { select: { id: true, username: true } },
      players: {
        include: { user: { select: { id: true, username: true } } },
      },
    },
  }) as unknown as (Session & { players: SessionPlayerWithUser[] }) | null;

  if (!session) return null;

  const sessionState = getSessionState(sessionId);
  let board = null as Awaited<ReturnType<typeof prisma.board.findFirst>>;

  if (sessionState?.currentBoardId) {
    board = await prisma.board.findUnique({
      where: { id: sessionState.currentBoardId },
    });
    if (board && board.sessionId !== sessionId) {
      board = null;
    }
  }

  // Fallback to first board if no active board has been selected yet.
  if (!board) {
    board = await prisma.board.findFirst({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Get the requesting user's role if provided
  let requestingUserRole: PlayerRole = 'player';
  if (requestingUserId) {
    const sessionState = getSessionState(sessionId);
    if (sessionState) {
      requestingUserRole = getUserRole(sessionState, requestingUserId);
    }
  }

  const tokens = (board ? await prisma.token.findMany({ where: { boardId: board.id } }) : []) as unknown as Token[];
  const fogReveals = (board ? await prisma.fogReveal.findMany({ where: { boardId: board.id } }) : []) as unknown as FogReveal[];
  
  // Build visibility filter for chat messages based on requesting user's role
  // Visibility rules:
  // - isPrivate (GM only): Only GM can see
  // - isBlindGM: Everyone EXCEPT GM can see
  // - isSelfRoll: Only the sender can see
  // - Public: Everyone can see
  let chatVisibilityFilter: any = {};
  if (requestingUserRole !== 'gm') {
    // Non-GM users can see:
    // 1. Public messages (isPrivate=false AND isBlindGM=false)
    // 2. Blind GM messages (isBlindGM=true) - they can see these!
    // 3. Self-rolls they sent (isSelfRoll=true AND userId=theirId)
    chatVisibilityFilter = {
      OR: [
        // Public messages
        { isPrivate: false, isBlindGM: false },
        // Blind GM messages - visible to non-GMs
        { isBlindGM: true },
        // Self-rolls they sent
        { isSelfRoll: true, userId: requestingUserId },
      ],
    };
  }
  
  const chatMessages = (await prisma.chatMessage.findMany({
    where: { 
      sessionId,
      ...(requestingUserRole !== 'gm' ? chatVisibilityFilter : {}),
    },
    orderBy: { timestamp: 'desc' },
    take: 100,
    include: { user: { select: { username: true } } },
  })) as unknown as (ChatMessage & { user: { username: string } })[];

  const players: Session['players'] = session.players.map((p: SessionPlayerWithUser) => ({
    userId: p.user.id,
    username: p.user.username,
    role: p.role as PlayerRole,
    joinedAt: p.joinedAt,
    playerColor: p.playerColor,
    controlledTokens: p.controlledTokens,
    isOnline: getSessionState(sessionId)?.players.has(p.user.id) || false,
    profilePicture: sessionState?.playerProfileImages[p.user.id],
  }));

  return {
    session: {
      id: session.id,
      name: session.name,
      roomCode: session.roomCode,
      gmId: session.gmId,
      players,
      createdAt: session.createdAt,
      settings: session.settings as unknown as Session['settings'],
    },
    currentBoard: board
      ? {
          id: board.id,
          sessionId: board.sessionId,
          name: board.name,
          backgroundUrl: board.backgroundUrl,
          gridSize: board.gridSize,
          gridType: board.gridType as 'square' | 'hex',
          width: board.width,
          height: board.height,
          createdAt: board.createdAt,
        }
      : null,
    tokens: tokens.map((t) => ({
      id: t.id,
      boardId: t.boardId,
      ownerId: t.ownerId,
      name: t.name,
      imageUrl: t.imageUrl,
      x: t.x,
      y: t.y,
      size: t.size,
      visible: t.visible,
      locked: t.locked,
      status: t.status || '',
      layer: (t.layer || 'tokens') as 'tokens' | 'tiles' | 'objects',
      label: t.label || '',
      showLabel: t.showLabel || false,
      bars: t.bars || '[]',
      properties: t.properties as Record<string, unknown>,
      creatureId: typeof (t.properties as Record<string, unknown> | null)?.creatureId === 'string'
        ? ((t.properties as Record<string, unknown>).creatureId as string)
        : undefined,
    })),
    fogReveals: fogReveals.map((f) => ({
      id: f.id,
      boardId: f.boardId,
      polygon: f.polygon as number[][],
      createdBy: f.createdBy,
      createdAt: f.createdAt,
    })),
    chatMessages: chatMessages
      .reverse()
      .map((m) => ({
        id: m.id,
        sessionId: m.sessionId,
        userId: m.userId,
        username: m.user?.username || '',
        text: m.text,
        timestamp: m.timestamp,
        isPrivate: m.isPrivate || false,
        isBlindGM: m.isBlindGM || false,
        isSelfRoll: m.isSelfRoll || false,
      })),
    lights: board ? getLightsForBoard(board.id) : [],
    audioSources: board ? getAudioSourcesForBoard(board.id) : [],
    playerProfileImages: sessionState?.playerProfileImages || {},
  };
}

// Helper: Get user role in session
function getUserRole(sessionState: SessionState, userId: string): PlayerRole {
  const player = sessionState.players.get(userId);
  return player?.role || 'player';
}

// Helper: Check if user is GM
function isGM(sessionState: SessionState, userId: string): boolean {
  return getUserRole(sessionState, userId) === 'gm';
}

function getVisibilityFlags(visibility: DiceRollVisibility): { isPrivate: boolean; isBlindGM: boolean; isSelfRoll: boolean } {
  return {
    isPrivate: visibility === 'gm',
    isBlindGM: visibility === 'blind',
    isSelfRoll: visibility === 'self',
  };
}

function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

function createDeterministicDieRoller(seed: string, requestId: string, nonce: string): (sides: number) => number {
  let counter = 0;
  return (sides: number) => {
    counter += 1;
    const digest = createHash('sha256')
      .update(`${seed}:${requestId}:${nonce}:${counter}`)
      .digest();
    const value = digest.readUInt32BE(0);
    return (value % sides) + 1;
  };
}

function buildCanonicalHash(input: { formula: string; rolled: { dice: DiceRollResult['dice']; total: number } }): string {
  const canonicalPayload = JSON.stringify({
    formula: input.formula,
    total: input.rolled.total,
    dice: input.rolled.dice.map((die) => ({
      sides: die.sides,
      rolls: die.rolls,
      total: die.total,
      modifier: die.modifier,
      dice: die.dice,
    })),
  });

  return createHash('sha256').update(canonicalPayload).digest('hex');
}

function parseAuthoritativeRollFormula(formula: string, roll: (sides: number) => number = rollDie): { dice: DiceRollResult['dice']; total: number } {
  const normalized = formula.toLowerCase().replace(/\s+/g, '');
  const withAdv = /\(adv\)$/i.test(normalized);
  const withDis = /\(dis\)$/i.test(normalized);
  const cleanFormula = normalized.replace(/\((adv|dis)\)$/i, '');

  if (!cleanFormula || !/[0-9d]/i.test(cleanFormula)) {
    throw new Error('Invalid dice formula');
  }

  const parts = cleanFormula.match(/[+-]?[^+-]+/g) || [];
  const dice: DiceRollResult['dice'] = [];
  let total = 0;
  let modifierTotal = 0;

  const diceParts = parts.filter((part) => /d/.test(part));
  const isSingleD20 = diceParts.length === 1 && /^\+?1d20$/i.test(diceParts[0]);

  for (const rawPart of parts) {
    const sign = rawPart.startsWith('-') ? -1 : 1;
    const part = rawPart.replace(/^[-+]/, '');

    if (/^\d+d\d+$/i.test(part)) {
      const [countText, sidesText] = part.toLowerCase().split('d');
      const count = Math.max(1, parseInt(countText, 10));
      const sides = parseInt(sidesText, 10);

      if (!Number.isFinite(count) || !Number.isFinite(sides) || sides <= 0 || count > 100) {
        throw new Error('Unsupported dice notation');
      }

      if (isSingleD20 && count === 1 && sides === 20 && (withAdv || withDis)) {
        const rollA = roll(20);
        const rollB = roll(20);
        const kept = withAdv ? Math.max(rollA, rollB) : Math.min(rollA, rollB);
        dice.push({
          dice: '1d20',
          sides: 20,
          rolls: [rollA, rollB],
          total: kept * sign,
          modifier: 0,
        });
        total += kept * sign;
      } else {
        const rolls: number[] = [];
        for (let i = 0; i < count; i++) {
          rolls.push(roll(sides));
        }
        const subtotal = rolls.reduce((sum, value) => sum + value, 0) * sign;
        dice.push({
          dice: `${count}d${sides}`,
          sides,
          rolls,
          total: subtotal,
          modifier: 0,
        });
        total += subtotal;
      }
      continue;
    }

    if (/^\d+$/.test(part)) {
      const modifierValue = parseInt(part, 10) * sign;
      modifierTotal += modifierValue;
      total += modifierValue;
      continue;
    }

    throw new Error('Unsupported formula segment');
  }

  if (dice.length === 0) {
    throw new Error('No dice found in formula');
  }

  const diceOnlyTotal = dice.reduce((sum, die) => sum + die.total, 0);
  console.debug('[dice-debug] parseAuthoritativeRollFormula', {
    formula,
    normalized,
    cleanFormula,
    parts,
    withAdv,
    withDis,
    diceOnlyTotal,
    modifierTotal,
    total,
    dice,
  });

  return { dice, total };
}

function describeRoll(result: { dice: DiceRollResult['dice']; total: number }): string {
  const parts: string[] = [];
  result.dice.forEach((die) => {
    if (die.rolls.length === 1) {
      parts.push(`${die.total}`);
    } else {
      parts.push(`[${die.rolls.join(', ')}] = ${die.total}`);
    }
  });
  const description = `${parts.join(' + ')} = ${result.total}`;
  console.debug('[dice-debug] describeRoll', {
    description,
    dice: result.dice,
    total: result.total,
    note: 'Description currently derives from dice entries only; numeric modifiers are represented only in total.',
  });
  return description;
}

function createPreparedRoll(input: {
  sessionId: string;
  userId: string;
  username: string;
  payload: DiceRollPrepareRequest;
}): PreparedAuthoritativeRoll {
  const secretSeed = randomBytes(32).toString('hex');
  const rollNonce = uuidv4();
  const deterministicRoll = createDeterministicDieRoller(secretSeed, input.payload.requestId, rollNonce);
  const rolled = parseAuthoritativeRollFormula(input.payload.formula, deterministicRoll);
  const determinism: DiceRollDeterminismContext = {
    algorithmVersion: 'sha256-seq-v1',
    seedCommitment: createHash('sha256').update(secretSeed).digest('hex'),
    rollNonce,
    canonicalHash: buildCanonicalHash({ formula: input.payload.formula, rolled }),
  };
  const preparedAt = new Date();
  const expiresAt = new Date(preparedAt.getTime() + 15000);

  return {
    requestId: input.payload.requestId,
    sessionId: input.sessionId,
    userId: input.userId,
    username: input.username,
    formula: input.payload.formula,
    source: input.payload.source,
    visibility: input.payload.visibility,
    rolled,
    determinism,
    preparedAt,
    expiresAt,
  };
}

function buildPreparedRollKey(sessionId: string, requestId: string): string {
  return `${sessionId}:${requestId}`;
}

async function finalizePreparedRoll(input: {
  io: Server;
  socket: Socket;
  sessionId: string;
  userId: string;
  username: string;
  prepared: PreparedAuthoritativeRoll;
  telemetry?: DiceRollFinalizeRequest['telemetry'];
}): Promise<void> {
  const visibilityFlags = getVisibilityFlags(input.prepared.visibility);
  const description = describeRoll(input.prepared.rolled);
  const chatText = `🎲 ${input.username} rolled ${input.prepared.formula}: ${description}`;

  const message = await prisma.chatMessage.create({
    data: {
      sessionId: input.sessionId,
      userId: input.userId,
      text: chatText,
      isPrivate: visibilityFlags.isPrivate,
      isBlindGM: visibilityFlags.isBlindGM,
      isSelfRoll: visibilityFlags.isSelfRoll,
    },
  });

  const messageWithUsername = {
    id: message.id,
    sessionId: message.sessionId,
    userId: message.userId,
    username: input.username,
    text: message.text,
    timestamp: message.timestamp,
    isPrivate: message.isPrivate,
    isBlindGM: message.isBlindGM,
    isSelfRoll: message.isSelfRoll,
  };

  const rollResult: DiceRollResult = {
    requestId: input.prepared.requestId,
    rollId: message.id,
    userId: input.userId,
    username: input.username,
    formula: input.prepared.formula,
    total: input.prepared.rolled.total,
    dice: input.prepared.rolled.dice,
    timestamp: message.timestamp,
    visibility: input.prepared.visibility,
    determinism: input.prepared.determinism,
    message: messageWithUsername,
  };

  const eventPayload = {
    type: 'dice_roll_result' as const,
    payload: rollResult,
  };

  if (input.telemetry) {
    console.info('[dice] finalize telemetry', {
      requestId: input.prepared.requestId,
      userId: input.userId,
      telemetry: input.telemetry,
    });
  }

  const sessionState = getSessionState(input.sessionId);

  if (message.isPrivate) {
    let gmSocketId: string | undefined;
    if (sessionState) {
      for (const player of sessionState.players.values()) {
        if (player.role === 'gm') {
          gmSocketId = player.socketId;
          break;
        }
      }
    }
    if (gmSocketId) {
      input.io.to(gmSocketId).emit('dice_roll_result', eventPayload);
    }
  } else if (message.isBlindGM) {
    let gmSocketId: string | undefined;
    if (sessionState) {
      for (const player of sessionState.players.values()) {
        if (player.role === 'gm') {
          gmSocketId = player.socketId;
          break;
        }
      }
    }

    const roomSockets = input.io.sockets.adapter.rooms.get(input.sessionId);
    if (roomSockets) {
      roomSockets.forEach((socketId) => {
        if (socketId !== gmSocketId && socketId !== input.socket.id) {
          input.io.to(socketId).emit('dice_roll_result', eventPayload);
        }
      });
    }
  } else if (message.isSelfRoll) {
    input.socket.emit('dice_roll_result', eventPayload);
  } else {
    input.io.to(input.sessionId).emit('dice_roll_result', eventPayload);
  }
}

export function setupWebSocketHandlers(io: Server): void {
  io.on('connection', (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);
    let currentUser: { userId: string; username: string } | null = null;
    let currentSessionId: string | null = null;

    // Authenticate
    socket.on('authenticate', (data: { token: string }, callback) => {
      const user = verifyToken(data.token);
      if (!user) {
        callback({ type: 'auth_error', message: 'Invalid token' } as ServerToClientMessage);
        return;
      }

      currentUser = user;
      connectedUsers.set(socket.id, user);
      socket.emit('authenticated', {
        type: 'authenticated',
        user: { id: user.userId, username: user.username, createdAt: new Date() },
      });
      console.log(`User authenticated: ${user.username} (${socket.id})`);
    });

    // Create session
    socket.on('create_session', async (data: { name: string }) => {
      if (!currentUser) {
        socket.emit('error', { type: 'error', code: 'NOT_AUTHENTICATED', message: 'Not authenticated' });
        return;
      }

      try {
        const roomCode = generateRoomCode();
        const session = await prisma.session.create({
          data: {
            name: data.name,
            roomCode,
            gmId: currentUser.userId,
          },
        });

        // Add GM as player
        await prisma.sessionPlayer.create({
          data: {
            sessionId: session.id,
            userId: currentUser.userId,
            role: 'gm',
          },
        });

        // Create initial board
        const board = await prisma.board.create({
          data: {
            sessionId: session.id,
            name: 'Main Board',
            gridSize: 50,
            gridType: 'square',
            width: 2000,
            height: 2000,
          },
        });

        // Initialize session state
        const sessionState: SessionState = {
          sessionId: session.id,
          roomCode: session.roomCode,
          players: new Map([[currentUser.userId, { ...currentUser, role: 'gm', socketId: socket.id }]]),
          currentBoardId: board.id,
          playerProfileImages: {},
        };
        sessions.set(session.id, sessionState);

        // Join socket room
        socket.join(session.id);
        currentSessionId = session.id;

        // Build and send game state
        const gameState = await buildGameState(session.id, socket, currentUser.userId);

        socket.emit('session_created', {
          type: 'session_created',
          session: {
            id: session.id,
            name: session.name,
            roomCode: session.roomCode,
            gmId: session.gmId,
            players: [{ userId: currentUser.userId, username: currentUser.username, role: 'gm', joinedAt: new Date(), isOnline: true }],
            createdAt: session.createdAt,
            settings: session.settings as unknown as Session['settings'],
          },
        });

        socket.emit('state_sync', { type: 'state_sync', state: gameState });
        socket.emit('board_selected', { type: 'board_selected', board: { ...board, gridType: 'square' } });

        console.log(`Session created: ${session.name} (${roomCode}) by ${currentUser.username}`);
      } catch (error) {
        console.error('Create session error:', error);
        socket.emit('error', { type: 'error', code: 'CREATE_FAILED', message: 'Failed to create session' });
      }
    });

    // Join session
    socket.on('join_session', async (data: { roomCode: string }) => {
      if (!currentUser) {
        socket.emit('error', { type: 'error', code: 'NOT_AUTHENTICATED', message: 'Not authenticated' });
        return;
      }

      try {
        const session = await prisma.session.findUnique({
          where: { roomCode: data.roomCode },
          include: { players: true },
        }) as unknown as (Session & { players: SessionPlayer[] }) | null;

        if (!session) {
          socket.emit('error', { type: 'error', code: 'SESSION_NOT_FOUND', message: 'Session not found' });
          return;
        }

        // currentUser is guaranteed non-null after auth check
        if (!currentUser) return;

        // Check if already in session
        const existingPlayer = session.players.find((p) => p.userId === currentUser!.userId);
        if (existingPlayer) {
          socket.emit('error', { type: 'error', code: 'ALREADY_IN_SESSION', message: 'Already in this session' });
          return;
        }

        // Add player
        await prisma.sessionPlayer.create({
          data: {
            sessionId: session.id,
            userId: currentUser.userId,
            role: 'player',
          },
        });

        // Get user info
        const user = await prisma.user.findUnique({ where: { id: currentUser.userId } });

        // Initialize or get session state
        let sessionState = sessions.get(session.id);
        if (!sessionState) {
          sessionState = {
            sessionId: session.id,
            roomCode: session.roomCode,
            players: new Map(),
            currentBoardId: null,
            playerProfileImages: {},
          };
          sessions.set(session.id, sessionState);
        }

        sessionState.players.set(currentUser.userId, {
          ...currentUser,
          role: 'player',
          socketId: socket.id,
        });

        // Join socket room
        socket.join(session.id);
        currentSessionId = session.id;

        // Notify others
        socket.to(session.id).emit('player_joined', {
          type: 'player_joined',
          player: { userId: currentUser.userId, username: currentUser.username, role: 'player', joinedAt: new Date(), isOnline: true },
        });

        // Send game state to joining player
        const gameState = await buildGameState(session.id, socket, currentUser.userId);

        socket.emit('session_joined', {
          type: 'session_joined',
          session: {
            id: session.id,
            name: session.name,
            roomCode: session.roomCode,
            gmId: session.gmId,
            players: Array.from(sessionState.players.values()).map((p) => ({
              userId: p.userId,
              username: p.username,
              role: p.role,
              joinedAt: new Date(),
              isOnline: true,
            })),
            createdAt: session.createdAt,
            settings: session.settings as unknown as Session['settings'],
          },
          board: gameState?.currentBoard || null,
        });

        socket.emit('state_sync', { type: 'state_sync', state: gameState });

        console.log(`User ${currentUser.username} joined session ${session.roomCode}`);
      } catch (error) {
        console.error('Join session error:', error);
        socket.emit('error', { type: 'error', code: 'JOIN_FAILED', message: 'Failed to join session' });
      }
    });

    // Leave session
    socket.on('leave_session', async () => {
      if (!currentUser || !currentSessionId) return;

      const sessionState = sessions.get(currentSessionId);
      if (sessionState) {
        sessionState.players.delete(currentUser.userId);
        
        // Notify others about player going offline
        socket.to(currentSessionId).emit('player_online_status', {
          type: 'player_online_status',
          userId: currentUser.userId,
          isOnline: false,
        });

        // Notify others
        socket.to(currentSessionId).emit('player_left', {
          type: 'player_left',
          userId: currentUser.userId,
        });

        // Clean up empty sessions
        if (sessionState.players.size === 0) {
          sessions.delete(currentSessionId);
        }
      }

      socket.leave(currentSessionId);
      currentSessionId = null;
      socket.emit('session_left', { type: 'session_left' });
    });

    // Create board
    socket.on('create_board', async (data: { name: string }) => {
      if (!currentUser || !currentSessionId) return;

      const sessionState = sessions.get(currentSessionId);
      if (!sessionState || !isGM(sessionState, currentUser.userId)) {
        socket.emit('error', { type: 'error', code: 'PERMISSION_DENIED', message: 'Only GM can create boards' });
        return;
      }

      try {
        const board = await prisma.board.create({
          data: {
            sessionId: currentSessionId,
            name: data.name,
            gridSize: 50,
            gridType: 'square',
            width: 2000,
            height: 2000,
          },
        });

        sessionState.currentBoardId = board.id;
        boardLights.set(board.id, []);

        io.to(currentSessionId).emit('board_updated', {
          type: 'board_updated',
          board: { ...board, gridType: 'square' },
        });
      } catch (error) {
        console.error('Create board error:', error);
        socket.emit('error', { type: 'error', code: 'CREATE_FAILED', message: 'Failed to create board' });
      }
    });

    // Select board
    socket.on('select_board', async (data: { boardId: string }) => {
      if (!currentUser || !currentSessionId) return;

      const sessionState = sessions.get(currentSessionId);
      if (!sessionState) return;

      try {
        const board = await prisma.board.findUnique({ where: { id: data.boardId } });
        if (!board || board.sessionId !== currentSessionId) {
          socket.emit('error', { type: 'error', code: 'BOARD_NOT_FOUND', message: 'Board not found' });
          return;
        }

        sessionState.currentBoardId = board.id;

        // Get tokens and fog for this board
        const tokens = await prisma.token.findMany({ where: { boardId: board.id } }) as unknown as Token[];
        const fogReveals = await prisma.fogReveal.findMany({ where: { boardId: board.id } }) as unknown as FogReveal[];

        socket.emit('board_selected', {
          type: 'board_selected',
          board: { ...board, gridType: 'square' },
        });

        // Send tokens
        tokens.forEach((token) => {
          socket.emit('token_created', {
            type: 'token_created',
            token: {
              id: token.id,
              boardId: token.boardId,
              ownerId: token.ownerId,
              name: token.name,
              imageUrl: token.imageUrl,
              x: token.x,
              y: token.y,
              size: token.size,
              visible: token.visible,
              locked: token.locked,
              properties: token.properties as Record<string, unknown>,
            },
          });
        });

        // Send fog reveals
        fogReveals.forEach((fog) => {
          socket.emit('fog_revealed', {
            type: 'fog_revealed',
            reveal: {
              id: fog.id,
              boardId: fog.boardId,
              polygon: fog.polygon as number[][],
              createdBy: fog.createdBy,
              createdAt: fog.createdAt,
            },
          });
        });

        // Send lights for this board
        const lights = getLightsForBoard(board.id);
        lights.forEach((light) => {
          socket.emit('light_created', {
            type: 'light_created',
            light,
          });
        });

        // Send audio sources for this board
        const audioSources = getAudioSourcesForBoard(board.id);
        audioSources.forEach((audioSource) => {
          socket.emit('audio_source_created', {
            type: 'audio_source_created',
            audioSource,
          });
        });
      } catch (error) {
        console.error('Select board error:', error);
      }
    });

    // Create light
    socket.on('create_light', async (data: { boardId: string; light: Partial<Light> }) => {
      if (!currentUser || !currentSessionId) return;

      const sessionState = sessions.get(currentSessionId);
      if (!sessionState || !isGM(sessionState, currentUser.userId)) {
        socket.emit('error', { type: 'error', code: 'PERMISSION_DENIED', message: 'Only GM can create lights' });
        return;
      }

      try {
        const board = await prisma.board.findUnique({ where: { id: data.boardId } });
        if (!board || board.sessionId !== currentSessionId) return;

        const newLight: Light = {
          id: data.light.id || `light-${uuidv4()}`,
          boardId: data.boardId,
          name: data.light.name || 'Light',
          x: data.light.x ?? 0,
          y: data.light.y ?? 0,
          radius: data.light.radius ?? 200,
          color: data.light.color ?? 0xffdd88,
          intensity: data.light.intensity ?? 1,
          alpha: data.light.alpha ?? 1,
          effect: data.light.effect ?? 'none',
          effectSpeed: data.light.effectSpeed ?? 1,
          effectIntensity: data.light.effectIntensity ?? 1,
          effectColor: data.light.effectColor ?? 0xffdd88,
          type: data.light.type ?? 'point',
          direction: data.light.direction ?? 0,
          angle: data.light.angle ?? 60,
          dimRadius: data.light.dimRadius ?? 50,
          visible: data.light.visible ?? true,
          blendMode: data.light.blendMode ?? 'add',
        };

        const existing = getLightsForBoard(data.boardId);
        boardLights.set(data.boardId, [...existing.filter((l) => l.id !== newLight.id), newLight]);

        io.to(currentSessionId).emit('light_created', {
          type: 'light_created',
          light: newLight,
        });
      } catch (error) {
        console.error('Create light error:', error);
      }
    });

    // Update light
    socket.on('update_light', async (data: { lightId: string; updates: Partial<Light> }) => {
      if (!currentUser || !currentSessionId) return;

      const sessionState = sessions.get(currentSessionId);
      if (!sessionState || !isGM(sessionState, currentUser.userId)) {
        socket.emit('error', { type: 'error', code: 'PERMISSION_DENIED', message: 'Only GM can update lights' });
        return;
      }

      try {
        for (const [boardId, lights] of boardLights.entries()) {
          const idx = lights.findIndex((light) => light.id === data.lightId);
          if (idx === -1) continue;

          const board = await prisma.board.findUnique({ where: { id: boardId } });
          if (!board || board.sessionId !== currentSessionId) return;

          const updatedLight: Light = {
            ...lights[idx],
            ...data.updates,
            id: lights[idx].id,
            boardId: lights[idx].boardId,
          };

          const next = [...lights];
          next[idx] = updatedLight;
          boardLights.set(boardId, next);

          io.to(currentSessionId).emit('light_updated', {
            type: 'light_updated',
            light: updatedLight,
          });
          return;
        }
      } catch (error) {
        console.error('Update light error:', error);
      }
    });

    // Delete light
    socket.on('delete_light', async (data: { lightId: string }) => {
      if (!currentUser || !currentSessionId) return;

      const sessionState = sessions.get(currentSessionId);
      if (!sessionState || !isGM(sessionState, currentUser.userId)) {
        socket.emit('error', { type: 'error', code: 'PERMISSION_DENIED', message: 'Only GM can delete lights' });
        return;
      }

      try {
        for (const [boardId, lights] of boardLights.entries()) {
          const exists = lights.some((light) => light.id === data.lightId);
          if (!exists) continue;

          const board = await prisma.board.findUnique({ where: { id: boardId } });
          if (!board || board.sessionId !== currentSessionId) return;

          boardLights.set(boardId, lights.filter((light) => light.id !== data.lightId));
          io.to(currentSessionId).emit('light_deleted', {
            type: 'light_deleted',
            lightId: data.lightId,
          });
          return;
        }
      } catch (error) {
        console.error('Delete light error:', error);
      }
    });

    // Create audio source
    socket.on('create_audio_source', async (data: { boardId: string; audioSource: Partial<AudioSource> }) => {
      if (!currentUser || !currentSessionId) return;

      const sessionState = sessions.get(currentSessionId);
      if (!sessionState || !isGM(sessionState, currentUser.userId)) {
        socket.emit('error', { type: 'error', code: 'PERMISSION_DENIED', message: 'Only GM can create audio sources' });
        return;
      }

      try {
        const board = await prisma.board.findUnique({ where: { id: data.boardId } });
        if (!board || board.sessionId !== currentSessionId) return;

        const gridSize = board.gridSize || 50;
        const newAudioSource: AudioSource = {
          id: data.audioSource.id || `audio-${uuidv4()}`,
          boardId: data.boardId,
          name: data.audioSource.name || 'Audio Source',
          x: data.audioSource.x ?? 0,
          y: data.audioSource.y ?? 0,
          audioFile: data.audioSource.audioFile || '',
          radius: data.audioSource.radius ?? gridSize * 6,
          innerRadius: data.audioSource.innerRadius ?? gridSize * 1,
          baseVolume: data.audioSource.baseVolume ?? 1,
          loop: data.audioSource.loop ?? true,
          playing: data.audioSource.playing ?? false, // Default to false until an audio file is set
        };

        const existing = getAudioSourcesForBoard(data.boardId);
        boardAudioSources.set(data.boardId, [...existing.filter((a) => a.id !== newAudioSource.id), newAudioSource]);

        io.to(currentSessionId).emit('audio_source_created', {
          type: 'audio_source_created',
          audioSource: newAudioSource,
        });
      } catch (error) {
        console.error('Create audio source error:', error);
      }
    });

    // Update audio source
    socket.on('update_audio_source', async (data: { audioSourceId: string; updates: Partial<AudioSource> }) => {
      if (!currentUser || !currentSessionId) return;

      const sessionState = sessions.get(currentSessionId);
      if (!sessionState || !isGM(sessionState, currentUser.userId)) {
        socket.emit('error', { type: 'error', code: 'PERMISSION_DENIED', message: 'Only GM can update audio sources' });
        return;
      }

      try {
        for (const [boardId, audioSources] of boardAudioSources.entries()) {
          const idx = audioSources.findIndex((audioSource) => audioSource.id === data.audioSourceId);
          if (idx === -1) continue;

          const board = await prisma.board.findUnique({ where: { id: boardId } });
          if (!board || board.sessionId !== currentSessionId) return;

          const updatedAudioSource: AudioSource = {
            ...audioSources[idx],
            ...data.updates,
            id: audioSources[idx].id,
            boardId: audioSources[idx].boardId,
          };

          const next = [...audioSources];
          next[idx] = updatedAudioSource;
          boardAudioSources.set(boardId, next);

          io.to(currentSessionId).emit('audio_source_updated', {
            type: 'audio_source_updated',
            audioSource: updatedAudioSource,
          });
          return;
        }
      } catch (error) {
        console.error('Update audio source error:', error);
      }
    });

    // Delete audio source
    socket.on('delete_audio_source', async (data: { audioSourceId: string }) => {
      if (!currentUser || !currentSessionId) return;

      const sessionState = sessions.get(currentSessionId);
      if (!sessionState || !isGM(sessionState, currentUser.userId)) {
        socket.emit('error', { type: 'error', code: 'PERMISSION_DENIED', message: 'Only GM can delete audio sources' });
        return;
      }

      try {
        for (const [boardId, audioSources] of boardAudioSources.entries()) {
          const exists = audioSources.some((audioSource) => audioSource.id === data.audioSourceId);
          if (!exists) continue;

          const board = await prisma.board.findUnique({ where: { id: boardId } });
          if (!board || board.sessionId !== currentSessionId) return;

          boardAudioSources.set(boardId, audioSources.filter((audioSource) => audioSource.id !== data.audioSourceId));
          io.to(currentSessionId).emit('audio_source_deleted', {
            type: 'audio_source_deleted',
            audioSourceId: data.audioSourceId,
          });
          return;
        }
      } catch (error) {
        console.error('Delete audio source error:', error);
      }
    });

    // Set background
    socket.on('set_background', async (data: { boardId: string; imageUrl: string }) => {
      if (!currentUser || !currentSessionId) return;

      const sessionState = sessions.get(currentSessionId);
      if (!sessionState || !isGM(sessionState, currentUser.userId)) {
        socket.emit('error', { type: 'error', code: 'PERMISSION_DENIED', message: 'Only GM can set background' });
        return;
      }

      try {
        const board = await prisma.board.update({
          where: { id: data.boardId },
          data: { backgroundUrl: data.imageUrl },
        });

        io.to(currentSessionId).emit('board_updated', {
          type: 'board_updated',
          board: { ...board, gridType: 'square' },
        });
      } catch (error) {
        console.error('Set background error:', error);
      }
    });

    // Create token
    socket.on('create_token', async (data: { boardId: string; token: { name: string; imageUrl: string; x: number; y: number; size?: number; visible?: boolean; showLabel?: boolean; bars?: string; creatureId?: string; properties?: Record<string, unknown> } }) => {
      if (!currentUser || !currentSessionId) return;

      const sessionState = sessions.get(currentSessionId);
      if (!sessionState) return;

      try {
        const tokenProperties: Record<string, unknown> = {
          ...(data.token.properties || {}),
        };

        if (data.token.creatureId) {
          tokenProperties.creatureId = data.token.creatureId;
        }

        const token = await prisma.token.create({
          data: {
            boardId: data.boardId,
            ownerId: currentUser.userId,
            name: data.token.name,
            imageUrl: data.token.imageUrl,
            x: data.token.x,
            y: data.token.y,
            size: data.token.size || 1,
            visible: data.token.visible !== false,
            showLabel: data.token.showLabel || false,
            bars: data.token.bars || '',
            properties: tokenProperties as any,
          },
        });

        const tokenData = {
          id: token.id,
          boardId: token.boardId,
          ownerId: token.ownerId,
          name: token.name,
          imageUrl: token.imageUrl,
          x: token.x,
          y: token.y,
          size: token.size,
          visible: token.visible,
          locked: token.locked,
          status: token.status || '',
          layer: (token.layer || 'tokens') as 'tokens' | 'tiles' | 'objects',
          properties: token.properties as Record<string, unknown>,
          creatureId: typeof (token.properties as Record<string, unknown> | null)?.creatureId === 'string'
            ? ((token.properties as Record<string, unknown>).creatureId as string)
            : undefined,
          label: token.label || '',
          showLabel: token.showLabel || false,
          bars: token.bars || '',
        };

        io.to(currentSessionId).emit('token_created', {
          type: 'token_created',
          token: tokenData,
        });
      } catch (error) {
        console.error('Create token error:', error);
      }
    });

    // Move token
    socket.on('move_token', async (data: { tokenId: string; x: number; y: number }) => {
      if (!currentUser || !currentSessionId) return;

      try {
        const token = await prisma.token.findUnique({ where: { id: data.tokenId } });
        if (!token) return;

        // Check permission (owner or GM can move)
        const sessionState = sessions.get(currentSessionId);
        if (!sessionState) return;

        if (token.ownerId !== currentUser.userId && !isGM(sessionState, currentUser.userId)) {
          socket.emit('error', { type: 'error', code: 'PERMISSION_DENIED', message: 'Cannot move this token' });
          return;
        }

        const updated = await prisma.token.update({
          where: { id: data.tokenId },
          data: { x: data.x, y: data.y },
        });

        io.to(currentSessionId).emit('token_moved', {
          type: 'token_moved',
          tokenId: updated.id,
          x: updated.x,
          y: updated.y,
        });
      } catch (error) {
        console.error('Move token error:', error);
      }
    });

    // Update token
    socket.on('update_token', async (data: { tokenId: string; updates: Partial<Token> }) => {
      if (!currentUser || !currentSessionId) return;

      const sessionState = sessions.get(currentSessionId);
      if (!sessionState) return;

      try {
        const token = await prisma.token.findUnique({ where: { id: data.tokenId } });
        if (!token) return;

        // Check permission
        if (token.ownerId !== currentUser.userId && !isGM(sessionState, currentUser.userId)) {
          socket.emit('error', { type: 'error', code: 'PERMISSION_DENIED', message: 'Cannot update this token' });
          return;
        }

        const updated = await prisma.token.update({
          where: { id: data.tokenId },
          data: data.updates as any,
        });

        io.to(currentSessionId).emit('token_updated', {
          type: 'token_updated',
          token: {
            id: updated.id,
            boardId: updated.boardId,
            ownerId: updated.ownerId,
            name: updated.name,
            imageUrl: updated.imageUrl,
            x: updated.x,
            y: updated.y,
            size: updated.size,
            visible: updated.visible,
            locked: updated.locked,
            status: updated.status || '',
            layer: (updated.layer || 'tokens') as 'tokens' | 'tiles' | 'objects',
            label: updated.label || '',
            showLabel: updated.showLabel || false,
            bars: updated.bars || '[]',
            properties: updated.properties as Record<string, unknown>,
            creatureId: typeof (updated.properties as Record<string, unknown> | null)?.creatureId === 'string'
              ? ((updated.properties as Record<string, unknown>).creatureId as string)
              : undefined,
          },
        });
      } catch (error) {
        console.error('Update token error:', error);
      }
    });

    // Delete token
    socket.on('delete_token', async (data: { tokenId: string }) => {
      if (!currentUser || !currentSessionId) return;

      const sessionState = sessions.get(currentSessionId);
      if (!sessionState) return;

      try {
        const token = await prisma.token.findUnique({ where: { id: data.tokenId } });
        if (!token) return;

        // Check permission
        if (token.ownerId !== currentUser.userId && !isGM(sessionState, currentUser.userId)) {
          socket.emit('error', { type: 'error', code: 'PERMISSION_DENIED', message: 'Cannot delete this token' });
          return;
        }

        await prisma.token.delete({ where: { id: data.tokenId } });

        io.to(currentSessionId).emit('token_deleted', {
          type: 'token_deleted',
          tokenId: data.tokenId,
        });
      } catch (error) {
        console.error('Delete token error:', error);
      }
    });

    // Toggle token status (add/remove emoji)
    socket.on('toggle_token_status', async (data: { tokenId: string; status: string }) => {
      if (!currentUser || !currentSessionId) return;

      const sessionState = sessions.get(currentSessionId);
      if (!sessionState) return;

      try {
        const token = await prisma.token.findUnique({ where: { id: data.tokenId } });
        if (!token) return;

        // Check permission - GM or token owner can modify
        if (token.ownerId !== currentUser.userId && !isGM(sessionState, currentUser.userId)) {
          socket.emit('error', { type: 'error', code: 'PERMISSION_DENIED', message: 'Cannot update this token' });
          return;
        }

        // Parse existing statuses
        const currentStatuses: string[] = token.status ? JSON.parse(token.status) : [];
        const statusIndex = currentStatuses.indexOf(data.status);
        
        let newStatuses: string[];
        if (statusIndex >= 0) {
          // Remove status
          currentStatuses.splice(statusIndex, 1);
          newStatuses = currentStatuses;
        } else {
          // Add status
          newStatuses = [...currentStatuses, data.status];
        }

        const updated = await prisma.token.update({
          where: { id: data.tokenId },
          data: { status: JSON.stringify(newStatuses) },
        });

        io.to(currentSessionId).emit('token_updated', {
          type: 'token_updated',
          token: {
            id: updated.id,
            boardId: updated.boardId,
            ownerId: updated.ownerId,
            name: updated.name,
            imageUrl: updated.imageUrl,
            x: updated.x,
            y: updated.y,
            size: updated.size,
            visible: updated.visible,
            locked: updated.locked,
            status: updated.status || '',
            layer: (updated.layer || 'tokens') as 'tokens' | 'tiles' | 'objects',
            properties: updated.properties as Record<string, unknown>,
          },
        });
      } catch (error) {
        console.error('Toggle token status error:', error);
      }
    });

    // Set token layer
    socket.on('set_token_layer', async (data: { tokenId: string; layer: 'tokens' | 'tiles' | 'objects' }) => {
      if (!currentUser || !currentSessionId) return;

      const sessionState = sessions.get(currentSessionId);
      if (!sessionState) return;

      try {
        const token = await prisma.token.findUnique({ where: { id: data.tokenId } });
        if (!token) return;

        // Check permission - GM or token owner can modify
        if (token.ownerId !== currentUser.userId && !isGM(sessionState, currentUser.userId)) {
          socket.emit('error', { type: 'error', code: 'PERMISSION_DENIED', message: 'Cannot update this token' });
          return;
        }

        const updated = await prisma.token.update({
          where: { id: data.tokenId },
          data: { layer: data.layer },
        });

        io.to(currentSessionId).emit('token_updated', {
          type: 'token_updated',
          token: {
            id: updated.id,
            boardId: updated.boardId,
            ownerId: updated.ownerId,
            name: updated.name,
            imageUrl: updated.imageUrl,
            x: updated.x,
            y: updated.y,
            size: updated.size,
            visible: updated.visible,
            locked: updated.locked,
            status: updated.status || '',
            layer: (updated.layer || 'tokens') as 'tokens' | 'tiles' | 'objects',
            properties: updated.properties as Record<string, unknown>,
          },
        });
      } catch (error) {
        console.error('Set token layer error:', error);
      }
    });

    // Reveal fog
    socket.on('reveal_fog', async (data: { boardId: string; polygon: number[][] }) => {
      if (!currentUser || !currentSessionId) return;

      const sessionState = sessions.get(currentSessionId);
      if (!sessionState || !isGM(sessionState, currentUser.userId)) {
        socket.emit('error', { type: 'error', code: 'PERMISSION_DENIED', message: 'Only GM can reveal fog' });
        return;
      }

      try {
        const reveal = await prisma.fogReveal.create({
          data: {
            boardId: data.boardId,
            polygon: data.polygon,
            createdBy: currentUser.userId,
          },
        });

        io.to(currentSessionId).emit('fog_revealed', {
          type: 'fog_revealed',
          reveal: {
            id: reveal.id,
            boardId: reveal.boardId,
            polygon: reveal.polygon as number[][],
            createdBy: reveal.createdBy,
            createdAt: reveal.createdAt,
          },
        });
      } catch (error) {
        console.error('Reveal fog error:', error);
      }
    });

    // Hide fog (remove a reveal)
    socket.on('hide_fog', async (data: { revealId: string }) => {
      if (!currentUser || !currentSessionId) return;

      const sessionState = sessions.get(currentSessionId);
      if (!sessionState || !isGM(sessionState, currentUser.userId)) {
        socket.emit('error', { type: 'error', code: 'PERMISSION_DENIED', message: 'Only GM can hide fog' });
        return;
      }

      try {
        await prisma.fogReveal.delete({ where: { id: data.revealId } });

        io.to(currentSessionId).emit('fog_hidden', {
          type: 'fog_hidden',
          revealId: data.revealId,
        });
      } catch (error) {
        console.error('Hide fog error:', error);
      }
    });

    // Add fog (cover area - erase)
    socket.on('add_fog', async (data: { boardId: string; polygon: number[][] }) => {
      if (!currentUser || !currentSessionId) return;

      const sessionState = sessions.get(currentSessionId);
      if (!sessionState || !isGM(sessionState, currentUser.userId)) {
        socket.emit('error', { type: 'error', code: 'PERMISSION_DENIED', message: 'Only GM can add fog' });
        return;
      }

      try {
        const fogAdd = await prisma.fogAdd.create({
          data: {
            boardId: data.boardId,
            polygon: data.polygon,
            createdBy: currentUser.userId,
          },
        });

        io.to(currentSessionId).emit('fog_added', {
          type: 'fog_added',
          fogAdd: {
            id: fogAdd.id,
            boardId: fogAdd.boardId,
            polygon: fogAdd.polygon as number[][],
            createdBy: fogAdd.createdBy,
            createdAt: fogAdd.createdAt,
          },
        });
      } catch (error) {
        console.error('Add fog error:', error);
      }
    });

    // Remove fog add (undo erase)
    socket.on('remove_fog_add', async (data: { fogAddId: string }) => {
      if (!currentUser || !currentSessionId) return;

      const sessionState = sessions.get(currentSessionId);
      if (!sessionState || !isGM(sessionState, currentUser.userId)) {
        socket.emit('error', { type: 'error', code: 'PERMISSION_DENIED', message: 'Only GM can remove fog' });
        return;
      }

      try {
        await prisma.fogAdd.delete({ where: { id: data.fogAddId } });

        io.to(currentSessionId).emit('fog_add_removed', {
          type: 'fog_add_removed',
          fogAddId: data.fogAddId,
        });
      } catch (error) {
        console.error('Remove fog add error:', error);
      }
    });

    // Clear all fog
    socket.on('clear_fog', async (data: { boardId: string }) => {
      if (!currentUser || !currentSessionId) return;

      const sessionState = sessions.get(currentSessionId);
      if (!sessionState || !isGM(sessionState, currentUser.userId)) {
        socket.emit('error', { type: 'error', code: 'PERMISSION_DENIED', message: 'Only GM can clear fog' });
        return;
      }

      try {
        await prisma.fogReveal.deleteMany({ where: { boardId: data.boardId } });

        io.to(currentSessionId).emit('fog_cleared', {
          type: 'fog_cleared',
          boardId: data.boardId,
        });
      } catch (error) {
        console.error('Clear fog error:', error);
      }
    });

    // Chat message
    socket.on('chat_message', async (data: { text: string; isPrivate?: boolean; isBlindGM?: boolean; isSelfRoll?: boolean }) => {
      if (!currentUser || !currentSessionId) return;

      try {
        const message = await prisma.chatMessage.create({
          data: {
            sessionId: currentSessionId,
            userId: currentUser.userId,
            text: data.text,
            isPrivate: data.isPrivate || false,
            isBlindGM: data.isBlindGM || false,
            isSelfRoll: data.isSelfRoll || false,
          },
        });

        // Get the user's role in the session
        const sessionState = getSessionState(currentSessionId);
        const senderRole = sessionState ? getUserRole(sessionState, currentUser.userId) : 'player';
        const senderIsGM = senderRole === 'gm';

        // Build the message object with username
        const messageWithUsername = {
          id: message.id,
          sessionId: message.sessionId,
          userId: message.userId,
          username: currentUser.username,
          text: message.text,
          timestamp: message.timestamp,
          isPrivate: message.isPrivate,
          isBlindGM: message.isBlindGM,
          isSelfRoll: message.isSelfRoll,
        };

        // Broadcast based on visibility settings
        if (message.isPrivate) {
          // GM Only: send only to GM
          let gmSocketId: string | undefined;
          if (sessionState) {
            for (const player of sessionState.players.values()) {
              if (player.role === 'gm') {
                gmSocketId = player.socketId;
                break;
              }
            }
          }
          if (gmSocketId) {
            io.to(gmSocketId).emit('chat_message', {
              type: 'chat_message',
              message: messageWithUsername,
            });
          }
        } else if (message.isBlindGM) {
          // Blind GM: send to everyone except GM and sender
          let gmSocketId: string | undefined;
          if (sessionState) {
            for (const player of sessionState.players.values()) {
              if (player.role === 'gm') {
                gmSocketId = player.socketId;
                break;
              }
            }
          }
          
          // Get all sockets in the room except GM's and sender's
          const roomSockets = io.sockets.adapter.rooms.get(currentSessionId);
          if (roomSockets) {
            roomSockets.forEach(socketId => {
              // Skip GM and sender
              if (socketId !== gmSocketId && socketId !== socket.id) {
                io.to(socketId).emit('chat_message', {
                  type: 'chat_message',
                  message: messageWithUsername,
                });
              }
            });
          }
        } else if (message.isSelfRoll) {
          // Self Only: send only back to the sender
          socket.emit('chat_message', {
            type: 'chat_message',
            message: messageWithUsername,
          });
        } else {
          // Public: send to everyone
          io.to(currentSessionId).emit('chat_message', {
            type: 'chat_message',
            message: messageWithUsername,
          });
        }
      } catch (error) {
        console.error('Chat message error:', error);
      }
    });

    socket.on('dice_roll_prepare_request', async (data: { payload: DiceRollPrepareRequest }) => {
      if (!currentUser || !currentSessionId || !data?.payload) return;

      try {
        const payload = data.payload;
        const prepared = createPreparedRoll({
          sessionId: currentSessionId,
          userId: currentUser.userId,
          username: currentUser.username,
          payload,
        });

        const preparedKey = buildPreparedRollKey(currentSessionId, payload.requestId);
        preparedRolls.set(preparedKey, prepared);

        const preparedPayload: DiceRollPrepareResult = {
          requestId: prepared.requestId,
          formula: prepared.formula,
          visibility: prepared.visibility,
          source: prepared.source,
          canonicalResult: {
            dice: prepared.rolled.dice,
            total: prepared.rolled.total,
          },
          determinism: prepared.determinism,
          preparedAt: prepared.preparedAt,
          expiresAt: prepared.expiresAt,
        };

        socket.emit('dice_roll_prepared', {
          type: 'dice_roll_prepared',
          payload: preparedPayload,
        });
      } catch (error) {
        console.error('Dice roll prepare error:', error);
        socket.emit('error', {
          type: 'error',
          code: 'ROLL_PREPARE_FAILED',
          message: 'Failed to prepare deterministic roll',
        });
      }
    });

    socket.on('dice_roll_finalize_request', async (data: { payload: DiceRollFinalizeRequest }) => {
      if (!currentUser || !currentSessionId || !data?.payload?.requestId) return;

      try {
        const requestId = data.payload.requestId;
        const preparedKey = buildPreparedRollKey(currentSessionId, requestId);
        const prepared = preparedRolls.get(preparedKey);

        if (!prepared || prepared.userId !== currentUser.userId || prepared.sessionId !== currentSessionId) {
          socket.emit('error', {
            type: 'error',
            code: 'ROLL_FINALIZE_NOT_FOUND',
            message: 'No prepared roll found for finalize request',
          });
          return;
        }

        if (prepared.expiresAt.getTime() < Date.now()) {
          preparedRolls.delete(preparedKey);
          socket.emit('error', {
            type: 'error',
            code: 'ROLL_FINALIZE_EXPIRED',
            message: 'Prepared roll expired before finalize',
          });
          return;
        }

        preparedRolls.delete(preparedKey);

        await finalizePreparedRoll({
          io,
          socket,
          sessionId: currentSessionId,
          userId: currentUser.userId,
          username: currentUser.username,
          prepared,
          telemetry: data.payload.telemetry,
        });
      } catch (error) {
        console.error('Dice roll finalize error:', error);
        socket.emit('error', {
          type: 'error',
          code: 'ROLL_FINALIZE_FAILED',
          message: 'Failed to finalize deterministic roll',
        });
      }
    });

    socket.on('dice_roll_request', async (data: { payload: DiceRollRequest }) => {
      if (!currentUser || !currentSessionId || !data?.payload) return;

      try {
        const clientResult = data.payload.clientResult;
        let prepared: PreparedAuthoritativeRoll;

        if (clientResult && Array.isArray(clientResult.dice) && clientResult.dice.length > 0 && Number.isFinite(clientResult.total)) {
          const preparedAt = new Date();
          prepared = {
            requestId: data.payload.requestId,
            sessionId: currentSessionId,
            userId: currentUser.userId,
            username: currentUser.username,
            formula: data.payload.formula,
            source: data.payload.source,
            visibility: data.payload.visibility,
            rolled: {
              dice: clientResult.dice,
              total: clientResult.total,
            },
            determinism: {
              algorithmVersion: 'sha256-seq-v1',
              seedCommitment: 'legacy-client-result',
              rollNonce: data.payload.requestId,
              canonicalHash: buildCanonicalHash({
                formula: data.payload.formula,
                rolled: {
                  dice: clientResult.dice,
                  total: clientResult.total,
                },
              }),
            },
            preparedAt,
            expiresAt: new Date(preparedAt.getTime() + 15_000),
          };
        } else {
          prepared = createPreparedRoll({
            sessionId: currentSessionId,
            userId: currentUser.userId,
            username: currentUser.username,
            payload: {
              requestId: data.payload.requestId,
              formula: data.payload.formula,
              visibility: data.payload.visibility,
              source: data.payload.source,
            },
          });
        }

        await finalizePreparedRoll({
          io,
          socket,
          sessionId: currentSessionId,
          userId: currentUser.userId,
          username: currentUser.username,
          prepared,
        });
      } catch (error) {
        console.error('Dice roll request error:', error);
        socket.emit('error', {
          type: 'error',
          code: 'ROLL_FAILED',
          message: 'Failed to roll dice',
        });
      }
    });

    // Profile image update - broadcast to all players in session
    socket.on('profile_image_update', (data: { userId: string; imageUrl: string }) => {
      if (!currentUser || !currentSessionId) return;

      const sessionState = getSessionState(currentSessionId);
      const imageUrl = data.imageUrl?.trim();

      if (!sessionState || !imageUrl) return;

      sessionState.playerProfileImages[currentUser.userId] = imageUrl;

      console.log('[Server] Profile image update:', {
        userId: currentUser.userId,
        imageUrl,
      });

      // Broadcast to all players in the session using the authenticated user id
      io.to(currentSessionId).emit('profile_image_update', {
        type: 'profile_image_update',
        userId: currentUser.userId,
        imageUrl,
      });
    });

    // Add token control for player
    socket.on('add_token_control', async (data: { playerId: string; tokenId: string }) => {
      if (!currentUser || !currentSessionId) return;
      
      try {
        const session = await prisma.session.findUnique({
          where: { id: currentSessionId },
          include: { players: true }
        });
        if (!session) return;

        const isGM = session.gmId === currentUser.userId;
        if (!isGM) {
          socket.emit('error', { type: 'error', code: 'PERMISSION_DENIED', message: 'Only GM can add token control' });
          return;
        }

        const player = session.players.find((p: any) => p.userId === data.playerId);
        if (!player) return;

        const controlledTokens: string[] = player.controlledTokens || [];
        if (!controlledTokens.includes(data.tokenId)) {
          controlledTokens.push(data.tokenId);
        }

        await prisma.sessionPlayer.update({
          where: { sessionId_userId: { sessionId: currentSessionId, userId: data.playerId } },
          data: { controlledTokens }
        });

        // Broadcast updated player info
        const updatedPlayers = await prisma.sessionPlayer.findMany({
          where: { sessionId: currentSessionId },
          include: { user: true }
        });

        const sessionState = sessions.get(currentSessionId);
        
        io.to(currentSessionId).emit('state_sync', {
          type: 'state_sync',
          state: {
            session,
            players: updatedPlayers.map((p: any) => ({
              userId: p.userId,
              username: p.user.username,
              role: p.role as 'gm' | 'player',
              joinedAt: p.joinedAt,
              playerColor: p.playerColor,
              controlledTokens: p.controlledTokens,
              isOnline: sessionState?.players.has(p.userId) || false,
            })),
            currentBoard: null,
            tokens: [],
            fogReveals: [],
            chatMessages: []
          }
        });
      } catch (error) {
        console.error('Error adding token control:', error);
      }
    });

    // Remove token control from player
    socket.on('remove_token_control', async (data: { playerId: string; tokenId: string }) => {
      if (!currentUser || !currentSessionId) return;
      
      try {
        const session = await prisma.session.findUnique({
          where: { id: currentSessionId },
          include: { players: true }
        });
        if (!session) return;

        const isGM = session.gmId === currentUser.userId;
        if (!isGM) {
          socket.emit('error', { type: 'error', code: 'PERMISSION_DENIED', message: 'Only GM can remove token control' });
          return;
        }

        const player = session.players.find((p: any) => p.userId === data.playerId);
        if (!player) return;

        const controlledTokens: string[] = player.controlledTokens || [];
        const newControlledTokens = controlledTokens.filter(id => id !== data.tokenId);

        await prisma.sessionPlayer.update({
          where: { sessionId_userId: { sessionId: currentSessionId, userId: data.playerId } },
          data: { controlledTokens: newControlledTokens }
        });

        // Broadcast updated player info
        const updatedPlayers = await prisma.sessionPlayer.findMany({
          where: { sessionId: currentSessionId },
          include: { user: true }
        });

        io.to(currentSessionId).emit('state_sync', {
          type: 'state_sync',
          state: {
            session,
            players: updatedPlayers.map((p: any) => ({
              userId: p.userId,
              username: p.user.username,
              role: p.role as 'gm' | 'player',
              joinedAt: p.joinedAt,
              playerColor: p.playerColor,
              controlledTokens: p.controlledTokens,
            })),
            currentBoard: null,
            tokens: [],
            fogReveals: [],
            chatMessages: []
          }
        });
      } catch (error) {
        console.error('Error removing token control:', error);
      }
    });

    // Update time settings (GM only)
    socket.on('update_time_settings', async (data: { 
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
    }) => {
      if (!currentUser || !currentSessionId) return;
      
      const sessionState = sessions.get(currentSessionId);
      if (!sessionState || !isGM(sessionState, currentUser.userId)) {
        socket.emit('error', { type: 'error', code: 'PERMISSION_DENIED', message: 'Only GM can update time settings' });
        return;
      }

      try {
        const session = await prisma.session.findUnique({ where: { id: currentSessionId } });
        if (!session) return;

        const currentSettings = session.settings as any;
        console.log('[handlers.ts] updateTimeSettings - data received:', JSON.stringify(data));
        console.log('[handlers.ts] currentSettings.atmosphericFog:', currentSettings.atmosphericFog);
        const newSettings = {
          ...currentSettings,
          gameTimeSeconds: data.gameTimeSeconds ?? currentSettings.gameTimeSeconds ?? 28800,
          timeOverlayEnabled: data.timeOverlayEnabled ?? currentSettings.timeOverlayEnabled ?? true,
          timeOverlayOpacity: data.timeOverlayOpacity ?? currentSettings.timeOverlayOpacity ?? 0.7,
          atmosphericFog: data.atmosphericFog ?? currentSettings.atmosphericFog ?? false,
          fogEnabled: data.fogEnabled ?? currentSettings.fogEnabled ?? true,
          fogIntensity: data.fogIntensity ?? currentSettings.fogIntensity ?? 0.3,
          fogSpeed: data.fogSpeed ?? currentSettings.fogSpeed ?? 1.0,
          fogShift: data.fogShift ?? currentSettings.fogShift ?? 1.6,
          fogDirection: data.fogDirection ?? currentSettings.fogDirection ?? 180,
          fogColor1: data.fogColor1 ?? currentSettings.fogColor1 ?? '#776f85',
          fogColor2: data.fogColor2 ?? currentSettings.fogColor2 ?? '#353645',
          // God Ray settings
          godRayEnabled: data.godRayEnabled ?? currentSettings.godRayEnabled ?? false,
          godRayAngle: data.godRayAngle ?? currentSettings.godRayAngle ?? -45,
          godRayLacunarity: data.godRayLacunarity ?? currentSettings.godRayLacunarity ?? 2.0,
          godRayIntensity: data.godRayIntensity ?? currentSettings.godRayIntensity ?? 1.0,
        };

        await prisma.session.update({
          where: { id: currentSessionId },
          data: { settings: newSettings },
        });

        // Broadcast to all clients in the session - only include settings that were actually changed
        const broadcastData: any = {
          type: 'time_settings_updated',
        };
        
        // Only include settings that were in the original request
        if (data.gameTimeSeconds !== undefined) broadcastData.gameTimeSeconds = newSettings.gameTimeSeconds;
        if (data.timeOverlayEnabled !== undefined) broadcastData.timeOverlayEnabled = newSettings.timeOverlayEnabled;
        if (data.timeOverlayOpacity !== undefined) broadcastData.timeOverlayOpacity = newSettings.timeOverlayOpacity;
        if (data.atmosphericFog !== undefined) broadcastData.atmosphericFog = newSettings.atmosphericFog;
        if (data.fogEnabled !== undefined) broadcastData.fogEnabled = newSettings.fogEnabled;
        if (data.fogIntensity !== undefined) broadcastData.fogIntensity = newSettings.fogIntensity;
        if (data.fogSpeed !== undefined) broadcastData.fogSpeed = newSettings.fogSpeed;
        if (data.fogShift !== undefined) broadcastData.fogShift = newSettings.fogShift;
        if (data.fogDirection !== undefined) broadcastData.fogDirection = newSettings.fogDirection;
        if (data.fogColor1 !== undefined) broadcastData.fogColor1 = newSettings.fogColor1;
        if (data.fogColor2 !== undefined) broadcastData.fogColor2 = newSettings.fogColor2;
        if (data.godRayEnabled !== undefined) broadcastData.godRayEnabled = newSettings.godRayEnabled;
        if (data.godRayAngle !== undefined) broadcastData.godRayAngle = newSettings.godRayAngle;
        if (data.godRayLacunarity !== undefined) broadcastData.godRayLacunarity = newSettings.godRayLacunarity;
        if (data.godRayIntensity !== undefined) broadcastData.godRayIntensity = newSettings.godRayIntensity;
        
        io.to(currentSessionId).emit('time_settings_updated', broadcastData);
      } catch (error) {
        console.error('Error updating time settings:', error);
        socket.emit('error', { type: 'error', code: 'UPDATE_FAILED', message: 'Failed to update time settings' });
      }
    });

    // Disconnect
    socket.on('disconnect', async () => {
      console.log(`Client disconnected: ${socket.id}`);

      if (currentUser && currentSessionId) {
        const sessionState = sessions.get(currentSessionId);
        if (sessionState) {
          sessionState.players.delete(currentUser.userId);

          // Notify others about player going offline
          socket.to(currentSessionId).emit('player_online_status', {
            type: 'player_online_status',
            userId: currentUser.userId,
            isOnline: false,
          });

          // Also notify about player leaving
          socket.to(currentSessionId).emit('player_left', {
            type: 'player_left',
            userId: currentUser.userId,
          });

          // Clean up empty sessions
          if (sessionState.players.size === 0) {
            sessions.delete(currentSessionId);
          }
        }
      }

      connectedUsers.delete(socket.id);
    });
  });
}
