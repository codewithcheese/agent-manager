# Agent Manager

A local-first Web UI for managing multiple agentic coding sessions across multiple GitHub repos. Each session runs in its own Docker sandbox, works on its own Git branch, and streams Claude Code Agent SDK messages to the UI via WebSockets.

## Features

- **Multi-repo support**: Manage multiple GitHub repositories from a single UI
- **Isolated sessions**: Each coding session runs in its own Docker container with a dedicated git worktree
- **Real-time streaming**: Watch agent activity live via WebSockets
- **Orchestrator mode**: Special per-repo coordinator session that can oversee other sessions
- **GitHub integration**: Branch links, compare views, and PR detection
- **Persistent history**: All events are stored in PostgreSQL for replay and analysis

## Tech Stack

- **Framework**: SvelteKit 2 with Svelte 5
- **Database**: PostgreSQL with Drizzle ORM
- **WebSocket**: sveltekit-ws for real-time communication
- **Styling**: Tailwind CSS
- **Testing**: Vitest with Playwright
- **Runtime**: Node.js with adapter-node

## Prerequisites

- **Node.js** 20+
- **PostgreSQL** database
- **Docker** Desktop (for agent containers)
- **GitHub CLI** (`gh`) installed and authenticated (`gh auth login`)
- **Claude credentials** in `~/.claude` (for Claude Code Agent SDK)

## Quick Start

### Option A: Docker Compose (Recommended)

The easiest way to run Agent Manager with PostgreSQL:

```sh
# Start all services
docker compose up --build

# Or run in background
docker compose up -d --build
```

This starts:
- **App**: http://localhost:3000
- **PostgreSQL**: localhost:5432 (user: `agent_manager`, password: `agent_manager`)

The database schema is automatically initialized on first startup. On subsequent starts, the schema is updated if needed.

To stop:
```sh
docker compose down
```

To stop and remove the database volume (resets all data):
```sh
docker compose down -v
```

### Option B: Manual Setup

#### 1. Install Dependencies

```sh
npm install
```

#### 2. Configure Environment

Copy the example environment file:

```sh
cp .env.example .env
```

Edit `.env` with your PostgreSQL connection string:

```
DATABASE_URL=postgresql://user:password@localhost:5432/agent_manager
```

#### 3. Set Up Database

Push the schema to your database:

```sh
npm run db:push
```

#### 4. Build Agent Container

```sh
cd docker
chmod +x build.sh
./build.sh
```

#### 5. Start Development Server

```sh
npm run dev
```

Open http://localhost:5173 in your browser.

## Configuration

Agent Manager can be configured via environment variables or a config file at `~/.agent-manager/config.json`.

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | - |
| `PORT` | Server port | 3000 |
| `WORKSPACE_ROOT` | Root for git mirrors/worktrees | `~/.agent-manager` |
| `CONTAINER_IMAGE` | Docker image for agent sessions | `agent-manager-sandbox:latest` |
| `IDLE_TIMEOUT_SECONDS` | Seconds before marking session idle | 30 |

### Config File

Create `~/.agent-manager/config.json`:

```json
{
  "databaseUrl": "postgres://localhost:5432/agent_manager",
  "port": 3000,
  "workspaceRoot": "~/.agent-manager",
  "containerImage": "agent-manager-sandbox:latest",
  "idleTimeoutSeconds": 30,
  "baseSystemPrompt": "Custom base system prompt..."
}
```

## Architecture

### On-Disk Layout

```
~/.agent-manager/
├── config.json              # Configuration file
├── repos/                   # Bare git mirrors
│   └── owner/
│       └── repo.git
└── worktrees/               # Session worktrees
    └── {sessionId}/
```

### Components

1. **SvelteKit App**: Serves UI, API routes, and WebSocket server
2. **Runner Module**: Manages git operations, Docker containers
3. **PostgreSQL**: Stores repos, sessions, and event streams
4. **Docker Containers**: Isolated agent execution environments

## API Reference

### Repos

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/repos` | GET | List all registered repos |
| `/api/repos` | POST | Register a new repo |
| `/api/repos/{id}` | GET | Get repo details with sessions |
| `/api/repos/{id}` | DELETE | Remove repo |
| `/api/repos/{id}/sessions` | GET | List sessions for repo |
| `/api/repos/{id}/sessions` | POST | Start new session |
| `/api/repos/github` | GET | List GitHub repos for selection |

### Sessions

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sessions/{id}` | GET | Get session details with events |
| `/api/sessions/{id}` | DELETE | Stop session |
| `/api/sessions/{id}/messages` | POST | Send message to session |
| `/api/sessions/{id}/events` | GET | Get session events (paginated) |

## WebSocket Protocol

Connect to `/ws` for real-time updates.

### Message Format

```typescript
interface WSMessage {
  v: 1;
  kind: 'event' | 'command' | 'ack' | 'error' | 'subscribe' | 'snapshot';
  sessionId: string | null;
  ts: string;  // ISO-8601
  seq: number;
  payload: object;
}
```

### Subscribing to Updates

```javascript
const ws = new WebSocket('ws://localhost:5173/ws');

// Subscribe to a session's events
ws.send(JSON.stringify({
  v: 1,
  kind: 'command',
  sessionId: null,
  ts: new Date().toISOString(),
  seq: 1,
  payload: {
    type: 'subscribe.session',
    sessionId: 'session-uuid'
  }
}));
```

## Session Lifecycle

### States

- **starting**: Worktree creation + container boot
- **running**: Agent actively producing events
- **waiting**: Agent idle, ready for user input
- **finished**: Agent exited normally
- **error**: Agent/container crashed
- **stopped**: User stopped the session

### Roles

- **Implementer**: Focused on code changes
- **Orchestrator**: Coordinates other sessions (one per repo)

## Development

### Running Tests

```sh
# Run all tests
npm test

# Watch mode
npm run test:unit

# Check types
npm run check
```

### Database Commands

```sh
npm run db:push      # Push schema to database
npm run db:generate  # Generate migrations
npm run db:migrate   # Run migrations
npm run db:studio    # Open Drizzle Studio
```

## Production

### Docker Compose (Recommended)

```sh
docker compose up -d --build
```

This runs the app with PostgreSQL. Data is persisted in a Docker volume. Database migrations run automatically on container startup.

### Manual Build

```sh
npm run build
node build
```

With custom port:
```sh
PORT=8080 node build
```

## Project Structure

```
src/
├── lib/
│   ├── components/       # Svelte components
│   ├── server/
│   │   ├── db/           # Database schema and connection
│   │   ├── runner/       # Git, GitHub, Docker modules
│   │   ├── websocket/    # WebSocket handlers
│   │   └── config.ts     # Configuration management
│   └── types/            # TypeScript types
├── routes/
│   ├── api/              # API endpoints
│   ├── repos/[id]/       # Repo detail page
│   ├── sessions/[id]/    # Session detail page
│   └── +page.svelte      # Home (repo list)
└── app.css               # Global styles

docker/
├── Dockerfile            # Agent container image
├── agent-entrypoint.sh   # Container entry script
├── agent-ws-client.js    # WebSocket client for containers
└── build.sh              # Build script
```

## Troubleshooting

### "GitHub CLI not authenticated"

Run `gh auth login` and follow the prompts.

### "Docker not available"

Ensure Docker Desktop is running.

### Session stuck in "starting"

Check Docker logs: `docker logs agent-session-{sessionId}`

### WebSocket connection failed

Ensure the server is running and accessible at the configured port.

## License

MIT
