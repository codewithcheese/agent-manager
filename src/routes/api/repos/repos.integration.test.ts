/**
 * Integration tests for /api/repos endpoints
 *
 * These tests mock the database layer to verify route handler logic
 * without requiring an actual database connection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestRepoData, createTestSessionData } from '$test/fixtures';

// Use vi.hoisted to define mocks that are hoisted with vi.mock
const mockDb = vi.hoisted(() => ({
	query: {
		repos: {
			findMany: vi.fn(),
			findFirst: vi.fn()
		},
		sessions: {
			findMany: vi.fn()
		}
	},
	insert: vi.fn(),
	update: vi.fn(),
	delete: vi.fn()
}));

const mockGitHubModule = vi.hoisted(() => ({
	checkAuth: vi.fn().mockResolvedValue({ authenticated: true, user: { login: 'testuser' } }),
	getToken: vi.fn().mockResolvedValue('test-token'),
	listRepos: vi.fn().mockResolvedValue([]),
	getRepo: vi.fn().mockResolvedValue({ owner: 'test', name: 'repo', defaultBranch: 'main' }),
	createRepo: vi.fn().mockResolvedValue({ owner: 'test', name: 'new-repo' }),
	findPRsForBranch: vi.fn().mockResolvedValue([]),
	getFileContent: vi.fn().mockResolvedValue(null),
	getUrls: vi.fn().mockReturnValue({ repo: 'https://github.com/test/repo' })
}));

// Mock the database module
vi.mock('$lib/server/db', () => ({
	db: mockDb
}));

// Mock GitHub module
vi.mock('$lib/server/runner/github', () => ({
	getGitHubModule: () => mockGitHubModule
}));

// Import route handlers after mocking
import { GET, POST } from './+server';

describe('GET /api/repos', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns empty array when no repos exist', async () => {
		mockDb.query.repos.findMany.mockResolvedValue([]);

		const response = await GET({
			url: new URL('http://localhost/api/repos')
		} as unknown as Parameters<typeof GET>[0]);

		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data.repos).toEqual([]);
	});

	it('returns repos with session statistics', async () => {
		const repo = createTestRepoData({ id: 'repo-1' });
		const sessions = [
			createTestSessionData('repo-1', { id: 'session-1', status: 'running' }),
			createTestSessionData('repo-1', { id: 'session-2', status: 'waiting' }),
			createTestSessionData('repo-1', { id: 'session-3', status: 'finished' })
		];

		mockDb.query.repos.findMany.mockResolvedValue([repo]);
		mockDb.query.sessions.findMany.mockResolvedValue(sessions);

		const response = await GET({
			url: new URL('http://localhost/api/repos')
		} as unknown as Parameters<typeof GET>[0]);

		expect(response.status).toBe(200);
		const data = await response.json();

		expect(data.repos).toHaveLength(1);
		expect(data.repos[0].stats).toEqual({
			totalSessions: 3,
			activeSessions: 2, // running + waiting
			hasRunning: true,
			hasWaiting: true,
			hasError: false
		});
	});

	it('includes fullName property', async () => {
		const repo = createTestRepoData({ owner: 'myorg', name: 'myrepo' });
		mockDb.query.repos.findMany.mockResolvedValue([repo]);
		mockDb.query.sessions.findMany.mockResolvedValue([]);

		const response = await GET({
			url: new URL('http://localhost/api/repos')
		} as unknown as Parameters<typeof GET>[0]);

		const data = await response.json();
		expect(data.repos[0].fullName).toBe('myorg/myrepo');
	});

	it('correctly detects error sessions', async () => {
		const repo = createTestRepoData();
		const sessions = [createTestSessionData('test-repo-id', { status: 'error' })];

		mockDb.query.repos.findMany.mockResolvedValue([repo]);
		mockDb.query.sessions.findMany.mockResolvedValue(sessions);

		const response = await GET({
			url: new URL('http://localhost/api/repos')
		} as unknown as Parameters<typeof GET>[0]);

		const data = await response.json();
		expect(data.repos[0].stats.hasError).toBe(true);
	});

	it('counts starting sessions as active', async () => {
		const repo = createTestRepoData();
		const sessions = [createTestSessionData('test-repo-id', { status: 'starting' })];

		mockDb.query.repos.findMany.mockResolvedValue([repo]);
		mockDb.query.sessions.findMany.mockResolvedValue(sessions);

		const response = await GET({
			url: new URL('http://localhost/api/repos')
		} as unknown as Parameters<typeof GET>[0]);

		const data = await response.json();
		expect(data.repos[0].stats.activeSessions).toBe(1);
	});

	it('does not count finished or stopped sessions as active', async () => {
		const repo = createTestRepoData();
		const sessions = [
			createTestSessionData('test-repo-id', { id: 's1', status: 'finished' }),
			createTestSessionData('test-repo-id', { id: 's2', status: 'stopped' })
		];

		mockDb.query.repos.findMany.mockResolvedValue([repo]);
		mockDb.query.sessions.findMany.mockResolvedValue(sessions);

		const response = await GET({
			url: new URL('http://localhost/api/repos')
		} as unknown as Parameters<typeof GET>[0]);

		const data = await response.json();
		expect(data.repos[0].stats.activeSessions).toBe(0);
		expect(data.repos[0].stats.totalSessions).toBe(2);
	});

	it('formats dates as ISO strings', async () => {
		const now = new Date('2024-01-15T12:00:00.000Z');
		const repo = createTestRepoData({
			createdAt: now,
			updatedAt: now,
			lastActivityAt: now
		});

		mockDb.query.repos.findMany.mockResolvedValue([repo]);
		mockDb.query.sessions.findMany.mockResolvedValue([]);

		const response = await GET({
			url: new URL('http://localhost/api/repos')
		} as unknown as Parameters<typeof GET>[0]);

		const data = await response.json();
		expect(data.repos[0].createdAt).toBe('2024-01-15T12:00:00.000Z');
		expect(data.repos[0].updatedAt).toBe('2024-01-15T12:00:00.000Z');
		expect(data.repos[0].lastActivityAt).toBe('2024-01-15T12:00:00.000Z');
	});

	it('handles null lastActivityAt', async () => {
		const repo = createTestRepoData({ lastActivityAt: null });
		mockDb.query.repos.findMany.mockResolvedValue([repo]);
		mockDb.query.sessions.findMany.mockResolvedValue([]);

		const response = await GET({
			url: new URL('http://localhost/api/repos')
		} as unknown as Parameters<typeof GET>[0]);

		const data = await response.json();
		expect(data.repos[0].lastActivityAt).toBeNull();
	});
});

describe('POST /api/repos', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns 400 when owner is missing', async () => {
		const request = new Request('http://localhost/api/repos', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: 'repo' })
		});

		await expect(POST({ request } as Parameters<typeof POST>[0])).rejects.toMatchObject({
			status: 400
		});
	});

	it('returns 400 when name is missing', async () => {
		const request = new Request('http://localhost/api/repos', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ owner: 'owner' })
		});

		await expect(POST({ request } as Parameters<typeof POST>[0])).rejects.toMatchObject({
			status: 400
		});
	});

	it('returns existing repo when already registered', async () => {
		const existingRepo = createTestRepoData();
		mockDb.query.repos.findFirst.mockResolvedValue(existingRepo);

		const request = new Request('http://localhost/api/repos', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ owner: 'test-owner', name: 'test-repo' })
		});

		const response = await POST({ request } as Parameters<typeof POST>[0]);
		expect(response.status).toBe(200);

		const data = await response.json();
		expect(data.created).toBe(false);
		expect(data.repo).toBeDefined();
	});

	it('creates new repo when not existing', async () => {
		mockDb.query.repos.findFirst.mockResolvedValue(null);

		const newRepo = createTestRepoData({ id: 'new-repo-id' });
		mockDb.insert.mockReturnValue({
			values: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([newRepo])
			})
		});

		const request = new Request('http://localhost/api/repos', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ owner: 'test', name: 'repo' })
		});

		const response = await POST({ request } as Parameters<typeof POST>[0]);
		expect(response.status).toBe(201);

		const data = await response.json();
		expect(data.created).toBe(true);
		expect(data.repo).toBeDefined();
	});
});
