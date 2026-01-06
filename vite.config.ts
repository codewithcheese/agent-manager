import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';
import { webSocketServer } from 'sveltekit-ws/vite';
import tailwindcss from '@tailwindcss/vite';

// Note: The actual WebSocket handlers are in src/lib/server/websocket/handler.ts
// For development, we use a simplified handler here that just sends acks
// The full implementation with database access is only available at runtime

export default defineConfig({
	plugins: [
		tailwindcss(),
		// WebSocket plugin MUST be before sveltekit()
		webSocketServer({
			path: '/ws',
			handlers: {
				onConnect: async (connection) => {
					const { getWebSocketManager } = await import('sveltekit-ws');
					console.log(`[WS] Client connected: ${connection.id}`);
					const manager = getWebSocketManager();
					manager.send(connection.id, {
						type: 'agent-manager',
						data: {
							v: 1,
							kind: 'ack',
							sessionId: null,
							ts: new Date().toISOString(),
							seq: 0,
							payload: {
								commandSeq: 0,
								success: true,
								data: { connectionId: connection.id, message: 'Connected to Agent Manager' }
							}
						}
					});
				},
				onMessage: async (connection, message) => {
					// Dev mode: just echo back an ack
					// Full functionality requires runtime with SvelteKit env
					const { getWebSocketManager } = await import('sveltekit-ws');
					const manager = getWebSocketManager();
					const wsMessage = message as { seq?: number; sessionId?: string };
					manager.send(connection.id, {
						type: 'agent-manager',
						data: {
							v: 1,
							kind: 'ack',
							sessionId: wsMessage.sessionId || null,
							ts: new Date().toISOString(),
							seq: 0,
							payload: {
								commandSeq: wsMessage.seq || 0,
								success: true,
								data: { message: 'Message received (dev mode)' }
							}
						}
					});
				},
				onDisconnect: (connection) => {
					console.log(`[WS] Client disconnected: ${connection.id}`);
				},
				onError: (connection, error) => {
					console.error(`[WS] Error for ${connection.id}:`, error);
				}
			},
			heartbeat: true,
			heartbeatInterval: 30000
		}),
		sveltekit()
	],

	test: {
		projects: [
			{
				extends: './vite.config.ts',

				test: {
					name: 'client',

					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},

					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',

				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					setupFiles: ['src/test/setup.server.ts']
				}
			}
		]
	}
});
