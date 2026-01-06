/**
 * API Routes for Session Events
 *
 * GET /api/sessions/[id]/events - Get events for a session (paginated)
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { sessions, events } from '$lib/server/db/schema';
import { eq, gt, lt, desc, asc, and } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params, url }) => {
	const { id: sessionId } = params;

	// Pagination params
	const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 1000);
	const afterId = url.searchParams.get('after'); // Get events after this ID
	const beforeId = url.searchParams.get('before'); // Get events before this ID
	const order = url.searchParams.get('order') === 'desc' ? 'desc' : 'asc';

	// Filter params
	const source = url.searchParams.get('source'); // claude, runner, manager
	const type = url.searchParams.get('type'); // Filter by event type

	// Verify session exists
	const session = await db.query.sessions.findFirst({
		where: eq(sessions.id, sessionId)
	});

	if (!session) {
		throw error(404, 'Session not found');
	}

	// Build query conditions
	const conditions = [eq(events.sessionId, sessionId)];

	if (afterId) {
		conditions.push(gt(events.id, BigInt(afterId)));
	}

	if (beforeId) {
		conditions.push(lt(events.id, BigInt(beforeId)));
	}

	if (source) {
		const validSources = ['claude', 'runner', 'manager'];
		if (validSources.includes(source)) {
			conditions.push(eq(events.source, source as 'claude' | 'runner' | 'manager'));
		}
	}

	// Execute query
	let eventList = await db.query.events.findMany({
		where: and(...conditions),
		orderBy: order === 'desc' ? [desc(events.id)] : [asc(events.id)],
		limit: limit + 1 // Fetch one extra to check for more
	});

	// Check if there are more events
	const hasMore = eventList.length > limit;
	if (hasMore) {
		eventList = eventList.slice(0, limit);
	}

	// Filter by type if specified (done in memory for simplicity)
	if (type) {
		eventList = eventList.filter((e) => e.type === type);
	}

	// Transform events
	const transformedEvents = eventList.map((e) => ({
		id: e.id.toString(),
		ts: e.ts.toISOString(),
		source: e.source,
		type: e.type,
		payload: e.payload
	}));

	// Determine cursors for pagination
	const firstEvent = transformedEvents[0];
	const lastEvent = transformedEvents[transformedEvents.length - 1];

	return json({
		events: transformedEvents,
		pagination: {
			limit,
			hasMore,
			nextCursor: hasMore && lastEvent ? lastEvent.id : null,
			prevCursor: firstEvent ? firstEvent.id : null
		},
		session: {
			id: session.id,
			status: session.status,
			lastEventId: session.lastEventId?.toString() || null
		}
	});
};
