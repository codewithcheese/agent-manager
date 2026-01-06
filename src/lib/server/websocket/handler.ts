/**
 * WebSocket Handler Module
 *
 * Implements the canonical WebSocket protocol for Agent Manager:
 * - Event ingestion from containers
 * - Live updates to UI clients
 * - Command handling from UI
 * - Subscription management
 */

import { getWebSocketManager, type WSMessage as SkWSMessage } from 'sveltekit-ws';
import type {
	WSMessage,
	WSCommand,
	WSEventMessage,
	RepoSummary,
	SessionSummary,
	StoredEvent
} from '../../types/websocket';
import { db } from '../db';
import { repos, sessions, events } from '../db/schema';
import { eq, desc, and, gt } from 'drizzle-orm';

// Define our own connection interface since sveltekit-ws doesn't export it
interface WSConnection {
	id: string;
}

// Client type tracking
type ClientType = 'ui' | 'container';

interface ClientInfo {
	type: ClientType;
	sessionId?: string; // For container clients
	subscriptions: Set<string>; // Subscription IDs
}

// Global state
const clients = new Map<string, ClientInfo>();
const subscriptions = new Map<string, Set<string>>(); // subscription key -> connection IDs

// Sequence counter for messages
let seqCounter = 0;

function nextSeq(): number {
	return ++seqCounter;
}

function createMessage<T>(
	kind: WSMessage<T>['kind'],
	sessionId: string | null,
	payload: T
): SkWSMessage {
	// Our protocol uses a different format than sveltekit-ws default
	// We wrap our format in the sveltekit-ws expected structure
	return {
		type: 'agent-manager',
		data: {
			v: 1,
			kind,
			sessionId,
			ts: new Date().toISOString(),
			seq: nextSeq(),
			payload
		}
	};
}

/**
 * Initialize WebSocket handlers for the canonical protocol.
 */
export function createWebSocketHandlers() {
	return {
		onConnect: (connection: WSConnection) => {
			console.log(`[WS] Client connected: ${connection.id}`);

			// Default to UI client, will be updated if container identifies itself
			clients.set(connection.id, {
				type: 'ui',
				subscriptions: new Set()
			});

			// Send welcome message
			const manager = getWebSocketManager();
			manager.send(
				connection.id,
				createMessage('ack', null, {
					commandSeq: 0,
					success: true,
					data: { connectionId: connection.id, message: 'Connected to Agent Manager' }
				})
			);
		},

		onMessage: async (connection: WSConnection, message: unknown) => {
			const manager = getWebSocketManager();

			try {
				const wsMessage = message as WSMessage<unknown>;

				// Validate message format
				if (!wsMessage || wsMessage.v !== 1) {
					manager.send(
						connection.id,
						createMessage('error', null, {
							code: 'INVALID_MESSAGE',
							message: 'Invalid message format'
						})
					);
					return;
				}

				switch (wsMessage.kind) {
					case 'event':
						await handleEvent(connection, wsMessage as WSEventMessage);
						break;

					case 'command':
						await handleCommand(connection, wsMessage as WSMessage<WSCommand>);
						break;

					case 'subscribe':
						handleSubscribe(connection, wsMessage);
						break;

					default:
						manager.send(
							connection.id,
							createMessage('error', null, {
								code: 'UNKNOWN_KIND',
								message: `Unknown message kind: ${wsMessage.kind}`
							})
						);
				}
			} catch (error) {
				console.error(`[WS] Error handling message from ${connection.id}:`, error);
				manager.send(
					connection.id,
					createMessage('error', null, {
						code: 'INTERNAL_ERROR',
						message: error instanceof Error ? error.message : 'Internal error'
					})
				);
			}
		},

		onDisconnect: async (connection: WSConnection) => {
			console.log(`[WS] Client disconnected: ${connection.id}`);

			const client = clients.get(connection.id);
			if (client) {
				// Clean up subscriptions
				for (const subId of client.subscriptions) {
					const subs = subscriptions.get(subId);
					if (subs) {
						subs.delete(connection.id);
						if (subs.size === 0) {
							subscriptions.delete(subId);
						}
					}
				}

				// If this was a container client, update session status
				if (client.type === 'container' && client.sessionId) {
					await handleContainerDisconnect(client.sessionId);
				}

				clients.delete(connection.id);
			}
		},

		onError: (connection: WSConnection, error: Error) => {
			console.error(`[WS] Error for ${connection.id}:`, error);
		}
	};
}

