/**
 * Integration tests for /api/sessions/[id]/messages endpoints
 *
 * These tests mock the database and WebSocket layers to verify route handler logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestSessionData, createTestRepoData } from '$test/fixtures';

// Use vi.hoisted to define mocks that are hoisted with vi.mock
const mockDb = vi.hoisted(() => ({
	query: {
		sessions: {
			findFirst: vi.fn()
		}
	},
	insert: vi.fn(),
	update: vi.fn()
}));

const mockWsManager = vi.hoisted(() => ({
	send: vi.fn(),
	broadcast: vi.fn()
}));

// Mock the database module
vi.mock('$lib/server/db', () => ({
	db: mockDb
}));

// Mock WebSocket manager
vi.mock('sveltekit-ws', () => ({
	getWebSocketManager: () => mockWsManager
}));

// Import route handlers after mocking
import { POST } from './+server';

describe('POST /api/sessions/[id]/messages', () => {
	const sessionId = 'test-session-id';
	const repo = createTestRepoData();

	beforeEach(() => {
		vi.clearAllMocks();

		// Setup mock for insert chain
		mockDb.insert.mockReturnValue({
			values: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([{ id: BigInt(1) }])
			})
		});

		// Setup mock for update chain
		mockDb.update.mockReturnValue({
			set: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined)
			})
		});
	});

	describe('validation', () => {
		it('returns 404 for non-existent session', async () => {
			mockDb.query.sessions.findFirst.mockResolvedValue(null);

			const request = new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: 'Hello' })
			});

			await expect(
				POST({
					params: { id: 'nonexistent' },
					request
				} as Parameters<typeof POST>[0])
			).rejects.toMatchObject({ status: 404 });
		});

		it('returns 400 when message is missing', async () => {
			const session = createTestSessionData(repo.id, { id: sessionId, status: 'waiting' });
			mockDb.query.sessions.findFirst.mockResolvedValue(session);

			const request = new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});

			await expect(
				POST({
					params: { id: sessionId },
					request
				} as Parameters<typeof POST>[0])
			).rejects.toMatchObject({ status: 400 });
		});

		it('returns 400 when message is not a string', async () => {
			const session = createTestSessionData(repo.id, { id: sessionId, status: 'waiting' });
			mockDb.query.sessions.findFirst.mockResolvedValue(session);

			const request = new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: 123 })
			});

			await expect(
				POST({
					params: { id: sessionId },
					request
				} as Parameters<typeof POST>[0])
			).rejects.toMatchObject({ status: 400 });
		});
	});

	describe('session status checks', () => {
		it('sends message when session is waiting', async () => {
			const session = createTestSessionData(repo.id, {
				id: sessionId,
				status: 'waiting',
				containerId: 'container-123'
			});
			mockDb.query.sessions.findFirst.mockResolvedValue(session);

			const request = new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: 'Hello agent' })
			});

			const response = await POST({
				params: { id: sessionId },
				request
			} as Parameters<typeof POST>[0]);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.sent).toBe(true);
			expect(data.sessionStatus).toBe('running');
		});

		it('rejects message when session is running without force', async () => {
			const session = createTestSessionData(repo.id, {
				id: sessionId,
				status: 'running',
				containerId: 'container-123'
			});
			mockDb.query.sessions.findFirst.mockResolvedValue(session);

			const request = new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: 'Hello' })
			});

			await expect(
				POST({
					params: { id: sessionId },
					request
				} as Parameters<typeof POST>[0])
			).rejects.toMatchObject({ status: 400 });
		});

		it('allows message when session is running with force=true', async () => {
			const session = createTestSessionData(repo.id, {
				id: sessionId,
				status: 'running',
				containerId: 'container-123'
			});
			mockDb.query.sessions.findFirst.mockResolvedValue(session);

			const request = new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: 'Hello', force: true })
			});

			const response = await POST({
				params: { id: sessionId },
				request
			} as Parameters<typeof POST>[0]);

			expect(response.status).toBe(200);
		});

		it('returns 400 when session has no container', async () => {
			const session = createTestSessionData(repo.id, {
				id: sessionId,
				status: 'waiting',
				containerId: null
			});
			mockDb.query.sessions.findFirst.mockResolvedValue(session);

			const request = new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: 'Hello' })
			});

			await expect(
				POST({
					params: { id: sessionId },
					request
				} as Parameters<typeof POST>[0])
			).rejects.toMatchObject({ status: 400 });
		});
	});

	describe('message handling', () => {
		it('updates session status to running', async () => {
			const session = createTestSessionData(repo.id, {
				id: sessionId,
				status: 'waiting',
				containerId: 'container-123'
			});
			mockDb.query.sessions.findFirst.mockResolvedValue(session);

			const request = new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: 'Continue please' })
			});

			await POST({
				params: { id: sessionId },
				request
			} as Parameters<typeof POST>[0]);

			expect(mockDb.update).toHaveBeenCalled();
		});

		it('inserts user message event', async () => {
			const session = createTestSessionData(repo.id, {
				id: sessionId,
				status: 'waiting',
				containerId: 'container-123'
			});
			mockDb.query.sessions.findFirst.mockResolvedValue(session);

			const request = new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: 'My message' })
			});

			await POST({
				params: { id: sessionId },
				request
			} as Parameters<typeof POST>[0]);

			expect(mockDb.insert).toHaveBeenCalled();
		});

		it('broadcasts message via WebSocket', async () => {
			const session = createTestSessionData(repo.id, {
				id: sessionId,
				status: 'waiting',
				containerId: 'container-123'
			});
			mockDb.query.sessions.findFirst.mockResolvedValue(session);

			const request = new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: 'Hello agent' })
			});

			await POST({
				params: { id: sessionId },
				request
			} as Parameters<typeof POST>[0]);

			expect(mockWsManager.broadcast).toHaveBeenCalled();
			const broadcastCall = mockWsManager.broadcast.mock.calls[0][0];
			expect(broadcastCall.type).toBe('agent-manager');
			expect(broadcastCall.data.kind).toBe('command');
			expect(broadcastCall.data.payload.message).toBe('Hello agent');
		});

		it('returns eventId in response', async () => {
			const session = createTestSessionData(repo.id, {
				id: sessionId,
				status: 'waiting',
				containerId: 'container-123'
			});
			mockDb.query.sessions.findFirst.mockResolvedValue(session);

			const request = new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: 'Hello' })
			});

			const response = await POST({
				params: { id: sessionId },
				request
			} as Parameters<typeof POST>[0]);

			const data = await response.json();
			expect(data.eventId).toBeDefined();
			expect(typeof data.eventId).toBe('string');
		});
	});
});
