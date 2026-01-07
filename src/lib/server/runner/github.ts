/**
 * GitHub Integration Module
 *
 * Uses the gh CLI for GitHub operations:
 * - Repo listing and creation
 * - PR detection and creation
 * - Token acquisition for container auth
 * - File content retrieval (README, CLAUDE.md)
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface GitHubRepo {
	owner: string;
	name: string;
	fullName: string;
	defaultBranch: string;
	description: string | null;
	isPrivate: boolean;
	htmlUrl: string;
	cloneUrl: string;
}

export interface GitHubPR {
	number: number;
	title: string;
	state: 'open' | 'closed' | 'merged';
	url: string;
	headBranch: string;
	baseBranch: string;
	draft: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface GitHubUser {
	login: string;
	name: string | null;
	email: string | null;
}

export interface GitHubModule {
	/**
	 * Check if gh CLI is installed and authenticated.
	 */
	checkAuth(): Promise<{ authenticated: boolean; user: GitHubUser | null; error?: string }>;

	/**
	 * Get the current access token for use in containers.
	 * WARNING: Handle with care - do not log or persist.
	 */
	getToken(): Promise<string>;

	/**
	 * List repos the user has access to.
	 */
	listRepos(options?: {
		limit?: number;
		owner?: string;
		visibility?: 'public' | 'private' | 'all';
	}): Promise<GitHubRepo[]>;

	/**
	 * Get details for a specific repo.
	 */
	getRepo(owner: string, name: string): Promise<GitHubRepo | null>;

	/**
	 * Create a new repo.
	 */
	createRepo(options: {
		name: string;
		description?: string;
		isPrivate?: boolean;
		org?: string;
	}): Promise<GitHubRepo>;

	/**
	 * Find PRs for a branch.
	 */
	findPRsForBranch(owner: string, name: string, branch: string): Promise<GitHubPR[]>;

	/**
	 * Get file content from a repo (for README, CLAUDE.md, etc).
	 */
	getFileContent(
		owner: string,
		name: string,
		filePath: string,
		ref?: string
	): Promise<string | null>;

	/**
	 * Generate GitHub URLs for a repo/branch.
	 */
	getUrls(
		owner: string,
		name: string,
		options?: { branch?: string; baseBranch?: string }
	): GitHubUrls;
}

export interface GitHubUrls {
	repo: string;
	branch?: string;
	compare?: string;
	newPr?: string;
}

async function runGh(args: string[]): Promise<string> {
	const cmd = `gh ${args.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(' ')}`;
	try {
		const { stdout } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
		return stdout.trim();
	} catch (error) {
		const execError = error as { stderr?: string; message: string; code?: number };
		throw new GitHubError(
			`gh command failed: ${args.join(' ')}\n${execError.stderr || execError.message}`,
			execError.code
		);
	}
}

async function runGhJson<T>(args: string[]): Promise<T> {
	const result = await runGh(args);
	return JSON.parse(result) as T;
}

export class GitHubError extends Error {
	constructor(
		message: string,
		public exitCode?: number
	) {
		super(message);
		this.name = 'GitHubError';
	}
}

