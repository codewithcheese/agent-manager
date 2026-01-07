/**
 * Integration tests for Git module
 *
 * Tests actual git operations using a temporary directory.
 * These tests verify worktree creation, mirror management, and branch handling.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createGitModule } from './git';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('Git Module - Integration', () => {
	let tempDir: string;
	let sourceRepo: string;

	beforeEach(async () => {
		// Create temp workspace directory
		tempDir = await fs.mkdtemp('/tmp/git-integration-test-');
		sourceRepo = path.join(tempDir, 'source-repo');

		// Create a source repository (simulates GitHub)
		await fs.mkdir(sourceRepo);
		await execAsync('git init --initial-branch=main', { cwd: sourceRepo });
		await execAsync('git config user.email "test@test.com"', { cwd: sourceRepo });
		await execAsync('git config user.name "Test User"', { cwd: sourceRepo });

		// Create initial commit on main branch
		await fs.writeFile(path.join(sourceRepo, 'README.md'), '# Test Repo');
		await execAsync('git add .', { cwd: sourceRepo });
		await execAsync('git commit -m "Initial commit"', { cwd: sourceRepo });
	});

	afterEach(async () => {
		// Cleanup temp directory
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	describe('ensureMirror', () => {
		it('clones repository as bare mirror', async () => {
			const git = createGitModule(tempDir);

			// Override the clone URL to use local source repo
			const mirrorPath = git.getMirrorPath('test-owner', 'test-repo');
			await fs.mkdir(path.dirname(mirrorPath), { recursive: true });
			await execAsync(`git clone --bare --mirror "${sourceRepo}" "${mirrorPath}"`);

			// Verify it's a bare repo
			const config = await fs.readFile(path.join(mirrorPath, 'config'), 'utf-8');
			expect(config).toContain('bare = true');
		});

		it('fetches updates on existing mirror', async () => {
			const git = createGitModule(tempDir);

			// Create initial mirror
			const mirrorPath = git.getMirrorPath('test-owner', 'test-repo');
			await fs.mkdir(path.dirname(mirrorPath), { recursive: true });
			await execAsync(`git clone --bare --mirror "${sourceRepo}" "${mirrorPath}"`);

			// Add new commit to source
			await fs.writeFile(path.join(sourceRepo, 'new-file.txt'), 'new content');
			await execAsync('git add .', { cwd: sourceRepo });
			await execAsync('git commit -m "Second commit"', { cwd: sourceRepo });

			// Fetch should work without errors
			await execAsync('git fetch --prune origin', { cwd: mirrorPath });

			// Verify new commit is in mirror
			const { stdout } = await execAsync('git log --oneline', { cwd: mirrorPath });
			expect(stdout).toContain('Second commit');
		});
	});

	describe('createWorktree', () => {
		it('creates worktree from bare mirror using branch name directly', async () => {
			const git = createGitModule(tempDir);

			// Create bare mirror
			const mirrorPath = git.getMirrorPath('test-owner', 'test-repo');
			await fs.mkdir(path.dirname(mirrorPath), { recursive: true });
			await execAsync(`git clone --bare --mirror "${sourceRepo}" "${mirrorPath}"`);

			// Create worktree - this is the key test that caught the origin/main bug
			const sessionId = 'test-session-123';
			const branchName = 'agent/test-repo/test-sess';
			const worktreePath = git.getWorktreePath(sessionId);

			// In bare mirror, use branch name directly (main), not origin/main
			await execAsync(
				`git worktree add -b "${branchName}" "${worktreePath}" main`,
				{ cwd: mirrorPath }
			);

			// Verify worktree exists and has correct branch
			const stat = await fs.stat(worktreePath);
			expect(stat.isDirectory()).toBe(true);

			const { stdout: branch } = await execAsync('git branch --show-current', { cwd: worktreePath });
			expect(branch.trim()).toBe(branchName);
		});

		it('fails with origin/main reference in bare mirror', async () => {
			const git = createGitModule(tempDir);

			// Create bare mirror
			const mirrorPath = git.getMirrorPath('test-owner', 'test-repo');
			await fs.mkdir(path.dirname(mirrorPath), { recursive: true });
			await execAsync(`git clone --bare --mirror "${sourceRepo}" "${mirrorPath}"`);

			const worktreePath = path.join(tempDir, 'worktrees', 'fail-session');

			// This should FAIL - demonstrates the bug we fixed
			await expect(
				execAsync(
					`git worktree add -b "agent/fail/test" "${worktreePath}" origin/main`,
					{ cwd: mirrorPath }
				)
			).rejects.toThrow(/invalid reference/);
		});

		it('creates worktree with full module flow', async () => {
			const git = createGitModule(tempDir);

			// Setup: Create mirror manually (since ensureMirror would try to clone from GitHub)
			const mirrorPath = git.getMirrorPath('test-owner', 'test-repo');
			await fs.mkdir(path.dirname(mirrorPath), { recursive: true });
			await execAsync(`git clone --bare --mirror "${sourceRepo}" "${mirrorPath}"`);

			// Test the full createWorktree flow
			const sessionId = 'full-flow-session';
			const branchName = git.generateBranchName('test-repo', sessionId);

			const result = await git.createWorktree(
				'test-owner',
				'test-repo',
				sessionId,
				'main',
				branchName
			);

			// Verify result
			expect(result.worktreePath).toContain(sessionId);
			expect(result.branchName).toBe(branchName);
			expect(result.baseBranch).toBe('main');

			// Verify worktree exists
			const stat = await fs.stat(result.worktreePath);
			expect(stat.isDirectory()).toBe(true);

			// Verify README exists (from source repo)
			const readme = await fs.readFile(path.join(result.worktreePath, 'README.md'), 'utf-8');
			expect(readme).toContain('# Test Repo');

			// Verify git config was set
			const { stdout: email } = await execAsync('git config user.email', { cwd: result.worktreePath });
			expect(email.trim()).toBe('agent@agent-manager.local');
		});

		it('handles existing branch by reusing it', async () => {
			const git = createGitModule(tempDir);

			// Setup mirror
			const mirrorPath = git.getMirrorPath('test-owner', 'test-repo');
			await fs.mkdir(path.dirname(mirrorPath), { recursive: true });
			await execAsync(`git clone --bare --mirror "${sourceRepo}" "${mirrorPath}"`);

			const branchName = 'agent/test-repo/existing';

			// Create branch first
			await execAsync(`git branch "${branchName}" main`, { cwd: mirrorPath });

			// Now try to create worktree - should handle existing branch
			const sessionId = 'reuse-session';
			const worktreePath = git.getWorktreePath(sessionId);

			// Should succeed by using existing branch
			await execAsync(
				`git worktree add "${worktreePath}" "${branchName}"`,
				{ cwd: mirrorPath }
			);

			const stat = await fs.stat(worktreePath);
			expect(stat.isDirectory()).toBe(true);
		});
	});

	describe('removeWorktree', () => {
		it('removes worktree and cleans up', async () => {
			const git = createGitModule(tempDir);

			// Setup mirror and worktree
			const mirrorPath = git.getMirrorPath('test-owner', 'test-repo');
			await fs.mkdir(path.dirname(mirrorPath), { recursive: true });
			await execAsync(`git clone --bare --mirror "${sourceRepo}" "${mirrorPath}"`);

			const sessionId = 'remove-test-session';
			const branchName = 'agent/test-repo/remove';
			const worktreePath = git.getWorktreePath(sessionId);

			// Ensure worktrees directory exists
			await fs.mkdir(path.dirname(worktreePath), { recursive: true });

			await execAsync(
				`git worktree add -b "${branchName}" "${worktreePath}" main`,
				{ cwd: mirrorPath }
			);

			// Verify worktree exists
			await fs.access(worktreePath);

			// Remove worktree
			await git.removeWorktree(sessionId);

			// Verify worktree is gone
			await expect(fs.access(worktreePath)).rejects.toThrow();
		});
	});

	describe('getDefaultBranch', () => {
		it('returns main as default branch', async () => {
			const git = createGitModule(tempDir);

			// Setup mirror
			const mirrorPath = git.getMirrorPath('test-owner', 'test-repo');
			await fs.mkdir(path.dirname(mirrorPath), { recursive: true });
			await execAsync(`git clone --bare --mirror "${sourceRepo}" "${mirrorPath}"`);

			const defaultBranch = await git.getDefaultBranch('test-owner', 'test-repo');
			expect(defaultBranch).toBe('main');
		});

		it('handles repos with master as default', async () => {
			const git = createGitModule(tempDir);

			// Create source repo with master branch
			const masterSourceRepo = path.join(tempDir, 'master-source');
			await fs.mkdir(masterSourceRepo);
			await execAsync('git init --initial-branch=master', { cwd: masterSourceRepo });
			await execAsync('git config user.email "test@test.com"', { cwd: masterSourceRepo });
			await execAsync('git config user.name "Test User"', { cwd: masterSourceRepo });
			await fs.writeFile(path.join(masterSourceRepo, 'README.md'), '# Master Repo');
			await execAsync('git add .', { cwd: masterSourceRepo });
			await execAsync('git commit -m "Initial commit"', { cwd: masterSourceRepo });

			// Create mirror
			const mirrorPath = git.getMirrorPath('test-owner', 'master-repo');
			await fs.mkdir(path.dirname(mirrorPath), { recursive: true });
			await execAsync(`git clone --bare --mirror "${masterSourceRepo}" "${mirrorPath}"`);

			const defaultBranch = await git.getDefaultBranch('test-owner', 'master-repo');
			expect(defaultBranch).toBe('master');
		});
	});

	describe('generateBranchName', () => {
		it('generates consistent branch names', () => {
			const git = createGitModule(tempDir);

			const branch1 = git.generateBranchName('my-repo', 'abc12345-full-uuid');
			const branch2 = git.generateBranchName('my-repo', 'abc12345-different');

			// Both should have same prefix from first 8 chars of session ID
			expect(branch1).toBe('agent/my-repo/abc12345');
			expect(branch2).toBe('agent/my-repo/abc12345');
		});
	});
});
