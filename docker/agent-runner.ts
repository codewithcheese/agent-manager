#!/usr/bin/env npx tsx
/**
 * Agent Runner - Claude Code Agent SDK Integration
 *
 * Runs Claude Code CLI in streaming JSON mode and bridges communication
 * between the container and the Agent Manager via WebSocket.
 */

import { spawn, ChildProcess } from 'child_process';
import { createInterface, Interface } from 'readline';
import WebSocket from 'ws';

// ============================================
// Exported types and functions for testing
// ============================================

export interface WSMessage {
	v: 1;
	kind: string;
	sessionId: string | null;
	ts: string;
	seq: number;
	payload: unknown;
}

export interface AgentConfig {
	sessionId: string;
	managerUrl: string;
	role: string;
	goalPrompt?: string;
	systemPrompt?: string;
	model: string;
}

export interface MessageCreator {
	createMessage(kind: string, payload: unknown): WSMessage;
	createMessageString(kind: string, payload: unknown): string;
	getSeq(): number;
}

/**
 * Creates a message creator with its own sequence counter
 */
export function createMessageCreator(sessionId: string): MessageCreator {
	let seqCounter = 0;

	return {
		getSeq(): number {
			return seqCounter;
		},
		createMessage(kind: string, payload: unknown): WSMessage {
			return {
				v: 1,
				kind,
				sessionId,
				ts: new Date().toISOString(),
				seq: ++seqCounter,
				payload
			};
		},
		createMessageString(kind: string, payload: unknown): string {
			return JSON.stringify(this.createMessage(kind, payload));
		}
	};
}

export interface SystemPromptConfig {
	sessionId: string;
	role: string;
	customPrompt?: string;
}

/**
 * Build the system prompt based on role
 */
export function buildSystemPrompt(config: SystemPromptConfig): string {
	const { sessionId, role, customPrompt } = config;

	let prompt =
		customPrompt ||
		`You are an AI coding assistant working in a sandboxed environment.

Your workspace is at /workspace, which is a git worktree for a specific branch.

Guidelines:
- You have full access to the filesystem within /workspace
- You can run any CLI commands needed for your task
- Make commits and push when you complete meaningful units of work
- The session ID is: ${sessionId}

Git workflow:
- Your work is on a dedicated branch
- Commit often with clear messages
- Push when you're done with a task so the user can review`;

	if (role === 'orchestrator') {
		prompt += `

As the Orchestrator:
- You coordinate work across multiple agent sessions
- You receive summaries of other sessions' activities
- Help plan and organize implementation efforts
- Suggest task breakdowns and session coordination strategies`;
	} else {
		prompt += `

As an Implementer:
- Focus on writing code and making changes
- Follow the repository's conventions (check CLAUDE.md if available)
- Run tests and ensure your changes work
- Create clear, focused commits`;
	}

	return prompt;
}

export interface CommandInput {
	type: string;
	message?: string;
	[key: string]: unknown;
}

export interface CommandResult {
	action: string;
	data?: unknown;
}

export interface CommandContext {
	stdin: NodeJS.WritableStream | null;
	process: ChildProcess | null;
	isRunning: boolean;
}

/**
 * Handle commands from the manager
 * Returns the action taken for testing purposes
 */
export function handleCommand(command: CommandInput, context: CommandContext): CommandResult {
	switch (command.type) {
		case 'user_message':
			if (command.message && context.stdin && context.isRunning) {
				const inputMessage = JSON.stringify({
					type: 'user',
					content: command.message
				});
				context.stdin.write(inputMessage + '\n');
				return { action: 'message_sent', data: { message: command.message } };
			}
			return { action: 'message_ignored', data: { reason: 'no message or not running' } };

		case 'stop':
			if (context.process) {
				context.process.kill('SIGTERM');
				return { action: 'stop_sent' };
			}
			return { action: 'stop_ignored', data: { reason: 'no process' } };

		case 'abort':
			if (context.process) {
				context.process.kill('SIGKILL');
				return { action: 'abort_sent' };
			}
			return { action: 'abort_ignored', data: { reason: 'no process' } };

		default:
			return { action: 'unknown_command', data: { type: command.type } };
	}
}

export interface ClaudeMessageResult {
	forwarded: boolean;
	events: Array<{ type: string; data: unknown }>;
}

/**
 * Process a Claude message and determine what events to emit
 */
