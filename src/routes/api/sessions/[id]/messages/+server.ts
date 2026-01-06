/**
 * API Routes for Session Messages
 *
 * POST /api/sessions/[id]/messages - Send a message to a session
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { sessions, events } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getWebSocketManager } from 'sveltekit-ws';

export const POST: RequestHandler = async ({ params, request }) => {
	const { id: sessionId } = params;
	const body = await request.json();
	const { message, force = false } = body as { message: string; force?: boolean };

	if (!message || typeof message !== 'string') {
		throw error(400, 'message is required and must be a string');
	}

	// Get session
	const session = await db.query.sessions.findFirst({
		where: eq(sessions.id, sessionId)
	});

	if (!session) {
		throw error(404, 'Session not found');
	}

	// Check session status
	if (!force && session.status !== 'waiting') {
		throw error(
			400,
			`Session is ${session.status}, not waiting for input. Use force=true to send anyway.`
		);
	}

	// Check if container is connected
	if (!session.containerId) {
		throw error(400, 'Session has no container associated');
	}

	// Update session status to running
	await db
		.update(sessions)
		.set({ status: 'running', updatedAt: new Date() })
		.where(eq(sessions.id, sessionId));

	// Insert user message event
	const [userEvent] = await db
		.insert(events)
		.values({
			sessionId,
			source: 'manager',
			type: 'user.message',
			payload: { message }
		})
		.returning();

	// Send message to container via WebSocket
	// The container should be connected with its sessionId
	const manager = getWebSocketManager();
	const wsMessage = {
		type: 'agent-manager',
		data: {
			v: 1 as const,
			kind: 'command' as const,
			sessionId,
			ts: new Date().toISOString(),
			seq: Date.now(),
			payload: {
				type: 'user_message',
				message
			}
		}
	};

	// Broadcast to the session's container connection
	// The container identifies itself via sessionId when connecting
	manager.broadcast(wsMessage, []); // Broadcast to all - container filters by sessionId

	return json({
		sent: true,
		eventId: userEvent.id.toString(),
		sessionStatus: 'running'
	});
};
