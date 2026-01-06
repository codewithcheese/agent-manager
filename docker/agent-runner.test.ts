/**
 * Agent Runner Unit Tests
 *
 * Tests the pure functions exported from agent-runner.ts
 * These are fast, isolated tests that don't require any external dependencies.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	createMessageCreator,
	buildSystemPrompt,
	handleCommand,
	processClaudeMessage,
	formatUserMessage,
	type CommandContext,
	type WSMessage
} from './agent-runner';

describe('Agent Runner - Message Creation', () => {
	it('creates valid WebSocket message', () => {
		const creator = createMessageCreator('test-session-123');
		const msg = creator.createMessage('event', { test: true });

		expect(msg).toMatchObject({
			v: 1,
			kind: 'event',
			sessionId: 'test-session-123',
			ts: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
			seq: expect.any(Number),
			payload: { test: true }
		});
	});

	it('increments sequence number', () => {
		const creator = createMessageCreator('test-session');
		const msg1 = creator.createMessage('event', {});
		const msg2 = creator.createMessage('event', {});

		expect(msg2.seq).toBeGreaterThan(msg1.seq);
		expect(msg2.seq).toBe(msg1.seq + 1);
	});

	it('starts sequence at 1', () => {
		const creator = createMessageCreator('test-session');
		const msg = creator.createMessage('event', {});

		expect(msg.seq).toBe(1);
	});

	it('creates valid JSON string', () => {
		const creator = createMessageCreator('test-session');
		const msgString = creator.createMessageString('event', { foo: 'bar' });

		const parsed = JSON.parse(msgString) as WSMessage;
		expect(parsed.v).toBe(1);
		expect(parsed.kind).toBe('event');
		expect(parsed.payload).toEqual({ foo: 'bar' });
	});

	it('uses consistent session ID', () => {
		const creator = createMessageCreator('my-session-id');
		const msg1 = creator.createMessage('event', {});
		const msg2 = creator.createMessage('command', {});

		expect(msg1.sessionId).toBe('my-session-id');
		expect(msg2.sessionId).toBe('my-session-id');
	});
});

describe('Agent Runner - System Prompt Building', () => {
	it('includes implementer instructions for implementer role', () => {
		const prompt = buildSystemPrompt({
			sessionId: 'test-session',
			role: 'implementer'
		});

		expect(prompt).toContain('As an Implementer');
		expect(prompt).toContain('Focus on writing code');
		expect(prompt).not.toContain('As the Orchestrator');
	});

	it('includes orchestrator instructions for orchestrator role', () => {
		const prompt = buildSystemPrompt({
			sessionId: 'test-session',
			role: 'orchestrator'
		});

		expect(prompt).toContain('As the Orchestrator');
		expect(prompt).toContain('coordinate work');
		expect(prompt).not.toContain('As an Implementer');
	});

	it('includes session ID in prompt', () => {
		const prompt = buildSystemPrompt({
			sessionId: 'test-session-123',
			role: 'implementer'
		});

		expect(prompt).toContain('test-session-123');
	});

	it('uses custom prompt when provided', () => {
		const customPrompt = 'This is my custom system prompt';
		const prompt = buildSystemPrompt({
			sessionId: 'test-session',
			role: 'implementer',
			customPrompt
		});

		// Custom prompt is the base, but role-specific instructions are still appended
		expect(prompt).toContain(customPrompt);
		expect(prompt).toContain('As an Implementer');
	});

	it('includes workspace guidelines', () => {
		const prompt = buildSystemPrompt({
			sessionId: 'test-session',
			role: 'implementer'
		});

		expect(prompt).toContain('/workspace');
		expect(prompt).toContain('git worktree');
	});

	it('includes git workflow instructions', () => {
		const prompt = buildSystemPrompt({
			sessionId: 'test-session',
			role: 'implementer'
		});

		expect(prompt).toContain('Commit often');
		expect(prompt).toContain('Push when');
	});
});

describe('Agent Runner - Command Handling', () => {
	let mockStdin: { write: ReturnType<typeof vi.fn> };
	let mockProcess: { kill: ReturnType<typeof vi.fn> };
	let context: CommandContext;

	beforeEach(() => {
		mockStdin = { write: vi.fn() };
		mockProcess = { kill: vi.fn() };
		context = {
			stdin: mockStdin as unknown as NodeJS.WritableStream,
			process: mockProcess as unknown as import('child_process').ChildProcess,
			isRunning: true
		};
	});

	it('handles user_message command', () => {
		const result = handleCommand({ type: 'user_message', message: 'Hello' }, context);

		expect(result.action).toBe('message_sent');
		expect(mockStdin.write).toHaveBeenCalledTimes(1);

		// Verify the message format
		const writtenData = mockStdin.write.mock.calls[0][0];
		const parsed = JSON.parse(writtenData.replace('\n', ''));
		expect(parsed).toEqual({
			type: 'user',
			content: 'Hello'
		});
	});

	it('ignores user_message without message content', () => {
		const result = handleCommand({ type: 'user_message' }, context);

		expect(result.action).toBe('message_ignored');
		expect(mockStdin.write).not.toHaveBeenCalled();
	});

	it('ignores user_message when not running', () => {
		context.isRunning = false;
		const result = handleCommand({ type: 'user_message', message: 'Hello' }, context);

		expect(result.action).toBe('message_ignored');
		expect(mockStdin.write).not.toHaveBeenCalled();
	});

	it('ignores user_message when stdin is null', () => {
		context.stdin = null;
		const result = handleCommand({ type: 'user_message', message: 'Hello' }, context);

		expect(result.action).toBe('message_ignored');
	});

	it('handles stop command', () => {
		const result = handleCommand({ type: 'stop' }, context);

		expect(result.action).toBe('stop_sent');
		expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
	});

	it('ignores stop when no process', () => {
		context.process = null;
		const result = handleCommand({ type: 'stop' }, context);

		expect(result.action).toBe('stop_ignored');
	});

	it('handles abort command', () => {
		const result = handleCommand({ type: 'abort' }, context);

		expect(result.action).toBe('abort_sent');
		expect(mockProcess.kill).toHaveBeenCalledWith('SIGKILL');
	});

	it('ignores abort when no process', () => {
		context.process = null;
		const result = handleCommand({ type: 'abort' }, context);

		expect(result.action).toBe('abort_ignored');
	});

	it('handles unknown command type', () => {
		const result = handleCommand({ type: 'unknown_cmd' }, context);

		expect(result.action).toBe('unknown_command');
		expect(result.data).toEqual({ type: 'unknown_cmd' });
	});
});

describe('Agent Runner - Claude Message Processing', () => {
	it('detects turn completion', () => {
		const msg = {
			type: 'assistant',
			stop_reason: 'end_turn',
			message: { type: 'text', text: 'Done' }
		};

		const result = processClaudeMessage(msg);

		expect(result.forwarded).toBe(true);
		expect(result.events).toHaveLength(1);
		expect(result.events[0].type).toBe('session.turn_complete');
		expect(result.events[0].data).toMatchObject({
			stopReason: 'end_turn',
			timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)
		});
	});

	it('detects result message', () => {
		const msg = {
			type: 'result',
			cost: { input_tokens: 1000, output_tokens: 500 },
			duration_ms: 5000
		};

		const result = processClaudeMessage(msg);

		expect(result.forwarded).toBe(true);
		expect(result.events).toHaveLength(1);
		expect(result.events[0].type).toBe('session.result');
		expect(result.events[0].data).toMatchObject({
			result: msg,
			timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)
		});
	});

	it('returns no events for regular messages', () => {
		const msg = {
			type: 'assistant',
			message: { type: 'text', text: 'Working on it...' }
		};

		const result = processClaudeMessage(msg);

		expect(result.forwarded).toBe(true);
		expect(result.events).toHaveLength(0);
	});

	it('returns no events for tool use messages', () => {
		const msg = {
			type: 'assistant',
			message: {
				type: 'tool_use',
				name: 'Read',
				input: { file_path: '/workspace/test.ts' }
			}
		};

		const result = processClaudeMessage(msg);

		expect(result.forwarded).toBe(true);
		expect(result.events).toHaveLength(0);
	});
});

describe('Agent Runner - User Message Formatting', () => {
	it('formats user message correctly', () => {
		const formatted = formatUserMessage('Hello, Claude!');
		const parsed = JSON.parse(formatted);

		expect(parsed).toEqual({
			type: 'user',
			content: 'Hello, Claude!'
		});
	});

	it('handles special characters in message', () => {
		const message = 'Fix the "bug" in line\n42';
		const formatted = formatUserMessage(message);
		const parsed = JSON.parse(formatted);

		expect(parsed.content).toBe(message);
	});

	it('handles empty message', () => {
		const formatted = formatUserMessage('');
		const parsed = JSON.parse(formatted);

		expect(parsed).toEqual({
			type: 'user',
			content: ''
		});
	});
});
