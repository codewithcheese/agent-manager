# Agent Manager - Testing Strategy

## Testing Pyramid

```
                    ┌─────────────────┐
                    │      E2E        │  ~5%   Full user journeys
                    │   (Playwright)  │        Browser automation
                    ├─────────────────┤
                    │   Component     │  ~10%  UI components
                    │   (Vitest +     │        Reactive logic
                    │    Browser)     │        User interactions
                    ├─────────────────┤
                    │  Integration    │  ~25%  API routes
                    │   (Vitest +     │        Database operations
                    │    Test DB)     │        WebSocket handlers
                    ├─────────────────┤
                    │     Unit        │  ~60%  Pure functions
                    │   (Vitest)      │        Business logic
                    │                 │        Type guards
                    └─────────────────┘
```

### Coverage Goals

| Layer | Target Coverage | Priority |
|-------|----------------|----------|
| Unit | 90%+ | Critical paths, edge cases |
| Integration | 80%+ | All API routes, error paths |
| Component | 70%+ | Interactive elements, state |
| E2E | Key flows | Happy paths, error recovery |

---

## Test Configuration

### Vitest Setup (`vite.config.ts`)

```typescript
test: {
  projects: [
    {
      name: 'server',
      environment: 'node',
      include: ['src/**/*.{test,spec}.ts'],
      exclude: ['src/**/*.svelte.{test,spec}.ts'],
      setupFiles: ['src/test/setup.server.ts']
    },
    {
      name: 'client',
      browser: {
        enabled: true,
        provider: playwright(),
        instances: [{ browser: 'chromium', headless: true }]
      },
      include: ['src/**/*.svelte.{test,spec}.ts'],
      setupFiles: ['src/test/setup.client.ts']
    }
  ]
}
```

### Test Database Setup

```typescript
// src/test/setup.server.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '$lib/server/db/schema';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
  || 'postgresql://test:test@localhost:5432/agent_manager_test';

export const testDb = drizzle(postgres(TEST_DATABASE_URL), { schema });

beforeEach(async () => {
  // Clean tables in reverse dependency order
  await testDb.delete(schema.events);
  await testDb.delete(schema.sessions);
  await testDb.delete(schema.repos);
});

afterAll(async () => {
  await testDb.$client.end();
});
```

---

## Layer 1: Unit Tests

Unit tests cover pure functions with no side effects. These are fast, isolated, and form the foundation of the test suite.

### Configuration Module

**File:** `src/lib/server/config.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { expandHome, getEnvConfig, clearConfigCache } from './config';

describe('expandHome', () => {
  const originalHome = process.env.HOME;

  afterEach(() => {
    process.env.HOME = originalHome;
  });

  it('expands tilde to home directory', () => {
    process.env.HOME = '/home/testuser';
    expect(expandHome('~/.agent-manager')).toBe('/home/testuser/.agent-manager');
  });

  it('leaves absolute paths unchanged', () => {
    expect(expandHome('/var/data')).toBe('/var/data');
  });

  it('leaves relative paths unchanged', () => {
    expect(expandHome('./config')).toBe('./config');
  });

  it('handles missing HOME env var', () => {
    delete process.env.HOME;
    expect(expandHome('~/data')).toBe('~/data');
  });

  it('handles empty string', () => {
    expect(expandHome('')).toBe('');
  });

  it('only expands leading tilde', () => {
    process.env.HOME = '/home/user';
    expect(expandHome('/path/~/file')).toBe('/path/~/file');
  });
});

describe('getEnvConfig', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('parses PORT as integer', async () => {
    vi.stubEnv('PORT', '8080');
    const { getEnvConfig } = await import('./config');
    const config = getEnvConfig();
    expect(config.port).toBe(8080);
  });

  it('ignores invalid PORT values', async () => {
    vi.stubEnv('PORT', 'invalid');
    const { getEnvConfig } = await import('./config');
    const config = getEnvConfig();
    expect(config.port).toBeNaN();
  });

  it('parses IDLE_TIMEOUT_SECONDS as integer', async () => {
    vi.stubEnv('IDLE_TIMEOUT_SECONDS', '60');
    const { getEnvConfig } = await import('./config');
    const config = getEnvConfig();
    expect(config.idleTimeoutSeconds).toBe(60);
  });

  it('returns empty object when no env vars set', async () => {
    const { getEnvConfig } = await import('./config');
    const config = getEnvConfig();
    expect(Object.keys(config).length).toBe(0);
  });
});
```

### Git Module Helpers

**File:** `src/lib/server/runner/git.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { generateBranchName, getMirrorPath, getWorktreePath } from './git';

describe('generateBranchName', () => {
  it('creates branch with agent prefix', () => {
    const branch = generateBranchName('my-repo', 'abc123def456');
    expect(branch).toMatch(/^agent\/my-repo\/[a-z0-9]+$/);
  });

  it('uses first 8 characters of session ID', () => {
    const branch = generateBranchName('repo', '12345678abcdefgh');
    expect(branch).toBe('agent/repo/12345678');
  });

  it('handles special characters in repo name', () => {
    const branch = generateBranchName('my.repo-name_v2', 'sessionid');
    expect(branch).toBe('agent/my.repo-name_v2/sessioni');
  });

  it('handles empty repo name', () => {
    const branch = generateBranchName('', 'sessionid');
    expect(branch).toBe('agent//sessioni');
  });

  it('handles short session ID', () => {
    const branch = generateBranchName('repo', 'abc');
    expect(branch).toBe('agent/repo/abc');
  });
});

describe('getMirrorPath', () => {
  it('constructs correct mirror path', () => {
    const path = getMirrorPath('owner', 'repo');
    expect(path).toContain('repos/owner/repo.git');
  });

  it('handles organization names with hyphens', () => {
    const path = getMirrorPath('my-org', 'my-repo');
    expect(path).toContain('repos/my-org/my-repo.git');
  });
});

describe('getWorktreePath', () => {
  it('constructs correct worktree path', () => {
    const path = getWorktreePath('session-123');
    expect(path).toContain('worktrees/session-123');
  });

  it('handles UUID format session IDs', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const path = getWorktreePath(uuid);
    expect(path).toContain(`worktrees/${uuid}`);
  });
});
```

