# Agent Manager - Design Document

## Maintaining This Document

This document describes the architecture and design of Agent Manager. Keep it updated when making significant changes:

**When to update:**
- Adding or modifying API endpoints
- Changing database schema or data model
- Modifying container configuration or environment variables
- Updating WebSocket protocol or message formats
- Changing container components (entrypoint, agent runner)
- Modifying session lifecycle or state machine
- Updating deployment requirements or dependencies

**How to update:**
1. Find the relevant section(s) for your changes
2. Update technical details to match the implementation
3. Keep diagrams and code examples current
4. Update version requirements if dependencies change
5. Ensure consistency between related sections

**Relationship to other docs:**
- `README.md` - User-facing setup and usage instructions
- `CLAUDE.md` - AI assistant development guidelines
- `TESTING.md` - Testing strategy and practices
- `DESIGN.md` (this file) - Architecture and implementation details

---

## Overview

Agent Manager is a local-first Web UI for managing multiple agentic coding sessions across GitHub repositories. Each session runs in an isolated Docker container with a dedicated git worktree, streaming real-time Claude Code Agent SDK messages to the UI via WebSockets.

### Key Design Principles

1. **Local-First**: Runs entirely on developer machines, using local Docker and `gh` CLI authentication
2. **Session Isolation**: Each coding session gets its own Docker container and git worktree
3. **Real-Time Streaming**: WebSocket-based protocol for live event streaming between containers and UI
4. **Multi-Repo Management**: Single UI to manage multiple GitHub repositories and their sessions
5. **Orchestrator Pattern**: Optional orchestrator sessions for coordinating work across implementers

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Browser UI                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │  Repo List   │  │ Repo Detail  │  │    Session Timeline      │   │
│  │  (+modal)    │  │ (sessions)   │  │  (events + messaging)    │   │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────────┘
                             │ HTTP + WebSocket
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      SvelteKit Server                                │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────────┐   │
│  │   API Routes   │  │   WebSocket    │  │   Runner Modules     │   │
│  │  /api/repos    │  │   Handler      │  │  git | github |      │   │
│  │  /api/sessions │  │   Protocol     │  │  docker              │   │
│  └────────────────┘  └────────────────┘  └──────────────────────┘   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
┌──────────────────┐ ┌──────────────┐ ┌────────────────────────────┐
│   PostgreSQL     │ │  Git Repos   │ │     Docker Containers      │
│                  │ │              │ │                            │
│  repos           │ │  ~/.agent-   │ │  ┌────────────────────┐   │
│  sessions        │ │  manager/    │ │  │  Session Container │   │
│  events          │ │  repos/      │ │  │  ┌──────────────┐  │   │
│                  │ │  worktrees/  │ │  │  │ Claude Code  │  │   │
└──────────────────┘ └──────────────┘ │  │  │   + Agent    │  │   │
                                      │  │  └──────────────┘  │   │
                                      │  │  ┌──────────────┐  │   │
                                      │  │  │  WS Client   │  │   │
                                      │  │  └──────────────┘  │   │
                                      │  └────────────────────┘   │
                                      └────────────────────────────┘
