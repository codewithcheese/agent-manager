# Agent Manager - Development Guide

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test

# Check types
npm run check
```

## Before Committing

**Always run these checks before committing:**

```bash
# 1. Run type checking
npm run check

# 2. Run all tests
npm test

# 3. Run build to catch any build-time errors
npm run build
```

All three must pass before committing. The CI workflow will also run these checks on push and PR.

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:unit

# Run tests with specific file pattern
npx vitest run --config vitest.config.ts "src/lib/server/runner"

# Run tests for a specific file
npx vitest run --config vitest.config.ts src/lib/types/config.test.ts
```

### Testing Pyramid Strategy

This project follows a testing pyramid approach. When tests are broken, **always fix lower-level tests first** before addressing higher-level tests.

```
                    ┌─────────────────┐
                    │      E2E        │  ~5%   Fix LAST
                    │   (Playwright)  │
                    ├─────────────────┤
                    │   Component     │  ~10%  Fix 3rd
                    │   (Svelte)      │
                    ├─────────────────┤
                    │  Integration    │  ~25%  Fix 2nd
                    │   (API routes)  │
                    ├─────────────────┤
                    │     Unit        │  ~60%  Fix FIRST
                    │   (Pure funcs)  │
                    └─────────────────┘
```

**When tests are broken:**

1. **Fix unit tests first** - These test pure functions with no side effects. If unit tests fail, the core logic is broken.

2. **Fix integration tests second** - Once unit tests pass, fix integration tests. These test API routes and database interactions.

3. **Fix component tests third** - After integration tests pass, fix component tests. These test UI component behavior.

4. **Fix E2E tests last** - Only after all other tests pass, address E2E test failures.

### Test File Locations

| Type | Location | Naming |
|------|----------|--------|
| Unit | `src/**/*.test.ts` | `*.test.ts` |
| Integration | `src/routes/**/*.integration.test.ts` | `*.integration.test.ts` |
| Component | `src/**/*.svelte.test.ts` | `*.svelte.test.ts` |
| E2E | `e2e/**/*.spec.ts` | `*.spec.ts` |

### Test Fixtures

Test fixtures are located in `src/test/fixtures.ts`. Use these helper functions:

```typescript
import { createTestRepoData, createTestSessionData, createTestEventData } from '$test/fixtures';
import { mockGitModule, mockGitHubModule, mockDockerModule } from '$test/fixtures';
```

### Mocking with vi.hoisted

When mocking modules that need to reference variables in vi.mock, use `vi.hoisted`:

```typescript
// Define mocks using vi.hoisted BEFORE vi.mock
const mockDb = vi.hoisted(() => ({
  query: { repos: { findMany: vi.fn() } }
}));

// Use in vi.mock
vi.mock('$lib/server/db', () => ({ db: mockDb }));

// Import after mocking
import { GET } from './+server';
```

## Database

```bash
# Push schema changes to database
npm run db:push

# Open Drizzle Studio
npm run db:studio

# Generate migrations
npm run db:generate

# Run migrations
npm run db:migrate
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
└── test/
    ├── setup.server.ts   # Test environment setup
    └── fixtures.ts       # Test data factories
```

## Common Tasks

### Adding a New API Route

1. Create route handler in `src/routes/api/`
2. Write integration tests with mocked database
3. Test manually with the UI

### Modifying the Database Schema

1. Update `src/lib/server/db/schema.ts`
2. Run `npm run db:push` (development) or `npm run db:generate` + `npm run db:migrate` (production)
3. Update any affected API routes and tests

### Adding a New Module

1. Create module in `src/lib/server/runner/`
2. Export from module index if needed
3. Write unit tests for pure functions
4. Add mock factory to `src/test/fixtures.ts`

## Documentation

### Keeping README Updated

When making changes that affect how users or developers interact with the project, update `README.md`. This includes:

- **New environment variables** - Document required/optional env vars
- **Docker/deployment changes** - Update setup instructions
- **New npm scripts** - Document new commands
- **Changed prerequisites** - Node version, database requirements, etc.
- **API changes** - Document new endpoints or breaking changes
- **Configuration changes** - New config files or options

The README is for end users and new developers. CLAUDE.md is for AI assistants and detailed development workflows.