export function processClaudeMessage(msg: Record<string, unknown>): ClaudeMessageResult {
	const events: Array<{ type: string; data: unknown }> = [];
	const type = msg.type as string;

	if (type === 'assistant' && msg.stop_reason === 'end_turn') {
		events.push({
			type: 'session.turn_complete',
			data: {
				stopReason: msg.stop_reason,
				timestamp: new Date().toISOString()
			}
		});
	}

	if (type === 'result') {
		events.push({
			type: 'session.result',
			data: {
				result: msg,
				timestamp: new Date().toISOString()
			}
		});
	}

	return { forwarded: true, events };
}

/**
 * Format a user message for Claude's stream-json input format
 */
export function formatUserMessage(message: string): string {
	return JSON.stringify({
		type: 'user',
		content: message
	});
}

// ============================================
// Runtime code (only runs when executed directly)
// ============================================

// Check if we're being run directly (not imported for testing)
const isMainModule =
	typeof require !== 'undefined' &&
	require.main === module;

// Also check for direct tsx execution
const isDirectExecution =
	process.argv[1]?.endsWith('agent-runner.ts') && process.env.AGENT_MANAGER_URL;

if (isMainModule || isDirectExecution) {
	runAgent();
}

function runAgent(): void {
	// Environment configuration - validate required vars
	const managerUrl = process.env.AGENT_MANAGER_URL;
	const sessionId = process.env.SESSION_ID;

	if (!managerUrl || !sessionId) {
		console.error('[Agent] Missing AGENT_MANAGER_URL or SESSION_ID');
		process.exit(1);
	}

	// Now TypeScript knows these are defined
	const MANAGER_URL: string = managerUrl;
	const SESSION_ID: string = sessionId;
	const AGENT_ROLE = process.env.AGENT_ROLE || 'implementer';
	const GOAL_PROMPT = process.env.GOAL_PROMPT;
	const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT;
	const MODEL = process.env.CLAUDE_MODEL || 'sonnet';

	// WebSocket state
	let ws: WebSocket | null = null;
	let reconnectAttempts = 0;
	const MAX_RECONNECT_ATTEMPTS = 10;
	const RECONNECT_DELAY = 3000;

	// Claude process state
	let claudeProcess: ChildProcess | null = null;
	let claudeStdin: NodeJS.WritableStream | null = null;
	let isRunning = false;

	// Create message creator for this session
	const messageCreator = createMessageCreator(SESSION_ID);

	function sendEvent(type: string, data: unknown): void {
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.send(messageCreator.createMessageString('event', { runnerEvent: { type, data } }));
		}
	}

	function sendClaudeMessage(msg: unknown): void {
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.send(messageCreator.createMessageString('event', { claudeMessage: msg }));
		}
	}

	// Start the Claude CLI process
	function startClaude(): void {
		const systemPrompt = buildSystemPrompt({
			sessionId: SESSION_ID,
			role: AGENT_ROLE,
			customPrompt: SYSTEM_PROMPT
		});

		const args = [
			'--print',
			'--output-format',
			'stream-json',
			'--input-format',
			'stream-json',
			'--dangerously-skip-permissions',
			'--system-prompt',
			systemPrompt,
			'--model',
			MODEL,
			'--replay-user-messages'
		];

		// Add initial prompt if provided
		if (GOAL_PROMPT) {
			args.push(GOAL_PROMPT);
		}

		console.log('[Agent] Starting Claude CLI with args:', args.slice(0, 6).join(' '), '...');

		claudeProcess = spawn('claude', args, {
			cwd: '/workspace',
			env: {
				...process.env,
				// Ensure Claude uses the container's home directory
				HOME: '/home/agent'
			},
			stdio: ['pipe', 'pipe', 'pipe']
		});

		claudeStdin = claudeProcess.stdin;
		isRunning = true;

		// Handle stdout - JSON messages from Claude
		if (claudeProcess.stdout) {
			const rl: Interface = createInterface({
				input: claudeProcess.stdout,
				crlfDelay: Infinity
			});

			rl.on('line', (line: string) => {
				if (!line.trim()) return;

				try {
					const msg = JSON.parse(line);
					handleClaudeMessageInternal(msg);
				} catch {
					// Non-JSON output, send as stdout event
					sendEvent('process.stdout', { text: line });
				}
			});
		}

		// Handle stderr
		if (claudeProcess.stderr) {
			const rl: Interface = createInterface({
				input: claudeProcess.stderr,
				crlfDelay: Infinity
			});

			rl.on('line', (line: string) => {
				console.error('[Claude stderr]', line);
				sendEvent('process.stderr', { text: line });
			});
		}

		// Handle process exit
		claudeProcess.on('exit', (code: number | null, signal: string | null) => {
			console.log(`[Agent] Claude exited with code ${code}, signal ${signal}`);
			isRunning = false;

			sendEvent('process.exited', {
				exitCode: code,
				signal,
				reason: code === 0 ? 'completed' : 'error'
			});

			// Clean shutdown
			setTimeout(() => {
				if (ws) ws.close();
				process.exit(code || 0);
			}, 1000);
		});

		claudeProcess.on('error', (err: Error) => {
			console.error('[Agent] Failed to start Claude:', err);
			sendEvent('process.error', { error: err.message });
			isRunning = false;
		});

		sendEvent('process.started', {
			sessionId: SESSION_ID,
			role: AGENT_ROLE,
			model: MODEL,
			startedAt: new Date().toISOString()
		});
	}

	// Handle messages from Claude
	function handleClaudeMessageInternal(msg: Record<string, unknown>): void {
		// Forward the full message to the manager
		sendClaudeMessage(msg);

		// Process for additional events
		const result = processClaudeMessage(msg);
		for (const event of result.events) {
			sendEvent(event.type, event.data);
		}
	}

	// Handle commands from the manager
	function handleCommandInternal(command: CommandInput): void {
		console.log('[Agent] Received command:', command.type);

		const result = handleCommand(command, {
			stdin: claudeStdin,
			process: claudeProcess,
			isRunning
		});

		if (result.action === 'message_sent') {
			console.log('[Agent] Sent message to Claude');
		} else if (result.action === 'stop_sent') {
			console.log('[Agent] Received stop command');
		} else if (result.action === 'abort_sent') {
			console.log('[Agent] Received abort command');
		} else if (result.action === 'unknown_command') {
			console.log('[Agent] Unknown command type:', command.type);
		}
	}

	// WebSocket connection management
	function connect(): void {
		console.log(`[Agent] Connecting to ${MANAGER_URL}...`);

		ws = new WebSocket(MANAGER_URL!);

		ws.on('open', () => {
			console.log('[Agent] Connected to manager');
			reconnectAttempts = 0;

			// Start Claude after WebSocket is connected
			if (!isRunning) {
				startClaude();
			}
		});

		ws.on('message', (data: WebSocket.Data) => {
			try {
				const msg = JSON.parse(data.toString()) as WSMessage;

				// Handle the nested data structure from sveltekit-ws
				const actualMsg = (msg as unknown as { data?: WSMessage })?.data || msg;

				if (actualMsg.kind === 'command' && actualMsg.payload) {
					handleCommandInternal(actualMsg.payload as CommandInput);
				}
			} catch (e) {
				console.error('[Agent] Error parsing message:', e);
			}
		});

		ws.on('close', () => {
			console.log('[Agent] WebSocket closed');
			scheduleReconnect();
		});

		ws.on('error', (err: Error) => {
			console.error('[Agent] WebSocket error:', err.message);
		});
	}

	function scheduleReconnect(): void {
		if (!isRunning) {
			// Don't reconnect if Claude has exited
			return;
		}

		if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
			console.error('[Agent] Max reconnect attempts reached');
			if (claudeProcess) {
				claudeProcess.kill('SIGTERM');
			}
			process.exit(1);
		}

		reconnectAttempts++;
		console.log(`[Agent] Reconnecting in ${RECONNECT_DELAY}ms (attempt ${reconnectAttempts})...`);
		setTimeout(connect, RECONNECT_DELAY);
	}

	// Signal handlers
	process.on('SIGTERM', () => {
		console.log('[Agent] Received SIGTERM');
		sendEvent('process.exited', { reason: 'sigterm', exitCode: 0 });
		if (claudeProcess) {
			claudeProcess.kill('SIGTERM');
		}
		setTimeout(() => process.exit(0), 500);
	});

	process.on('SIGINT', () => {
		console.log('[Agent] Received SIGINT');
		sendEvent('process.exited', { reason: 'sigint', exitCode: 0 });
		if (claudeProcess) {
			claudeProcess.kill('SIGINT');
		}
		setTimeout(() => process.exit(0), 500);
	});

	// Start
	console.log('[Agent] Agent Runner starting...');
	console.log(`[Agent] Session: ${SESSION_ID}`);
	console.log(`[Agent] Role: ${AGENT_ROLE}`);
	console.log(`[Agent] Model: ${MODEL}`);
	connect();
}