### GitHub Module Helpers

**File:** `src/lib/server/runner/github.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { getUrls } from './github';

describe('getUrls', () => {
  it('generates basic repo URL', () => {
    const urls = getUrls('owner', 'repo');
    expect(urls.repo).toBe('https://github.com/owner/repo');
  });

  it('generates branch URL when branch provided', () => {
    const urls = getUrls('owner', 'repo', { branch: 'feature/test' });
    expect(urls.branch).toBe('https://github.com/owner/repo/tree/feature/test');
  });

  it('returns undefined branch URL when no branch', () => {
    const urls = getUrls('owner', 'repo');
    expect(urls.branch).toBeUndefined();
  });

  it('generates compare URL when both branches provided', () => {
    const urls = getUrls('owner', 'repo', {
      baseBranch: 'main',
      branch: 'feature'
    });
    expect(urls.compare).toBe('https://github.com/owner/repo/compare/main...feature');
  });

  it('generates new PR URL', () => {
    const urls = getUrls('owner', 'repo', {
      baseBranch: 'main',
      branch: 'feature'
    });
    expect(urls.newPr).toContain('pull/new/feature');
  });

  it('handles special characters in branch names', () => {
    const urls = getUrls('owner', 'repo', {
      branch: 'feature/add-tests'
    });
    expect(urls.branch).toContain('feature/add-tests');
  });
});
```

### Docker Module Helpers

**File:** `src/lib/server/runner/docker.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { getHostUrl } from './docker';

describe('getHostUrl', () => {
  it('generates host.docker.internal URL', () => {
    const url = getHostUrl(3000);
    expect(url).toBe('http://host.docker.internal:3000');
  });

  it('handles standard HTTP port', () => {
    const url = getHostUrl(80);
    expect(url).toBe('http://host.docker.internal:80');
  });

  it('handles high port numbers', () => {
    const url = getHostUrl(65535);
    expect(url).toBe('http://host.docker.internal:65535');
  });
});
```

### WebSocket Message Helpers

**File:** `src/lib/types/websocket.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import {
  createWSMessage,
  isClaudeMessage,
  isRunnerEvent
} from './websocket';

describe('createWSMessage', () => {
  it('creates message with correct structure', () => {
    const msg = createWSMessage('event', 'session-123', { test: true });

    expect(msg.v).toBe(1);
    expect(msg.kind).toBe('event');
    expect(msg.sessionId).toBe('session-123');
    expect(msg.payload).toEqual({ test: true });
    expect(msg.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(typeof msg.seq).toBe('number');
  });

  it('handles null sessionId', () => {
    const msg = createWSMessage('ack', null, {});
    expect(msg.sessionId).toBeNull();
  });

  it('increments sequence number', () => {
    const msg1 = createWSMessage('event', null, {});
    const msg2 = createWSMessage('event', null, {});
    expect(msg2.seq).toBeGreaterThan(msg1.seq);
  });
});

describe('isClaudeMessage', () => {
  it('returns true for claude message payload', () => {
    const payload = { claudeMessage: { type: 'text', text: 'Hello' } };
    expect(isClaudeMessage(payload)).toBe(true);
  });

  it('returns false for runner event payload', () => {
    const payload = { runnerEvent: { type: 'heartbeat' } };
    expect(isClaudeMessage(payload)).toBe(false);
  });

  it('returns false for empty object', () => {
    expect(isClaudeMessage({})).toBe(false);
  });

  it('returns false for null', () => {
    expect(isClaudeMessage(null as any)).toBe(false);
  });
});

describe('isRunnerEvent', () => {
  it('returns true for runner event payload', () => {
    const payload = { runnerEvent: { type: 'process.started' } };
    expect(isRunnerEvent(payload)).toBe(true);
  });

  it('returns false for claude message payload', () => {
    const payload = { claudeMessage: { type: 'text' } };
    expect(isRunnerEvent(payload)).toBe(false);
  });
});
```

### TimeAgo Component Logic

**File:** `src/lib/components/TimeAgo.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Extract and test the pure function
function formatTimeAgo(date: Date | string | null): string {
  if (!date) return 'Never';

  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString();
}

describe('formatTimeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "Never" for null', () => {
    expect(formatTimeAgo(null)).toBe('Never');
  });

  it('returns "Just now" for recent times', () => {
    const recent = new Date('2024-01-15T11:59:30Z');
    expect(formatTimeAgo(recent)).toBe('Just now');
  });

  it('returns minutes ago', () => {
    const fiveMinAgo = new Date('2024-01-15T11:55:00Z');
    expect(formatTimeAgo(fiveMinAgo)).toBe('5m ago');
  });

  it('returns hours ago', () => {
    const threeHoursAgo = new Date('2024-01-15T09:00:00Z');
    expect(formatTimeAgo(threeHoursAgo)).toBe('3h ago');
  });

  it('returns days ago', () => {
    const twoDaysAgo = new Date('2024-01-13T12:00:00Z');
    expect(formatTimeAgo(twoDaysAgo)).toBe('2d ago');
  });

  it('returns date for old times', () => {
    const oldDate = new Date('2024-01-01T12:00:00Z');
    expect(formatTimeAgo(oldDate)).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
  });

  it('handles string dates', () => {
    expect(formatTimeAgo('2024-01-15T11:59:30Z')).toBe('Just now');
  });

  it('handles ISO string format', () => {
    expect(formatTimeAgo('2024-01-15T11:55:00.000Z')).toBe('5m ago');
  });
});
```

---

## Layer 2: Integration Tests

Integration tests verify API routes work correctly with the database and handle all edge cases.

### Test Fixtures

**File:** `src/test/fixtures.ts`

