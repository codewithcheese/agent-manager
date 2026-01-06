/**
 * Docker Container Deployment Integration Tests
 *
 * Tests the container deployment workflow by mocking child_process.exec
 * to verify that Docker commands are built correctly with all required
 * environment variables and mounts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted to define mocks before they're used in vi.mock
const mockExec = vi.hoisted(() => vi.fn());
const mockSpawn = vi.hoisted(() => vi.fn());

vi.mock('child_process', () => ({
	exec: mockExec,
	spawn: mockSpawn
}));

// Import after mocking
import { createDockerModule } from './docker';

describe('Docker Container Deployment', () => {
	const defaultConfig = { port: 3000 };

	beforeEach(() => {
		vi.clearAllMocks();
		// Default mock implementation for successful docker run
		mockExec.mockImplementation((cmd: string, opts: unknown, callback?: unknown) => {
			const cb = typeof opts === 'function' ? opts : callback;
			if (typeof cb === 'function') {
				cb(null, { stdout: 'abc123def456789012', stderr: '' });
			}
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('startContainer', () => {
		it('passes all required environment variables', async () => {
			const docker = createDockerModule(defaultConfig);

			await docker.startContainer({
				sessionId: 'session-123',
				worktreePath: '/tmp/workspace',
				ghToken: 'gh-token-secret',
				managerUrl: 'http://host.docker.internal:3000/ws',
				containerImage: 'agent-sandbox:latest',
				role: 'implementer',
				goalPrompt: 'Fix the bug',
				model: 'sonnet'
			});

			expect(mockExec).toHaveBeenCalledTimes(1);
			const dockerCmd = mockExec.mock.calls[0][0] as string;

			// Verify all env vars are present
			expect(dockerCmd).toContain('SESSION_ID=session-123');
			expect(dockerCmd).toContain('AGENT_MANAGER_URL=http://host.docker.internal:3000/ws');
			expect(dockerCmd).toContain('GH_TOKEN=gh-token-secret');
			expect(dockerCmd).toContain('AGENT_ROLE=implementer');
			expect(dockerCmd).toContain('GOAL_PROMPT=Fix the bug');
			expect(dockerCmd).toContain('CLAUDE_MODEL=sonnet');
			expect(dockerCmd).toContain('GIT_TERMINAL_PROMPT=0');
		});

		it('uses default model when not specified', async () => {
			const docker = createDockerModule(defaultConfig);

			await docker.startContainer({
				sessionId: 'session-123',
				worktreePath: '/tmp/workspace',
				ghToken: 'gh-token',
				managerUrl: 'http://host.docker.internal:3000/ws',
				containerImage: 'agent-sandbox:latest'
			});

			const dockerCmd = mockExec.mock.calls[0][0] as string;
			expect(dockerCmd).toContain('CLAUDE_MODEL=sonnet');
		});

		it('uses default role when not specified', async () => {
			const docker = createDockerModule(defaultConfig);

			await docker.startContainer({
				sessionId: 'session-123',
				worktreePath: '/tmp/workspace',
				ghToken: 'gh-token',
				managerUrl: 'http://host.docker.internal:3000/ws',
				containerImage: 'agent-sandbox:latest'
			});

			const dockerCmd = mockExec.mock.calls[0][0] as string;
			expect(dockerCmd).toContain('AGENT_ROLE=implementer');
		});

		it('handles orchestrator role', async () => {
			const docker = createDockerModule(defaultConfig);

			await docker.startContainer({
				sessionId: 'session-123',
				worktreePath: '/tmp/workspace',
				ghToken: 'gh-token',
				managerUrl: 'http://host.docker.internal:3000/ws',
				containerImage: 'agent-sandbox:latest',
				role: 'orchestrator'
			});

			const dockerCmd = mockExec.mock.calls[0][0] as string;
			expect(dockerCmd).toContain('AGENT_ROLE=orchestrator');
		});

		it('mounts workspace directory', async () => {
			const docker = createDockerModule(defaultConfig);

			await docker.startContainer({
				sessionId: 'session-123',
				worktreePath: '/tmp/my-workspace',
				ghToken: 'gh-token',
				managerUrl: 'http://host.docker.internal:3000/ws',
				containerImage: 'agent-sandbox:latest'
			});

			const dockerCmd = mockExec.mock.calls[0][0] as string;
			expect(dockerCmd).toContain('/tmp/my-workspace:/workspace');
		});

		it('mounts Claude config directory as read-only', async () => {
			const docker = createDockerModule(defaultConfig);

			await docker.startContainer({
				sessionId: 'session-123',
				worktreePath: '/tmp/workspace',
				ghToken: 'gh-token',
				managerUrl: 'http://host.docker.internal:3000/ws',
				containerImage: 'agent-sandbox:latest'
			});

			const dockerCmd = mockExec.mock.calls[0][0] as string;
			expect(dockerCmd).toContain('.claude:/home/agent/.claude:ro');
		});

		it('uses custom Claude config path when provided', async () => {
			const docker = createDockerModule(defaultConfig);

			await docker.startContainer({
				sessionId: 'session-123',
				worktreePath: '/tmp/workspace',
				ghToken: 'gh-token',
				managerUrl: 'http://host.docker.internal:3000/ws',
				containerImage: 'agent-sandbox:latest',
				claudeConfigPath: '/custom/claude/config'
			});

			const dockerCmd = mockExec.mock.calls[0][0] as string;
			expect(dockerCmd).toContain('/custom/claude/config:/home/agent/.claude:ro');
		});

		it('sets container name with session ID', async () => {
			const docker = createDockerModule(defaultConfig);

			await docker.startContainer({
				sessionId: 'my-session-456',
				worktreePath: '/tmp/workspace',
				ghToken: 'gh-token',
				managerUrl: 'http://host.docker.internal:3000/ws',
				containerImage: 'agent-sandbox:latest'
			});

			const dockerCmd = mockExec.mock.calls[0][0] as string;
			expect(dockerCmd).toContain('--name');
			expect(dockerCmd).toContain('agent-session-my-session-456');
		});

		it('sets session label for filtering', async () => {
			const docker = createDockerModule(defaultConfig);

			await docker.startContainer({
				sessionId: 'session-789',
				worktreePath: '/tmp/workspace',
				ghToken: 'gh-token',
				managerUrl: 'http://host.docker.internal:3000/ws',
				containerImage: 'agent-sandbox:latest'
			});

			const dockerCmd = mockExec.mock.calls[0][0] as string;
			expect(dockerCmd).toContain('--label');
			expect(dockerCmd).toContain('agent-manager.session=session-789');
		});

		it('sets resource limits', async () => {
			const docker = createDockerModule(defaultConfig);

			await docker.startContainer({
				sessionId: 'session-123',
				worktreePath: '/tmp/workspace',
				ghToken: 'gh-token',
				managerUrl: 'http://host.docker.internal:3000/ws',
				containerImage: 'agent-sandbox:latest'
			});

			const dockerCmd = mockExec.mock.calls[0][0] as string;
			expect(dockerCmd).toContain('--memory');
			expect(dockerCmd).toContain('4g');
			expect(dockerCmd).toContain('--cpus');
			expect(dockerCmd).toContain('2');
		});

		it('adds host.docker.internal host entry', async () => {
			const docker = createDockerModule(defaultConfig);

			await docker.startContainer({
				sessionId: 'session-123',
				worktreePath: '/tmp/workspace',
				ghToken: 'gh-token',
				managerUrl: 'http://host.docker.internal:3000/ws',
				containerImage: 'agent-sandbox:latest'
			});

			const dockerCmd = mockExec.mock.calls[0][0] as string;
			expect(dockerCmd).toContain('--add-host');
			expect(dockerCmd).toContain('host.docker.internal:host-gateway');
		});

		it('sets working directory to /workspace', async () => {
			const docker = createDockerModule(defaultConfig);

			await docker.startContainer({
				sessionId: 'session-123',
				worktreePath: '/tmp/workspace',
				ghToken: 'gh-token',
				managerUrl: 'http://host.docker.internal:3000/ws',
				containerImage: 'agent-sandbox:latest'
			});

			const dockerCmd = mockExec.mock.calls[0][0] as string;
			expect(dockerCmd).toContain('-w');
			expect(dockerCmd).toContain('/workspace');
		});

		it('runs in detached mode', async () => {
			const docker = createDockerModule(defaultConfig);

			await docker.startContainer({
				sessionId: 'session-123',
				worktreePath: '/tmp/workspace',
				ghToken: 'gh-token',
				managerUrl: 'http://host.docker.internal:3000/ws',
				containerImage: 'agent-sandbox:latest'
			});

			const dockerCmd = mockExec.mock.calls[0][0] as string;
			expect(dockerCmd).toContain('-d');
		});

		it('uses specified container image', async () => {
			const docker = createDockerModule(defaultConfig);

			await docker.startContainer({
				sessionId: 'session-123',
				worktreePath: '/tmp/workspace',
				ghToken: 'gh-token',
				managerUrl: 'http://host.docker.internal:3000/ws',
				containerImage: 'my-custom-image:v1.2.3'
			});

			const dockerCmd = mockExec.mock.calls[0][0] as string;
			expect(dockerCmd).toContain('my-custom-image:v1.2.3');
		});

		it('passes additional environment variables', async () => {
			const docker = createDockerModule(defaultConfig);

			await docker.startContainer({
				sessionId: 'session-123',
				worktreePath: '/tmp/workspace',
				ghToken: 'gh-token',
				managerUrl: 'http://host.docker.internal:3000/ws',
				containerImage: 'agent-sandbox:latest',
				additionalEnv: {
					CUSTOM_VAR: 'custom-value',
					ANOTHER_VAR: 'another-value'
				}
			});

			const dockerCmd = mockExec.mock.calls[0][0] as string;
			expect(dockerCmd).toContain('CUSTOM_VAR=custom-value');
			expect(dockerCmd).toContain('ANOTHER_VAR=another-value');
		});

		it('returns container info with truncated ID', async () => {
			mockExec.mockImplementation((cmd: string, opts: unknown, callback?: unknown) => {
				const cb = typeof opts === 'function' ? opts : callback;
				if (typeof cb === 'function') {
					cb(null, { stdout: 'abcdef1234567890abcdef1234567890', stderr: '' });
				}
			});

			const docker = createDockerModule(defaultConfig);

			const result = await docker.startContainer({
				sessionId: 'session-123',
				worktreePath: '/tmp/workspace',
				ghToken: 'gh-token',
				managerUrl: 'http://host.docker.internal:3000/ws',
				containerImage: 'agent-sandbox:latest'
			});

			expect(result.containerId).toBe('abcdef123456'); // First 12 chars
			expect(result.sessionId).toBe('session-123');
			expect(result.status).toBe('running');
		});

		it('handles empty goal prompt', async () => {
			const docker = createDockerModule(defaultConfig);

			await docker.startContainer({
				sessionId: 'session-123',
				worktreePath: '/tmp/workspace',
				ghToken: 'gh-token',
				managerUrl: 'http://host.docker.internal:3000/ws',
				containerImage: 'agent-sandbox:latest',
				goalPrompt: ''
			});

			const dockerCmd = mockExec.mock.calls[0][0] as string;
			// Empty goal prompt should still be passed
			expect(dockerCmd).toContain('GOAL_PROMPT=');
		});
	});

	describe('stopContainer', () => {
		it('sends stop command with default timeout', async () => {
			const docker = createDockerModule(defaultConfig);

			await docker.stopContainer('abc123');

			expect(mockExec).toHaveBeenCalledTimes(1);
			const dockerCmd = mockExec.mock.calls[0][0] as string;
			expect(dockerCmd).toContain('docker');
			expect(dockerCmd).toContain('stop');
			expect(dockerCmd).toContain('-t');
			expect(dockerCmd).toContain('10');
			expect(dockerCmd).toContain('abc123');
		});

		it('uses custom timeout', async () => {
			const docker = createDockerModule(defaultConfig);

			await docker.stopContainer('abc123', 30);

			const dockerCmd = mockExec.mock.calls[0][0] as string;
			expect(dockerCmd).toContain('-t');
			expect(dockerCmd).toContain('30');
		});
	});

	describe('removeContainer', () => {
		it('removes container without force', async () => {
			const docker = createDockerModule(defaultConfig);

			await docker.removeContainer('abc123');

			const dockerCmd = mockExec.mock.calls[0][0] as string;
			expect(dockerCmd).toContain('docker');
			expect(dockerCmd).toContain('rm');
			expect(dockerCmd).toContain('abc123');
			expect(dockerCmd).not.toContain('-f');
		});

		it('removes container with force', async () => {
			const docker = createDockerModule(defaultConfig);

			await docker.removeContainer('abc123', true);

			const dockerCmd = mockExec.mock.calls[0][0] as string;
			expect(dockerCmd).toContain('-f');
		});
	});
});
