import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';
import { webSocketServer } from 'sveltekit-ws/vite';
import tailwindcss from '@tailwindcss/vite';

// Note: The actual WebSocket handlers are in src/lib/server/websocket/handler.ts
// but they use ES module imports that aren't available in vite.config.ts
// So we use a simplified version here for dev, and the full implementation in server.js

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
					// Dynamically import the handler for full functionality
					try {
						const { createWebSocketHandlers } = await import('./src/lib/server/websocket/handler');
						const handlers = createWebSocketHandlers();
						await handlers.onMessage(connection, message);
					} catch (error) {
						console.error('[WS] Handler error:', error);
						// Fallback to basic echo
						const { getWebSocketManager } = await import('sveltekit-ws');
						const manager = getWebSocketManager();
						manager.send(connection.id, {
							type: 'agent-manager',
							data: {
								v: 1,
								kind: 'error',
								sessionId: null,
								ts: new Date().toISOString(),
								seq: 0,
								payload: {
									code: 'HANDLER_ERROR',
									message: error instanceof Error ? error.message : 'Handler not available'
								}
							}
						});
					}
				},
				onDisconnect: async (connection) => {
					console.log(`[WS] Client disconnected: ${connection.id}`);
					try {
						const { createWebSocketHandlers } = await import('./src/lib/server/websocket/handler');
						const handlers = createWebSocketHandlers();
						await handlers.onDisconnect(connection);
					} catch (error) {
						console.error('[WS] Disconnect handler error:', error);
					}
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
		expect: { requireAssertions: true },

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
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
