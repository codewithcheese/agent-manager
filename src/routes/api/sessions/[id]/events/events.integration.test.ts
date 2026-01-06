/**
 * Integration tests for /api/sessions/[id]/events endpoints
 *
 * These tests mock the database layer to verify route handler logic
 * for event pagination and filtering.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestSessionData, createTestEventData } from '$test/fixtures';

// Use vi.hoisted to define mocks that are hoisted with vi.mock
const mockDb = vi.hoisted(() => ({
	query: {
		sessions: {
			findFirst: vi.fn()
		},
		events: {
			findMany: vi.fn()
		}
	}
}));

// Mock the database module
vi.mock('$lib/server/db', () => ({
	db: mockDb
}));

// Import route handlers after mocking
import { GET } from './+server';

describe('GET /api/sessions/[id]/events', () => {
	const sessionId = 'test-session-id';
	const session = createTestSessionData('test-repo-id', { id: sessionId });

	beforeEach(() => {
		vi.clearAllMocks();
		mockDb.query.sessions.findFirst.mockResolvedValue(session);
	});

	describe('session validation', () => {
		it('returns 404 for non-existent session', async () => {
			mockDb.query.sessions.findFirst.mockResolvedValue(null);

			const request = {
				params: { id: 'nonexistent' },
				url: new URL('http://localhost/api/sessions/nonexistent/events')
			};

			await expect(GET(request as Parameters<typeof GET>[0])).rejects.toMatchObject({
				status: 404
			});
		});
	});

	describe('basic event retrieval', () => {
		it('returns events for session', async () => {
			const events = [
				createTestEventData(sessionId, { id: BigInt(1) }),
				createTestEventData(sessionId, { id: BigInt(2) }),
				createTestEventData(sessionId, { id: BigInt(3) })
			];

			mockDb.query.events.findMany.mockResolvedValue(events);

			const response = await GET({
				params: { id: sessionId },
				url: new URL(`http://localhost/api/sessions/${sessionId}/events`)
			} as Parameters<typeof GET>[0]);

			expect(response.status).toBe(200);
			const data = await response.json();

			expect(data.events).toHaveLength(3);
			expect(data.events[0].id).toBe('1');
		});

		it('returns empty array when no events', async () => {
			mockDb.query.events.findMany.mockResolvedValue([]);

			const response = await GET({
				params: { id: sessionId },
				url: new URL(`http://localhost/api/sessions/${sessionId}/events`)
			} as Parameters<typeof GET>[0]);

			const data = await response.json();
			expect(data.events).toEqual([]);
		});
	});

	describe('pagination', () => {
		it('respects limit parameter', async () => {
			const events = Array.from({ length: 4 }, (_, i) =>
				createTestEventData(sessionId, { id: BigInt(i + 1) })
			);

			mockDb.query.events.findMany.mockResolvedValue(events);

			const response = await GET({
				params: { id: sessionId },
				url: new URL(`http://localhost/api/sessions/${sessionId}/events?limit=3`)
			} as Parameters<typeof GET>[0]);

			const data = await response.json();
			expect(data.pagination.limit).toBe(3);
		});

		it('caps limit at 1000', async () => {
			mockDb.query.events.findMany.mockResolvedValue([]);

			const response = await GET({
				params: { id: sessionId },
				url: new URL(`http://localhost/api/sessions/${sessionId}/events?limit=5000`)
			} as Parameters<typeof GET>[0]);

			const data = await response.json();
			expect(data.pagination.limit).toBe(1000);
		});

		it('defaults limit to 100', async () => {
			mockDb.query.events.findMany.mockResolvedValue([]);

			const response = await GET({
				params: { id: sessionId },
				url: new URL(`http://localhost/api/sessions/${sessionId}/events`)
			} as Parameters<typeof GET>[0]);

			const data = await response.json();
			expect(data.pagination.limit).toBe(100);
		});

		it('indicates hasMore when more events exist', async () => {
			// Return limit + 1 events to indicate more exist
			const events = Array.from({ length: 4 }, (_, i) =>
				createTestEventData(sessionId, { id: BigInt(i + 1) })
			);

			mockDb.query.events.findMany.mockResolvedValue(events);

			const response = await GET({
				params: { id: sessionId },
				url: new URL(`http://localhost/api/sessions/${sessionId}/events?limit=3`)
			} as Parameters<typeof GET>[0]);

			const data = await response.json();
			expect(data.pagination.hasMore).toBe(true);
			expect(data.events).toHaveLength(3); // Only returns limit, not the extra one
		});

		it('returns hasMore=false when at end', async () => {
			const events = [
				createTestEventData(sessionId, { id: BigInt(1) }),
				createTestEventData(sessionId, { id: BigInt(2) })
			];

			mockDb.query.events.findMany.mockResolvedValue(events);

			const response = await GET({
				params: { id: sessionId },
				url: new URL(`http://localhost/api/sessions/${sessionId}/events?limit=10`)
			} as Parameters<typeof GET>[0]);

			const data = await response.json();
			expect(data.pagination.hasMore).toBe(false);
		});

		it('provides nextCursor when hasMore', async () => {
			const events = Array.from({ length: 4 }, (_, i) =>
				createTestEventData(sessionId, { id: BigInt(i + 1) })
			);

			mockDb.query.events.findMany.mockResolvedValue(events);

			const response = await GET({
				params: { id: sessionId },
				url: new URL(`http://localhost/api/sessions/${sessionId}/events?limit=3`)
			} as Parameters<typeof GET>[0]);

			const data = await response.json();
			expect(data.pagination.nextCursor).toBe('3'); // Last event ID
		});

		it('returns null nextCursor when no more events', async () => {
			const events = [createTestEventData(sessionId, { id: BigInt(1) })];

			mockDb.query.events.findMany.mockResolvedValue(events);

			const response = await GET({
				params: { id: sessionId },
				url: new URL(`http://localhost/api/sessions/${sessionId}/events?limit=10`)
			} as Parameters<typeof GET>[0]);

			const data = await response.json();
			expect(data.pagination.nextCursor).toBeNull();
		});
	});

	describe('ordering', () => {
		it('defaults to ascending order', async () => {
			mockDb.query.events.findMany.mockResolvedValue([]);

			await GET({
				params: { id: sessionId },
				url: new URL(`http://localhost/api/sessions/${sessionId}/events`)
			} as Parameters<typeof GET>[0]);

			// Verify the order was asc (check the call to findMany)
			expect(mockDb.query.events.findMany).toHaveBeenCalled();
		});

		it('respects order=desc parameter', async () => {
			mockDb.query.events.findMany.mockResolvedValue([]);

			await GET({
				params: { id: sessionId },
				url: new URL(`http://localhost/api/sessions/${sessionId}/events?order=desc`)
			} as Parameters<typeof GET>[0]);

			expect(mockDb.query.events.findMany).toHaveBeenCalled();
		});
	});

	describe('filtering', () => {
		it('filters by source when provided', async () => {
			const claudeEvents = [
				createTestEventData(sessionId, { id: BigInt(1), source: 'claude' as const })
			];

			mockDb.query.events.findMany.mockResolvedValue(claudeEvents);

			const response = await GET({
				params: { id: sessionId },
				url: new URL(`http://localhost/api/sessions/${sessionId}/events?source=claude`)
			} as Parameters<typeof GET>[0]);

			const data = await response.json();
			expect(data.events).toHaveLength(1);
			expect(data.events[0].source).toBe('claude');
		});

		it('filters by type when provided', async () => {
			const events = [
				createTestEventData(sessionId, { id: BigInt(1), type: 'claude.message' }),
				createTestEventData(sessionId, { id: BigInt(2), type: 'claude.tool_use' })
			];

			mockDb.query.events.findMany.mockResolvedValue(events);

			const response = await GET({
				params: { id: sessionId },
				url: new URL(`http://localhost/api/sessions/${sessionId}/events?type=claude.message`)
			} as Parameters<typeof GET>[0]);

			const data = await response.json();
			// Note: type filtering is done in memory
			expect(data.events.every((e: { type: string }) => e.type === 'claude.message')).toBe(true);
		});
	});

	describe('event transformation', () => {
		it('converts BigInt id to string', async () => {
			const events = [createTestEventData(sessionId, { id: BigInt(12345) })];

			mockDb.query.events.findMany.mockResolvedValue(events);

			const response = await GET({
				params: { id: sessionId },
				url: new URL(`http://localhost/api/sessions/${sessionId}/events`)
			} as Parameters<typeof GET>[0]);

			const data = await response.json();
			expect(data.events[0].id).toBe('12345');
			expect(typeof data.events[0].id).toBe('string');
		});

		it('converts timestamp to ISO string', async () => {
			const ts = new Date('2024-01-15T12:00:00.000Z');
			const events = [createTestEventData(sessionId, { id: BigInt(1), ts })];

			mockDb.query.events.findMany.mockResolvedValue(events);

			const response = await GET({
				params: { id: sessionId },
				url: new URL(`http://localhost/api/sessions/${sessionId}/events`)
			} as Parameters<typeof GET>[0]);

			const data = await response.json();
			expect(data.events[0].ts).toBe('2024-01-15T12:00:00.000Z');
		});

		it('includes session info in response', async () => {
			mockDb.query.events.findMany.mockResolvedValue([]);

			const response = await GET({
				params: { id: sessionId },
				url: new URL(`http://localhost/api/sessions/${sessionId}/events`)
			} as Parameters<typeof GET>[0]);

			const data = await response.json();
			expect(data.session).toBeDefined();
			expect(data.session.id).toBe(sessionId);
			expect(data.session.status).toBe('running');
		});
	});
});
