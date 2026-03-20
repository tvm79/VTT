# Online Virtual Tabletop (VTT) - Staged Development Roadmap

**Version:** 1.0  
**Document Type:** Technical Architecture & Implementation Plan  
**Target Audience:** Senior Engineers, Technical Leads, Project Managers  
**Assumptions:** Web-based, real-time multiplayer, browser-first, system-agnostic, modular architecture

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Architecture Overview](#technical-architecture-overview)
3. [Technology Stack Recommendations](#technology-stack-recommendations)
4. [State Synchronization Model](#state-synchronization-model)
5. [Stage 1: Core Board Functionality](#stage-1-core-board-functionality)
6. [Stage 2: Character Systems & Game Mechanics](#stage-2-character-systems--game-mechanics)
7. [Stage 3: Advanced Gameplay Features](#stage-3-advanced-gameplay-features)
8. [Stage 4: Content & Extensibility](#stage-4-content--extensibility)
9. [Stage 5: Scale & Production Readiness](#stage-5-scale--production-readiness)
10. [Directory Structure](#directory-structure)
11. [Timeline Estimates](#timeline-estimates)
12. [Cost Considerations](#cost-considerations)
13. [Tradeoffs Analysis](#tradeoffs-analysis)

---

## Executive Summary

This roadmap defines a five-stage development plan for building a production-ready Online Virtual Tabletop (VTT) from scratch. Each stage builds incrementally on the previous, with clear exit criteria and realistic timelines.

**Key Design Principles:**
- **Server-authoritative** for critical game state (prevents desync and cheating)
- **Event-driven architecture** for loose coupling between systems
- **Modular design** allowing future extensibility without refactoring
- **Rendering-game logic separation** for testability and cross-platform support
- **Progressive complexity** - each stage is shippable and adds tangible value

**Target Metrics:**
- Initial capacity: 4-8 concurrent players per session
- Long-term target: 1000+ concurrent sessions
- Latency target: <100ms for real-time interactions
- Browser-first, desktop primary, mobile optional

---

## Technical Architecture Overview

### Architectural Layers

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Application                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   UI Layer  │  │  Renderer   │  │  Client State      │  │
│  │   (React)   │  │  (Canvas/   │  │  (Zustand/Jotai)   │  │
│  │             │  │   WebGL)    │  │                    │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                          │ WebSocket / Binary Protocol
┌──────────────────────────┴──────────────────────────────────┐
│                      Server Platform                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Gateway   │  │   Game      │  │  Session Manager    │  │
│  │   (WS)      │  │   Engine    │  │  (Room-based)       │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Auth      │  │  Rule       │  │  Event Bus          │  │
│  │   Service   │  │  Engine     │  │  (Redis Pub/Sub)    │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                          │
┌──────────────────────────┴──────────────────────────────────┐
│                       Data Layer                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  PostgreSQL │  │   Redis     │  │   Object Storage    │  │
│  │  (Sessions, │  │  (State,    │  │   (Images, Assets)  │  │
│  │   Users)    │  │   Cache)    │  │                     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Core Architectural Decisions

1. **Server-Authoritative Model**: Server maintains canonical game state; clients send actions, receive state updates
2. **Room-Based Sessions**: Each game session is an isolated "room" with its own state
3. **Event-Sourced State**: All state changes recorded as events for replay/debugging
4. **Stateless Game Servers**: Session state in Redis; servers can be horizontally scaled

---

## Technology Stack Recommendations

### Frontend Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| UI Framework | React 18+ | Ecosystem, component model, SSR optional |
| State Management | Zustand | Minimal boilerplate, derived state, TypeScript |
| Canvas Rendering | PixiJS | 2D WebGL acceleration, good performance |
| Alternative Renderer | Konva.js | Simpler API, good for basic 2D |
| Real-time Client | Socket.io-client | Fallback support, reconnection logic |
| Alternative | Native WebSocket + custom protocol | Lower overhead for binary data |
| Build Tool | Vite | Fast HMR, optimized builds |
| Testing | Vitest + Playwright | Unit + E2E coverage |

### Backend Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Runtime | Node.js 20+ LTS | JavaScript everywhere, event-driven |
| WebSocket Server | Socket.io | Room abstraction, fallback transports |
| Alternative | uWebSockets.js | Higher performance, Node.js native |
| API Server | Fastify | Lower overhead than Express, TypeScript |
| Database | PostgreSQL 15+ | ACID compliance, JSON support |
| Cache/State | Redis 7+ | Pub/Sub, session state, rate limiting |
| ORM | Prisma | Type-safe, migrations, good DX |
| Object Storage | S3-compatible (MinIO local) | Asset hosting |
| Message Queue | Redis Streams | Event processing |

### Infrastructure (Production)

| Component | Recommendation |
|-----------|---------------|
| Container Orchestration | Kubernetes (EKS/GKE) |
| Load Balancer | AWS ALB / CloudFlare |
| CDN | CloudFlare / AWS CloudFront |
| Monitoring | Prometheus + Grafana |
| Logging | ELK Stack / Datadog |
| CI/CD | GitHub Actions + ArgoCD |

---

## State Synchronization Model

### Comparison: Authoritative Server vs Peer-to-Peer

| Aspect | Server-Authoritative | Peer-to-Peer (P2P) |
|--------|---------------------|-------------------|
| **Consistency** | Strong (single source of truth) | Eventual (conflict resolution needed) |
| **Cheat Resistance** | High (server validates all actions) | Low (trust clients) |
| **Latency** | Higher (round-trip) | Lower (direct) |
| **Scalability** | Requires more server resources | Client resources scale |
| **Host Requirements** | Dedicated server needed | Host is peer |
| **State Recovery** | Easy (server state) | Complex (reconciliation) |
| **Implementation** | Moderate | Complex |

### Recommendation: Server-Authoritative with Client Prediction

For VTT specifically:
- **Use authoritative server** for game state (positions, dice rolls, permissions)
- **Client-side prediction** for smooth local movement (immediate feedback)
- **Server reconciliation** to correct desyncs
- **Optimistic updates** for non-critical actions

### Protocol Comparison

| Protocol | Latency | Reliability | Complexity | Use Case |
|----------|---------|-------------|------------|----------|
| WebSocket | ~50ms | TCP (ordered) | Low | Primary game sync |
| WebRTC DataChannel | ~20ms | UDP (unreliable mode) | High | P2P optional |
| HTTP Long Polling | ~200ms | HTTP | Low | Fallback only |
| Server-Sent Events | ~100ms | HTTP | Low | Non-critical updates |

**Recommendation:** WebSocket as primary protocol with Socket.io for abstraction and fallback handling.

---

## Stage 1: Core Board Functionality (Foundational VTT)

**Timeline:** 4-6 weeks  
**Goal:** Minimum viable board with real-time multiplayer sync

### 1.1 Objectives

- Establish foundational multiplayer architecture
- Implement real-time board rendering with grid overlay
- Enable token creation and movement with sync
- Define GM/Player permission model
- Basic fog of war functionality
- Session creation and joining

### 1.2 Core Features

| Feature | Description | Priority |
|---------|-------------|----------|
| Session Management | Create/join/list sessions with room codes | P0 |
| Map Upload | Upload background images (PNG, JPG, WebP) | P0 |
| Grid Overlay | Square grid with configurable size | P0 |
| Hex Grid | Optional hexagonal grid support | P1 |
| Token Creation | Create tokens from uploaded images | P0 |
| Token Movement | Drag-drop with real-time sync | P0 |
| Role System | GM (full control) vs Player (limited) | P0 |
| Fog of War | Manual reveal by GM (painter algorithm) | P1 |
| Basic Chat | Text chat within session | P1 |

### 1.3 Technical Architecture

```
Client (Browser)
├── Canvas Renderer (PixiJS)
│   ├── GridLayer
│   ├── BackgroundLayer
│   ├── TokenLayer
│   └── FogLayer
├── State Store (Zustand)
└── WebSocket Client

Server (Node.js)
├── Session Manager (in-memory)
├── State Engine (event-sourced)
├── Auth Middleware
└── File Upload Handler
```

**Key Components:**

1. **SessionManager**: Handles room creation, player join/leave, maintains participant list
2. **StateEngine**: Applies actions to game state, emits state updates
3. **CanvasRenderer**: Renders board, tokens, grid, fog using PixiJS
4. **SyncProtocol**: WebSocket messages for position updates, state diffs

### 1.4 Data Model Design

```sql
-- Core tables for Stage 1
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    gm_id UUID REFERENCES users(id),
    room_code VARCHAR(8) UNIQUE NOT NULL,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE session_players (
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'player', -- 'gm', 'player'
    PRIMARY KEY (session_id, user_id)
);

CREATE TABLE boards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    name VARCHAR(100),
    background_url TEXT,
    grid_size INTEGER DEFAULT 50,
    grid_type VARCHAR(20) DEFAULT 'square', -- 'square', 'hex'
    width INTEGER DEFAULT 2000,
    height INTEGER DEFAULT 2000,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
    owner_id UUID REFERENCES users(id),
    name VARCHAR(100),
    image_url TEXT,
    x INTEGER DEFAULT 0,
    y INTEGER DEFAULT 0,
    size INTEGER DEFAULT 1, -- grid cells
    visible BOOLEAN DEFAULT TRUE,
    locked BOOLEAN DEFAULT FALSE,
    properties JSONB DEFAULT '{}'
);

CREATE TABLE fog_reveals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
    polygon JSONB NOT NULL, -- Array of [x,y] points
    created_by UUID REFERENCES users(id)
);
```

### 1.5 Networking Model

**WebSocket Message Types:**

```typescript
// Client -> Server
type ClientMessage =
  | { type: 'join_session'; sessionId: string; userId: string }
  | { type: 'move_token'; tokenId: string; x: number; y: number }
  | { type: 'create_token'; boardId: string; token: TokenData }
  | { type: 'reveal_fog'; points: number[][] }
  | { type: 'hide_fog' }
  | { type: 'chat_message'; text: string };

// Server -> Client
type ServerMessage =
  | { type: 'state_sync'; state: GameState }
  | { type: 'token_moved'; tokenId: string; x: number; y: number }
  | { type: 'token_created'; token: Token }
  | { type: 'player_joined'; userId: string; username: string }
  | { type: 'player_left'; userId: string }
  | { type: 'chat_message'; userId: string; text: string; timestamp: number }
  | { type: 'error'; code: string; message: string };
```

**Sync Strategy:**
- On join: Full state sync
- During play: Delta updates (optimized with checksums)
- Token movement: Immediate local prediction, server reconciliation
- State diff algorithm: JSON Patch (RFC 6902)

### 1.6 Persistence Strategy

| Data | Storage | Sync |
|------|---------|------|
| User accounts | PostgreSQL | On registration/login |
| Session metadata | PostgreSQL | On create/close |
| Board state | PostgreSQL + Redis | In-memory for active sessions |
| Token positions | In-memory (Redis) | Real-time WebSocket |
| Chat history | PostgreSQL | Last 100 messages in-memory |
| Fog state | In-memory | Real-time, not persisted |
| Assets (images) | Object storage (S3) | On upload |

### 1.7 Security Considerations

1. **Authentication:** JWT-based auth with refresh tokens
2. **Room codes:** 8-character alphanumeric, rate-limited generation
3. **Input validation:** Server-side validation for all coordinates/positions
4. **File uploads:** Max 10MB, allowed types only (image/*), virus scanning
5. **Rate limiting:** 100 requests/minute per user, WebSocket message throttling
6. **Permission checks:** Every action validated against user role
7. **SQL injection:** Parameterized queries via Prisma
8. **XSS:** Sanitize chat messages, escape user content

### 1.8 UI/UX Scope

**Layout:**
```
┌──────────────────────────────────────────────────────────┐
│  Header: Logo | Session Name | Players | Settings         │
├────────────┬─────────────────────────────────────────────┤
│            │                                              │
│  Sidebar   │           Main Canvas (Board)               │
│  - Boards  │                                              │
│  - Tokens  │                                              │
│  - Players │                                              │
│            │                                              │
├────────────┴─────────────────────────────────────────────┤
│  Chat Panel (collapsible)                                │
└──────────────────────────────────────────────────────────┘
```

**Key Screens:**
1. **Home/Dashboard:** List user's sessions, create new session
2. **Session Lobby:** Wait for players, configure settings, start
3. **Game Board:** Main play area with canvas
4. **Token Creator:** Upload image, set properties

### 1.9 Risks & Scaling Concerns

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| WebSocket disconnects | High | Medium | Auto-reconnect with state reconciliation |
| Latency issues | Medium | High | Client-side prediction, delta compression |
| State desync | Medium | High | Checksum validation, force-sync mechanism |
| Large file uploads | Low | Medium | Size limits, async processing |
| Concurrent session limits | Low | High | Horizontal scaling design from start |

**Initial Capacity:** 50 concurrent sessions per server (4-8 players each)

### 1.10 Exit Criteria

- [ ] Users can register, login, and manage accounts
- [ ] GMs can create sessions and generate room codes
- [ ] Players can join sessions via room code
- [ ] Background images can be uploaded and displayed
- [ ] Square grid overlay renders correctly with configurable size
- [ ] Tokens can be created, positioned, and moved
- [ ] Token movement syncs to all players in <100ms
- [ ] GM can reveal/hide fog areas manually
- [ ] Basic text chat works within sessions
- [ ] GM/Player roles correctly restrict actions
- [ ] Session state persists across page reloads
- [ ] Basic performance: 60fps with 50 tokens on screen

---

## Stage 2: Character Systems & Game Mechanics Layer

**Timeline:** 4-6 weeks  
**Goal:** Character sheets, dice rolling, initiative tracking, extensible stats

### 2.1 Objectives

- Implement flexible character sheet system
- Create server-authoritative dice rolling
- Build initiative tracker
- Add HP tracking and conditions
- Enable token-character binding
- Create extensible stats framework

### 2.2 Core Features

| Feature | Description | Priority |
|---------|-------------|----------|
| Character Sheets | Create/edit character data with custom fields | P0 |
| Stats Framework | Customizable stat schema (str, dex, etc.) | P0 |
| Dice Rolling | Server-authoritative dice (d4-d100, custom) | P0 |
| Dice History | Log of all rolls with timestamps | P1 |
| Initiative Tracker | Turn-based initiative order | P0 |
| HP Tracking | Current/max HP with temp HP | P0 |
| Conditions | Status effects (poisoned, stunned, etc.) | P1 |
| Token Binding | Link tokens to character sheets | P0 |
| Chat Dice Commands | `/roll 2d6+3` syntax in chat | P1 |

### 2.3 Technical Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Server Extensions                        │
│  ┌─────────────────┐  ┌──────────────────────────────────┐ │
│  │  Dice Engine    │  │  Character Service               │ │
│  │  - RNG (crypto) │  │  - CRUD operations               │ │
│  │  - Roll parsing │  │  - Stat validation              │ │
│  │  - Formula eval  │  │  - Custom field types           │ │
│  └─────────────────┘  └──────────────────────────────────┘ │
│  ┌─────────────────┐  ┌──────────────────────────────────┐ │
│  │  Initiative     │  │  Condition Manager               │ │
│  │  Tracker       │  │  - Apply/remove effects           │ │
│  │  - Turn order  │  │  - Duration tracking              │ │
│  │  - Round count │  │  - Stack rules                    │ │
│  └─────────────────┘  └──────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 2.4 Data Model Design

```sql
-- Character system tables
CREATE TABLE characters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    owner_id UUID REFERENCES users(id),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    avatar_url TEXT,
    stats JSONB DEFAULT '{}', -- Custom stat key-value pairs
    derived_stats JSONB DEFAULT '{}', -- Computed from base stats
    hp_current INTEGER,
    hp_max INTEGER,
    hp_temp INTEGER DEFAULT 0,
    conditions JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE character_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    field_type VARCHAR(20) NOT NULL, -- 'number', 'text', 'boolean', 'select'
    default_value JSONB,
    options JSONB, -- For select type: ["option1", "option2"]
    is_required BOOLEAN DEFAULT FALSE,
    display_order INTEGER DEFAULT 0
);

-- Dice rolling
CREATE TABLE dice_rolls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    character_id UUID REFERENCES characters(id),
    roller_id UUID REFERENCES users(id),
    formula VARCHAR(100) NOT NULL,
    result INTEGER NOT NULL,
    breakdown JSONB NOT NULL, -- [{die: "2d6", rolls: [3, 5], total: 8}]
    visibility VARCHAR(20) DEFAULT 'public', -- 'public', 'gm_only', 'private'
    created_at TIMESTAMP DEFAULT NOW()
);

-- Initiative
CREATE TABLE initiative_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    turn_order INTEGER NOT NULL,
    character_id UUID REFERENCES characters(id),
    initiative_modifier INTEGER,
    initiative_roll INTEGER,
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Token-Character binding
ALTER TABLE tokens ADD COLUMN character_id UUID REFERENCES characters(id);
```

### 2.5 Networking Model

```typescript
// New message types
type CharacterMessage =
  | { type: 'create_character'; character: CharacterData }
  | { type: 'update_character'; characterId: string; updates: Partial<CharacterData> }
  | { type: 'delete_character'; characterId: string }
  | { type: 'bind_token'; tokenId: string; characterId: string }
  | { type: 'roll_dice'; formula: string; characterId?: string; visibility: Visibility }
  | { type: 'update_hp'; characterId: string; hp: number; type: 'damage' | 'healing' | 'temp' }
  | { type: 'add_condition'; characterId: string; condition: string; duration?: number }
  | { type: 'remove_condition'; characterId: string; condition: string }
  | { type: 'next_initiative' }
  | { type: 'start_encounter' }
  | { type: 'clear_encounter' }
  | { type: 'sort_initiative' };

// Server responses
type CharacterResponse =
  | { type: 'character_created'; character: Character }
  | { type: 'character_updated'; character: Character }
  | { type: 'roll_result'; rollId: string; formula: string; result: number; breakdown: RollBreakdown[]; rolledBy: string }
  | { type: 'initiative_order'; entries: InitiativeEntry[] }
  | { type: 'active_turn'; characterId: string; round: number };
```

### 2.6 Dice Engine Design

```typescript
// Server-side dice roller
interface DiceEngine {
  // Parse roll string: "2d6+1d8+5" -> parsed structure
  parse(formula: string): ParsedDice;
  
  // Roll with cryptographic RNG
  roll(formula: string, seed?: Buffer): RollResult;
  
  // Validate formula (sanitize)
  validate(formula: string): boolean;
}

// Supported syntax
// - Basic: 2d6, 1d20, 4d4
// - Modifiers: +5, -2, *2
// - Advantage/Disadvantage: 2d20kh1 (keep highest), 2d20kl1 (keep lowest)
// - Exploding: 6d6! (reroll on max)
// - Compound: (2d6+3)*2
```

### 2.7 Persistence Strategy

| Data | Storage | Notes |
|------|---------|-------|
| Characters | PostgreSQL | Full CRUD, long-term storage |
| Character fields | PostgreSQL | Session-scoped schemas |
| Dice rolls | PostgreSQL | Full history per session |
| Initiative state | Redis | Real-time, cleared on session end |
| Active conditions | Redis | Fast updates, persisted on save |

### 2.8 Security Considerations

1. **Dice RNG:** Use Node.js `crypto.randomInt()` for server-side rolls
2. **Formula validation:** Whitelist allowed characters, block function calls
3. **HP modifications:** Validate bounds (can't go below 0 unless rules allow)
4. **Character ownership:** Only owner/GM can modify characters
5. **Private rolls:** GM-only rolls not visible to players
6. **Rate limiting:** Max 30 dice rolls per minute per user

### 2.9 UI/UX Scope

**Character Sheet Panel:**
- Tabbed interface: Stats | HP | Conditions | Notes
- Inline editing with auto-save
- Collapsible sections

**Dice Roller UI:**
- Quick dice buttons (d4, d6, d8, d10, d12, d20, d100)
- Custom formula input
- Roll history sidebar
- Click to expand breakdown

**Initiative Panel:**
- Floating panel (dockable)
- Drag-to-reorder
- Current turn highlight
- Round counter

### 2.10 Risks & Scaling Concerns

| Risk | Impact | Mitigation |
|------|--------|------------|
| Complex stat formulas | High | Sandbox evaluation, simple AST parser |
| Character data bloat | Medium | Pagination, lazy loading |
| Dice roll spam | Medium | Rate limiting, cooldown UI |
| Concurrent initiative edits | Medium | Server-authoritative turn management |

### 2.11 Exit Criteria

- [ ] Characters can be created with custom fields
- [ ] Stats are customizable per session (not hardcoded)
- [ ] Dice rolling works via UI buttons and chat commands
- [ ] Dice rolls are server-authoritative with verified results
- [ ] Roll history is viewable by session participants
- [ ] Initiative tracker manages turn order
- [ ] HP can be modified with damage/healing
- [ ] Conditions can be added/removed from characters
- [ ] Tokens can be linked to character sheets
- [ ] GM-only rolls are hidden from players
- [ ] Character data persists across sessions

---

## Stage 3: Advanced Gameplay Features

**Timeline:** 6-8 weeks  
**Goal:** Dynamic lighting, vision, layers, measured movement, AOE templates, macros

### 3.1 Objectives

- Implement dynamic lighting system with vision
- Create layered map architecture
- Build measured movement with pathfinding
- Add area-of-effect templates
- Implement macro system
- Create reusable asset library

### 3.2 Core Features

| Feature | Description | Priority |
|---------|-------------|----------|
| Dynamic Lighting | Light sources with falloff, ambient darkness | P0 |
| Vision System | Token vision cones, line-of-sight calculation | P0 |
| Layered Maps | Background/Object/Token/Lighting layers | P0 |
| Measured Movement | Distance calculation, path templates | P0 |
| AOE Templates | Circle, cone, rectangle, line templates | P1 |
| Macro System | Recordable/reusable action sequences | P1 |
| Asset Library | Reusable images, tokens, maps | P1 |
| Drawing Tools | Freehand, shapes, lines on map | P1 |

### 3.3 Technical Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Rendering Pipeline                        │
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │  Background │ -> │   Objects   │ -> │   Tokens    │     │
│  │   Layer     │    │   Layer     │    │   Layer     │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│         │                                    │              │
│         v                                    v              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Lighting / Vision Pass                 │    │
│  │  - Calculate light sources                          │    │
│  │  - Apply vision masks                               │    │
│  │  - Composite final frame                           │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 3.4 Layer Architecture

```typescript
interface MapLayer {
  id: string;
  name: string;
  type: 'background' | 'object' | 'token' | 'lighting' | 'drawing';
  visible: boolean;
  locked: boolean;
  opacity: number;
  objects: MapObject[];
}

interface MapObject {
  id: string;
  type: 'image' | 'shape' | 'text' | 'drawing';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  layerId: string;
  properties: Record<string, unknown>;
}
```

### 3.5 Dynamic Lighting System

```typescript
interface LightSource {
  id: string;
  tokenId?: string; // Attached to token
  x: number;
  y: number;
  radius: number; // Light radius
  dimRadius: number; // Dim light radius
  color: string; // Hex color
  intensity: number; // 0-1
  isActive: boolean;
}

// Server-side lighting calculation
// 1. Collect all active light sources
// 2. Calculate light polygon for each (accounting for obstacles)
// 3. Merge polygons
// 4. Send visibility mask to client

// Client-side rendering
// 1. Draw scene normally
// 2. Render lighting mask (black overlay with light cutouts)
// 3. Apply vision reveal from fog
// 4. Composite final image
```

### 3.6 Vision System

```typescript
interface VisionSource {
  tokenId: string;
  distance: number; // Vision distance
  type: 'normal' | 'blind' | 'truesight';
  angle?: number; // For vision cones
  direction?: number; // Facing direction
}

// Line-of-sight calculation
// - Raycasting from token to all edge points
// - Check intersection with blocking objects
// - Build visible polygon
```

### 3.7 Data Model Design

```sql
-- Enhanced board with layers
ALTER TABLE boards ADD COLUMN layers JSONB DEFAULT '[]';

CREATE TABLE map_layers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    layer_type VARCHAR(20) NOT NULL,
    display_order INTEGER NOT NULL,
    is_visible BOOLEAN DEFAULT TRUE,
    is_locked BOOLEAN DEFAULT FALSE,
    opacity REAL DEFAULT 1.0
);

CREATE TABLE map_objects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    layer_id UUID REFERENCES map_layers(id) ON DELETE CASCADE,
    object_type VARCHAR(20) NOT NULL,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    width INTEGER,
    height INTEGER,
    rotation REAL DEFAULT 0,
    properties JSONB DEFAULT '{}'
);

-- Lighting
CREATE TABLE light_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
    token_id UUID REFERENCES tokens(id) ON DELETE SET NULL,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    radius INTEGER DEFAULT 60,
    dim_radius INTEGER DEFAULT 30,
    color VARCHAR(7) DEFAULT '#ffffff',
    intensity REAL DEFAULT 1.0,
    is_active BOOLEAN DEFAULT TRUE
);

-- Macros
CREATE TABLE macros (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    owner_id UUID REFERENCES users(id),
    name VARCHAR(50) NOT NULL,
    actions JSONB NOT NULL, -- Array of macro actions
    icon_url TEXT,
    is_global BOOLEAN DEFAULT FALSE
);

-- Asset library
CREATE TABLE assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    name VARCHAR(100) NOT NULL,
    asset_type VARCHAR(20) NOT NULL, -- 'image', 'token', 'map'
    url TEXT NOT NULL,
    tags JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

-- AOE Templates (stored as temporary state, not persisted)
interface AOETemplate {
  type: 'circle' | 'cone' | 'rectangle' | 'line';
  x: number;
  y: number;
  size: number; // Radius for circle, length for line
  angle?: number; // Direction for cone/line
  originX: number;
  originY: number;
}
```

### 3.8 Measured Movement

```typescript
interface MovementMeasurement {
  // Distance calculation
  calculateDistance(from: Point, to: Point, gridType: GridType): number;
  
  // Pathfinding (simple A*)
  findPath(from: Point, to: Point, obstacles: Obstacle[]): Point[];
  
  // Template measurements
  measureTemplate(template: AOETemplate): Point[]; // Affected cells
  
  // Snap to grid options
  type: 'none' | 'center' | 'corner' | 'edge';
  diagonalRule: '1-1-1' | '1-1-2' | 'Euclidean';
}
```

### 3.9 Performance Optimizations

1. **Spatial Indexing:** Use Quadtree for efficient point/region queries
2. **Vision Caching:** Cache vision calculations, only recalculate on move
3. **Level of Detail:** Reduce lighting detail for distant tokens
4. **Web Workers:** Offload vision/lighting calculations to separate thread
5. **Canvas Optimization:** Use dirty rect rendering, not full redraws

```typescript
// Quadtree for spatial queries
class SpatialIndex<T> {
  insert(bounds: Rect, item: T): void;
  query(bounds: Rect): T[];
  queryRadius(center: Point, radius: number): T[];
}
```

### 3.10 UI/UX Scope

**Layer Panel:**
- Drag-to-reorder layers
- Eye icon for visibility toggle
- Lock icon for edit lock
- Opacity slider per layer

**Lighting Controls:**
- Light source list with radius sliders
- Color picker for light color
- Ambient light setting (0-100%)
- Day/night cycle toggle

**Tools Toolbar:**
- Select tool
- Token tool
- Drawing tools
- Measure tool
- AOE template tool
- Vision/light tool

**Macro Panel:**
- Macro list with icons
- Drag to reorder
- Right-click to edit/delete
- Hotkey assignment

### 3.11 Exit Criteria

- [ ] Maps support multiple layers with independent visibility/lock
- [ ] Objects can be placed on any layer
- [ ] Dynamic lighting renders with smooth falloff
- [ ] Tokens have working vision systems
- [ ] Blocking objects affect line-of-sight
- [ ] Distance measurement works with grid snapping
- [ ] AOE templates can be placed and visualized
- [ ] Macros can be created, saved, and executed
- [ ] Asset library allows uploading and re-using images
- [ ] Performance: 60fps with 20+ active light sources
- [ ] Drawing tools allow basic shapes and freehand

---

## Stage 4: Content & Extensibility

**Timeline:** 6-8 weeks  
**Goal:** Module system, plugins, API, marketplace architecture

### 4.1 Objectives

- Create modular plugin architecture
- Implement ruleset plugins
- Build developer API for custom systems
- Design marketplace-ready infrastructure
- Implement campaign save/load
- Add version management and migration

### 4.2 Core Features

| Feature | Description | Priority |
|---------|-------------|----------|
| Module System | Load/unload game modules at runtime | P0 |
| Ruleset Plugins | Game system definitions (D&D, Pathfinder, etc.) | P0 |
| Plugin API | Public API for third-party developers | P0 |
| Campaign Manager | Save/load full campaign state | P1 |
| Version Migration | Handle data migrations across versions | P1 |
| Asset Marketplace | Architecture for buying/selling content | P2 |
| Content Templates | Pre-built characters, maps, macros | P1 |

### 4.3 Module Architecture

```typescript
// Plugin manifest
interface ModuleManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  dependencies: string[]; // Other module IDs
  entryPoint: string;
  permissions: string[]; // Required permissions
  
  // Hooks provided by module
  hooks: {
    onCharacterCreate?: (char: Character) => void;
    onRollDice?: (roll: Roll) => Roll;
    onDamage?: (target: Character, damage: Damage) => void;
    getStatModifiers?: (character: Character, stat: string) => number;
  };
  
  // Custom content
  characterFields?: CharacterFieldDef[];
  conditions?: ConditionDef[];
  macros?: MacroDef[];
  assets?: AssetDef[];
}

// Module loader (server-side)
class ModuleLoader {
  loadModule(manifest: ModuleManifest, code: string): Module;
  unloadModule(moduleId: string): void;
  getModule(moduleId: string): Module;
  listModules(): ModuleManifest[];
}
```

### 4.4 Ruleset Plugin Structure

```typescript
interface RulesetPlugin {
  // System identification
  systemName: string;
  version: string;
  
  // Character schema
  characterSchema: z.ZodSchema; // Validation schema
  defaultStats: Record<string, number>;
  defaultHP: { formula: string };
  
  // Dice rules
  diceModifiers: {
    [key: string]: (roll: Roll, context: RollContext) => number;
  };
  
  // Condition definitions
  conditions: ConditionDefinition[];
  
  // Combat rules
  initiativeFormula: string; // "d20 + dex_mod"
  acFormula: string; // "10 + dex_mod"
  
  // Export/import
  exportCharacter(char: Character): ExportData;
  importCharacter(data: ExportData): Character;
}

// Example: D&D 5e ruleset
const dnd5eRuleset: RulesetPlugin = {
  systemName: "D&D 5th Edition",
  version: "1.0.0",
  
  characterSchema: z.object({
    name: z.string(),
    level: z.number().min(1).max(20),
    class: z.enum(['fighter', 'wizard', 'rogue', ...]),
    stats: z.object({
      strength: z.number().min(1).max(30),
      dexterity: z.number().min(1).max(30),
      // ...
    }),
    // ...
  }),
  
  defaultStats: { strength: 10, dexterity: 10, ... },
  defaultHP: { formula: "8 + con_mod" },
  
  diceModifiers: {
    attack: (roll, ctx) => ctx.proficiency + ctx.abilityMod,
    damage: (roll, ctx) => ctx.abilityMod,
  },
  
  conditions: [
    { name: 'Blinded', description: '...', duration: 'until end of turn' },
    // ...
  ],
  
  initiativeFormula: "d20 + dex_mod",
  acFormula: "10 + dex_mod",
};
```

### 4.5 Public API Design

```typescript
// Exposed API for plugins
interface VTTAPI {
  // Character operations
  characters: {
    create(data: CharacterData): Promise<Character>;
    get(id: string): Promise<Character>;
    update(id: string, data: Partial<CharacterData>): Promise<Character>;
    delete(id: string): Promise<void>;
    list(sessionId: string): Promise<Character[]>;
  };
  
  // Dice operations
  dice: {
    roll(formula: string, options?: RollOptions): Promise<RollResult>;
  };
  
  // Session operations
  session: {
    getState(): GameState;
    broadcast(event: string, data: unknown): void;
    getPlayers(): Player[];
  };
  
  // UI extensions
  ui: {
    registerPanel(panel: UIPanel): void;
    registerTool(tool: ToolDef): void;
    registerSidebar(tab: SidebarTab): void;
  };
  
  // Hooks
  hooks: {
    register(hook: string, callback: Function): void;
    unregister(hook: string, callback: Function): void;
  };
}

// Plugin registration
function vttPlugin(api: VTTAPI, config: PluginConfig) {
  api.hooks.register('onCharacterCreate', (char) => {
    // Custom logic
  });
  
  api.ui.registerTool({
    id: 'my-custom-tool',
    name: 'Custom Tool',
    icon: 'sword',
    onActivate: () => { /* ... */ }
  });
}
```

### 4.6 Campaign Management

```typescript
// Campaign export format
interface CampaignExport {
  version: string;
  exportedAt: string;
  ruleset?: string;
  sessions: SessionExport[];
  characters: CharacterExport[];
  assets: AssetReference[];
  modules: string[];
  metadata: {
    name: string;
    description: string;
    author: string;
  };
}

// Campaign import/export flow
class CampaignManager {
  export(campaignId: string): Promise<CampaignExport>;
  import(data: CampaignExport, options?: ImportOptions): Promise<string>;
  migrate(data: CampaignExport, targetVersion: string): CampaignExport;
}
```

### 4.7 Data Model Design

```sql
-- Modules/Plugins
CREATE TABLE modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    version VARCHAR(20) NOT NULL,
    author VARCHAR(100),
    description TEXT,
    manifest JSONB NOT NULL,
    code TEXT, -- Or URL to hosted code
    is_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE module_dependencies (
    module_id UUID REFERENCES modules(id) ON DELETE CASCADE,
    depends_on UUID REFERENCES modules(id) ON DELETE CASCADE,
    PRIMARY KEY (module_id, depends_on)
);

-- Campaigns
CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    owner_id UUID REFERENCES users(id),
    ruleset_id UUID REFERENCES modules(id),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE campaign_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    session_order INTEGER NOT NULL,
    session_id UUID REFERENCES sessions(id),
    PRIMARY KEY (campaign_id, session_order)
);

-- Plugin API keys (for marketplace)
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    key_hash VARCHAR(255) NOT NULL,
    permissions JSONB DEFAULT '[]',
    last_used TIMESTAMP,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### 4.8 Security Considerations

1. **Plugin Sandboxing:** Run plugins in isolated context (VM2 or dedicated workers)
2. **API Rate Limiting:** Per-plugin limits to prevent abuse
3. **Code Signing:** Require signed modules for marketplace
4. **Permission Model:** Plugins declare required permissions at install
5. **Data Isolation:** Plugins can only access their own data
6. **Audit Logging:** All plugin actions logged for review

### 4.9 UI/UX Scope

**Module Manager:**
- Browse available modules
- Enable/disable modules
- Configure module settings
- Dependency resolution UI

**Developer Console:**
- Plugin editor with syntax highlighting
- API documentation viewer
- Test console for API calls
- Error logs and debugging

**Marketplace (Architecture):**
- Module listings with ratings
- Version history
- Changelog display
- Installation count

### 4.10 Exit Criteria

- [ ] Modules can be loaded and unloaded at runtime
- [ ] Ruleset plugins define character schemas
- [ ] Plugin API allows character/dice/session manipulation
- [ ] UI can be extended with custom panels and tools
- [ ] Campaigns can be exported to single file
- [ ] Campaigns can be imported with version migration
- [ ] Plugin marketplace architecture is in place
- [ ] Content templates (characters, maps) are importable
- [ ] Third-party developers can build extensions
- [ ] Version safety: migrations are reversible

---

## Stage 5: Scale & Production Readiness

**Timeline:** 6-8 weeks  
**Goal:** Horizontal scaling, production hardening, monitoring, anti-cheat

### 5.1 Objectives

- Implement horizontal scaling architecture
- Build session orchestration and matchmaking
- Optimize WebSocket handling
- Implement load balancing
- Add comprehensive monitoring
- Harden security
- Implement rate limiting and anti-cheat

### 5.2 Core Features

| Feature | Description | Priority |
|---------|-------------|----------|
| Horizontal Scaling | Stateless game servers, distributed state | P0 |
| Session Orchestration | Matchmaking, server assignment | P0 |
| Load Balancing | Distribute player connections | P0 |
| Sharding | Database sharding by session/user | P1 |
| Monitoring | Metrics, alerts, dashboards | P0 |
| Anti-Cheat | Client validation, anomaly detection | P1 |
| Rate Limiting | Per-user, per-action limits | P0 |
| Disaster Recovery | Backups, failover, multi-region | P1 |

### 5.3 Horizontal Scaling Architecture

```
                        ┌─────────────────┐
                        │   CDN / Edge     │
                        └────────┬────────┘
                                 │
                        ┌────────▼────────┐
                        │ Load Balancer   │
                        │ (ALB/CloudFlare)│
                        └────────┬────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        │                        │                        │
┌───────▼───────┐        ┌───────▼───────┐        ┌───────▼───────┐
│  API Server   │        │  API Server   │        │  API Server   │
│   (Web)       │        │   (Web)       │        │   (Web)       │
└───────┬───────┘        └───────┬───────┘        └───────┬───────┘
        │                        │                        │
        │                        │                        │
┌───────▼───────┐        ┌───────▼───────┐        ┌───────▼───────┐
│   Game Node   │        │   Game Node   │        │   Game Node   │
│   (WS)        │        │   (WS)        │        │   (WS)        │
└───────────────┘        └───────────────┘        └───────────────┘
        │                        │                        │
        └────────────────────────┼────────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │    Redis Cluster        │
                    │  (State, Pub/Sub, Cache)│
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   PostgreSQL Cluster    │
                    │   (Primary + Replicas)  │
                    └─────────────────────────┘
```

### 5.4 Session Orchestration

```typescript
// Service discovery and session routing
interface SessionOrchestrator {
  // Find or create session server
  findServer(sessionId: string): Promise<GameServerInfo>;
  
  // Create new session with optimal server
  createSession(options: SessionOptions): Promise<SessionInfo>;
  
  // Migrate session to different server (for load balancing)
  migrateSession(sessionId: string, targetServer: string): Promise<void>;
  
  // Get server metrics for load balancing decisions
  getServerMetrics(): ServerMetrics[];
}

// Server selection algorithm
class LoadBalancer {
  selectServer(criteria: SessionCriteria): GameServerInfo {
    const servers = this.getHealthyServers();
    
    // Filter by region preference
    const regionServers = servers.filter(s => s.region === criteria.preferredRegion);
    const candidates = regionServers.length > 0 ? regionServers : servers;
    
    // Select least loaded
    return candidates.sort((a, b) => a.load - b.load)[0];
  }
}
```

### 5.5 WebSocket Optimization

1. **Binary Protocol:** Use Protocol Buffers or MessagePack instead of JSON
2. **Compression:** Enable WebSocket compression (permessage-deflate)
3. **Heartbeat Optimization:** Adaptive heartbeat intervals
4. **Connection Pooling:** Reuse connections where possible
5. **Message Batching:** Batch updates in 16ms frames

```typescript
// Binary message format (MessagePack)
interface BinaryMessage {
  type: MessageType; // uint8
  payload: Buffer;
  timestamp: uint32;
  sequence: uint32;
}

// Example: Move token (compact)
const MoveTokenMessage = {
  type: 0x01, // MOVE_TOKEN
  encode: (tokenId: string, x: number, y: number) => {
    return Buffer.from([
      0x01, // type
      ...Buffer.from(tokenId), // 16 bytes UUID
      x >> 8, x & 0xFF, // x as uint16
      y >> 8, y & 0xFF  // y as uint16
    ]);
  }
};
```

### 5.6 Monitoring & Observability

```typescript
// Key metrics to track
const Metrics = {
  // System metrics
  cpuUsage: 'system.cpu.usage',
  memoryUsage: 'system.memory.usage',
  connectionCount: 'websocket.connections',
  messageRate: 'websocket.messages.per_second',
  
  // Game metrics
  activeSessions: 'game.sessions.active',
  playersOnline: 'game.players.online',
  averageLatency: 'game.latency.avg',
  diceRollsPerMinute: 'game.dice.rolls_per_min',
  
  // Business metrics
  newUsers: 'business.users.new',
  sessionsCreated: 'business.sessions.created',
  revenue: 'business.revenue.total',
};

// Alert rules
const AlertRules = [
  { metric: 'game.latency.p99', threshold: 200, duration: '5m', severity: 'warning' },
  { metric: 'websocket.connections', threshold: 10000, duration: '1m', severity: 'critical' },
  { metric: 'system.cpu.usage', threshold: 80, duration: '10m', severity: 'warning' },
];
```

### 5.7 Anti-Cheat System

```typescript
// Server-side validation
class AntiCheatEngine {
  // Validate dice rolls (server authoritative)
  validateRoll(userId: string, roll: DiceRoll): ValidationResult {
    // Check roll history for anomalies
    const history = this.getRollHistory(userId);
    const stats = this.calculateStats(history);
    
    // Statistical anomaly detection
    if (this.isStatisticallyImprobable(roll, stats)) {
      return { valid: false, reason: 'Anomalous roll pattern detected' };
    }
    
    return { valid: true };
  }
  
  // Validate movement
  validateMovement(token: Token, newPos: Point, context: MovementContext): boolean {
    const distance = this.calculateDistance(token.pos, newPos);
    const maxDistance = context.speed * context.timeElapsed;
    
    // Instant teleportation detection
    if (distance > maxDistance * 2) {
      this.flagSuspiciousActivity(token.ownerId, 'teleportation');
      return false;
    }
    
    return true;
  }
  
  // Rate limiting
  checkRateLimit(userId: string, action: string): boolean {
    const limit = this.getRateLimit(userId, action);
    const current = this.getActionCount(userId, action);
    return current < limit;
  }
}
```

### 5.8 Rate Limiting Configuration

```typescript
// Rate limit rules
const RateLimits = {
  // API endpoints
  'api:create_session': { window: '1m', limit: 10 },
  'api:join_session': { window: '1m', limit: 20 },
  
  // Game actions
  'game:move_token': { window: '1s', limit: 30 },
  'game:roll_dice': { window: '1m', limit: 60 },
  'game:chat_message': { window: '1s', limit: 5 },
  
  // Authentication
  'auth:login': { window: '5m', limit: 10 },
  'auth:register': { window: '1h', limit: 5 },
};
```

### 5.9 Database Sharding Strategy

```typescript
// Sharding by session (most common queries are within session)
function getShardKey(sessionId: string): number {
  const hash = crypto.createHash('sha256').update(sessionId).digest();
  return hash.readUInt16BE(0) % SHARD_COUNT;
}

// Sharding by user (for user-centric queries)
function getUserShardKey(userId: string): number {
  const hash = crypto.createHash('sha256').update(userId).digest();
  return hash.readUInt16BE(0) % SHARD_COUNT;
}

// Connection pool per shard
class ShardedConnectionPool {
  private pools: Map<number, Pool> = new Map();
  
  async query<T>(shardKey: number, sql: string, params: any[]): Promise<T> {
    const pool = this.pools.get(shardKey);
    return pool.query(sql, params);
  }
}
```

### 5.10 Disaster Recovery

1. **Database Backups:**
   - Full backup: Daily (retained 30 days)
   - Incremental: Every 6 hours
   - Point-in-time recovery enabled

2. **Multi-Region Strategy:**
   - Primary region: US-East
   - Failover region: US-West
   - Async replication with <1s RPO

3. **Failover Procedures:**
   - Health checks every 10 seconds
   - Automatic instance replacement
   - DNS failover with 30s TTL

### 5.11 Exit Criteria

- [ ] Game servers can scale horizontally behind load balancer
- [ ] Sessions are distributed across multiple servers
- [ ] Redis cluster handles session state and pub/sub
- [ ] PostgreSQL has read replicas for query scaling
- [ ] Binary protocol reduces message size by >50%
- [ ] Monitoring dashboards show real-time metrics
- [ ] Alerts trigger on threshold violations
- [ ] Anti-cheat detects and flags suspicious patterns
- [ ] Rate limiting prevents abuse
- [ ] Disaster recovery procedures are documented and tested
- [ ] CI/CD pipeline deploys to production
- [ ] Load testing validates 1000+ concurrent sessions

---

## Directory Structure

```
vtt/
├── client/                          # Frontend application
│   ├── src/
│   │   ├── components/              # React components
│   │   │   ├── board/               # Board rendering components
│   │   │   ├── ui/                  # Shared UI components
│   │   │   ├── panels/              # Side panels
│   │   │   └── tools/               # Tool components
│   │   ├── hooks/                   # Custom React hooks
│   │   ├── stores/                  # Zustand stores
│   │   ├── services/                # API/WebSocket clients
│   │   ├── rendering/               # Canvas rendering
│   │   │   ├── layers/              # Render layers
│   │   │   ├── lighting/            # Lighting calculations
│   │   │   └── effects/             # Visual effects
│   │   ├── utils/                   # Utility functions
│   │   ├── types/                   # TypeScript types
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── public/
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── server/                          # Backend application
│   ├── src/
│   │   ├── api/                     # REST API routes
│   │   │   ├── auth/
│   │   │   ├── sessions/
│   │   │   └── users/
│   │   ├── game/                    # Game logic
│   │   │   ├── engine/              # Core game engine
│   │   │   ├── state/               # State management
│   │   │   ├── dice/                # Dice rolling
│   │   │   ├── characters/          # Character system
│   │   │   ├── combat/              # Initiative/combat
│   │   │   ├── lighting/            # Vision/lighting
│   │   │   └── sync/                # State synchronization
│   │   ├── modules/                 # Plugin system
│   │   │   ├── loader.ts
│   │   │   ├── sandbox.ts
│   │   │   └── api.ts
│   │   ├── rulesets/               # Built-in rulesets
│   │   │   ├── dnd5e/
│   │   │   └── generic/
│   │   ├── services/                # External services
│   │   │   ├── auth.service.ts
│   │   │   ├── storage.service.ts
│   │   │   └── websocket.service.ts
│   │   ├── middleware/             # Express/Fastify middleware
│   │   ├── types/                   # TypeScript types
│   │   ├── utils/                   # Utility functions
│   │   ├── prisma/                  # Database schema
│   │   │   └── schema.prisma
│   │   └── index.ts                # Entry point
│   ├── package.json
│   └── tsconfig.json
│
├── shared/                          # Shared code between client/server
│   ├── types/                       # Shared TypeScript types
│   ├── constants/                   # Shared constants
│   └── utils/                       # Shared utilities
│
├── infrastructure/                 # Infrastructure as Code
│   ├── kubernetes/
│   │   ├── base/
│   │   ├── overlays/
│   │   └── production/
│   ├── terraform/
│   └── docker/
│
├── docs/                            # Documentation
│   ├── api/
│   ├── architecture/
│   └── guides/
│
├── scripts/                         # Build/deploy scripts
│
├── .github/                         # GitHub Actions workflows
│
├── README.md
├── package.json                     # Root package.json for monorepo
└── turbo.json                       # Turborepo configuration
```

---

## Timeline Estimates

| Stage | Duration | Key Milestones |
|-------|----------|----------------|
| **Stage 1** | 4-6 weeks | MVP - Playable board with multiplayer |
| **Stage 2** | 4-6 weeks | Character sheets, dice, initiative |
| **Stage 3** | 6-8 weeks | Lighting, vision, layers, macros |
| **Stage 4** | 6-8 weeks | Plugins, API, extensibility |
| **Stage 5** | 6-8 weeks | Production scaling, hardening |
| **Total** | **26-36 weeks** | Full production system |

### Phase Breakdown (Stage 1 Detail)

| Week | Focus | Deliverables |
|------|-------|---------------|
| 1 | Project setup, basic server | Auth system, WebSocket server setup |
| 2 | Board rendering | Canvas setup, grid rendering |
| 3 | Token system | Token CRUD, movement sync |
| 4 | Multiplayer sync | State synchronization, permissions |
| 5 | Fog of war, chat | Basic FoW, chat |
| 6 | Polish, testing | Bug fixes, performance optimization |

---

## Cost Considerations

### Development Phase (Estimated)

| Resource | Cost/Month | Notes |
|----------|------------|-------|
| Developer (1 senior) | $8,000-12,000 | Full-time |
| Developer (1 mid) | $5,000-8,000 | Full-time |
| Total Dev Cost | $13,000-20,000 | 2-person team |

### Infrastructure (Monthly - Production)

| Component | Small Scale | Medium Scale | Large Scale |
|-----------|-------------|--------------|-------------|
| **Compute** | | | |
| API Servers (4x t3.medium) | $200 | $400 | $800 |
| Game Servers (8x t3.large) | $400 | $800 | $1,600 |
| **Database** | | | |
| PostgreSQL (db.t3.medium) | $150 | $300 | $600 |
| Redis (cache.t3.medium) | $80 | $150 | $300 |
| **Storage & Network** | | | |
| S3 (100GB) | $20 | $50 | $100 |
| Data Transfer | $50 | $200 | $500 |
| CloudFlare | $20 | $50 | $100 |
| **Monitoring** | | | |
| Datadog | $50 | $100 | $200 |
| **Total/Month** | **~ $1,000** | **~ $2,100** | **~ $4,300** |

### Cost Optimization Strategies

1. **Spot Instances:** 60-70% savings for non-critical workers
2. **Reserved Instances:** 30-40% savings for baseline capacity
3. **Auto-scaling:** Scale to zero during off-hours if applicable
4. **CDN Caching:** Cache static assets aggressively
5. **Database Connection Pooling:** Reduce database costs

---

## Tradeoffs Analysis

### Build Custom vs. Use Frameworks

| Aspect | Custom Build | Framework (e.g., Fantasy Grounds) |
|--------|--------------|-----------------------------------|
| **Flexibility** | Full control, any feature | Limited by framework |
| **Development Time** | 6-9 months | 2-3 months (base) |
| **Cost** | High (dev time) | License + customization |
| **Learning Curve** | High (new systems) | Lower (existing knowledge) |
| **Maintenance** | Full responsibility | Vendor-maintained |
| **Ownership** | Complete | Partial (vendor lock-in) |
| **Monetization** | Keep all revenue | Revenue share often required |

### Recommended Approach

**Hybrid Strategy:**
1. Build custom core (Stages 1-3) for competitive advantage
2. Use proven libraries for commodity features:
   - **Socket.io** for WebSocket abstraction
   - **PixiJS** for rendering
   - **Prisma** for database
   - **React** for UI
3. Evaluate open-source VTT projects for reference:
   - Foundry VTT (excellent architecture)
   - Roll20 (web-native)
   - Owlbear Rodeo (modern, open-source)

### Key Tradeoffs Made in This Roadmap

1. **Server-Authoritative:** Chosen over P2P for consistency and anti-cheat, at cost of latency
2. **WebSocket over WebRTC:** Simpler implementation, adequate performance for VTT use case
3. **PostgreSQL over NoSQL:** ACID compliance more important than horizontal scaling for game state
4. **Binary Messages:** Added complexity for 50%+ bandwidth reduction
5. **Staged Development:** Slower time-to-market but cleaner architecture

---

## Appendix: Technology Selection Rationale

### Why PixiJS over Three.js?
- VTTs are primarily 2D; PixiJS is optimized for 2D rendering
- Simpler API for tile-based rendering
- Better performance for many sprites (tokens)
- WebGL backend with Canvas fallback

### Why Node.js over Go/Rust?
- Shared language (TypeScript) across stack
- Excellent WebSocket ecosystem (Socket.io)
- Faster development iteration
- Can optimize later with compiled modules if needed

### Why PostgreSQL over MongoDB?
- ACID compliance for financial/transactional data
- Complex queries for analytics
- Better JSON support (PostgreSQL 15+)
- Stronger data integrity model

### Why Redis for State?
- Sub-millisecond latency for real-time updates
- Pub/Sub for multi-server communication
- Built-in data structures (Sorted Sets for leaderboards)
- Persistence options (RDB + AOF)

---

*Document Version: 1.0*  
*Last Updated: 2026-03-01*  
*Authors: VTT Architecture Team*