```

---

## Data Model

### Database Schema

The application uses PostgreSQL with Drizzle ORM. Three core tables store all persistent state:

#### `repos` Table

Stores registered GitHub repository references.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key (auto-generated) |
| `owner` | text | Repository owner/organization |
| `name` | text | Repository name |
| `defaultBranch` | text | Default branch (default: 'main') |
| `createdAt` | timestamp | When repo was registered |
| `updatedAt` | timestamp | Last modification time |
| `lastActivityAt` | timestamp | Last session activity |

#### `sessions` Table

Stores agent session state and container metadata.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `repoId` | UUID | Foreign key to repos (cascade delete) |
| `role` | enum | 'implementer' or 'orchestrator' |
| `status` | enum | Session lifecycle state |
| `branchName` | text | Git branch for this session |
| `baseBranch` | text | Branch used as starting point |
| `worktreePath` | text | Filesystem path to worktree |
| `containerId` | text | Docker container ID |
| `createdAt` | timestamp | Session start time |
| `updatedAt` | timestamp | Last update time |
| `finishedAt` | timestamp | When session ended (nullable) |
| `lastEventId` | bigint | Reference to latest event |
| `lastKnownHeadSha` | text | Latest git commit SHA |
| `lastKnownPrUrl` | text | Cached PR URL for branch |

**Session Status Values:**
- `starting` - Container and worktree being provisioned
- `running` - Agent actively working
- `waiting` - Agent idle, awaiting user input
- `finished` - Work completed successfully
- `error` - Session failed
- `stopped` - User-terminated

#### `events` Table

Append-only log of all session events for replay and debugging.

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigserial | Auto-incrementing primary key |
| `sessionId` | UUID | Foreign key to sessions (cascade delete) |
| `ts` | timestamp | Event timestamp |
| `source` | enum | 'claude', 'runner', or 'manager' |
| `type` | text | Event type identifier |
| `payload` | jsonb | Event-specific data |

**Event Sources:**
- `claude` - Messages from Claude Code SDK
- `runner` - Container lifecycle events
- `manager` - Server-side events

### Entity Relationships

```
repos (1) ────────< (N) sessions
sessions (1) ────────< (N) events
```

---

## Git Strategy

### Bare Mirror + Worktrees

The application uses a two-layer git strategy for efficient session isolation:

#### 1. Bare Mirrors

Each registered repository has a bare mirror stored locally:

```
~/.agent-manager/repos/{owner}/{repo}.git
```

**Operations:**
- Created on first session start via `git clone --bare --mirror`
- Updated via `git fetch --prune origin` before each session
- Shared across all sessions for the same repository
- Minimal disk space (no working files)

#### 2. Session Worktrees

Each session gets an isolated worktree:

```
~/.agent-manager/worktrees/{sessionId}/
```

**Operations:**
- Created via `git worktree add -b {branchName} {path} origin/{baseBranch}`
- Branch naming: `agent/{repoName}/{shortSessionId}`
- Full working directory with all files
- Independent git state from other sessions
- Removed when session is stopped or cleaned up

### Benefits

1. **Fast Session Startup**: No need to clone entire repo for each session
2. **Disk Efficiency**: Single mirror shared across sessions
3. **Branch Isolation**: Each session works on independent branch
4. **Clean Cleanup**: Worktree removal doesn't affect mirror or other sessions

---

## Container Sandboxing

### Docker Container Design

Each session runs in an isolated Docker container with controlled resources:

#### Container Configuration

```dockerfile
Image: agent-manager-sandbox:latest
Base: node:22-slim

Resources:
  - Memory: 4GB limit
  - CPU: 2 cores limit

Mounts:
  - /workspace ← session worktree (read-write)
  - /home/agent/.claude ← Claude config (read-only)

Environment:
  - AGENT_MANAGER_URL: WebSocket endpoint
  - SESSION_ID: Session UUID
  - GH_TOKEN: GitHub authentication
  - AGENT_ROLE: implementer|orchestrator
  - GOAL_PROMPT: Initial task description
  - CLAUDE_MODEL: Model to use (sonnet, opus, haiku)
```

#### Container Lifecycle

```
1. Start Container
   ├── Docker run with env vars and mounts
   ├── agent-entrypoint.sh executes
   ├── Git credentials configured
   ├── WebSocket client started
   └── Claude Code launched

2. Running
   ├── Claude Code processes tasks
   ├── Events streamed via WebSocket
   ├── Heartbeats sent every 30s
   └── Idle detection after 30s inactivity

3. Shutdown
   ├── User stop OR agent completion
   ├── Container stopped gracefully (10s timeout)
   ├── Worktree optionally cleaned up
   └── Session marked as stopped/finished
```

### Container Components

#### 1. Entrypoint Script (`agent-entrypoint.sh`)

Orchestrates container startup:
- Configures git credential helper with GitHub token
- Sets up gh CLI authentication
- Builds system prompt with role-specific instructions
- Appends CLAUDE.md content if present in workspace
- Verifies Claude Code CLI is available
- Launches TypeScript agent runner

#### 2. Agent Runner (`agent-runner.ts`)

TypeScript process managing Claude CLI and WebSocket communication:
- Spawns Claude Code CLI with streaming JSON mode (`--output-format stream-json`)
- Connects to manager's WebSocket endpoint
- Bridges Claude CLI output to WebSocket (forwards events with envelope format)
- Bridges WebSocket commands to Claude CLI stdin
- Monitors for idle state (30s inactivity)
- Sends heartbeat every 30s
- Handles reconnection (up to 10 attempts)
- Processes user messages and injects into Claude CLI

---

## WebSocket Protocol

### Message Envelope

All WebSocket messages use a canonical envelope format:

```typescript
interface WSMessage<T> {
  v: 1;                    // Protocol version
  kind: WSMessageKind;     // Message type
  sessionId: string | null;
  ts: string;              // ISO-8601 timestamp
  seq: number;             // Sequence number
  payload: T;              // Type-specific data
}