/**
 * Handle event messages from containers.
 */
async function handleEvent(connection: WSConnection, message: WSEventMessage) {
	const client = clients.get(connection.id);
	const manager = getWebSocketManager();

	// Mark client as container type
	if (client && client.type !== 'container') {
		client.type = 'container';
		client.sessionId = message.sessionId;
	}

	// Determine event source and type
	const payload = message.payload;
	let source: 'claude' | 'runner' = 'claude';
	let type = 'unknown';

	if ('claudeMessage' in payload) {
		source = 'claude';
		type = (payload.claudeMessage as Record<string, unknown>).type as string || 'claude.message';
	} else if ('runnerEvent' in payload) {
		source = 'runner';
		type = payload.runnerEvent.type;
	}

	// Persist event to database
	const [insertedEvent] = await db
		.insert(events)
		.values({
			sessionId: message.sessionId,
			source,
			type,
			payload: payload as unknown as Record<string, unknown>
		})
		.returning();

	// Update session's last_event_id and updated_at
	await db
		.update(sessions)
		.set({
			lastEventId: insertedEvent.id,
			updatedAt: new Date()
		})
		.where(eq(sessions.id, message.sessionId));

	// Update repo's last_activity_at
	const session = await db.query.sessions.findFirst({
		where: eq(sessions.id, message.sessionId)
	});

	if (session) {
		await db
			.update(repos)
			.set({ lastActivityAt: new Date(), updatedAt: new Date() })
			.where(eq(repos.id, session.repoId));
	}

	// Broadcast to subscribed UI clients
	const storedEvent: StoredEvent = {
		id: insertedEvent.id.toString(),
		ts: insertedEvent.ts.toISOString(),
		source: insertedEvent.source,
		type: insertedEvent.type,
		payload: insertedEvent.payload as Record<string, unknown>
	};

	broadcastToSubscribers(`session:${message.sessionId}`, createMessage('event', message.sessionId, {
		sessionId: message.sessionId,
		event: storedEvent
	}));

	// Also broadcast to repo subscribers
	if (session) {
		broadcastToSubscribers(`repo:${session.repoId}`, createMessage('event', message.sessionId, {
			sessionId: message.sessionId,
			event: storedEvent
		}));
	}

	// Check for idle status (session.idle event from runner)
	if (type === 'session.idle') {
		await db
			.update(sessions)
			.set({ status: 'waiting', updatedAt: new Date() })
			.where(eq(sessions.id, message.sessionId));

		broadcastSessionUpdate(message.sessionId);
	}

	// Send ack
	manager.send(connection.id, createMessage('ack', message.sessionId, {
		commandSeq: message.seq,
		success: true,
		data: { eventId: insertedEvent.id.toString() }
	}));
}

/**
 * Handle command messages from UI clients.
 */
async function handleCommand(connection: WSConnection, message: WSMessage<WSCommand>) {
	const manager = getWebSocketManager();
	const command = message.payload;

	switch (command.type) {
		case 'session.start':
			// This will be handled by the API routes, send ack with redirect
			manager.send(connection.id, createMessage('ack', null, {
				commandSeq: message.seq,
				success: true,
				data: { message: 'Use POST /api/sessions to start a session' }
			}));
			break;

		case 'session.stop':
			await handleStopSession(connection, message.seq, command.sessionId);
			break;

		case 'session.send_message':
			await handleSendMessage(connection, message.seq, command.sessionId, command.message, command.force);
			break;

		case 'subscribe.repo_list':
			subscribe(connection.id, 'repo_list');
			await sendRepoListSnapshot(connection.id);
			manager.send(connection.id, createMessage('ack', null, {
				commandSeq: message.seq,
				success: true,
				data: { subscriptionId: 'repo_list' }
			}));
			break;

		case 'subscribe.repo':
			if (command.repoId) {
				subscribe(connection.id, `repo:${command.repoId}`);
				await sendRepoSnapshot(connection.id, command.repoId);
				manager.send(connection.id, createMessage('ack', null, {
					commandSeq: message.seq,
					success: true,
					data: { subscriptionId: `repo:${command.repoId}` }
				}));
			}
			break;

		case 'subscribe.session':
			if (command.sessionId) {
				subscribe(connection.id, `session:${command.sessionId}`);
				await sendSessionSnapshot(connection.id, command.sessionId);
				manager.send(connection.id, createMessage('ack', null, {
					commandSeq: message.seq,
					success: true,
					data: { subscriptionId: `session:${command.sessionId}` }
				}));
			}
			break;

		case 'unsubscribe':
			unsubscribe(connection.id, command.subscriptionId);
			manager.send(connection.id, createMessage('ack', null, {
				commandSeq: message.seq,
				success: true
			}));
			break;

		case 'snapshot.request':
			await handleSnapshotRequest(connection, message.seq, command);
			break;

		default:
			manager.send(connection.id, createMessage('error', null, {
				code: 'UNKNOWN_COMMAND',
				message: `Unknown command type: ${(command as { type: string }).type}`
			}));
	}
}

