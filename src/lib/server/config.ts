/**
 * Configuration Module
 *
 * Loads and manages Agent Manager configuration from:
 * 1. Environment variables
 * 2. Config file (~/.agent-manager/config.json)
 * 3. Defaults
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { AgentManagerConfig, WorkspacePaths } from '$lib/types/config';
import { DEFAULT_CONFIG, getWorkspacePaths } from '$lib/types/config';
import { env } from '$env/dynamic/private';

let configCache: AgentManagerConfig | null = null;

/**
 * Resolve ~ to home directory
 */
function expandHome(filepath: string): string {
	if (filepath.startsWith('~')) {
		return filepath.replace('~', process.env.HOME || '~');
	}
	return filepath;
}

/**
 * Load configuration from file if it exists
 */
async function loadConfigFile(): Promise<Partial<AgentManagerConfig>> {
	const configPath = expandHome('~/.agent-manager/config.json');

	try {
		const content = await fs.readFile(configPath, 'utf-8');
		return JSON.parse(content);
	} catch {
		// Config file doesn't exist or is invalid
		return {};
	}
}

/**
 * Get configuration from environment variables
 */
function getEnvConfig(): Partial<AgentManagerConfig> {
	const config: Partial<AgentManagerConfig> = {};

	if (env.DATABASE_URL) {
		config.databaseUrl = env.DATABASE_URL;
	}

	if (env.PORT) {
		config.port = parseInt(env.PORT, 10);
	}

	if (env.WORKSPACE_ROOT) {
		config.workspaceRoot = env.WORKSPACE_ROOT;
	}

	if (env.CONTAINER_IMAGE) {
		config.containerImage = env.CONTAINER_IMAGE;
	}

	if (env.IDLE_TIMEOUT_SECONDS) {
		config.idleTimeoutSeconds = parseInt(env.IDLE_TIMEOUT_SECONDS, 10);
	}

	if (env.HEARTBEAT_INTERVAL_MS) {
		config.heartbeatIntervalMs = parseInt(env.HEARTBEAT_INTERVAL_MS, 10);
	}

	if (env.BASE_SYSTEM_PROMPT) {
		config.baseSystemPrompt = env.BASE_SYSTEM_PROMPT;
	}

	return config;
}

/**
 * Load and merge configuration from all sources
 */
export async function loadConfig(): Promise<AgentManagerConfig> {
	if (configCache) {
		return configCache;
	}

	// Load from file
	const fileConfig = await loadConfigFile();

	// Get from environment
	const envConfig = getEnvConfig();

	// Merge: defaults < file < env
	configCache = {
		...DEFAULT_CONFIG,
		...fileConfig,
		...envConfig
	} as AgentManagerConfig;

	return configCache;
}

/**
 * Get configuration (sync version, requires loadConfig to be called first)
 */
export function getConfig(): AgentManagerConfig {
	if (!configCache) {
		// Return defaults if not yet loaded
		return DEFAULT_CONFIG;
	}
	return configCache;
}

/**
 * Get workspace paths
 */
export async function getWorkspacePathsAsync(): Promise<WorkspacePaths> {
	const config = await loadConfig();
	return getWorkspacePaths(config.workspaceRoot);
}

/**
 * Ensure workspace directories exist
 */
export async function ensureWorkspaceDirs(): Promise<WorkspacePaths> {
	const paths = await getWorkspacePathsAsync();

	await fs.mkdir(paths.root, { recursive: true });
	await fs.mkdir(paths.reposDir, { recursive: true });
	await fs.mkdir(paths.worktreesDir, { recursive: true });

	return paths;
}

/**
 * Save configuration to file
 */
export async function saveConfig(config: Partial<AgentManagerConfig>): Promise<void> {
	const paths = await getWorkspacePathsAsync();

	// Load existing config
	const existing = await loadConfigFile();

	// Merge and save
	const merged = { ...existing, ...config };

	await fs.mkdir(path.dirname(paths.configFile), { recursive: true });
	await fs.writeFile(paths.configFile, JSON.stringify(merged, null, 2));

	// Invalidate cache
	configCache = null;
}

/**
 * Get the base system prompt for sessions
 */
export async function getBaseSystemPrompt(role: 'implementer' | 'orchestrator'): Promise<string> {
	const config = await loadConfig();

	const basePrompt = config.baseSystemPrompt || `You are an AI coding assistant working in a sandboxed environment.

Your workspace is at /workspace, which is a git worktree for a specific branch.

Guidelines:
- You have full access to the filesystem within /workspace
- You can run any CLI commands needed for your task
- Make commits and push when you complete meaningful units of work
- Stop and wait for user input after completing a task or when you need clarification

Git workflow:
- Your work is on a dedicated branch
- Commit often with clear messages
- Push when you're done with a task so the user can review
`;

	if (role === 'orchestrator') {
		return basePrompt + `

As the Orchestrator:
- You coordinate work across multiple agent sessions
- You receive summaries of other sessions' activities
- Help plan and organize implementation efforts
- Suggest task breakdowns and session coordination strategies
`;
	}

	return basePrompt + `

As an Implementer:
- Focus on writing code and making changes
- Follow the repository's conventions (check CLAUDE.md if available)
- Run tests and ensure your changes work
- Create clear, focused commits
`;
}

/**
 * Clear configuration cache (for testing)
 */
export function clearConfigCache(): void {
	configCache = null;
}