type WSMessageKind =
  | 'event'      // Container → Manager (events)
  | 'command'    // UI → Manager (actions)
  | 'ack'        // Manager → Client (confirmations)
  | 'error'      // Manager → Client (errors)
  | 'subscribe'  // Client → Manager (subscriptions)
  | 'snapshot'   // Manager → Client (state dumps)
```

### Integration with sveltekit-ws

The protocol wraps messages in sveltekit-ws format:

```typescript
// sveltekit-ws expects:
{ type: 'agent-manager', data: WSMessage }
```

### Event Flow

#### Container → Manager

```
Container                    Manager                      UI
   │                            │                          │
   │─── event (claude.message) ─▶                          │
   │                            ├── Persist to DB          │
   │                            ├── Update session         │
   │                            ├── Broadcast ────────────▶│
   │◀── ack ────────────────────┤                          │
```

#### UI → Container (via Manager)

```
UI                          Manager                   Container
│                              │                          │
│─── command (send_message) ──▶                           │
│                              ├── Validate session       │
│                              ├── Update status          │
│                              ├── Record event           │
│                              ├── Forward ──────────────▶│
│◀── ack ──────────────────────┤                          │
```

### Event Types

#### Claude Events (source: 'claude')
- `claude.message` - General SDK message
- `claude.text` - Text output
- `claude.tool_use` - Tool invocation
- `claude.tool_result` - Tool execution result
- `claude.error` - Error from SDK

#### Runner Events (source: 'runner')
- `process.started` - Container initialized
- `process.exited` - Container stopped
- `process.stdout` / `process.stderr` - Process output
- `heartbeat` - Container alive signal
- `session.idle` - Agent waiting for input
- `session.error` - Container-level error

#### Manager Events (source: 'manager')
- `container.started` / `container.stopped`
- `container.connected` / `container.disconnected`
- `worktree.created` / `worktree.deleted`
- `session.status_changed`
- `user.message` - User input recorded
- `orchestrator.injection` - Cross-session coordination

### Subscription Model

Clients subscribe to topics for selective updates:

| Topic | Format | Updates |
|-------|--------|---------|
| Repository list | `repo_list` | Any repo change |
| Single repository | `repo:{repoId}` | Sessions for repo |
| Single session | `session:{sessionId}` | Events for session |

Subscriptions enable:
- Real-time UI updates without polling
- Multi-tab synchronization
- Bandwidth-efficient delivery

---

## API Design

### Repository Endpoints

#### `GET /api/repos`
Lists all registered repositories with session statistics.

**Response:**
```json
{
  "repos": [{
    "id": "uuid",
    "owner": "string",
    "name": "string",
    "fullName": "owner/name",
    "defaultBranch": "main",
    "lastActivityAt": "2024-01-01T00:00:00Z",
    "stats": {
      "totalSessions": 5,
      "activeSessions": 1,
      "hasRunning": true,
      "hasWaiting": false,
      "hasError": false
    }
  }]
}
```

#### `POST /api/repos`
Registers a new repository.

**Request:**
```json
{
  "owner": "string",
  "name": "string"
}
```

#### `GET /api/repos/github`
Lists available GitHub repositories for the authenticated user.

**Query Parameters:**
- `check_auth=true` - Return auth status only
- `owner` - Filter by owner
- `limit` - Max results (default 100)
- `visibility` - public/private/all

#### `GET /api/repos/[id]`
Gets repository details with sessions and documentation.

**Response includes:**
- Repository metadata
- Active and past sessions
- Orchestrator session (if exists)
- README.md and CLAUDE.md content

#### `DELETE /api/repos/[id]`
Removes repository registration. Fails if active sessions exist.

### Session Endpoints

#### `POST /api/repos/[id]/sessions`
Starts a new coding session.

**Request:**
```json
{
  "role": "implementer",
  "baseBranch": "main",
  "goalPrompt": "Implement feature X",
  "branchSuffix": "optional-suffix",
  "model": "sonnet"
}
```

**Startup Sequence:**
1. Create session record (status: 'starting')
2. Generate branch name
3. Create git worktree
4. Obtain GitHub token
5. Start Docker container
6. Record session.started event
7. Return session on 201

#### `GET /api/sessions/[id]`
Gets session details with events.

**Query Parameters:**
- `events=true` - Include event history
- `event_limit=100` - Max events

**Response includes:**
- Full session data
- Associated repository
- PR information (if exists)
- Recent events

#### `DELETE /api/sessions/[id]`
Stops a running session.

**Process:**
1. Stop Docker container
2. Update status to 'stopped'
3. Record session.stopped event

#### `GET /api/sessions/[id]/events`
Paginated event retrieval.

**Query Parameters:**
- `limit` - Events per page (max 1000)
- `after` / `before` - Cursor for pagination
- `order` - asc/desc
- `source` - Filter by event source
- `type` - Filter by event type

#### `POST /api/sessions/[id]/messages`
Sends user message to session.

**Request:**
```json
{
  "message": "string",
  "force": false
}
```

**Validation:**
- Session must exist
- Status must be 'waiting' (unless force=true)
- Container must be connected

---

## UI Components

### Pages

#### Home Page (`/`)

Repository grid with:
- Card per registered repository
- Activity indicators (running/waiting/error)
- Session counts
- Last activity time
- "Add Repository" modal with GitHub repo search

#### Repository Detail (`/repos/[id]`)

Three-column layout:
1. **Sessions Panel**
   - Active sessions with status
   - Past sessions (last 10)
   - Branch names and PR links

2. **Actions**
   - Start Session button
   - Orchestrator controls

3. **Documentation Panel**
   - README.md tab
   - CLAUDE.md tab

#### Session Detail (`/sessions/[id]`)

Full-height layout:
1. **Header**
   - Repository name
   - Role and status badges
   - Branch name
   - GitHub links (Compare, PR)
   - Stop button

2. **Event Timeline**
   - Scrollable container
   - Events colored by source
   - Formatted payloads
   - Auto-scroll to bottom

3. **Input Area**
   - Message input (enabled when status='waiting')
   - Status-aware placeholder
   - Send button

### Shared Components

#### `StatusBadge`
Session status indicator with color coding:
- Starting: Gray
- Running: Green (pulsing)
- Waiting: Yellow
- Finished: Blue
- Error: Red
- Stopped: Gray

#### `RoleBadge`
Session role indicator:
- Implementer: Purple
- Orchestrator: Cyan

#### `TimeAgo`
Relative time display ("5m ago", "2h ago")

---

## Configuration

### Configuration Sources

Priority order (later overrides earlier):
1. Built-in defaults
2. Config file (`~/.agent-manager/config.json`)
3. Environment variables

### Configuration Options

| Option | Env Variable | Default | Description |
|--------|-------------|---------|-------------|
| `databaseUrl` | `DATABASE_URL` | - | PostgreSQL connection string |
| `port` | `PORT` | 3000 | Server port |
| `workspaceRoot` | `WORKSPACE_ROOT` | ~/.agent-manager | Root directory for repos/worktrees |
| `containerImage` | `CONTAINER_IMAGE` | agent-manager-sandbox:latest | Docker image for sessions |
| `idleTimeoutSeconds` | `IDLE_TIMEOUT_SECONDS` | 30 | Seconds before marking idle |
| `heartbeatIntervalMs` | `HEARTBEAT_INTERVAL_MS` | 30000 | Container health check interval |
| `baseSystemPrompt` | `BASE_SYSTEM_PROMPT` | (built-in) | Custom agent system prompt |

### Workspace Directory Structure

```
~/.agent-manager/
├── config.json           # User configuration
├── repos/                # Bare git mirrors
│   └── {owner}/
│       └── {repo}.git
└── worktrees/            # Session working directories
    └── {sessionId}/
