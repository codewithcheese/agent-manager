/**
 * Unit tests for Git module
 *
 * Tests pure functions that don't require file system or git operations.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createGitModule } from './git';

describe('Git Module - Pure Functions', () => {
	const originalHome = process.env.HOME;

	beforeEach(() => {
		process.env.HOME = '/home/testuser';
	});

	afterEach(() => {
		process.env.HOME = originalHome;
	});

	describe('generateBranchName', () => {
		it('creates branch with agent prefix and short session ID', () => {
			const git = createGitModule('/tmp/agent-manager');
			const branch = git.generateBranchName('my-repo', 'abc12345-6789-0123-4567-890abcdef012');

			expect(branch).toBe('agent/my-repo/abc12345');
		});

		it('uses first 8 characters of session ID', () => {
			const git = createGitModule('/tmp/agent-manager');
			const branch = git.generateBranchName('repo', '12345678abcdefgh');

			expect(branch).toBe('agent/repo/12345678');
		});

		it('handles short session IDs', () => {
			const git = createGitModule('/tmp/agent-manager');
			const branch = git.generateBranchName('repo', 'abc');

			expect(branch).toBe('agent/repo/abc');
		});

		it('handles special characters in repo name', () => {
			const git = createGitModule('/tmp/agent-manager');
			const branch = git.generateBranchName('my.repo-name_v2', 'session123');

			expect(branch).toBe('agent/my.repo-name_v2/session1');
		});

		it('handles empty repo name', () => {
			const git = createGitModule('/tmp/agent-manager');
			const branch = git.generateBranchName('', 'sessionid');

			expect(branch).toBe('agent//sessioni');
		});

		it('handles UUID-style session IDs', () => {
			const git = createGitModule('/tmp/agent-manager');
			const uuid = '550e8400-e29b-41d4-a716-446655440000';
			const branch = git.generateBranchName('webapp', uuid);

			expect(branch).toBe('agent/webapp/550e8400');
		});
	});

	describe('getMirrorPath', () => {
		it('constructs correct mirror path', () => {
			const git = createGitModule('/tmp/agent-manager');
			const path = git.getMirrorPath('owner', 'repo');

			expect(path).toBe('/tmp/agent-manager/repos/owner/repo.git');
		});

		it('handles organization names with hyphens', () => {
			const git = createGitModule('/tmp/agent-manager');
			const path = git.getMirrorPath('my-org', 'my-repo');

			expect(path).toBe('/tmp/agent-manager/repos/my-org/my-repo.git');
		});

		it('handles organization names with dots', () => {
			const git = createGitModule('/tmp/agent-manager');
			const path = git.getMirrorPath('org.name', 'repo.name');

			expect(path).toBe('/tmp/agent-manager/repos/org.name/repo.name.git');
		});

		it('handles underscores in names', () => {
			const git = createGitModule('/tmp/agent-manager');
			const path = git.getMirrorPath('my_org', 'my_repo');

			expect(path).toBe('/tmp/agent-manager/repos/my_org/my_repo.git');
		});

		it('uses expanded workspace root with tilde', () => {
			const git = createGitModule('~/.agent-manager');
			const path = git.getMirrorPath('owner', 'repo');

			expect(path).toBe('/home/testuser/.agent-manager/repos/owner/repo.git');
		});
	});

	describe('getWorktreePath', () => {
		it('constructs correct worktree path', () => {
			const git = createGitModule('/tmp/agent-manager');
			const path = git.getWorktreePath('session-123');

			expect(path).toBe('/tmp/agent-manager/worktrees/session-123');
		});

		it('handles UUID format session IDs', () => {
			const git = createGitModule('/tmp/agent-manager');
			const uuid = '550e8400-e29b-41d4-a716-446655440000';
			const path = git.getWorktreePath(uuid);

			expect(path).toBe('/tmp/agent-manager/worktrees/550e8400-e29b-41d4-a716-446655440000');
		});

		it('uses expanded workspace root with tilde', () => {
			const git = createGitModule('~/.agent-manager');
			const path = git.getWorktreePath('session-abc');

			expect(path).toBe('/home/testuser/.agent-manager/worktrees/session-abc');
		});
	});

	describe('workspace root handling', () => {
		it('expands tilde in paths', () => {
			const git = createGitModule('~/.agent-manager');

			expect(git.getMirrorPath('o', 'r')).toContain('/home/testuser/');
			expect(git.getWorktreePath('s')).toContain('/home/testuser/');
		});

		it('leaves absolute paths unchanged', () => {
			const git = createGitModule('/var/agent-data');

			expect(git.getMirrorPath('o', 'r')).toBe('/var/agent-data/repos/o/r.git');
			expect(git.getWorktreePath('s')).toBe('/var/agent-data/worktrees/s');
		});

		it('handles missing HOME env variable', () => {
			delete process.env.HOME;
			const git = createGitModule('~/data');

			// Should keep the tilde when HOME is missing
			expect(git.getMirrorPath('o', 'r')).toBe('~/data/repos/o/r.git');
		});
	});
});
