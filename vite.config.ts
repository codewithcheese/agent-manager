import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';
import { webSocketServer } from 'sveltekit-ws/vite';
import { getWebSocketManager } from 'sveltekit-ws';

export default defineConfig({
	plugins: [
		// WebSocket plugin MUST be before sveltekit()
		webSocketServer({
			path: '/ws',
			handlers: {
				onConnect: (connection) => {
					console.log(`[WS] Client connected: ${connection.id}`);
					const manager = getWebSocketManager();
					manager.send(connection.id, {
						type: 'welcome',
						data: { message: 'Connected to WebSocket server', connectionId: connection.id }
					});
				},
				onMessage: (connection, message) => {
					console.log(`[WS] Message from ${connection.id}:`, message);
					const manager = getWebSocketManager();

					switch (message.type) {
						case 'echo':
							manager.send(connection.id, {
								type: 'echo',
								data: message.data
							});
							break;
						case 'broadcast':
							manager.broadcast(
								{ type: 'broadcast', data: message.data },
								[connection.id]
							);
							break;
						default:
							manager.send(connection.id, {
								type: 'error',
								data: { message: `Unknown message type: ${message.type}` }
							});
					}
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
