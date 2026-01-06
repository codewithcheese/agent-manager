/**
 * API Routes for Repo Sessions
 *
 * GET /api/repos/[id]/sessions - List sessions for a repo
 * POST /api/repos/[id]/sessions - Start a new session
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { repos, sessions, events } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getGitModule } from '$lib/server/runner/git';
import { getGitHubModule } from '$lib/server/runner/github';
import { getDockerModule } from '$lib/server/runner/docker';
import type { SessionRole } from '$lib/server/db/schema';

export const GET: RequestHandler = async ({ params }) => {
	const { id } = params;

	const repo = await db.query.repos.findFirst({
		where: eq(repos.id, id)
	});

	if (!repo) {
		throw error(404, 'Repo not found');
	}

	const sessionList = await db.query.sessions.findMany({
		where: eq(sessions.repoId, id),
		orderBy: [desc(sessions.updatedAt)]
	});

	const github = getGitHubModule();

	return json({
		sessions: sessionList.map((s) => ({
			id: s.id,
			role: s.role,
			status: s.status,
			branchName: s.branchName,
			baseBranch: s.baseBranch,
			createdAt: s.createdAt.toISOString(),
			updatedAt: s.updatedAt.toISOString(),
			finishedAt: s.finishedAt?.toISOString() || null,
			needsInput: s.status === 'waiting',
			prUrl: s.lastKnownPrUrl,
			urls: github.getUrls(repo.owner, repo.name, {
				branch: s.branchName,
				baseBranch: s.baseBranch
			})
		}))
	});
};

export const POST: RequestHandler = async ({ params, request }) => {
	const { id: repoId } = params;
	const body = await request.json();

	const {
		role = 'implementer',
		baseBranch,
		goalPrompt,
		branchSuffix,
		model = 'sonnet'
	} = body as {
		role?: SessionRole;
		baseBranch?: string;
		goalPrompt?: string;
		branchSuffix?: string;
		model?: string;
	};

	// Validate role
	if (role !== 'implementer' && role !== 'orchestrator') {
		throw error(400, 'Invalid role. Must be "implementer" or "orchestrator"');
	}

	// Get repo
	const repo = await db.query.repos.findFirst({
		where: eq(repos.id, repoId)
	});

	if (!repo) {
		throw error(404, 'Repo not found');
	}

	// Check for existing orchestrator if creating one
	if (role === 'orchestrator') {
		const existingOrchestrator = await db.query.sessions.findFirst({
			where: (sessions, { and, eq, or }) =>
				and(
					eq(sessions.repoId, repoId),
					eq(sessions.role, 'orchestrator'),
					or(
						eq(sessions.status, 'running'),
						eq(sessions.status, 'starting'),
						eq(sessions.status, 'waiting')
					)
				)
		});

		if (existingOrchestrator) {
			throw error(400, 'An active orchestrator session already exists for this repo');
		}
	}

	const git = getGitModule();
	const github = getGitHubModule();
	const docker = getDockerModule();

	// Determine base branch
	const actualBaseBranch = baseBranch || repo.defaultBranch;

	// Create session record first to get ID
	const [session] = await db
		.insert(sessions)
		.values({
			repoId,
			role,
			status: 'starting',
			branchName: '', // Will be updated
			baseBranch: actualBaseBranch
		})
		.returning();

	try {
		// Generate branch name
		const branchName = branchSuffix
			? `agent/${repo.name}/${branchSuffix}`
			: git.generateBranchName(repo.name, session.id);

		// Create worktree
		const worktree = await git.createWorktree(
			repo.owner,
			repo.name,
			session.id,
			actualBaseBranch,
			branchName
		);

		// Update session with worktree info
		await db
			.update(sessions)
			.set({
				branchName,
				worktreePath: worktree.worktreePath,
				updatedAt: new Date()
			})
			.where(eq(sessions.id, session.id));

		// Get GitHub token for container
		const ghToken = await github.getToken();

		// Start container
		const managerUrl = docker.getHostUrl(parseInt(process.env.PORT || '3000', 10));
		const containerInfo = await docker.startContainer({
			sessionId: session.id,
			worktreePath: worktree.worktreePath,
			ghToken,
			managerUrl: `${managerUrl}/ws`,
			containerImage: process.env.CONTAINER_IMAGE || 'agent-manager-sandbox:latest',
			role,
			goalPrompt: goalPrompt || '',
			model
		});

		// Update session with container info
		await db
			.update(sessions)
			.set({
				containerId: containerInfo.containerId,
				updatedAt: new Date()
			})
			.where(eq(sessions.id, session.id));

		// Insert manager event
		await db.insert(events).values({
			sessionId: session.id,
			source: 'manager',
			type: 'session.started',
			payload: {
				role,
				branchName,
				baseBranch: actualBaseBranch,
				containerId: containerInfo.containerId,
				goalPrompt,
				model
			}
		});

		// Update repo activity
		await db
			.update(repos)
			.set({
				lastActivityAt: new Date(),
				updatedAt: new Date()
			})
			.where(eq(repos.id, repoId));

		// Get updated session
		const updatedSession = await db.query.sessions.findFirst({
			where: eq(sessions.id, session.id)
		});

		return json(
			{
				session: {
					...updatedSession,
					urls: github.getUrls(repo.owner, repo.name, {
						branch: branchName,
						baseBranch: actualBaseBranch
					})
				}
			},
			{ status: 201 }
		);
	} catch (err) {
		// Cleanup on failure
		await db
			.update(sessions)
			.set({
				status: 'error',
				updatedAt: new Date()
			})
			.where(eq(sessions.id, session.id));

		await db.insert(events).values({
			sessionId: session.id,
			source: 'manager',
			type: 'session.error',
			payload: {
				error: err instanceof Error ? err.message : 'Unknown error',
				phase: 'startup'
			}
		});

		throw error(500, err instanceof Error ? err.message : 'Failed to start session');
	}
};