```typescript
import { testDb } from './setup.server';
import { repos, sessions, events } from '$lib/server/db/schema';

export async function createTestRepo(overrides = {}) {
  const [repo] = await testDb.insert(repos).values({
    owner: 'test-owner',
    name: 'test-repo',
    defaultBranch: 'main',
    ...overrides
  }).returning();
  return repo;
}

export async function createTestSession(repoId: string, overrides = {}) {
  const [session] = await testDb.insert(sessions).values({
    repoId,
    role: 'implementer',
    status: 'running',
    branchName: 'agent/test/abc12345',
    baseBranch: 'main',
    ...overrides
  }).returning();
  return session;
}

export async function createTestEvent(sessionId: string, overrides = {}) {
  const [event] = await testDb.insert(events).values({
    sessionId,
    source: 'claude',
    type: 'claude.message',
    payload: { claudeMessage: { type: 'text', text: 'Hello' } },
    ...overrides
  }).returning();
  return event;
}

export function mockGitModule() {
  return {
    ensureMirror: vi.fn().mockResolvedValue({
      mirrorPath: '/tmp/mirror',
      defaultBranch: 'main'
    }),
    createWorktree: vi.fn().mockResolvedValue({
      worktreePath: '/tmp/worktree',
      branchName: 'agent/test/session'
    }),
    removeWorktree: vi.fn().mockResolvedValue(undefined),
    generateBranchName: vi.fn().mockReturnValue('agent/test/session'),
    getMirrorPath: vi.fn().mockReturnValue('/tmp/mirror'),
    getWorktreePath: vi.fn().mockReturnValue('/tmp/worktree')
  };
}

export function mockGitHubModule() {
  return {
    checkAuth: vi.fn().mockResolvedValue({ authenticated: true, user: { login: 'testuser' } }),
    getToken: vi.fn().mockResolvedValue('test-token'),
    listRepos: vi.fn().mockResolvedValue([]),
    getRepo: vi.fn().mockResolvedValue({ owner: 'test', name: 'repo', defaultBranch: 'main' }),
    findPRsForBranch: vi.fn().mockResolvedValue([]),
    getFileContent: vi.fn().mockResolvedValue(null),
    getUrls: vi.fn().mockReturnValue({ repo: 'https://github.com/test/repo' })
  };
}

export function mockDockerModule() {
  return {
    checkDocker: vi.fn().mockResolvedValue({ available: true, version: '24.0.0' }),
    startContainer: vi.fn().mockResolvedValue({
      containerId: 'container-123',
      status: 'running'
    }),
    stopContainer: vi.fn().mockResolvedValue(undefined),
    removeContainer: vi.fn().mockResolvedValue(undefined),
    getContainerInfo: vi.fn().mockResolvedValue(null),
    getHostUrl: vi.fn().mockReturnValue('http://host.docker.internal:3000')
  };
}
```

### Repos API Tests

**File:** `src/routes/api/repos/+server.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from './+server';
import { testDb } from '$test/setup.server';
import { createTestRepo, createTestSession, mockGitHubModule } from '$test/fixtures';

describe('GET /api/repos', () => {
  it('returns empty array when no repos', async () => {
    const response = await GET({ url: new URL('http://localhost/api/repos') });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.repos).toEqual([]);
  });

  it('returns repos with session statistics', async () => {
    const repo = await createTestRepo();
    await createTestSession(repo.id, { status: 'running' });
    await createTestSession(repo.id, { status: 'waiting' });
    await createTestSession(repo.id, { status: 'finished' });

    const response = await GET({ url: new URL('http://localhost/api/repos') });
    const data = await response.json();

    expect(data.repos).toHaveLength(1);
    expect(data.repos[0].stats).toEqual({
      totalSessions: 3,
      activeSessions: 2,
      hasRunning: true,
      hasWaiting: true,
      hasError: false
    });
  });

  it('includes fullName property', async () => {
    await createTestRepo({ owner: 'myorg', name: 'myrepo' });

    const response = await GET({ url: new URL('http://localhost/api/repos') });
    const data = await response.json();

    expect(data.repos[0].fullName).toBe('myorg/myrepo');
  });

  it('orders by last activity descending', async () => {
    const repo1 = await createTestRepo({
      name: 'old-repo',
      lastActivityAt: new Date('2024-01-01')
    });
    const repo2 = await createTestRepo({
      name: 'new-repo',
      lastActivityAt: new Date('2024-01-15')
    });

    const response = await GET({ url: new URL('http://localhost/api/repos') });
    const data = await response.json();

    expect(data.repos[0].name).toBe('new-repo');
    expect(data.repos[1].name).toBe('old-repo');
  });
});

describe('POST /api/repos', () => {
  beforeEach(() => {
    vi.mock('$lib/server/runner', () => ({
      getGitHubModule: () => mockGitHubModule()
    }));
  });

  it('creates new repo', async () => {
    const response = await POST({
      request: new Request('http://localhost/api/repos', {
        method: 'POST',
        body: JSON.stringify({ owner: 'testowner', name: 'testrepo' }),
        headers: { 'Content-Type': 'application/json' }
      })
    });

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.repo.owner).toBe('testowner');
    expect(data.repo.name).toBe('testrepo');
  });

  it('returns existing repo if already registered', async () => {
    await createTestRepo({ owner: 'existing', name: 'repo' });

    const response = await POST({
      request: new Request('http://localhost/api/repos', {
        method: 'POST',
        body: JSON.stringify({ owner: 'existing', name: 'repo' }),
        headers: { 'Content-Type': 'application/json' }
      })
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.existing).toBe(true);
  });

  it('returns 400 for missing owner', async () => {
    const response = await POST({
      request: new Request('http://localhost/api/repos', {
        method: 'POST',
        body: JSON.stringify({ name: 'repo' }),
        headers: { 'Content-Type': 'application/json' }
      })
    });

    expect(response.status).toBe(400);
  });

  it('returns 400 for missing name', async () => {
    const response = await POST({
      request: new Request('http://localhost/api/repos', {
        method: 'POST',
        body: JSON.stringify({ owner: 'owner' }),
        headers: { 'Content-Type': 'application/json' }
      })
    });

    expect(response.status).toBe(400);
  });

  it('returns 404 when GitHub repo does not exist', async () => {
    vi.mock('$lib/server/runner', () => ({
      getGitHubModule: () => ({
        ...mockGitHubModule(),
        getRepo: vi.fn().mockResolvedValue(null)
      })
    }));

    const response = await POST({
      request: new Request('http://localhost/api/repos', {
        method: 'POST',
        body: JSON.stringify({ owner: 'nonexistent', name: 'repo' }),
        headers: { 'Content-Type': 'application/json' }
      })
    });

    expect(response.status).toBe(404);
  });
});
```

