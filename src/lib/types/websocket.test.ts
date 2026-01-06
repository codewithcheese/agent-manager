/**
 * Unit tests for WebSocket types and helpers
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	createWSMessage,
	isClaudeMessage,
	isRunnerEvent,
	type ClaudeMessagePayload,
	type RunnerEventPayload,
	type EventPayload
} from './websocket';

describe('createWSMessage', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2024-01-15T12:00:00.000Z'));
	});

	it('creates message with correct structure', () => {
		const msg = createWSMessage('event', 'session-123', { test: true });

		expect(msg.v).toBe(1);
		expect(msg.kind).toBe('event');
		expect(msg.sessionId).toBe('session-123');
		expect(msg.payload).toEqual({ test: true });
		expect(msg.ts).toBe('2024-01-15T12:00:00.000Z');
		expect(typeof msg.seq).toBe('number');
	});

	it('handles null sessionId', () => {
		const msg = createWSMessage('ack', null, { success: true });
		expect(msg.sessionId).toBeNull();
	});

	it('increments sequence number across calls', () => {
		const msg1 = createWSMessage('event', null, {});
		const msg2 = createWSMessage('event', null, {});
		const msg3 = createWSMessage('event', null, {});

		expect(msg2.seq).toBe(msg1.seq + 1);
		expect(msg3.seq).toBe(msg2.seq + 1);
	});

	it('creates messages for all valid kinds', () => {
		const kinds = ['event', 'command', 'ack', 'error', 'subscribe', 'snapshot'] as const;

		for (const kind of kinds) {
			const msg = createWSMessage(kind, null, {});
			expect(msg.kind).toBe(kind);
			expect(msg.v).toBe(1);
		}
	});

	it('preserves complex payload structures', () => {
		const complexPayload = {
			claudeMessage: {
				type: 'tool_use',
				name: 'Read',
				input: { path: '/src/file.ts' },
				nested: { deep: { value: 123 } }
			}
		};

		const msg = createWSMessage('event', 'session-1', complexPayload);
		expect(msg.payload).toEqual(complexPayload);
	});

	it('generates valid ISO-8601 timestamp', () => {
		vi.useRealTimers();
		const msg = createWSMessage('event', null, {});

		// Should be parseable as a date
		const parsed = new Date(msg.ts);
		expect(parsed.toISOString()).toBe(msg.ts);
	});
});

describe('isClaudeMessage', () => {
	it('returns true for claude message payload', () => {
		const payload: ClaudeMessagePayload = {
			claudeMessage: { type: 'text', text: 'Hello' }
		};
		expect(isClaudeMessage(payload)).toBe(true);
	});

	it('returns false for runner event payload', () => {
		const payload: RunnerEventPayload = {
			runnerEvent: { type: 'heartbeat' }
		};
		expect(isClaudeMessage(payload)).toBe(false);
	});

	it('returns false for empty object', () => {
		const payload = {} as EventPayload;
		expect(isClaudeMessage(payload)).toBe(false);
	});

	it('correctly narrows type', () => {
		const payload: EventPayload = {
			claudeMessage: { type: 'text', text: 'Test' }
		};

		if (isClaudeMessage(payload)) {
			// TypeScript should recognize this as ClaudeMessagePayload
			expect(payload.claudeMessage).toBeDefined();
			expect(payload.claudeMessage.type).toBe('text');
		}
	});

	it('handles payload with empty claudeMessage object', () => {
		const payload: ClaudeMessagePayload = {
			claudeMessage: {}
		};
		expect(isClaudeMessage(payload)).toBe(true);
	});
});

describe('isRunnerEvent', () => {
	it('returns true for runner event payload', () => {
		const payload: RunnerEventPayload = {
			runnerEvent: { type: 'process.started' }
		};
		expect(isRunnerEvent(payload)).toBe(true);
	});

	it('returns false for claude message payload', () => {
		const payload: ClaudeMessagePayload = {
			claudeMessage: { type: 'text' }
		};
		expect(isRunnerEvent(payload)).toBe(false);
	});

	it('returns false for empty object', () => {
		const payload = {} as EventPayload;
		expect(isRunnerEvent(payload)).toBe(false);
	});

	it('correctly narrows type', () => {
		const payload: EventPayload = {
			runnerEvent: { type: 'session.idle', data: { seconds: 30 } }
		};

		if (isRunnerEvent(payload)) {
			// TypeScript should recognize this as RunnerEventPayload
			expect(payload.runnerEvent).toBeDefined();
			expect(payload.runnerEvent.type).toBe('session.idle');
			expect(payload.runnerEvent.data).toEqual({ seconds: 30 });
		}
	});

	it('handles runner event with optional data', () => {
		const payloadWithData: RunnerEventPayload = {
			runnerEvent: { type: 'process.stdout', data: 'output line' }
		};
		const payloadWithoutData: RunnerEventPayload = {
			runnerEvent: { type: 'heartbeat' }
		};

		expect(isRunnerEvent(payloadWithData)).toBe(true);
		expect(isRunnerEvent(payloadWithoutData)).toBe(true);
	});
});

describe('type guard combinations', () => {
	it('exactly one type guard should match for valid payloads', () => {
		const claudePayload: EventPayload = {
			claudeMessage: { type: 'text', text: 'Hello' }
		};
		const runnerPayload: EventPayload = {
			runnerEvent: { type: 'heartbeat' }
		};

		// Claude message should only match isClaudeMessage
		expect(isClaudeMessage(claudePayload)).toBe(true);
		expect(isRunnerEvent(claudePayload)).toBe(false);

		// Runner event should only match isRunnerEvent
		expect(isClaudeMessage(runnerPayload)).toBe(false);
		expect(isRunnerEvent(runnerPayload)).toBe(true);
	});

	it('neither guard matches for empty payload', () => {
		const emptyPayload = {} as EventPayload;

		expect(isClaudeMessage(emptyPayload)).toBe(false);
		expect(isRunnerEvent(emptyPayload)).toBe(false);
	});
});
