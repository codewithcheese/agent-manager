/**
 * Git Integration Module
 *
 * Handles:
 * - Bare mirror management (~/.agent-manager/repos/<owner>/<repo>.git)
 * - Worktree creation for sessions (~/.agent-manager/worktrees/<sessionId>)
 * - Branch management
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getWorkspacePaths, type WorkspacePaths } from '$lib/types/config';
import { createLogger } from '$lib/server/logger';

const execAsync = promisify(exec);
const log = createLogger('git');

export interface GitMirrorInfo {
	mirrorPath: string;
	owner: string;
	name: string;
	defaultBranch: string;
	exists: boolean;
}

export interface WorktreeInfo {
	worktreePath: string;
	sessionId: string;
	branchName: string;
	baseBranch: string;
}

export interface GitModule {
	/**
	 * Ensure a bare mirror exists for the given repo.
	 * Creates it if missing, fetches if exists.
	 */
	ensureMirror(owner: string, name: string): Promise<GitMirrorInfo>;

	/**
	 * Create a worktree for a new session.
	 * Creates a new branch based on the specified base branch.
	 */
	createWorktree(
		owner: string,
		name: string,
		sessionId: string,
		baseBranch: string,
		branchName: string
	): Promise<WorktreeInfo>;

	/**
	 * Remove a worktree when session is done.
	 */
	removeWorktree(sessionId: string): Promise<void>;

	/**
	 * Get the default branch for a repo mirror.
	 */
	getDefaultBranch(owner: string, name: string): Promise<string>;

	/**
	 * Generate a branch name for a session.
	 */
	generateBranchName(repoName: string, sessionId: string): string;

	/**
	 * Get the mirror path for a repo.
	 */
	getMirrorPath(owner: string, name: string): string;

	/**
	 * Get the worktree path for a session.
	 */
	getWorktreePath(sessionId: string): string;
}