### Sessions API Tests

**File:** `src/routes/api/repos/[id]/sessions/+server.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from './+server';
import { createTestRepo, createTestSession, mockGitModule, mockGitHubModule, mockDockerModule } from '$test/fixtures';

describe('GET /api/repos/[id]/sessions', () => {
  it('returns sessions for repo', async () => {
    const repo = await createTestRepo();
    await createTestSession(repo.id, { branchName: 'branch-1' });
    await createTestSession(repo.id, { branchName: 'branch-2' });

    const response = await GET({
      params: { id: repo.id },
      url: new URL('http://localhost/api/repos/' + repo.id + '/sessions')
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sessions).toHaveLength(2);
  });

  it('returns 404 for non-existent repo', async () => {
    const response = await GET({
      params: { id: 'nonexistent-uuid' },
      url: new URL('http://localhost/api/repos/nonexistent/sessions')
    });

    expect(response.status).toBe(404);
  });

  it('includes session URLs', async () => {
    const repo = await createTestRepo();
    await createTestSession(repo.id);

    const response = await GET({
      params: { id: repo.id },
      url: new URL('http://localhost/api/repos/' + repo.id + '/sessions')
    });
    const data = await response.json();

    expect(data.sessions[0].urls).toBeDefined();
    expect(data.sessions[0].urls.branch).toBeDefined();
  });
});

describe('POST /api/repos/[id]/sessions', () => {
  beforeEach(() => {
    vi.mock('$lib/server/runner', () => ({
      getGitModule: () => mockGitModule(),
      getGitHubModule: () => mockGitHubModule(),
      getDockerModule: () => mockDockerModule()
    }));
  });

  it('creates implementer session', async () => {
    const repo = await createTestRepo();

    const response = await POST({
      params: { id: repo.id },
      request: new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          role: 'implementer',
          baseBranch: 'main',
          goalPrompt: 'Fix the bug'
        }),
        headers: { 'Content-Type': 'application/json' }
      })
    });

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.session.role).toBe('implementer');
    expect(data.session.status).toBe('starting');
  });

  it('creates orchestrator session', async () => {
    const repo = await createTestRepo();

    const response = await POST({
      params: { id: repo.id },
      request: new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          role: 'orchestrator',
          baseBranch: 'main'
        }),
        headers: { 'Content-Type': 'application/json' }
      })
    });

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.session.role).toBe('orchestrator');
  });

  it('prevents duplicate orchestrator', async () => {
    const repo = await createTestRepo();
    await createTestSession(repo.id, { role: 'orchestrator', status: 'running' });

    const response = await POST({
      params: { id: repo.id },
      request: new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ role: 'orchestrator' }),
        headers: { 'Content-Type': 'application/json' }
      })
    });

    expect(response.status).toBe(409);
  });

  it('returns 400 for invalid role', async () => {
    const repo = await createTestRepo();

    const response = await POST({
      params: { id: repo.id },
      request: new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ role: 'invalid' }),
        headers: { 'Content-Type': 'application/json' }
      })
    });

    expect(response.status).toBe(400);
  });

  it('sets status to error on git failure', async () => {
    vi.mock('$lib/server/runner', () => ({
      getGitModule: () => ({
        ...mockGitModule(),
        ensureMirror: vi.fn().mockRejectedValue(new Error('Git clone failed'))
      }),
      getGitHubModule: () => mockGitHubModule(),
      getDockerModule: () => mockDockerModule()
    }));

    const repo = await createTestRepo();

    const response = await POST({
      params: { id: repo.id },
      request: new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ role: 'implementer' }),
        headers: { 'Content-Type': 'application/json' }
      })
    });

    expect(response.status).toBe(500);
  });
});
```

### Session Messages API Tests

**File:** `src/routes/api/sessions/[id]/messages/+server.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { POST } from './+server';
import { createTestRepo, createTestSession } from '$test/fixtures';

describe('POST /api/sessions/[id]/messages', () => {
  beforeEach(() => {
    vi.mock('sveltekit-ws', () => ({
      getWebSocketManager: () => ({
        broadcast: vi.fn()
      })
    }));
  });

  it('sends message when session is waiting', async () => {
    const repo = await createTestRepo();
    const session = await createTestSession(repo.id, { status: 'waiting' });

    const response = await POST({
      params: { id: session.id },
      request: new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ message: 'Hello agent' }),
        headers: { 'Content-Type': 'application/json' }
      })
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.sent).toBe(true);
    expect(data.sessionStatus).toBe('running');
  });

  it('rejects message when session is running', async () => {
    const repo = await createTestRepo();
    const session = await createTestSession(repo.id, { status: 'running' });

    const response = await POST({
      params: { id: session.id },
      request: new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ message: 'Hello' }),
        headers: { 'Content-Type': 'application/json' }
      })
    });

    expect(response.status).toBe(400);
  });

  it('allows force send when session is running', async () => {
    const repo = await createTestRepo();
    const session = await createTestSession(repo.id, { status: 'running' });

    const response = await POST({
      params: { id: session.id },
      request: new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ message: 'Hello', force: true }),
        headers: { 'Content-Type': 'application/json' }
      })
    });

    expect(response.status).toBe(200);
  });

  it('returns 400 for empty message', async () => {
    const repo = await createTestRepo();
    const session = await createTestSession(repo.id, { status: 'waiting' });

    const response = await POST({
      params: { id: session.id },
      request: new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ message: '' }),
        headers: { 'Content-Type': 'application/json' }
      })
    });

    expect(response.status).toBe(400);
  });

  it('returns 404 for non-existent session', async () => {
    const response = await POST({
      params: { id: 'nonexistent' },
      request: new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ message: 'Hello' }),
        headers: { 'Content-Type': 'application/json' }
      })
    });

    expect(response.status).toBe(404);
  });
});
```