```

---

## Session Lifecycle

### State Machine

```
                    ┌─────────────────────┐
                    │      starting       │
                    └──────────┬──────────┘
                               │ container ready
                               ▼
              ┌────────────────────────────────┐
              │            running             │◀─┐
              └───────────────┬────────────────┘  │
                              │ idle 30s          │ user message
                              ▼                   │
              ┌────────────────────────────────┐  │
              │            waiting             │──┘
              └───────────────┬────────────────┘
                              │ agent completes
                              ▼
              ┌────────────────────────────────┐
              │           finished             │
              └────────────────────────────────┘

From any state:
  ─── error ───▶ [error]     (on failure)
  ─── stop ────▶ [stopped]   (user action)
```

### Session Startup Flow

```
1. UI: POST /api/repos/{id}/sessions
2. Server: Create session record (starting)
3. Server: Generate branch name (agent/{repo}/{id})
4. Git: Ensure mirror exists and is current
5. Git: Create worktree with new branch
6. Server: Update session with worktree path
7. GitHub: Get authentication token
8. Docker: Start container with mounts and env
9. Server: Update session with container ID
10. Server: Record session.started event
11. Container: Initialize and connect WebSocket
12. Container: Send process.started event
13. Container: Launch Claude Code with goal prompt
14. Server: Update status to running
```

### Idle Detection

The container WebSocket client monitors activity:
1. Track timestamp of last Claude Code output
2. After 30 seconds of inactivity:
   - Send `session.idle` event to manager
   - Manager updates session status to `waiting`
   - UI shows input field enabled

---

## Security Model

### GitHub Authentication

- Uses locally configured `gh` CLI authentication
- Token obtained dynamically via `gh auth token`
- Passed to container via environment variable
- Used for git operations and API calls
- Never persisted to database

### Container Isolation

- **Non-root execution**: Runs as `agent` user
- **Resource limits**: 4GB RAM, 2 CPU cores
- **Mount restrictions**: Only workspace and Claude config
- **No privileged mode**: Standard container security

### WebSocket Security

- Implicit authentication via session ID ownership
- Containers identify themselves by session ID
- UI clients tracked by connection ID
- Local-only deployment assumption (no HTTPS/auth tokens)

### Credential Handling

- GitHub token: Environment variable only, not logged
- Claude config: Read-only mount from host
- Git operations: Credential helper configured per-session

---

## Error Handling

### Session Creation Errors

| Condition | Response | Recovery |
|-----------|----------|----------|
| Invalid repo | 404 | Use valid repo ID |
| Git clone failure | 500, status='error' | Check network/auth |
| Worktree creation failure | 500, status='error' | Check disk space |
| Docker start failure | 500, status='error' | Check Docker daemon |
| Token unavailable | 500 | Run `gh auth login` |

### Runtime Errors

| Condition | Detection | Action |
|-----------|-----------|--------|
| Container crash | Docker event / WS disconnect | Set status='error', record event |
| Network failure | WS disconnect | Attempt reconnection (10 tries) |
| Git push failure | Claude event | Agent handles retry |

### Message Delivery Errors

| Condition | Response | Recovery |
|-----------|----------|----------|
| Session not found | 404 | Use valid session ID |
| Not in waiting state | 400 | Wait or use force=true |
| Container disconnected | 400 | Session may have crashed |

---

## Testing Strategy

### Test Configuration

```typescript
// vite.config.ts
projects: [
  {
    name: 'client',
    browser: { enabled: true, provider: playwright() },
    include: ['src/**/*.svelte.{test,spec}.{js,ts}']
  },
  {
    name: 'server',
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,ts}'],
    exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
  }
]
```

### Test Categories

1. **Unit Tests**: Individual module functions
2. **Component Tests**: Svelte components with mocked APIs
3. **Integration Tests**: API routes with test database
4. **E2E Tests**: Full flows with Playwright browser

---

## Deployment

### Development Setup

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with DATABASE_URL

# Setup database
npm run db:push

# Build Docker image
cd docker && ./build.sh

# Start dev server
npm run dev  # localhost:5173
```

### Production Deployment

```bash
# Build application
npm run build

# Start server
PORT=8080 node server.js
```

### Requirements

| Requirement | Version | Purpose |
|-------------|---------|---------|
| Node.js | 22+ | Runtime |
| PostgreSQL | 15+ | Data storage |
| Docker | 24+ | Container runtime |
| gh CLI | 2.0+ | GitHub integration |

---

## Future Considerations

### Potential Enhancements

1. **Multi-User Support**: Add authentication and user isolation
2. **Remote Deployment**: HTTPS, proper auth tokens, remote Docker
3. **Session Resume**: Reconnect to existing containers
4. **Event Replay**: Full session playback from stored events
5. **Branch Merging**: Automated PR creation and merge flows
6. **Resource Monitoring**: Container metrics and alerts
7. **Plugin System**: Custom event handlers and integrations

### Scalability Notes

- Single PostgreSQL handles events at ~1000/sec
- WebSocket connections limited by Node.js memory
- Docker containers limited by host resources
- Git mirrors cached indefinitely (may need pruning)
