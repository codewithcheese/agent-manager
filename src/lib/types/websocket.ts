/**
 * WebSocket Protocol Types
 * Based on the canonical protocol from the Agent Manager specification
 */

export type WSMessageKind = 'event' | 'command' | 'ack' | 'error' | 'subscribe' | 'snapshot';

/**
 * Base envelope for all WebSocket messages
 */
export interface WSMessage<T = unknown> {
	v: 1;
	kind: WSMessageKind;
	sessionId: string | null;
	ts: string; // ISO-8601
	seq: number;
	payload: T;
}

// ============================================
// Container → Manager (Event Ingestion)
// ============================================

export interface ClaudeMessagePayload {
	claudeMessage: Record<string, unknown>; // Raw Claude SDK message object
}

export interface RunnerEventPayload {
	runnerEvent: {
		type: string;
		data?: unknown;
	};
}

export type EventPayload = ClaudeMessagePayload | RunnerEventPayload;

export interface WSEventMessage extends WSMessage<EventPayload> {
	kind: 'event';
	sessionId: string;
}

// Event types
export type ClaudeEventType =
	| 'claude.message' // Raw SDK message
	| 'claude.tool_use' // Tool invocation
	| 'claude.tool_result' // Tool result
	| 'claude.text' // Text output
	| 'claude.error'; // Error from Claude

export type RunnerEventType =
	| 'process.started'
	| 'process.exited'
	| 'process.stdout'
	| 'process.stderr'
	| 'heartbeat'
	| 'session.idle'
	| 'session.error';

export type ManagerEventType =
	| 'container.started'
	| 'container.stopped'
	| 'container.connected'
	| 'container.disconnected'
	| 'worktree.created'
	| 'worktree.deleted'
	| 'session.status_changed'
	| 'orchestrator.injection';

// ============================================
// Manager → UI (Live Updates)
// ============================================

export interface RepoListUpdate {
	repos: RepoSummary[];
}

export interface RepoSummary {
	id: string;
	owner: string;
	name: string;
	lastActivityAt: string | null;
	activeSessionCount: number;
	hasRunning: boolean;
	hasWaiting: boolean;
	hasError: boolean;
}

export interface SessionListUpdate {
	repoId: string;
	sessions: SessionSummary[];
}

export interface SessionSummary {
	id: string;
	role: 'implementer' | 'orchestrator';
	status: 'starting' | 'running' | 'waiting' | 'finished' | 'error' | 'stopped';
	branchName: string;
	baseBranch: string;
	updatedAt: string;
	needsInput: boolean;
	prUrl: string | null;
}

export interface SessionTailEvent {
	sessionId: string;
	event: StoredEvent;
}

export interface StoredEvent {
	id: string;
	ts: string;
	source: 'claude' | 'runner' | 'manager';
	type: string;
	payload: Record<string, unknown>;
}

export interface SnapshotPayload {
	type: 'repos' | 'sessions' | 'events';
	data: RepoSummary[] | SessionSummary[] | StoredEvent[];
	cursor?: string; // For pagination
}

// ============================================
// UI → Manager (Commands)
// ============================================

export type WSCommandType =
	| 'session.start'
	| 'session.stop'
	| 'session.send_message'
	| 'subscribe.repo_list'
	| 'subscribe.repo'
	| 'subscribe.session'
	| 'unsubscribe'
	| 'snapshot.request';

export interface StartSessionCommand {
	type: 'session.start';
	repoId: string;
	role: 'implementer' | 'orchestrator';
	baseBranch?: string;
	goalPrompt?: string;
	branchSuffix?: string;
	additionalInstructions?: string;
}

export interface StopSessionCommand {
	type: 'session.stop';
	sessionId: string;
}

export interface SendMessageCommand {
	type: 'session.send_message';
	sessionId: string;
	message: string;
	force?: boolean; // Allow sending even if not in 'waiting' state
}

export interface SubscribeCommand {
	type: 'subscribe.repo_list' | 'subscribe.repo' | 'subscribe.session';
	repoId?: string;
	sessionId?: string;
}

export interface UnsubscribeCommand {
	type: 'unsubscribe';
	subscriptionId: string;
}

export interface SnapshotRequestCommand {
	type: 'snapshot.request';
	target: 'repos' | 'sessions' | 'events';
	repoId?: string;
	sessionId?: string;
	afterEventId?: string;
	limit?: number;
}

export type WSCommand =
	| StartSessionCommand
	| StopSessionCommand
	| SendMessageCommand
	| SubscribeCommand
	| UnsubscribeCommand
	| SnapshotRequestCommand;

export interface WSCommandMessage extends WSMessage<WSCommand> {
	kind: 'command';
}

// ============================================
// Acknowledgments and Errors
// ============================================

export interface AckPayload {
	commandSeq: number;
	success: boolean;
	data?: unknown;
}

export interface WSAckMessage extends WSMessage<AckPayload> {
	kind: 'ack';
}

export interface ErrorPayload {
	code: string;
	message: string;
	details?: unknown;
}

export interface WSErrorMessage extends WSMessage<ErrorPayload> {
	kind: 'error';
}

// ============================================
// Helper functions
// ============================================

let sequenceCounter = 0;

export function createWSMessage<T>(
	kind: WSMessageKind,
	sessionId: string | null,
	payload: T
): WSMessage<T> {
	return {
		v: 1,
		kind,
		sessionId,
		ts: new Date().toISOString(),
		seq: ++sequenceCounter,
		payload
	};
}

export function isClaudeMessage(payload: EventPayload): payload is ClaudeMessagePayload {
	return 'claudeMessage' in payload;
}

export function isRunnerEvent(payload: EventPayload): payload is RunnerEventPayload {
	return 'runnerEvent' in payload;
}
