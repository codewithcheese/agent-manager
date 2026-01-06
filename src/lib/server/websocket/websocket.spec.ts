import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocketManager, getWebSocketManager } from 'sveltekit-ws';
import type { WebSocket } from 'ws';

describe('WebSocket Integration', () => {
	let manager: WebSocketManager;
	let mockWs: Partial<WebSocket>;

	beforeEach(() => {
		manager = new WebSocketManager();
		mockWs = {
			readyState: 1, // OPEN
			send: vi.fn(),
			close: vi.fn()
		};
	});

	afterEach(() => {
		manager.clear();
	});

	describe('Connection Management', () => {
		it('should add a new connection', () => {
			expect(manager.size()).toBe(0);
			const connection = manager.addConnection(mockWs as WebSocket);

			expect(connection).toBeDefined();
			expect(connection.id).toBeDefined();
			expect(connection.ws).toBe(mockWs);
			expect(manager.size()).toBe(1);
		});

		it('should retrieve connection by id', () => {
			const connection = manager.addConnection(mockWs as WebSocket);
			const retrieved = manager.getConnection(connection.id);

			expect(retrieved).toBe(connection);
		});

		it('should return undefined for non-existent connection', () => {
			const retrieved = manager.getConnection('non-existent-id');
			expect(retrieved).toBeUndefined();
		});

		it('should remove connection', () => {
			const connection = manager.addConnection(mockWs as WebSocket);
			expect(manager.size()).toBe(1);

			const removed = manager.removeConnection(connection.id);

			expect(removed).toBe(true);
			expect(manager.size()).toBe(0);
		});

		it('should handle removing non-existent connection', () => {
			const removed = manager.removeConnection('non-existent-id');
			expect(removed).toBe(false);
		});

		it('should disconnect connection and close websocket', () => {
			const connection = manager.addConnection(mockWs as WebSocket);

			const disconnected = manager.disconnect(connection.id);

			expect(disconnected).toBe(true);
			expect(mockWs.close).toHaveBeenCalled();
			expect(manager.size()).toBe(0);
		});

		it('should clear all connections', () => {
			manager.addConnection({ ...mockWs } as WebSocket);
			manager.addConnection({ ...mockWs } as WebSocket);
			manager.addConnection({ ...mockWs } as WebSocket);

			expect(manager.size()).toBe(3);

			manager.clear();

			expect(manager.size()).toBe(0);
		});
	});

	describe('Message Sending', () => {
		it('should send message to specific connection', () => {
			const connection = manager.addConnection(mockWs as WebSocket);
			const message = { type: 'test', data: { value: 'hello' } };

			const result = manager.send(connection.id, message);

			expect(result).toBe(true);
			expect(mockWs.send).toHaveBeenCalled();
			const sentData = (mockWs.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
			expect(sentData).toContain('"type":"test"');
		});

		it('should return false when sending to non-existent connection', () => {
			const result = manager.send('non-existent-id', {
				type: 'test',
				data: 'hello'
			});

			expect(result).toBe(false);
		});

		it('should return false when sending to closed connection', () => {
			const closedWs = { ...mockWs, readyState: 3 }; // CLOSED
			const connection = manager.addConnection(closedWs as WebSocket);

			const result = manager.send(connection.id, {
				type: 'test',
				data: 'hello'
			});

			expect(result).toBe(false);
		});

		it('should include timestamp in sent messages', () => {
			const connection = manager.addConnection(mockWs as WebSocket);
			const message = { type: 'test', data: 'hello' };

			manager.send(connection.id, message);

			const sentData = (mockWs.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
			const parsed = JSON.parse(sentData);

			expect(parsed.timestamp).toBeDefined();
			expect(typeof parsed.timestamp).toBe('number');
		});
	});

	describe('Broadcasting', () => {
		it('should broadcast to all connections', () => {
			const ws1 = { ...mockWs, send: vi.fn() };
			const ws2 = { ...mockWs, send: vi.fn() };

			manager.addConnection(ws1 as WebSocket);
			manager.addConnection(ws2 as WebSocket);

			const message = { type: 'broadcast', data: 'hello all' };
			manager.broadcast(message);

			expect(ws1.send).toHaveBeenCalled();
			expect(ws2.send).toHaveBeenCalled();
		});

		it('should broadcast excluding specific connections', () => {
			const ws1 = { ...mockWs, send: vi.fn() };
			const ws2 = { ...mockWs, send: vi.fn() };

			const conn1 = manager.addConnection(ws1 as WebSocket);
			manager.addConnection(ws2 as WebSocket);

			const message = { type: 'broadcast', data: 'hello' };
			manager.broadcast(message, [conn1.id]);

			expect(ws1.send).not.toHaveBeenCalled();
			expect(ws2.send).toHaveBeenCalled();
		});

		it('should not send to closed connections during broadcast', () => {
			const ws1 = { ...mockWs, send: vi.fn() };
			const ws2 = { ...mockWs, send: vi.fn(), readyState: 3 }; // CLOSED

			manager.addConnection(ws1 as WebSocket);
			manager.addConnection(ws2 as WebSocket);

			const message = { type: 'broadcast', data: 'hello' };
			manager.broadcast(message);

			expect(ws1.send).toHaveBeenCalled();
			expect(ws2.send).not.toHaveBeenCalled();
		});
	});

	describe('Metadata', () => {
		it('should add metadata to connection', () => {
			const metadata = { userId: '123', username: 'test' };
			const connection = manager.addConnection(mockWs as WebSocket, metadata);

			expect(connection.metadata).toEqual(metadata);
		});

		it('should allow updating connection metadata', () => {
			const connection = manager.addConnection(mockWs as WebSocket, { userId: '123' });
			connection.metadata = { ...connection.metadata, role: 'admin' };

			expect(connection.metadata?.userId).toBe('123');
			expect(connection.metadata?.role).toBe('admin');
		});
	});

	describe('Global Manager Singleton', () => {
		it('should return the same manager instance', () => {
			const manager1 = getWebSocketManager();
			const manager2 = getWebSocketManager();

			expect(manager1).toBe(manager2);
		});
	});
});
