/**
 * Docker Container Management Module
 *
 * Handles:
 * - Container lifecycle (create, start, stop, remove)
 * - Volume mounts for workspace and secrets
 * - Environment variables for auth
 * - Container health monitoring
 */

import { exec, spawn, type ChildProcess } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import type { AgentManagerConfig } from '$lib/types/config';

const execAsync = promisify(exec);

export interface ContainerConfig {
	sessionId: string;
	worktreePath: string;
	ghToken: string;
	managerUrl: string;
	containerImage: string;
	claudeConfigPath?: string;
	additionalEnv?: Record<string, string>;
}

export interface ContainerInfo {
	containerId: string;
	sessionId: string;
	status: 'created' | 'running' | 'exited' | 'dead' | 'unknown';
	exitCode?: number;
	startedAt?: string;
	finishedAt?: string;
}

export interface DockerModule {
	/**
	 * Check if Docker is available and running.
	 */
	checkDocker(): Promise<{ available: boolean; version?: string; error?: string }>;

	/**
	 * Start a container for a session.
	 */
	startContainer(config: ContainerConfig): Promise<ContainerInfo>;

	/**
	 * Stop a running container.
	 */
	stopContainer(containerId: string, timeout?: number): Promise<void>;

	/**
	 * Remove a container.
	 */
	removeContainer(containerId: string, force?: boolean): Promise<void>;

	/**
	 * Get container info by ID or session ID.
	 */
	getContainerInfo(containerId: string): Promise<ContainerInfo | null>;

	/**
	 * List containers for a session (by label).
	 */
	listSessionContainers(sessionId: string): Promise<ContainerInfo[]>;

	/**
	 * Stream container logs.
	 */
	streamLogs(
		containerId: string,
		onLog: (type: 'stdout' | 'stderr', data: string) => void
	): ChildProcess;

	/**
	 * Execute a command inside a running container.
	 */
	exec(containerId: string, command: string[]): Promise<{ stdout: string; stderr: string }>;

	/**
	 * Get the host URL for containers to connect back.
	 * On macOS Docker Desktop, this is host.docker.internal.
	 */
	getHostUrl(port: number): string;
}

export class DockerError extends Error {
	constructor(
		message: string,
		public exitCode?: number
	) {
		super(message);
		this.name = 'DockerError';
	}
}

async function runDocker(args: string[]): Promise<string> {
	const cmd = `docker ${args.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(' ')}`;
	try {
		const { stdout } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
		return stdout.trim();
	} catch (error) {
		const execError = error as { stderr?: string; message: string; code?: number };
		throw new DockerError(
			`Docker command failed: ${args.join(' ')}\n${execError.stderr || execError.message}`,
			execError.code
		);
	}
}

