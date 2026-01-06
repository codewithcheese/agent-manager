/**
 * Unit tests for config types
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getWorkspacePaths, DEFAULT_CONFIG } from './config';

describe('getWorkspacePaths', () => {
	const originalHome = process.env.HOME;

	afterEach(() => {
		process.env.HOME = originalHome;
	});

	it('expands tilde to home directory', () => {
		process.env.HOME = '/home/testuser';
		const paths = getWorkspacePaths('~/.agent-manager');

		expect(paths.root).toBe('/home/testuser/.agent-manager');
		expect(paths.reposDir).toBe('/home/testuser/.agent-manager/repos');
		expect(paths.worktreesDir).toBe('/home/testuser/.agent-manager/worktrees');
		expect(paths.configFile).toBe('/home/testuser/.agent-manager/config.json');
	});

	it('leaves absolute paths unchanged', () => {
		const paths = getWorkspacePaths('/var/agent-manager');

		expect(paths.root).toBe('/var/agent-manager');
		expect(paths.reposDir).toBe('/var/agent-manager/repos');
		expect(paths.worktreesDir).toBe('/var/agent-manager/worktrees');
		expect(paths.configFile).toBe('/var/agent-manager/config.json');
	});

	it('handles missing HOME env var', () => {
		delete process.env.HOME;
		const paths = getWorkspacePaths('~/data');

		expect(paths.root).toBe('~/data');
	});

	it('handles paths with trailing slashes correctly', () => {
		process.env.HOME = '/home/user';
		const paths = getWorkspacePaths('~/.agent-manager');

		// Should not have double slashes
		expect(paths.reposDir).not.toContain('//');
	});

	it('only expands leading tilde', () => {
		process.env.HOME = '/home/user';
		const paths = getWorkspacePaths('/path/~/data');

		expect(paths.root).toBe('/path/~/data');
	});
});

describe('DEFAULT_CONFIG', () => {
	it('has required default values', () => {
		expect(DEFAULT_CONFIG.databaseUrl).toBe('postgres://localhost:5432/agent_manager');
		expect(DEFAULT_CONFIG.port).toBe(3000);
		expect(DEFAULT_CONFIG.workspaceRoot).toBe('~/.agent-manager');
		expect(DEFAULT_CONFIG.containerImage).toBe('agent-manager-sandbox:latest');
		expect(DEFAULT_CONFIG.idleTimeoutSeconds).toBe(30);
		expect(DEFAULT_CONFIG.heartbeatIntervalMs).toBe(30000);
	});

	it('does not have optional fields set', () => {
		expect(DEFAULT_CONFIG.baseSystemPrompt).toBeUndefined();
		expect(DEFAULT_CONFIG.defaultBaseBranch).toBeUndefined();
	});
});