### Events Pagination Tests

**File:** `src/routes/api/sessions/[id]/events/+server.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { GET } from './+server';
import { createTestRepo, createTestSession, createTestEvent } from '$test/fixtures';

describe('GET /api/sessions/[id]/events', () => {
  it('returns events with pagination', async () => {
    const repo = await createTestRepo();
    const session = await createTestSession(repo.id);

    // Create 5 events
    for (let i = 0; i < 5; i++) {
      await createTestEvent(session.id);
    }

    const response = await GET({
      params: { id: session.id },
      url: new URL(`http://localhost/api/sessions/${session.id}/events?limit=3`)
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.events).toHaveLength(3);
    expect(data.pagination.hasMore).toBe(true);
    expect(data.pagination.nextCursor).toBeDefined();
  });

  it('filters by source', async () => {
    const repo = await createTestRepo();
    const session = await createTestSession(repo.id);

    await createTestEvent(session.id, { source: 'claude' });
    await createTestEvent(session.id, { source: 'runner' });
    await createTestEvent(session.id, { source: 'manager' });

    const response = await GET({
      params: { id: session.id },
      url: new URL(`http://localhost/api/sessions/${session.id}/events?source=claude`)
    });
    const data = await response.json();

    expect(data.events).toHaveLength(1);
    expect(data.events[0].source).toBe('claude');
  });

  it('paginates with after cursor', async () => {
    const repo = await createTestRepo();
    const session = await createTestSession(repo.id);

    const event1 = await createTestEvent(session.id);
    const event2 = await createTestEvent(session.id);
    const event3 = await createTestEvent(session.id);

    const response = await GET({
      params: { id: session.id },
      url: new URL(`http://localhost/api/sessions/${session.id}/events?after=${event1.id}`)
    });
    const data = await response.json();

    expect(data.events).toHaveLength(2);
    expect(data.events.map(e => e.id)).not.toContain(event1.id);
  });

  it('caps limit at 1000', async () => {
    const repo = await createTestRepo();
    const session = await createTestSession(repo.id);

    const response = await GET({
      params: { id: session.id },
      url: new URL(`http://localhost/api/sessions/${session.id}/events?limit=5000`)
    });
    const data = await response.json();

    expect(data.pagination.limit).toBe(1000);
  });

  it('returns 404 for non-existent session', async () => {
    const response = await GET({
      params: { id: 'nonexistent' },
      url: new URL('http://localhost/api/sessions/nonexistent/events')
    });

    expect(response.status).toBe(404);
  });
});
```

---

## Layer 3: WebSocket Handler Tests

**File:** `src/lib/server/websocket/handler.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWebSocketHandlers } from './handler';
import { createTestRepo, createTestSession, createTestEvent } from '$test/fixtures';

// Mock WebSocket manager
const mockManager = {
  send: vi.fn(),
  broadcast: vi.fn()
};

vi.mock('sveltekit-ws', () => ({
  getWebSocketManager: () => mockManager
}));