/**
 * Handle subscribe messages.
 */
function handleSubscribe(connection: WSConnection, message: WSMessage<unknown>) {
	// Legacy subscribe format - redirect to command handling
	const payload = message.payload as { target?: string; repoId?: string; sessionId?: string };
	if (payload.target === 'repo_list') {
		subscribe(connection.id, 'repo_list');
	} else if (payload.repoId) {
		subscribe(connection.id, `repo:${payload.repoId}`);
	} else if (payload.sessionId) {
		subscribe(connection.id, `session:${payload.sessionId}`);
	}
}

/**
 * Subscribe a connection to a topic.
 */
function subscribe(connectionId: string, subscriptionKey: string) {
	const client = clients.get(connectionId);
	if (client) {
		client.subscriptions.add(subscriptionKey);
	}

	if (!subscriptions.has(subscriptionKey)) {
		subscriptions.set(subscriptionKey, new Set());
	}
	subscriptions.get(subscriptionKey)!.add(connectionId);
}

/**
 * Unsubscribe a connection from a topic.
 */
function unsubscribe(connectionId: string, subscriptionKey: string) {
	const client = clients.get(connectionId);
	if (client) {
		client.subscriptions.delete(subscriptionKey);
	}

	const subs = subscriptions.get(subscriptionKey);
	if (subs) {
		subs.delete(connectionId);
		if (subs.size === 0) {
			subscriptions.delete(subscriptionKey);
		}
	}
}

/**
 * Broadcast a message to all subscribers of a topic.
 */
function broadcastToSubscribers(subscriptionKey: string, message: SkWSMessage) {
	const manager = getWebSocketManager();
	const subs = subscriptions.get(subscriptionKey);
	if (subs) {
		for (const connectionId of subs) {
			const client = clients.get(connectionId);
			if (client?.type === 'ui') {
				manager.send(connectionId, message);
			}
		}
	}
}

/**
 * Handle container disconnect - update session status.
 */
async function handleContainerDisconnect(sessionId: string) {
	const session = await db.query.sessions.findFirst({
		where: eq(sessions.id, sessionId)
	});

	if (session && session.status !== 'stopped' && session.status !== 'finished') {
		await db
			.update(sessions)
			.set({
				status: 'error',
				updatedAt: new Date()
			})
			.where(eq(sessions.id, sessionId));

		// Insert manager event
		await db.insert(events).values({
			sessionId,
			source: 'manager',
			type: 'container.disconnected',
			payload: { reason: 'connection_lost' }
		});

		broadcastSessionUpdate(sessionId);
	}
}

/**
 * Handle stop session command.
 */
async function handleStopSession(connection: WSConnection, commandSeq: number, sessionId: string) {
	const manager = getWebSocketManager();

	try {
		await db
			.update(sessions)
			.set({
				status: 'stopped',
				finishedAt: new Date(),
				updatedAt: new Date()
			})
			.where(eq(sessions.id, sessionId));

		// Insert manager event
		await db.insert(events).values({
			sessionId,
			source: 'manager',
			type: 'session.stopped',
			payload: { stoppedBy: 'user' }
		});

		broadcastSessionUpdate(sessionId);

		manager.send(connection.id, createMessage('ack', sessionId, {
			commandSeq,
			success: true
		}));
	} catch (error) {
		manager.send(connection.id, createMessage('error', sessionId, {
			code: 'STOP_FAILED',
			message: error instanceof Error ? error.message : 'Failed to stop session'
		}));
	}
}

