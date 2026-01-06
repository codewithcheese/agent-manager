/**
 * Configuration types for Agent Manager
 */

export interface AgentManagerConfig {
	/** PostgreSQL connection string */
	databaseUrl: string;

	/** Port for the manager to listen on */
	port: number;

	/** Root directory for repo mirrors and worktrees */
	workspaceRoot: string;

	/** Docker container image for agent sessions */
	containerImage: string;

	/** Seconds of inactivity before considering a session idle */
	idleTimeoutSeconds: number;

	/** Heartbeat interval for container health checks (ms) */
	heartbeatIntervalMs: number;

	/** Base system prompt for all sessions */
	baseSystemPrompt?: string;

	/** Optional: Override default branch for new sessions */
	defaultBaseBranch?: string;
}

export const DEFAULT_CONFIG: AgentManagerConfig = {
	databaseUrl: 'postgres://localhost:5432/agent_manager',
	port: 3000,
	workspaceRoot: '~/.agent-manager',
	containerImage: 'agent-manager-sandbox:latest',
	idleTimeoutSeconds: 30,
	heartbeatIntervalMs: 30000
};

/**
 * Paths derived from workspace root
 */
export interface WorkspacePaths {
	/** Root directory for all agent manager data */
	root: string;
	/** Directory for bare git mirrors: {root}/repos/{owner}/{repo}.git */
	reposDir: string;
	/** Directory for session worktrees: {root}/worktrees/{sessionId} */
	worktreesDir: string;
	/** Config file location */
	configFile: string;
}

export function getWorkspacePaths(workspaceRoot: string): WorkspacePaths {
	const root = workspaceRoot.replace(/^~/, process.env.HOME || '~');
	return {
		root,
		reposDir: `${root}/repos`,
		worktreesDir: `${root}/worktrees`,
		configFile: `${root}/config.json`
	};
}