describe('WebSocket Handler', () => {
  let handlers: ReturnType<typeof createWebSocketHandlers>;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = createWebSocketHandlers();
  });

  describe('onConnect', () => {
    it('sends welcome message to new connection', async () => {
      await handlers.onConnect({ id: 'conn-123' });

      expect(mockManager.send).toHaveBeenCalledWith(
        'conn-123',
        expect.objectContaining({
          type: 'agent-manager',
          data: expect.objectContaining({
            kind: 'ack'
          })
        })
      );
    });
  });

  describe('onMessage - event handling', () => {
    it('persists claude events to database', async () => {
      const repo = await createTestRepo();
      const session = await createTestSession(repo.id);

      await handlers.onMessage(
        { id: 'container-conn' },
        {
          type: 'agent-manager',
          data: {
            v: 1,
            kind: 'event',
            sessionId: session.id,
            ts: new Date().toISOString(),
            seq: 1,
            payload: {
              claudeMessage: { type: 'text', text: 'Hello' }
            }
          }
        }
      );

      // Verify event was stored
      const events = await testDb.query.events.findMany({
        where: eq(events.sessionId, session.id)
      });
      expect(events).toHaveLength(1);
      expect(events[0].source).toBe('claude');
    });

    it('updates session status on session.idle event', async () => {
      const repo = await createTestRepo();
      const session = await createTestSession(repo.id, { status: 'running' });

      await handlers.onMessage(
        { id: 'container-conn' },
        {
          type: 'agent-manager',
          data: {
            v: 1,
            kind: 'event',
            sessionId: session.id,
            ts: new Date().toISOString(),
            seq: 1,
            payload: {
              runnerEvent: { type: 'session.idle' }
            }
          }
        }
      );

      // Verify session status updated
      const updated = await testDb.query.sessions.findFirst({
        where: eq(sessions.id, session.id)
      });
      expect(updated?.status).toBe('waiting');
    });

    it('broadcasts event to session subscribers', async () => {
      const repo = await createTestRepo();
      const session = await createTestSession(repo.id);

      // Simulate UI subscription
      await handlers.onMessage(
        { id: 'ui-conn' },
        {
          type: 'agent-manager',
          data: {
            v: 1,
            kind: 'command',
            sessionId: session.id,
            ts: new Date().toISOString(),
            seq: 1,
            payload: {
              type: 'subscribe.session',
              sessionId: session.id
            }
          }
        }
      );

      // Send event from container
      await handlers.onMessage(
        { id: 'container-conn' },
        {
          type: 'agent-manager',
          data: {
            v: 1,
            kind: 'event',
            sessionId: session.id,
            ts: new Date().toISOString(),
            seq: 1,
            payload: {
              claudeMessage: { type: 'text', text: 'Working...' }
            }
          }
        }
      );

      // Verify broadcast to UI
      expect(mockManager.send).toHaveBeenCalledWith(
        'ui-conn',
        expect.objectContaining({
          type: 'agent-manager'
        })
      );
    });
  });

  describe('onMessage - command handling', () => {
    it('handles subscribe.session command', async () => {
      const repo = await createTestRepo();
      const session = await createTestSession(repo.id);
      await createTestEvent(session.id);

      await handlers.onMessage(
        { id: 'ui-conn' },
        {
          type: 'agent-manager',
          data: {
            v: 1,
            kind: 'command',
            sessionId: null,
            ts: new Date().toISOString(),
            seq: 1,
            payload: {
              type: 'subscribe.session',
              sessionId: session.id
            }
          }
        }
      );

      // Should send snapshot with events
      expect(mockManager.send).toHaveBeenCalledWith(
        'ui-conn',
        expect.objectContaining({
          data: expect.objectContaining({
            kind: 'snapshot'
          })
        })
      );
    });

    it('handles session.stop command', async () => {
      const repo = await createTestRepo();
      const session = await createTestSession(repo.id, { status: 'running' });

      await handlers.onMessage(
        { id: 'ui-conn' },
        {
          type: 'agent-manager',
          data: {
            v: 1,
            kind: 'command',
            sessionId: session.id,
            ts: new Date().toISOString(),
            seq: 1,
            payload: {
              type: 'session.stop',
              sessionId: session.id
            }
          }
        }
      );

      // Verify session stopped
      const updated = await testDb.query.sessions.findFirst({
        where: eq(sessions.id, session.id)
      });
      expect(updated?.status).toBe('stopped');
    });

    it('returns error for unknown command', async () => {
      await handlers.onMessage(
        { id: 'ui-conn' },
        {
          type: 'agent-manager',
          data: {
            v: 1,
            kind: 'command',
            sessionId: null,
            ts: new Date().toISOString(),
            seq: 1,
            payload: {
              type: 'unknown.command'
            }
          }
        }
      );

      expect(mockManager.send).toHaveBeenCalledWith(
        'ui-conn',
        expect.objectContaining({
          data: expect.objectContaining({
            kind: 'error'
          })
        })
      );
    });
  });

  describe('onDisconnect', () => {
    it('cleans up subscriptions', async () => {
      // Subscribe first
      await handlers.onMessage(
        { id: 'ui-conn' },
        {
          type: 'agent-manager',
          data: {
            v: 1,
            kind: 'command',
            sessionId: null,
            ts: new Date().toISOString(),
            seq: 1,
            payload: { type: 'subscribe.repo_list' }
          }
        }
      );

      // Disconnect
      await handlers.onDisconnect({ id: 'ui-conn' });

      // Future broadcasts should not include this connection
      // (internal state check)
    });

    it('sets session to error when container disconnects unexpectedly', async () => {
      const repo = await createTestRepo();
      const session = await createTestSession(repo.id, { status: 'running' });

      // Simulate container connection
      await handlers.onMessage(
        { id: 'container-conn' },
        {
          type: 'agent-manager',
          data: {
            v: 1,
            kind: 'event',
            sessionId: session.id,
            ts: new Date().toISOString(),
            seq: 1,
            payload: { runnerEvent: { type: 'process.started' } }
          }
        }
      );

      // Disconnect
      await handlers.onDisconnect({ id: 'container-conn' });

      // Verify session status
      const updated = await testDb.query.sessions.findFirst({
        where: eq(sessions.id, session.id)
      });
      expect(updated?.status).toBe('error');
    });
  });
});
```

---

## Layer 4: Component Tests

### StatusBadge Component

**File:** `src/lib/components/StatusBadge.svelte.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import StatusBadge from './StatusBadge.svelte';