/**
 * Handle send message command - relay to container.
 */
async function handleSendMessage(
	connection: WSConnection,
	commandSeq: number,
	sessionId: string,
	messageText: string,
	force?: boolean
) {
	const wsManager = getWebSocketManager();

	// Find the container connection for this session
	let containerConnectionId: string | null = null;
	for (const [connId, client] of clients) {
		if (client.type === 'container' && client.sessionId === sessionId) {
			containerConnectionId = connId;
			break;
		}
	}

	if (!containerConnectionId) {
		wsManager.send(connection.id, createMessage('error', sessionId, {
			code: 'NO_CONTAINER',
			message: 'No container connected for this session'
		}));
		return;
	}

	// Check session status (unless force)
	if (!force) {
		const session = await db.query.sessions.findFirst({
			where: eq(sessions.id, sessionId)
		});

		if (session && session.status !== 'waiting') {
			wsManager.send(connection.id, createMessage('error', sessionId, {
				code: 'SESSION_NOT_WAITING',
				message: `Session is ${session.status}, not waiting for input. Use force=true to send anyway.`
			}));
			return;
		}
	}

	// Update session status to running
	await db
		.update(sessions)
		.set({ status: 'running', updatedAt: new Date() })
		.where(eq(sessions.id, sessionId));

	// Send message to container
	wsManager.send(containerConnectionId, createMessage('command', sessionId, {
		type: 'user_message',
		message: messageText
	}));

	// Insert manager event
	await db.insert(events).values({
		sessionId,
		source: 'manager',
		type: 'user.message',
		payload: { message: messageText }
	});

	broadcastSessionUpdate(sessionId);

	wsManager.send(connection.id, createMessage('ack', sessionId, {
		commandSeq,
		success: true
	}));
}

/**
 * Handle snapshot request.
 */
async function handleSnapshotRequest(
	connection: WSConnection,
	commandSeq: number,
	command: { target: string; repoId?: string; sessionId?: string; afterEventId?: string; limit?: number }
) {
	const manager = getWebSocketManager();

	switch (command.target) {
		case 'repos':
			await sendRepoListSnapshot(connection.id);
			break;

		case 'sessions':
			if (command.repoId) {
				await sendRepoSnapshot(connection.id, command.repoId);
			}
			break;

		case 'events':
			if (command.sessionId) {
				await sendEventsSnapshot(connection.id, command.sessionId, command.afterEventId, command.limit);
			}
			break;
	}

	manager.send(connection.id, createMessage('ack', null, {
		commandSeq,
		success: true
	}));
}

/**
 * Send repo list snapshot.
 */
async function sendRepoListSnapshot(connectionId: string) {
	const manager = getWebSocketManager();

	const repoList = await db.query.repos.findMany({
		orderBy: [desc(repos.lastActivityAt), desc(repos.updatedAt)]
	});

	const repoSummaries: RepoSummary[] = await Promise.all(
		repoList.map(async (repo) => {
			const sessionList = await db.query.sessions.findMany({
				where: eq(sessions.repoId, repo.id)
			});

			const activeSessions = sessionList.filter(
				(s) => s.status === 'running' || s.status === 'waiting' || s.status === 'starting'
			);

			return {
				id: repo.id,
				owner: repo.owner,
				name: repo.name,
				lastActivityAt: repo.lastActivityAt?.toISOString() || null,
				activeSessionCount: activeSessions.length,
				hasRunning: sessionList.some((s) => s.status === 'running'),
				hasWaiting: sessionList.some((s) => s.status === 'waiting'),
				hasError: sessionList.some((s) => s.status === 'error')
			};
		})
	);

	manager.send(connectionId, createMessage('snapshot', null, {
		type: 'repos',
		data: repoSummaries
	}));
}

/**
 * Send repo snapshot with sessions.
 */
