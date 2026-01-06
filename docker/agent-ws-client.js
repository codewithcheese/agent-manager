#!/usr/bin/env node
/**
 * Agent WebSocket Client
 *
 * Connects to the Agent Manager WebSocket server and:
 * - Sends Claude Code output events to the manager
 * - Receives user messages and forwards them to Claude Code
 * - Handles heartbeat/health checks
 */

const WebSocket = require('ws');
const fs = require('fs');
const readline = require('readline');

const MANAGER_URL = process.env.AGENT_MANAGER_URL;
const SESSION_ID = process.env.SESSION_ID;
const INPUT_PIPE = process.env.AGENT_INPUT_PIPE;
const OUTPUT_PIPE = process.env.AGENT_OUTPUT_PIPE;

if (!MANAGER_URL || !SESSION_ID) {
	console.error('[WS Client] Missing AGENT_MANAGER_URL or SESSION_ID');
	process.exit(1);
}

let ws = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY = 3000;
let seqCounter = 0;
let lastActivityTime = Date.now();
const IDLE_TIMEOUT = 30000; // 30 seconds

function nextSeq() {
	return ++seqCounter;
}

function createMessage(kind, payload) {
	return JSON.stringify({
		v: 1,
		kind,
		sessionId: SESSION_ID,
		ts: new Date().toISOString(),
		seq: nextSeq(),
		payload
	});
}

function connect() {
	console.log(`[WS Client] Connecting to ${MANAGER_URL}...`);

	ws = new WebSocket(MANAGER_URL);

	ws.on('open', () => {
		console.log('[WS Client] Connected to manager');
		reconnectAttempts = 0;

		// Send initial connection event
		ws.send(
			createMessage('event', {
				runnerEvent: {
					type: 'process.started',
					data: {
						sessionId: SESSION_ID,
						role: process.env.AGENT_ROLE,
						startedAt: new Date().toISOString()
					}
				}
			})
		);
	});

	ws.on('message', (data) => {
		try {
			const msg = JSON.parse(data.toString());

			if (msg.kind === 'command' && msg.payload) {
				handleCommand(msg.payload);
			}
		} catch (e) {
			console.error('[WS Client] Error parsing message:', e);
		}
	});

	ws.on('close', () => {
		console.log('[WS Client] Connection closed');
		scheduleReconnect();
	});

	ws.on('error', (err) => {
		console.error('[WS Client] WebSocket error:', err.message);
	});
}

function scheduleReconnect() {
	if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
		console.error('[WS Client] Max reconnect attempts reached, exiting');
		process.exit(1);
	}

	reconnectAttempts++;
	console.log(`[WS Client] Reconnecting in ${RECONNECT_DELAY}ms (attempt ${reconnectAttempts})...`);
	setTimeout(connect, RECONNECT_DELAY);
}

function handleCommand(command) {
	console.log('[WS Client] Received command:', command.type);

	switch (command.type) {
		case 'user_message':
			// Forward to Claude Code via named pipe
			if (INPUT_PIPE && command.message) {
				try {
					fs.appendFileSync(INPUT_PIPE, command.message + '\n');
					console.log('[WS Client] Forwarded message to Claude Code');
				} catch (e) {
					console.error('[WS Client] Error writing to input pipe:', e);
				}
			}
			lastActivityTime = Date.now();
			break;

		case 'stop':
			console.log('[WS Client] Received stop command');
			// Send exit event
			sendEvent('process.exited', { reason: 'user_stop', exitCode: 0 });
			process.exit(0);
			break;

		default:
			console.log('[WS Client] Unknown command type:', command.type);
	}
}

function sendEvent(type, data) {
	if (ws && ws.readyState === WebSocket.OPEN) {
		ws.send(
			createMessage('event', {
				runnerEvent: { type, data }
			})
		);
	}
}

function sendClaudeMessage(msg) {
	if (ws && ws.readyState === WebSocket.OPEN) {
		ws.send(createMessage('event', { claudeMessage: msg }));
		lastActivityTime = Date.now();
	}
}

// Watch output pipe for Claude Code messages
function watchOutputPipe() {
	if (!OUTPUT_PIPE) {
		console.log('[WS Client] No output pipe configured');
		return;
	}

	// Wait for pipe to exist
	const checkPipe = () => {
		if (fs.existsSync(OUTPUT_PIPE)) {
			console.log('[WS Client] Watching output pipe:', OUTPUT_PIPE);

			const rl = readline.createInterface({
				input: fs.createReadStream(OUTPUT_PIPE),
				crlfDelay: Infinity
			});

			rl.on('line', (line) => {
				try {
					// Try to parse as JSON (Claude Code output)
					const msg = JSON.parse(line);
					sendClaudeMessage(msg);
				} catch {
					// Not JSON, send as text output
					sendEvent('process.stdout', { text: line });
				}
			});

			rl.on('close', () => {
				console.log('[WS Client] Output pipe closed');
				sendEvent('process.exited', { reason: 'completed', exitCode: 0 });
			});
		} else {
			setTimeout(checkPipe, 1000);
		}
	};

	checkPipe();
}

// Monitor for idle state
function monitorIdleState() {
	setInterval(() => {
		const idleTime = Date.now() - lastActivityTime;
		if (idleTime >= IDLE_TIMEOUT) {
			sendEvent('session.idle', {
				idleTime,
				lastActivityAt: new Date(lastActivityTime).toISOString()
			});
		}
	}, 10000); // Check every 10 seconds
}

// Heartbeat
function startHeartbeat() {
	setInterval(() => {
		if (ws && ws.readyState === WebSocket.OPEN) {
			sendEvent('heartbeat', { timestamp: Date.now() });
		}
	}, 30000); // Every 30 seconds
}

// Handle process signals
process.on('SIGTERM', () => {
	console.log('[WS Client] Received SIGTERM');
	sendEvent('process.exited', { reason: 'sigterm', exitCode: 0 });
	process.exit(0);
});

process.on('SIGINT', () => {
	console.log('[WS Client] Received SIGINT');
	sendEvent('process.exited', { reason: 'sigint', exitCode: 0 });
	process.exit(0);
});

// Start
console.log('[WS Client] Agent WebSocket Client starting...');
connect();
watchOutputPipe();
monitorIdleState();
startHeartbeat();

// Keep process running
process.stdin.resume();
