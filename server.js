import { handler } from './build/handler.js';
import express from 'express';
import { createServer } from 'http';
import { createWebSocketHandler } from 'sveltekit-ws/server';
import { getWebSocketManager } from 'sveltekit-ws';

const app = express();
const server = createServer(app);

// Setup WebSocket handler for production
createWebSocketHandler(server, {
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
					manager.broadcast({ type: 'broadcast', data: message.data }, [connection.id]);
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
});

// SvelteKit handler
app.use(handler);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
	console.log(`Server running on http://localhost:${PORT}`);
	console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
});
