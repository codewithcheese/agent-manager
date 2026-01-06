/**
 * Claude CLI Output Mocking
 *
 * Provides test fixtures and utilities for mocking Claude CLI output
 * in the --output-format stream-json mode.
 */

import { Readable, PassThrough } from 'stream';

/**
 * Creates a mock Claude CLI stdout stream that emits JSON messages
 * matching the real --output-format stream-json output
 */
export function createMockClaudeOutput(messages: unknown[]): Readable {
	const stream = new PassThrough();

	// Emit messages asynchronously to simulate real behavior
	setImmediate(() => {
		for (const msg of messages) {
			stream.push(JSON.stringify(msg) + '\n');
		}
		stream.push(null); // End stream
	});

	return stream;
}

/**
 * Creates an interactive mock stream for testing real-time behavior
 */
export function createInteractiveMockStream(): {
	stream: PassThrough;
	emit: (msg: unknown) => void;
	end: () => void;
} {
	const stream = new PassThrough();

	return {
		stream,
		emit: (msg: unknown) => {
			stream.push(JSON.stringify(msg) + '\n');
		},
		end: () => {
			stream.push(null);
		}
	};
}

/**
 * Sample Claude CLI output messages for testing
 * These match the format from --output-format stream-json
 */
export const sampleClaudeMessages = {
	// System initialization message
	systemInit: {
		type: 'system',
		system: {
			model: 'claude-sonnet-4-20250514',
			tools: ['Read', 'Write', 'Edit', 'Bash']
		}
	},

	// Text message from assistant
	textMessage: {
		type: 'assistant',
		message: {
			type: 'text',
			text: 'I understand. Let me analyze the code.'
		}
	},

	// Tool use message
	toolUse: {
		type: 'assistant',
		message: {
			type: 'tool_use',
			id: 'tool_123',
			name: 'Read',
			input: { file_path: '/workspace/src/index.ts' }
		}
	},

	// Tool result message
	toolResult: {
		type: 'tool_result',
		tool_use_id: 'tool_123',
		content: 'File contents here...'
	},

	// Turn complete message
	turnComplete: {
		type: 'assistant',
		stop_reason: 'end_turn'
	},

	// Final result message
	result: {
		type: 'result',
		cost: { input_tokens: 1000, output_tokens: 500 },
		duration_ms: 5000,
		session_id: 'sess_abc123'
	},

	// Error message
	error: {
		type: 'error',
		error: {
			type: 'api_error',
			message: 'Rate limit exceeded'
		}
	}
};

/**
 * Create a sequence of messages that simulates a typical Claude interaction
 */
export function createTypicalInteraction(): unknown[] {
	return [
		sampleClaudeMessages.systemInit,
		{
			type: 'assistant',
			message: {
				type: 'text',
				text: "I'll help you with that. Let me first read the file."
			}
		},
		{
			type: 'assistant',
			message: {
				type: 'tool_use',
				id: 'tool_001',
				name: 'Read',
				input: { file_path: '/workspace/src/main.ts' }
			}
		},
		{
			type: 'tool_result',
			tool_use_id: 'tool_001',
			content: 'export function main() {\n  console.log("Hello");\n}'
		},
		{
			type: 'assistant',
			message: {
				type: 'text',
				text: "I see the issue. Let me fix it."
			}
		},
		{
			type: 'assistant',
			message: {
				type: 'tool_use',
				id: 'tool_002',
				name: 'Edit',
				input: {
					file_path: '/workspace/src/main.ts',
					old_string: 'console.log("Hello")',
					new_string: 'console.log("Hello, World!")'
				}
			}
		},
		{
			type: 'tool_result',
			tool_use_id: 'tool_002',
			content: 'File edited successfully'
		},
		{
			type: 'assistant',
			message: {
				type: 'text',
				text: "Done! I've updated the message."
			}
		},
		{
			...sampleClaudeMessages.turnComplete
		},
		{
			type: 'result',
			cost: { input_tokens: 2500, output_tokens: 800 },
			duration_ms: 12000
		}
	];
}

/**
 * Create a message sequence that ends in an error
 */
export function createErrorInteraction(): unknown[] {
	return [
		sampleClaudeMessages.systemInit,
		{
			type: 'assistant',
			message: {
				type: 'text',
				text: 'Let me try to read that file.'
			}
		},
		{
			type: 'assistant',
			message: {
				type: 'tool_use',
				id: 'tool_001',
				name: 'Read',
				input: { file_path: '/workspace/nonexistent.ts' }
			}
		},
		{
			type: 'tool_result',
			tool_use_id: 'tool_001',
			is_error: true,
			content: 'Error: File not found: /workspace/nonexistent.ts'
		},
		{
			type: 'assistant',
			message: {
				type: 'text',
				text: "I couldn't find that file. Let me check what files exist."
			}
		}
	];
}

/**
 * Create a multi-turn conversation
 */
export function createMultiTurnConversation(): unknown[][] {
	return [
		// Turn 1: Initial question
		[
			{
				type: 'assistant',
				message: {
					type: 'text',
					text: 'What would you like me to help you with?'
				}
			},
			{ type: 'assistant', stop_reason: 'end_turn' }
		],
		// Turn 2: After user input
		[
			{
				type: 'assistant',
				message: {
					type: 'text',
					text: 'I understand. Let me work on that.'
				}
			},
			{
				type: 'assistant',
				message: {
					type: 'tool_use',
					id: 'tool_001',
					name: 'Bash',
					input: { command: 'npm test' }
				}
			}
		]
	];
}

/**
 * Utility to verify a message matches the expected stream-json format
 */
export function isValidStreamJsonMessage(msg: unknown): boolean {
	if (typeof msg !== 'object' || msg === null) {
		return false;
	}

	const obj = msg as Record<string, unknown>;

	// Must have a type field
	if (typeof obj.type !== 'string') {
		return false;
	}

	// Type-specific validation
	switch (obj.type) {
		case 'system':
			return typeof obj.system === 'object';
		case 'assistant':
			return 'message' in obj || 'stop_reason' in obj;
		case 'tool_result':
			return typeof obj.tool_use_id === 'string';
		case 'result':
			return typeof obj.cost === 'object' || typeof obj.duration_ms === 'number';
		case 'error':
			return typeof obj.error === 'object';
		default:
			return true; // Allow unknown types for forward compatibility
	}
}