export function createGitHubModule(): GitHubModule {
	async function checkAuth(): Promise<{
		authenticated: boolean;
		user: GitHubUser | null;
		error?: string;
	}> {
		try {
			const user = await runGhJson<{ login: string; name: string; email: string }>([
				'api',
				'user',
				'--jq',
				'{login: .login, name: .name, email: .email}'
			]);
			return { authenticated: true, user };
		} catch (error) {
			return {
				authenticated: false,
				user: null,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	async function getToken(): Promise<string> {
		return runGh(['auth', 'token']);
	}

	async function listRepos(
		options: { limit?: number; owner?: string; visibility?: 'public' | 'private' | 'all' } = {}
	): Promise<GitHubRepo[]> {
		const { limit = 100, owner, visibility = 'all' } = options;

		const args = ['repo', 'list'];

		if (owner) {
			args.push(owner);
		}

		args.push('--limit', String(limit));
		// gh repo list only accepts public|private|internal, not 'all'
		if (visibility !== 'all') {
			args.push('--visibility', visibility);
		}
		args.push(
			'--json',
			'owner,name,nameWithOwner,defaultBranchRef,description,isPrivate,url,sshUrl'
		);

		interface GhRepoItem {
			owner: { login: string };
			name: string;
			nameWithOwner: string;
			defaultBranchRef: { name: string } | null;
			description: string | null;
			isPrivate: boolean;
			url: string;
			sshUrl: string;
		}

		const repos = await runGhJson<GhRepoItem[]>(args);

		return repos.map((r) => ({
			owner: r.owner.login,
			name: r.name,
			fullName: r.nameWithOwner,
			defaultBranch: r.defaultBranchRef?.name || 'main',
			description: r.description,
			isPrivate: r.isPrivate,
			htmlUrl: r.url,
			cloneUrl: `https://github.com/${r.nameWithOwner}.git`
		}));
	}

	async function getRepo(owner: string, name: string): Promise<GitHubRepo | null> {
		try {
			interface GhRepoView {
				owner: { login: string };
				name: string;
				nameWithOwner: string;
				defaultBranchRef: { name: string } | null;
				description: string | null;
				isPrivate: boolean;
				url: string;
			}

			const repo = await runGhJson<GhRepoView>([
				'repo',
				'view',
				`${owner}/${name}`,
				'--json',
				'owner,name,nameWithOwner,defaultBranchRef,description,isPrivate,url'
			]);

			return {
				owner: repo.owner.login,
				name: repo.name,
				fullName: repo.nameWithOwner,
				defaultBranch: repo.defaultBranchRef?.name || 'main',
				description: repo.description,
				isPrivate: repo.isPrivate,
				htmlUrl: repo.url,
				cloneUrl: `https://github.com/${repo.nameWithOwner}.git`
			};
		} catch {
			return null;
		}
	}

	async function createRepo(options: {
		name: string;
		description?: string;
		isPrivate?: boolean;
		org?: string;
	}): Promise<GitHubRepo> {
		const args = ['repo', 'create'];

		const repoName = options.org ? `${options.org}/${options.name}` : options.name;
		args.push(repoName);

		if (options.description) {
			args.push('--description', options.description);
		}

		args.push(options.isPrivate ? '--private' : '--public');
		args.push('--confirm');

		await runGh(args);

		// Fetch the created repo
		const owner = options.org || (await getCurrentUser());
		const repo = await getRepo(owner, options.name);

		if (!repo) {
			throw new GitHubError(`Failed to fetch newly created repo ${repoName}`);
		}

		return repo;
	}

	async function getCurrentUser(): Promise<string> {
		const result = await runGh(['api', 'user', '--jq', '.login']);
		return result;
	}

	async function findPRsForBranch(owner: string, name: string, branch: string): Promise<GitHubPR[]> {
		try {
			interface GhPRItem {
				number: number;
				title: string;
				state: 'OPEN' | 'CLOSED' | 'MERGED';
				url: string;
				headRefName: string;
				baseRefName: string;
				isDraft: boolean;
				createdAt: string;
				updatedAt: string;
			}

			const prs = await runGhJson<GhPRItem[]>([
				'pr',
				'list',
				'--repo',
				`${owner}/${name}`,
				'--head',
				branch,
				'--state',
				'all',
				'--json',
				'number,title,state,url,headRefName,baseRefName,isDraft,createdAt,updatedAt'
			]);

			return prs.map((pr) => ({
				number: pr.number,
				title: pr.title,
				state: pr.state.toLowerCase() as 'open' | 'closed' | 'merged',
				url: pr.url,
				headBranch: pr.headRefName,
				baseBranch: pr.baseRefName,
				draft: pr.isDraft,
				createdAt: pr.createdAt,
				updatedAt: pr.updatedAt
			}));
		} catch {
			return [];
		}
	}

	async function getFileContent(
		owner: string,
		name: string,
		filePath: string,
		ref?: string
	): Promise<string | null> {
		try {
			const endpoint = ref
				? `repos/${owner}/${name}/contents/${filePath}?ref=${ref}`
				: `repos/${owner}/${name}/contents/${filePath}`;

			const result = await runGh([
				'api',
				endpoint,
				'--jq',
				'.content | @base64d'
			]);

			return result;
		} catch {
			return null;
		}
	}

	function getUrls(
		owner: string,
		name: string,
		options: { branch?: string; baseBranch?: string } = {}
	): GitHubUrls {
		const base = `https://github.com/${owner}/${name}`;
		const urls: GitHubUrls = { repo: base };

		if (options.branch) {
			urls.branch = `${base}/tree/${options.branch}`;

			if (options.baseBranch) {
				urls.compare = `${base}/compare/${options.baseBranch}...${options.branch}`;
				urls.newPr = `${base}/compare/${options.baseBranch}...${options.branch}?expand=1`;
			}
		}

		return urls;
	}

	return {
		checkAuth,
		getToken,
		listRepos,
		getRepo,
		createRepo,
		findPRsForBranch,
		getFileContent,
		getUrls
	};
}

// Singleton instance
let githubModule: GitHubModule | null = null;

export function getGitHubModule(): GitHubModule {
	if (!githubModule) {
		githubModule = createGitHubModule();
	}
	return githubModule;
}