export function createDockerModule(config: Pick<AgentManagerConfig, 'port'>): DockerModule {
	async function checkDocker(): Promise<{ available: boolean; version?: string; error?: string }> {
		try {
			const version = await runDocker(['version', '--format', '{{.Server.Version}}']);
			return { available: true, version };
		} catch (error) {
			return {
				available: false,
				error: error instanceof Error ? error.message : 'Docker not available'
			};
		}
	}

	async function startContainer(containerConfig: ContainerConfig): Promise<ContainerInfo> {
		const {
			sessionId,
			worktreePath,
			ghToken,
			managerUrl,
			containerImage,
			claudeConfigPath,
			additionalEnv = {}
		} = containerConfig;

		// Build docker run command
		const args = [
			'run',
			'-d', // Detach
			'--name',
			`agent-session-${sessionId}`,
			'--label',
			`agent-manager.session=${sessionId}`,

			// Mount workspace
			'-v',
			`${worktreePath}:/workspace`,

			// Mount Claude config (read-only)
			...(claudeConfigPath
				? ['-v', `${claudeConfigPath}:/home/agent/.claude:ro`]
				: ['-v', `${process.env.HOME}/.claude:/home/agent/.claude:ro`]),

			// Environment variables (do not log these!)
			'-e',
			`GH_TOKEN=${ghToken}`,
			'-e',
			`GIT_TERMINAL_PROMPT=0`,
			'-e',
			`AGENT_MANAGER_URL=${managerUrl}`,
			'-e',
			`SESSION_ID=${sessionId}`,

			// Additional env vars
			...Object.entries(additionalEnv).flatMap(([k, v]) => ['-e', `${k}=${v}`]),

			// Working directory
			'-w',
			'/workspace',

			// Resource limits (reasonable for agent work)
			'--memory',
			'4g',
			'--cpus',
			'2',

			// Network: use bridge (default), container will connect via host.docker.internal
			'--add-host',
			'host.docker.internal:host-gateway',

			// Image
			containerImage
		];

		const containerId = await runDocker(args);

		return {
			containerId: containerId.substring(0, 12),
			sessionId,
			status: 'running'
		};
	}

	async function stopContainer(containerId: string, timeout = 10): Promise<void> {
		try {
			await runDocker(['stop', '-t', String(timeout), containerId]);
		} catch (error) {
			// Container might already be stopped
			if (error instanceof DockerError && error.message.includes('No such container')) {
				return;
			}
			throw error;
		}
	}

	async function removeContainer(containerId: string, force = false): Promise<void> {
		try {
			const args = ['rm'];
			if (force) args.push('-f');
			args.push(containerId);
			await runDocker(args);
		} catch (error) {
			// Container might already be removed
			if (error instanceof DockerError && error.message.includes('No such container')) {
				return;
			}
			throw error;
		}
	}

	async function getContainerInfo(containerId: string): Promise<ContainerInfo | null> {
		try {
			const format =
				'{{.Id}}|{{.State.Status}}|{{.State.ExitCode}}|{{.State.StartedAt}}|{{.State.FinishedAt}}|{{index .Config.Labels "agent-manager.session"}}';
			const result = await runDocker(['inspect', '--format', format, containerId]);

			const [id, status, exitCode, startedAt, finishedAt, sessionId] = result.split('|');

			return {
				containerId: id.substring(0, 12),
				sessionId: sessionId || '',
				status: status as ContainerInfo['status'],
				exitCode: parseInt(exitCode, 10),
				startedAt,
				finishedAt: finishedAt !== '0001-01-01T00:00:00Z' ? finishedAt : undefined
			};
		} catch {
			return null;
		}
	}

	async function listSessionContainers(sessionId: string): Promise<ContainerInfo[]> {
		try {
			const format = '{{.ID}}|{{.Status}}|{{.Labels}}';
			const result = await runDocker([
				'ps',
				'-a',
				'--filter',
				`label=agent-manager.session=${sessionId}`,
				'--format',
				format
			]);

			if (!result) return [];

			const containers: ContainerInfo[] = [];
			for (const line of result.split('\n')) {
				const [id] = line.split('|');
				const info = await getContainerInfo(id);
				if (info) containers.push(info);
			}

			return containers;
		} catch {
			return [];
		}
	}

	function streamLogs(
		containerId: string,
		onLog: (type: 'stdout' | 'stderr', data: string) => void
	): ChildProcess {
		const proc = spawn('docker', ['logs', '-f', '--timestamps', containerId]);

		proc.stdout?.on('data', (data: Buffer) => {
			onLog('stdout', data.toString());
		});

		proc.stderr?.on('data', (data: Buffer) => {
			onLog('stderr', data.toString());
		});

		return proc;
	}

	async function dockerExec(
		containerId: string,
		command: string[]
	): Promise<{ stdout: string; stderr: string }> {
		try {
			const args = ['exec', containerId, ...command];
			const stdout = await runDocker(args);
			return { stdout, stderr: '' };
		} catch (error) {
			if (error instanceof DockerError) {
				return { stdout: '', stderr: error.message };
			}
			throw error;
		}
	}

	function getHostUrl(port: number): string {
		// On macOS Docker Desktop, containers can reach the host via host.docker.internal
		// On Linux with Docker, you might need to use the host's IP or --network=host
		return `http://host.docker.internal:${port}`;
	}

	return {
		checkDocker,
		startContainer,
		stopContainer,
		removeContainer,
		getContainerInfo,
		listSessionContainers,
		streamLogs,
		exec: dockerExec,
		getHostUrl
	};
}

// Singleton instance
let dockerModule: DockerModule | null = null;

export function getDockerModule(config?: Pick<AgentManagerConfig, 'port'>): DockerModule {
	if (!dockerModule) {
		dockerModule = createDockerModule(config || { port: 3000 });
	}
	return dockerModule;
}
