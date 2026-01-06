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

// Environment configuration
const MANAGER_URL = process.env.AGENT_MANAGER_URL;
const SESSION_ID = process.env.SESSION_ID;
const AGENT_ROLE = process.env.AGENT_ROLE || 'implementer';
const GOAL_PROMPT = process.env.GOAL_PROMPT;
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT;
const MODEL = process.env.CLAUDE_MODEL || 'sonnet';

if (!MANAGER_URL || !SESSION_ID) {
	console.error('[Agent] Missing AGENT_MANAGER_URL or SESSION_ID');
	process.exit(1);
}

// WebSocket state
let ws: WebSocket | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY = 3000;
let seqCounter = 0;

// Claude process state
let claudeProcess: ChildProcess | null = null;
let claudeStdin: NodeJS.WritableStream | null = null;
let isRunning = false;

function nextSeq(): number {
	return ++seqCounter;
}

interface WSMessage {
	v: 1;
	kind: string;
	sessionId: string | null;
	ts: string;
	seq: number;
	payload: unknown;
}

function createMessage(kind: string, payload: unknown): string {
	return JSON.stringify({
		v: 1,
		kind,
		sessionId: SESSION_ID,
		ts: new Date().toISOString(),
		seq: nextSeq(),
		payload
	});
}

function sendEvent(type: string, data: unknown): void {
	if (ws && ws.readyState === WebSocket.OPEN) {
		ws.send(createMessage('event', { runnerEvent: { type, data } }));
	}
}

function sendClaudeMessage(msg: unknown): void {
	if (ws && ws.readyState === WebSocket.OPEN) {
		ws.send(createMessage('event', { claudeMessage: msg }));
	}
}

// Build the system prompt based on role
function buildSystemPrompt(): string {
	let prompt = SYSTEM_PROMPT || `You are an AI coding assistant working in a sandboxed environment.

Your workspace is at /workspace, which is a git worktree for a specific branch.

Guidelines:
- You have full access to the filesystem within /workspace
- You can run any CLI commands needed for your task
- Make commits and push when you complete meaningful units of work
- The session ID is: ${SESSION_ID}

Git workflow:
- Your work is on a dedicated branch
- Commit often with clear messages
- Push when you're done with a task so the user can review`;

	if (AGENT_ROLE === 'orchestrator') {
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

// Start the Claude CLI process
function startClaude(): void {
	const systemPrompt = buildSystemPrompt();

	const args = [
		'--print',
		'--output-format', 'stream-json',
		'--input-format', 'stream-json',
		'--dangerously-skip-permissions',
		'--system-prompt', systemPrompt,
		'--model', MODEL,
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
				handleClaudeMessage(msg);
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
function handleClaudeMessage(msg: Record<string, unknown>): void {
	// Forward the full message to the manager
	sendClaudeMessage(msg);

	// Check for specific message types that affect session state
	const type = msg.type as string;

	if (type === 'assistant' && msg.stop_reason === 'end_turn') {
		// Claude finished a turn, might be waiting for input
		sendEvent('session.turn_complete', {
			stopReason: msg.stop_reason,
			timestamp: new Date().toISOString()
		});
	}

	if (type === 'result') {
		// Final result from Claude
		sendEvent('session.result', {
			result: msg,
			timestamp: new Date().toISOString()
		});
	}
}

// Send a message to Claude
function sendToClaude(message: string): void {
	if (!claudeStdin || !isRunning) {
		console.error('[Agent] Cannot send message - Claude not running');
		return;
	}

	// Format as stream-json input
	const inputMessage = JSON.stringify({
		type: 'user',
		content: message
	});

	claudeStdin.write(inputMessage + '\n');
	console.log('[Agent] Sent message to Claude');
}

// Handle commands from the manager
function handleCommand(command: { type: string; message?: string; [key: string]: unknown }): void {
	console.log('[Agent] Received command:', command.type);

	switch (command.type) {
		case 'user_message':
			if (command.message) {
				sendToClaude(command.message);
			}
			break;

		case 'stop':
			console.log('[Agent] Received stop command');
			if (claudeProcess) {
				claudeProcess.kill('SIGTERM');
			}
			break;

		case 'abort':
			console.log('[Agent] Received abort command');
			if (claudeProcess) {
				claudeProcess.kill('SIGKILL');
			}
			break;

		default:
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
				handleCommand(actualMsg.payload as { type: string; message?: string });
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
