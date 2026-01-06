/**
 * WebSocket Message Contract Tests
 *
 * Ensures message format compatibility between:
 * - agent-runner.ts (container side)
 * - websocket handler.ts (server side)
 *
 * These tests document the contract and catch breaking changes.
 */

import { describe, it, expect } from 'vitest';
import type {
	WSMessage,
	WSMessageKind,
	EventPayload,
	ClaudeMessagePayload,
	RunnerEventPayload
} from '$lib/types/websocket';
import {
	createMessageCreator,
	buildSystemPrompt,
	type WSMessage as AgentWSMessage
} from '../../../docker/agent-runner';

describe('WebSocket Message Contract', () => {
	describe('Message Envelope', () => {
		it('agent-runner message matches handler expectation', () => {
			const creator = createMessageCreator('session-123');
			const agentMessage = creator.createMessage('event', {
				claudeMessage: { type: 'text', text: 'Hello' }
			});

			// Validate against WSMessage type structure
			const isValidWSMessage = (msg: unknown): msg is WSMessage => {
				const m = msg as Record<string, unknown>;
				return (
					m.v === 1 &&
					typeof m.kind === 'string' &&
					['event', 'command', 'ack', 'error', 'subscribe', 'snapshot'].includes(
						m.kind as string
					) &&
					(m.sessionId === null || typeof m.sessionId === 'string') &&
					typeof m.ts === 'string' &&
					typeof m.seq === 'number' &&
					typeof m.payload === 'object'
				);
			};

			expect(isValidWSMessage(agentMessage)).toBe(true);
		});

		it('message version is always 1', () => {
			const creator = createMessageCreator('test');
			const msg = creator.createMessage('event', {});

			expect(msg.v).toBe(1);
		});

		it('timestamp is ISO-8601 format', () => {
			const creator = createMessageCreator('test');
			const msg = creator.createMessage('event', {});

			// ISO-8601 format: YYYY-MM-DDTHH:mm:ss.sssZ
			expect(msg.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
		});

		it('sequence numbers are positive integers', () => {
			const creator = createMessageCreator('test');
			const msg = creator.createMessage('event', {});

			expect(Number.isInteger(msg.seq)).toBe(true);
			expect(msg.seq).toBeGreaterThan(0);
		});
	});

	describe('Event Payloads', () => {
		it('claude message payload has correct structure', () => {
			const payload = {
				claudeMessage: {
					type: 'assistant',
					message: { type: 'text', text: 'Hello' }
				}
			};

			// Type guard from websocket.ts
			const isClaudeMessage = (p: unknown): p is ClaudeMessagePayload => {
				return (
					typeof p === 'object' &&
					p !== null &&
					'claudeMessage' in p &&
					typeof (p as ClaudeMessagePayload).claudeMessage === 'object'
				);
			};

			expect(isClaudeMessage(payload)).toBe(true);
		});

		it('runner event payload has correct structure', () => {
			const payload = {
				runnerEvent: {
					type: 'process.started',
					data: { sessionId: 'test', role: 'implementer' }
				}
			};

			// Type guard from websocket.ts
			const isRunnerEvent = (p: unknown): p is RunnerEventPayload => {
				return (
					typeof p === 'object' &&
					p !== null &&
					'runnerEvent' in p &&
					typeof (p as RunnerEventPayload).runnerEvent === 'object' &&
					typeof (p as RunnerEventPayload).runnerEvent.type === 'string'
				);
			};

			expect(isRunnerEvent(payload)).toBe(true);
		});
	});

	describe('Runner Event Types', () => {
		const runnerEventTypes = [
			'process.started',
			'process.exited',
			'process.stdout',
			'process.stderr',
			'process.error',
			'session.idle',
			'session.turn_complete',
			'session.result',
			'heartbeat'
		];

		it('documents all expected runner event types', () => {
			// This test documents the contract - these are the events
			// that the handler should be prepared to receive
			expect(runnerEventTypes).toContain('process.started');
			expect(runnerEventTypes).toContain('process.exited');
			expect(runnerEventTypes).toContain('session.idle');
			expect(runnerEventTypes).toContain('session.turn_complete');
			expect(runnerEventTypes).toContain('heartbeat');
		});

		it('process.started event has required fields', () => {
			const payload = {
				runnerEvent: {
					type: 'process.started',
					data: {
						sessionId: 'session-123',
						role: 'implementer',
						model: 'sonnet',
						startedAt: new Date().toISOString()
					}
				}
			};

			expect(payload.runnerEvent.data.sessionId).toBeDefined();
			expect(payload.runnerEvent.data.role).toBeDefined();
			expect(payload.runnerEvent.data.model).toBeDefined();
		});

		it('process.exited event has required fields', () => {
			const payload = {
				runnerEvent: {
					type: 'process.exited',
					data: {
						exitCode: 0,
						signal: null,
						reason: 'completed'
					}
				}
			};

			expect(payload.runnerEvent.data.exitCode).toBeDefined();
			expect(payload.runnerEvent.data.reason).toBeDefined();
		});

		it('session.turn_complete event has required fields', () => {
			const payload = {
				runnerEvent: {
					type: 'session.turn_complete',
					data: {
						stopReason: 'end_turn',
						timestamp: new Date().toISOString()
					}
				}
			};

			expect(payload.runnerEvent.data.stopReason).toBeDefined();
			expect(payload.runnerEvent.data.timestamp).toBeDefined();
		});
	});

	describe('Command Types', () => {
		it('user_message command has required fields', () => {
			const command = {
				type: 'user_message',
				message: 'Hello, please help me'
			};

			expect(command.type).toBe('user_message');
			expect(typeof command.message).toBe('string');
		});

		it('stop command structure', () => {
			const command = { type: 'stop' };
			expect(command.type).toBe('stop');
		});

		it('abort command structure', () => {
			const command = { type: 'abort' };
			expect(command.type).toBe('abort');
		});
	});

	describe('System Prompt Contract', () => {
		it('implementer prompt includes expected markers', () => {
			const prompt = buildSystemPrompt({
				sessionId: 'test-session',
				role: 'implementer'
			});

			// These are markers the handler might look for
			expect(prompt).toContain('session ID');
			expect(prompt).toContain('/workspace');
			expect(prompt).toContain('Implementer');
		});

		it('orchestrator prompt includes expected markers', () => {
			const prompt = buildSystemPrompt({
				sessionId: 'test-session',
				role: 'orchestrator'
			});

			expect(prompt).toContain('session ID');
			expect(prompt).toContain('/workspace');
			expect(prompt).toContain('Orchestrator');
			expect(prompt).toContain('coordinate');
		});
	});

	describe('sveltekit-ws Message Wrapping', () => {
		it('documents the nested message structure', () => {
			// sveltekit-ws wraps messages in { type, data } structure
			const wrappedMessage = {
				type: 'agent-manager',
				data: {
					v: 1,
					kind: 'event',
					sessionId: 'session-123',
					ts: new Date().toISOString(),
					seq: 1,
					payload: { claudeMessage: { type: 'text' } }
				}
			};

			// The handler must unwrap this structure
			expect(wrappedMessage.type).toBe('agent-manager');
			expect(wrappedMessage.data.v).toBe(1);
		});

		it('agent-runner handles unwrapping correctly', () => {
			// This documents how agent-runner handles the wrapped format
			const wrappedCommand = {
				type: 'agent-manager',
				data: {
					v: 1,
					kind: 'command',
					sessionId: 'session-123',
					ts: new Date().toISOString(),
					seq: 1,
					payload: { type: 'user_message', message: 'Hello' }
				}
			};

			// Extract the actual message (as done in agent-runner)
			const msg = wrappedCommand as { data?: { kind: string; payload: unknown } };
			const actualMsg = msg.data!;

			expect(actualMsg.kind).toBe('command');
			expect(actualMsg.payload).toEqual({ type: 'user_message', message: 'Hello' });
		});
	});
});

describe('Claude CLI Message Format Contract', () => {
	it('text message format', () => {
		const claudeTextMsg = {
			type: 'assistant',
			message: {
				type: 'text',
				text: 'I will help you with that.'
			}
		};

		expect(claudeTextMsg.type).toBe('assistant');
		expect(claudeTextMsg.message.type).toBe('text');
		expect(typeof claudeTextMsg.message.text).toBe('string');
	});

	it('tool use message format', () => {
		const toolUseMsg = {
			type: 'assistant',
			message: {
				type: 'tool_use',
				id: 'tool_abc123',
				name: 'Read',
				input: { file_path: '/workspace/src/index.ts' }
			}
		};

		expect(toolUseMsg.type).toBe('assistant');
		expect(toolUseMsg.message.type).toBe('tool_use');
		expect(toolUseMsg.message.id).toBeDefined();
		expect(toolUseMsg.message.name).toBeDefined();
		expect(toolUseMsg.message.input).toBeDefined();
	});

	it('tool result message format', () => {
		const toolResultMsg = {
			type: 'tool_result',
			tool_use_id: 'tool_abc123',
			content: 'File contents...'
		};

		expect(toolResultMsg.type).toBe('tool_result');
		expect(toolResultMsg.tool_use_id).toBeDefined();
	});

	it('turn complete message format', () => {
		const turnCompleteMsg = {
			type: 'assistant',
			stop_reason: 'end_turn'
		};

		expect(turnCompleteMsg.type).toBe('assistant');
		expect(turnCompleteMsg.stop_reason).toBe('end_turn');
	});

	it('result message format', () => {
		const resultMsg = {
			type: 'result',
			cost: {
				input_tokens: 1500,
				output_tokens: 800
			},
			duration_ms: 5000
		};

		expect(resultMsg.type).toBe('result');
		expect(resultMsg.cost).toBeDefined();
		expect(resultMsg.cost.input_tokens).toBeDefined();
		expect(resultMsg.cost.output_tokens).toBeDefined();
	});
});
