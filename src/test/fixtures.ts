/**
 * Test Fixtures
 *
 * Factory functions for creating test data.
 * Used by both unit and integration tests.
 */

import { vi } from 'vitest';

/**
 * Create a mock git module for testing
 */
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
		getWorktreePath: vi.fn().mockReturnValue('/tmp/worktree'),
		getDefaultBranch: vi.fn().mockResolvedValue('main')
	};
}

/**
 * Create a mock GitHub module for testing
 */
export function mockGitHubModule() {
	return {
		checkAuth: vi.fn().mockResolvedValue({
			authenticated: true,
			user: { login: 'testuser' }
		}),
		getToken: vi.fn().mockResolvedValue('test-token'),
		listRepos: vi.fn().mockResolvedValue([]),
		getRepo: vi.fn().mockResolvedValue({
			owner: 'test',
			name: 'repo',
			defaultBranch: 'main'
		}),
		createRepo: vi.fn().mockResolvedValue({
			owner: 'test',
			name: 'new-repo'
		}),
		findPRsForBranch: vi.fn().mockResolvedValue([]),
		getFileContent: vi.fn().mockResolvedValue(null),
		getUrls: vi.fn().mockReturnValue({
			repo: 'https://github.com/test/repo',
			branch: undefined,
			compare: undefined,
			newPr: undefined
		})
	};
}

/**
 * Create a mock Docker module for testing
 */
export function mockDockerModule() {
	return {
		checkDocker: vi.fn().mockResolvedValue({
			available: true,
			version: '24.0.0'
		}),
		startContainer: vi.fn().mockResolvedValue({
			containerId: 'container-123',
			status: 'running'
		}),
		stopContainer: vi.fn().mockResolvedValue(undefined),
		removeContainer: vi.fn().mockResolvedValue(undefined),
		getContainerInfo: vi.fn().mockResolvedValue(null),
		listSessionContainers: vi.fn().mockResolvedValue([]),
		streamLogs: vi.fn(),
		exec: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
		getHostUrl: vi.fn().mockReturnValue('http://host.docker.internal:3000')
	};
}

/**
 * Create a mock WebSocket manager for testing
 */
export function mockWebSocketManager() {
	const connections = new Map<string, unknown[]>();

	return {
		send: vi.fn((connectionId: string, message: unknown) => {
			const messages = connections.get(connectionId) || [];
			messages.push(message);
			connections.set(connectionId, messages);
		}),

		broadcast: vi.fn((message: unknown, exclude: string[] = []) => {
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

/**
 * Create test repo data
 */
export function createTestRepoData(overrides: Record<string, unknown> = {}) {
	return {
		id: 'test-repo-id',
		owner: 'test-owner',
		name: 'test-repo',
		defaultBranch: 'main',
		createdAt: new Date(),
		updatedAt: new Date(),
		lastActivityAt: null,
		...overrides
	};
}

/**
 * Create test session data
 */
export function createTestSessionData(
	repoId: string,
	overrides: Record<string, unknown> = {}
) {
	return {
		id: 'test-session-id',
		repoId,
		role: 'implementer' as const,
		status: 'running' as const,
		branchName: 'agent/test/abc12345',
		baseBranch: 'main',
		worktreePath: '/tmp/worktree',
		containerId: 'container-123',
		createdAt: new Date(),
		updatedAt: new Date(),
		finishedAt: null,
		lastEventId: null,
		lastKnownHeadSha: null,
		lastKnownPrUrl: null,
		...overrides
	};
}

/**
 * Create test event data
 */
export function createTestEventData(
	sessionId: string,
	overrides: Record<string, unknown> = {}
) {
	return {
		id: 1,
		sessionId,
		ts: new Date(),
		source: 'claude' as const,
		type: 'claude.message',
		payload: { claudeMessage: { type: 'text', text: 'Hello' } },
		...overrides
	};
}