export function createGitModule(workspaceRoot: string): GitModule {
	const paths = getWorkspacePaths(workspaceRoot);

	async function ensureDirectories(): Promise<void> {
		await fs.mkdir(paths.reposDir, { recursive: true });
		await fs.mkdir(paths.worktreesDir, { recursive: true });
	}

	function getMirrorPath(owner: string, name: string): string {
		return path.join(paths.reposDir, owner, `${name}.git`);
	}

	function getWorktreePath(sessionId: string): string {
		return path.join(paths.worktreesDir, sessionId);
	}

	async function mirrorExists(mirrorPath: string): Promise<boolean> {
		try {
			await fs.access(mirrorPath);
			const stat = await fs.stat(mirrorPath);
			return stat.isDirectory();
		} catch {
			return false;
		}
	}

	async function runGit(cwd: string, args: string[]): Promise<string> {
		const cmd = `git ${args.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(' ')}`;
		log.debug(`Running: ${cmd}`, { cwd });
		try {
			const { stdout } = await execAsync(cmd, { cwd, maxBuffer: 10 * 1024 * 1024 });
			return stdout.trim();
		} catch (error) {
			const execError = error as { stderr?: string; message: string };
			const errorMsg = `Git command failed: ${cmd}\n${execError.stderr || execError.message}`;
			log.error(errorMsg, error);
			throw new Error(errorMsg);
		}
	}

	async function ensureMirror(owner: string, name: string): Promise<GitMirrorInfo> {
		await ensureDirectories();

		const mirrorPath = getMirrorPath(owner, name);
		const cloneUrl = `https://github.com/${owner}/${name}.git`;

		const exists = await mirrorExists(mirrorPath);

		if (exists) {
			// Fetch updates
			await runGit(mirrorPath, ['fetch', '--prune', 'origin']);
		} else {
			// Create parent directory
			await fs.mkdir(path.dirname(mirrorPath), { recursive: true });

			// Clone as bare mirror
			await runGit(path.dirname(mirrorPath), ['clone', '--bare', '--mirror', cloneUrl, mirrorPath]);
		}

		// Get default branch
		const defaultBranch = await getDefaultBranch(owner, name);

		return {
			mirrorPath,
			owner,
			name,
			defaultBranch,
			exists
		};
	}

	async function getDefaultBranch(owner: string, name: string): Promise<string> {
		const mirrorPath = getMirrorPath(owner, name);

		try {
			// Try to get the HEAD reference
			const headRef = await runGit(mirrorPath, ['symbolic-ref', 'HEAD']);
			// Returns something like "refs/heads/main"
			return headRef.replace('refs/heads/', '');
		} catch {
			// Fallback: try common branch names
			const branches = await runGit(mirrorPath, ['branch', '-l']);
			if (branches.includes('main')) return 'main';
			if (branches.includes('master')) return 'master';

			// Last resort: get first branch
			const firstBranch = branches.split('\n')[0]?.replace(/^\*?\s*/, '').trim();
			return firstBranch || 'main';
		}
	}

	async function createWorktree(
		owner: string,
		name: string,
		sessionId: string,
		baseBranch: string,
		branchName: string
	): Promise<WorktreeInfo> {
		await ensureDirectories();

		const mirrorPath = getMirrorPath(owner, name);
		const worktreePath = getWorktreePath(sessionId);

		// Ensure mirror is up to date
		await ensureMirror(owner, name);

		// Remove existing worktree if it exists (cleanup from crashed session)
		try {
			await fs.access(worktreePath);
			await runGit(mirrorPath, ['worktree', 'remove', '--force', worktreePath]);
		} catch {
			// Worktree doesn't exist, which is expected
		}

		// Create new branch and worktree
		// First, try to create the branch from origin/<baseBranch>
		const baseRef = `origin/${baseBranch}`;

		try {
			// Create worktree with new branch
			await runGit(mirrorPath, ['worktree', 'add', '-b', branchName, worktreePath, baseRef]);
		} catch (error) {
			// Branch might already exist, try without -b
			try {
				await runGit(mirrorPath, ['worktree', 'add', worktreePath, branchName]);
			} catch {
				// If that fails too, force create
				await runGit(mirrorPath, ['branch', '-D', branchName]).catch(() => {});
				await runGit(mirrorPath, ['worktree', 'add', '-b', branchName, worktreePath, baseRef]);
			}
		}

		// Configure user info in the worktree for commits
		await runGit(worktreePath, ['config', 'user.email', 'agent@agent-manager.local']);
		await runGit(worktreePath, ['config', 'user.name', 'Agent Manager']);

		return {
			worktreePath,
			sessionId,
			branchName,
			baseBranch
		};
	}

	async function removeWorktree(sessionId: string): Promise<void> {
		const worktreePath = getWorktreePath(sessionId);

		try {
			// Find the mirror this worktree belongs to by reading .git file
			const gitFile = path.join(worktreePath, '.git');
			const gitContent = await fs.readFile(gitFile, 'utf-8');
			const gitDirMatch = gitContent.match(/gitdir:\s*(.+)/);

			if (gitDirMatch) {
				// Extract mirror path from the gitdir
				// gitdir is like: /path/to/repos/owner/repo.git/worktrees/sessionId
				const gitDir = gitDirMatch[1].trim();
				const mirrorPath = gitDir.replace(/\/worktrees\/[^/]+$/, '');

				if (mirrorPath) {
					await runGit(mirrorPath, ['worktree', 'remove', '--force', worktreePath]);
				}
			}
		} catch {
			// If we can't properly remove via git, just delete the directory
			await fs.rm(worktreePath, { recursive: true, force: true });
		}
	}

	function generateBranchName(repoName: string, sessionId: string): string {
		// Use first 8 chars of session ID for readability
		const shortId = sessionId.substring(0, 8);
		return `agent/${repoName}/${shortId}`;
	}

	return {
		ensureMirror,
		createWorktree,
		removeWorktree,
		getDefaultBranch,
		generateBranchName,
		getMirrorPath,
		getWorktreePath
	};
}

// Default instance using standard workspace root
let defaultGitModule: GitModule | null = null;

export function getGitModule(workspaceRoot = '~/.agent-manager'): GitModule {
	if (!defaultGitModule) {
		defaultGitModule = createGitModule(workspaceRoot);
	}
	return defaultGitModule;
}
