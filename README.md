# Virtual Tabletop (VTT)

A web-based virtual tabletop application for tabletop RPGs like Dungeons & Dragons.

## Features

- **Game Board**: Interactive canvas for placing tokens, maps, and game elements
- **Dice Roller**: Full dice support (d4, d6, d8, d10, d12, d20, d100)
- **Character Sheets**: Manage character data and stats
- **Combat Tracker**: Track initiative and combat encounters
- **Chat System**: In-game chat with dice roll sharing
- **Audio Environment**: Ambient sounds for different settings (cities, dungeons, forests, etc.)
- **Weather Effects**: Visual atmospheric effects (rain, snow, stars, etc.)
- **Token Management**: Place and manage game tokens on the board
- **Journal**: Keep track of notes and story elements
- **Macros**: Create custom action buttons

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Node.js + Express + Prisma
- **Database**: SQLite (development)
- **Real-time**: WebSocket for multiplayer sync

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Install root dependencies
npm install

# Install client dependencies
cd client && npm install

# Install server dependencies
cd ../server && npm install

# Set up environment variables
cp server/.env.example server/.env
```

### Running the Application

```bash
# Start the development server (from root)
npm run dev
```

The client will be available at `http://localhost:5173` and the server at `http://localhost:3000`.

## Project Structure

```
vtt/
├── client/          # React frontend
│   ├── src/
│   │   ├── components/   # UI components
│   │   ├── store/        # State management
│   │   └── utils/        # Utility functions
│   └── public/           # Static assets
├── server/          # Node.js backend
│   └── src/
│       ├── routes/       # API routes
│       ├── data/         # Game data (spells, items, etc.)
│       └── websocket/    # Real-time communication
├── shared/         # Shared types and utilities
└── plans/          # Development planning documents
```

## License

MIT
# VTT
# VTT