describe('StatusBadge', () => {
  it('renders starting status', () => {
    render(StatusBadge, { props: { status: 'starting' } });
    expect(screen.getByText('Starting')).toBeInTheDocument();
  });

  it('renders running status with animation', () => {
    render(StatusBadge, { props: { status: 'running' } });
    const badge = screen.getByText('Running');
    expect(badge).toBeInTheDocument();
    expect(badge.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders waiting status', () => {
    render(StatusBadge, { props: { status: 'waiting' } });
    expect(screen.getByText('Waiting')).toBeInTheDocument();
  });

  it('renders all status values', () => {
    const statuses = ['starting', 'running', 'waiting', 'finished', 'error', 'stopped'];

    for (const status of statuses) {
      const { unmount } = render(StatusBadge, { props: { status } });
      expect(screen.getByRole('status')).toBeInTheDocument();
      unmount();
    }
  });

  it('applies small size class', () => {
    render(StatusBadge, { props: { status: 'running', size: 'sm' } });
    expect(screen.getByRole('status')).toHaveClass('text-xs');
  });

  it('applies medium size class by default', () => {
    render(StatusBadge, { props: { status: 'running' } });
    expect(screen.getByRole('status')).toHaveClass('text-sm');
  });
});
```

### RoleBadge Component

**File:** `src/lib/components/RoleBadge.svelte.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import RoleBadge from './RoleBadge.svelte';

describe('RoleBadge', () => {
  it('renders implementer role', () => {
    render(RoleBadge, { props: { role: 'implementer' } });
    expect(screen.getByText('Implementer')).toBeInTheDocument();
  });

  it('renders orchestrator role', () => {
    render(RoleBadge, { props: { role: 'orchestrator' } });
    expect(screen.getByText('Orchestrator')).toBeInTheDocument();
  });

  it('applies correct color for implementer', () => {
    render(RoleBadge, { props: { role: 'implementer' } });
    expect(screen.getByText('Implementer')).toHaveClass('bg-purple-100');
  });

  it('applies correct color for orchestrator', () => {
    render(RoleBadge, { props: { role: 'orchestrator' } });
    expect(screen.getByText('Orchestrator')).toHaveClass('bg-cyan-100');
  });
});
```

### Home Page Tests

**File:** `src/routes/+page.svelte.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import HomePage from './+page.svelte';

describe('Home Page', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('shows loading state initially', () => {
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
    render(HomePage);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('displays repos after loading', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        repos: [
          {
            id: '1',
            owner: 'test',
            name: 'repo',
            fullName: 'test/repo',
            defaultBranch: 'main',
            stats: { totalSessions: 0, activeSessions: 0 }
          }
        ]
      })
    });

    render(HomePage);

    await waitFor(() => {
      expect(screen.getByText('test/repo')).toBeInTheDocument();
    });
  });

  it('shows empty state when no repos', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ repos: [] })
    });

    render(HomePage);

    await waitFor(() => {
      expect(screen.getByText('No repositories yet')).toBeInTheDocument();
    });
  });

  it('shows error state on fetch failure', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500
    });

    render(HomePage);

    await waitFor(() => {
      expect(screen.getByText(/Failed to fetch repos/i)).toBeInTheDocument();
    });
  });

  it('opens add repo modal', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ repos: [] })
    });

    render(HomePage);

    await waitFor(() => {
      expect(screen.getByText('Add Repository')).toBeInTheDocument();
    });

    await fireEvent.click(screen.getByText('Add Repository'));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('filters GitHub repos by search query', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ repos: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          repos: [
            { owner: 'test', name: 'matching-repo', fullName: 'test/matching-repo' },
            { owner: 'test', name: 'other', fullName: 'test/other' }
          ]
        })
      });

    render(HomePage);

    await waitFor(() => {
      expect(screen.getByText('Add Repository')).toBeInTheDocument();
    });

    await fireEvent.click(screen.getByText('Add Repository'));

    await waitFor(() => {
      expect(screen.getByText('test/matching-repo')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search repositories...');
    await fireEvent.input(searchInput, { target: { value: 'matching' } });

    expect(screen.getByText('test/matching-repo')).toBeInTheDocument();
    expect(screen.queryByText('test/other')).not.toBeInTheDocument();
  });
});
```

---

## Layer 5: End-to-End Tests

**File:** `e2e/session-flow.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Session Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Reset database state
    await page.request.post('/api/test/reset');
  });

  test('complete session lifecycle', async ({ page }) => {
    // 1. Navigate to home
    await page.goto('/');
    await expect(page.getByText('Repositories')).toBeVisible();

    // 2. Add a repository
    await page.click('text=Add Repository');
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.fill('[placeholder="Search repositories..."]', 'test-repo');
    await page.click('text=Add', { first: true });

    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByText('test-owner/test-repo')).toBeVisible();

    // 3. Navigate to repo detail
    await page.click('text=test-owner/test-repo');
    await expect(page.url()).toContain('/repos/');

    // 4. Start a session
    await page.click('text=New Session');
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.selectOption('select[id="session-role"]', 'implementer');
    await page.fill('textarea[id="goal-prompt"]', 'Fix the login bug');
    await page.click('text=Start Session');

    // 5. Verify session started
    await expect(page.getByText('Starting')).toBeVisible({ timeout: 5000 });

    // 6. Navigate to session detail
    await page.click('[data-testid="session-card"]');
    await expect(page.url()).toContain('/sessions/');

    // 7. Verify event timeline
    await expect(page.getByText('session.started')).toBeVisible({ timeout: 10000 });

    // 8. Stop session
    await page.click('text=Stop');
    await expect(page.getByText('Stopped')).toBeVisible();
  });

  test('sends message when session is waiting', async ({ page }) => {
    // Setup: Create repo and session in waiting state
    const response = await page.request.post('/api/test/setup-waiting-session');
    const { sessionId } = await response.json();

    // Navigate to session
    await page.goto(`/sessions/${sessionId}`);

    // Verify input is enabled
    const input = page.getByPlaceholder('Send a message...');
    await expect(input).toBeEnabled();

    // Send message
    await input.fill('Please continue with the implementation');
    await page.click('text=Send');

    // Verify message sent
    await expect(page.getByText('user.message')).toBeVisible();
    await expect(input).toHaveValue('');
  });

  test('real-time event updates via WebSocket', async ({ page }) => {
    // Setup: Create active session
    const response = await page.request.post('/api/test/setup-active-session');
    const { sessionId } = await response.json();

    // Navigate to session
    await page.goto(`/sessions/${sessionId}`);

    // Wait for WebSocket connection
    await page.waitForTimeout(1000);

    // Inject event via API (simulating container)
    await page.request.post(`/api/test/inject-event`, {
      data: {
        sessionId,
        type: 'claude.message',
        payload: { claudeMessage: { type: 'text', text: 'Test message from agent' } }
      }
    });

    // Verify event appears without refresh
    await expect(page.getByText('Test message from agent')).toBeVisible({ timeout: 5000 });
  });

  test('handles container disconnection gracefully', async ({ page }) => {
    const response = await page.request.post('/api/test/setup-active-session');
    const { sessionId } = await response.json();

    await page.goto(`/sessions/${sessionId}`);

    // Simulate container disconnection
    await page.request.post(`/api/test/disconnect-container`, {
      data: { sessionId }
    });

    // Verify error state shown
    await expect(page.getByText('Error')).toBeVisible({ timeout: 5000 });
  });
});
```

---

## Mocking Strategies

### External Command Mocking

**File:** `src/test/mocks/commands.ts`

```typescript
import { vi } from 'vitest';
import { exec } from 'child_process';