async function sendRepoSnapshot(connectionId: string, repoId: string) {
	const manager = getWebSocketManager();

	const sessionList = await db.query.sessions.findMany({
		where: eq(sessions.repoId, repoId),
		orderBy: [desc(sessions.updatedAt)]
	});

	const sessionSummaries: SessionSummary[] = sessionList.map((s) => ({
		id: s.id,
		role: s.role,
		status: s.status,
		branchName: s.branchName,
		baseBranch: s.baseBranch,
		updatedAt: s.updatedAt.toISOString(),
		needsInput: s.status === 'waiting',
		prUrl: s.lastKnownPrUrl
	}));

	manager.send(connectionId, createMessage('snapshot', null, {
		type: 'sessions',
		data: sessionSummaries
	}));
}

/**
 * Send session snapshot with recent events.
 */
async function sendSessionSnapshot(connectionId: string, sessionId: string) {
	const manager = getWebSocketManager();

	// Get session info
	const session = await db.query.sessions.findFirst({
		where: eq(sessions.id, sessionId),
		with: { repo: true }
	});

	if (!session) return;

	// Get recent events (last 100)
	const eventList = await db.query.events.findMany({
		where: eq(events.sessionId, sessionId),
		orderBy: [desc(events.id)],
		limit: 100
	});

	// Reverse to get chronological order
	const storedEvents: StoredEvent[] = eventList.reverse().map((e) => ({
		id: e.id.toString(),
		ts: e.ts.toISOString(),
		source: e.source,
		type: e.type,
		payload: e.payload as Record<string, unknown>
	}));

	manager.send(connectionId, createMessage('snapshot', sessionId, {
		type: 'events',
		data: storedEvents,
		cursor: storedEvents.length > 0 ? storedEvents[storedEvents.length - 1].id : undefined
	}));
}

/**
 * Send events snapshot for pagination.
 */
async function sendEventsSnapshot(
	connectionId: string,
	sessionId: string,
	afterEventId?: string,
	limit = 100
) {
	const manager = getWebSocketManager();

	let eventList;
	if (afterEventId) {
		eventList = await db.query.events.findMany({
			where: and(
				eq(events.sessionId, sessionId),
				gt(events.id, BigInt(afterEventId))
			),
			orderBy: [events.id],
			limit
		});
	} else {
		eventList = await db.query.events.findMany({
			where: eq(events.sessionId, sessionId),
			orderBy: [events.id],
			limit
		});
	}

	const storedEvents: StoredEvent[] = eventList.map((e) => ({
		id: e.id.toString(),
		ts: e.ts.toISOString(),
		source: e.source,
		type: e.type,
		payload: e.payload as Record<string, unknown>
	}));

	manager.send(connectionId, createMessage('snapshot', sessionId, {
		type: 'events',
		data: storedEvents,
		cursor: storedEvents.length > 0 ? storedEvents[storedEvents.length - 1].id : undefined
	}));
}

/**
 * Broadcast session update to relevant subscribers.
 */
async function broadcastSessionUpdate(sessionId: string) {
	const session = await db.query.sessions.findFirst({
		where: eq(sessions.id, sessionId),
		with: { repo: true }
	});

	if (!session) return;

	const summary: SessionSummary = {
		id: session.id,
		role: session.role,
		status: session.status,
		branchName: session.branchName,
		baseBranch: session.baseBranch,
		updatedAt: session.updatedAt.toISOString(),
		needsInput: session.status === 'waiting',
		prUrl: session.lastKnownPrUrl
	};

	// Broadcast to session subscribers
	broadcastToSubscribers(`session:${sessionId}`, createMessage('event', sessionId, {
		type: 'session.updated',
		session: summary
	}));

	// Broadcast to repo subscribers
	broadcastToSubscribers(`repo:${session.repoId}`, createMessage('event', sessionId, {
		type: 'session.updated',
		session: summary
	}));

	// Broadcast to repo_list subscribers
	broadcastToSubscribers('repo_list', createMessage('event', null, {
		type: 'repo.activity',
		repoId: session.repoId
	}));
}

// Export for use by other modules
export {
	broadcastToSubscribers,
	broadcastSessionUpdate,
	createMessage,
	subscribe,
	unsubscribe
};