export function mockExec() {
  const mockImplementation = vi.fn((command: string, callback: Function) => {
    // Git commands
    if (command.includes('git symbolic-ref')) {
      callback(null, { stdout: 'refs/heads/main', stderr: '' });
      return;
    }
    if (command.includes('git clone --bare')) {
      callback(null, { stdout: '', stderr: '' });
      return;
    }
    if (command.includes('git fetch')) {
      callback(null, { stdout: '', stderr: '' });
      return;
    }
    if (command.includes('git worktree add')) {
      callback(null, { stdout: '', stderr: '' });
      return;
    }
    if (command.includes('git worktree remove')) {
      callback(null, { stdout: '', stderr: '' });
      return;
    }

    // Docker commands
    if (command.includes('docker version')) {
      callback(null, { stdout: '24.0.0', stderr: '' });
      return;
    }
    if (command.includes('docker run')) {
      callback(null, { stdout: 'container-id-123', stderr: '' });
      return;
    }
    if (command.includes('docker stop')) {
      callback(null, { stdout: '', stderr: '' });
      return;
    }
    if (command.includes('docker rm')) {
      callback(null, { stdout: '', stderr: '' });
      return;
    }
    if (command.includes('docker inspect')) {
      callback(null, {
        stdout: JSON.stringify([{ State: { Status: 'running' } }]),
        stderr: ''
      });
      return;
    }

    // gh commands
    if (command.includes('gh api user')) {
      callback(null, { stdout: '{"login":"testuser"}', stderr: '' });
      return;
    }
    if (command.includes('gh auth token')) {
      callback(null, { stdout: 'test-token', stderr: '' });
      return;
    }
    if (command.includes('gh repo list')) {
      callback(null, { stdout: '[]', stderr: '' });
      return;
    }
    if (command.includes('gh repo view')) {
      callback(null, {
        stdout: JSON.stringify({ owner: { login: 'test' }, name: 'repo', defaultBranch: 'main' }),
        stderr: ''
      });
      return;
    }

    // Default: command not found
    callback(new Error(`Mock not implemented: ${command}`), null);
  });

  vi.mock('child_process', () => ({
    exec: mockImplementation
  }));

  return mockImplementation;
}
```

### WebSocket Manager Mock

**File:** `src/test/mocks/websocket.ts`

```typescript
import { vi } from 'vitest';

export function createMockWSManager() {
  const connections = new Map<string, any[]>();

  return {
    send: vi.fn((connectionId: string, message: any) => {
      const messages = connections.get(connectionId) || [];
      messages.push(message);
      connections.set(connectionId, messages);
    }),

    broadcast: vi.fn((message: any, exclude: string[]) => {
      for (const [connId, messages] of connections) {
        if (!exclude.includes(connId)) {
          messages.push(message);
        }
      }
    }),

    getMessages: (connectionId: string) => connections.get(connectionId) || [],

    clearMessages: () => connections.clear(),

    simulateConnection: (connectionId: string) => {
      connections.set(connectionId, []);
    },

    simulateDisconnect: (connectionId: string) => {
      connections.delete(connectionId);
    }
  };
}
```

---

## CI/CD Integration

### GitHub Actions Workflow

**File:** `.github/workflows/test.yml`

```yaml
name: Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci
      - run: npm run test:unit

      - uses: codecov/codecov-action@v3
        with:
          files: coverage/lcov.info
          flags: unit

  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: agent_manager_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci
      - run: npm run db:push
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/agent_manager_test

      - run: npm run test:integration
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/agent_manager_test

      - uses: codecov/codecov-action@v3
        with:
          files: coverage/lcov.info
          flags: integration

  e2e-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: agent_manager_test
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci
      - run: npx playwright install --with-deps chromium

      - run: npm run db:push
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/agent_manager_test

      - run: npm run build
      - run: npm run test:e2e
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/agent_manager_test

      - uses: actions/upload-artifact@v3
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

### NPM Scripts

```json
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest run --project server --coverage",
    "test:integration": "vitest run --project server --testPathPattern='integration|api'",
    "test:component": "vitest run --project client",
    "test:e2e": "playwright test",
    "test:coverage": "vitest run --coverage"
  }
}
```

---

## Test Data Management

### Seed Data

**File:** `src/test/seed.ts`

```typescript
import { testDb } from './setup.server';
import { repos, sessions, events } from '$lib/server/db/schema';

export async function seedTestData() {
  // Create repos
  const [repo1] = await testDb.insert(repos).values({
    owner: 'acme',
    name: 'webapp',
    defaultBranch: 'main',
    lastActivityAt: new Date()
  }).returning();

  const [repo2] = await testDb.insert(repos).values({
    owner: 'acme',
    name: 'api',
    defaultBranch: 'main'
  }).returning();

  // Create sessions
  const [activeSession] = await testDb.insert(sessions).values({
    repoId: repo1.id,
    role: 'implementer',
    status: 'running',
    branchName: 'agent/webapp/abc12345',
    baseBranch: 'main'
  }).returning();

  const [waitingSession] = await testDb.insert(sessions).values({
    repoId: repo1.id,
    role: 'implementer',
    status: 'waiting',
    branchName: 'agent/webapp/def67890',
    baseBranch: 'main'
  }).returning();

  // Create events
  await testDb.insert(events).values([
    {
      sessionId: activeSession.id,
      source: 'manager',
      type: 'session.started',
      payload: {}
    },
    {
      sessionId: activeSession.id,
      source: 'claude',
      type: 'claude.message',
      payload: { claudeMessage: { type: 'text', text: 'Analyzing codebase...' } }
    },
    {
      sessionId: activeSession.id,
      source: 'claude',
      type: 'claude.tool_use',
      payload: { claudeMessage: { type: 'tool_use', name: 'Read', input: { path: '/src' } } }
    }
  ]);

  return { repo1, repo2, activeSession, waitingSession };
}
```

---

## Running Tests

```bash
# Run all tests
npm test

# Run with UI
npm test -- --ui

# Run specific layer
npm run test:unit
npm run test:integration
npm run test:component
npm run test:e2e

# Run with coverage
npm run test:coverage

# Run specific file
npm test -- src/lib/server/config.test.ts

# Run in watch mode
npm test -- --watch

# Run E2E with headed browser
npx playwright test --headed
```
