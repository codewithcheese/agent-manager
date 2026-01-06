/**
 * API Routes for Repo Detail
 *
 * GET /api/repos/[id] - Get repo details with sessions
 * DELETE /api/repos/[id] - Remove repo from Agent Manager
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { repos, sessions } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getGitHubModule } from '$lib/server/runner/github';

export const GET: RequestHandler = async ({ params }) => {
	const { id } = params;

	const repo = await db.query.repos.findFirst({
		where: eq(repos.id, id)
	});

	if (!repo) {
		throw error(404, 'Repo not found');
	}

	// Get sessions
	const sessionList = await db.query.sessions.findMany({
		where: eq(sessions.repoId, id),
		orderBy: [desc(sessions.updatedAt)]
	});

	// Get GitHub URLs
	const github = getGitHubModule();
	const urls = github.getUrls(repo.owner, repo.name);

	// Try to get README and CLAUDE.md
	let readme: string | null = null;
	let claudeMd: string | null = null;

	try {
		readme = await github.getFileContent(repo.owner, repo.name, 'README.md');
	} catch {
		// README not found
	}

	try {
		claudeMd = await github.getFileContent(repo.owner, repo.name, 'CLAUDE.md');
	} catch {
		// CLAUDE.md not found
	}

	// Find orchestrator session
	const orchestrator = sessionList.find((s) => s.role === 'orchestrator');

	return json({
		repo: {
			id: repo.id,
			owner: repo.owner,
			name: repo.name,
			fullName: `${repo.owner}/${repo.name}`,
			defaultBranch: repo.defaultBranch,
			createdAt: repo.createdAt.toISOString(),
			updatedAt: repo.updatedAt.toISOString(),
			lastActivityAt: repo.lastActivityAt?.toISOString() || null,
			urls
		},
		sessions: sessionList.map((s) => ({
			id: s.id,
			role: s.role,
			status: s.status,
			branchName: s.branchName,
			baseBranch: s.baseBranch,
			worktreePath: s.worktreePath,
			containerId: s.containerId,
			createdAt: s.createdAt.toISOString(),
			updatedAt: s.updatedAt.toISOString(),
			finishedAt: s.finishedAt?.toISOString() || null,
			needsInput: s.status === 'waiting',
			prUrl: s.lastKnownPrUrl,
			urls: github.getUrls(repo.owner, repo.name, {
				branch: s.branchName,
				baseBranch: s.baseBranch
			})
		})),
		orchestrator: orchestrator
			? {
					id: orchestrator.id,
					status: orchestrator.status,
					needsInput: orchestrator.status === 'waiting'
				}
			: null,
		docs: {
			readme,
			claudeMd
		}
	});
};

export const DELETE: RequestHandler = async ({ params }) => {
	const { id } = params;

	const repo = await db.query.repos.findFirst({
		where: eq(repos.id, id)
	});

	if (!repo) {
		throw error(404, 'Repo not found');
	}

	// Check for active sessions
	const activeSessions = await db.query.sessions.findMany({
		where: (sessions, { and, eq, or }) =>
			and(
				eq(sessions.repoId, id),
				or(
					eq(sessions.status, 'running'),
					eq(sessions.status, 'starting'),
					eq(sessions.status, 'waiting')
				)
			)
	});

	if (activeSessions.length > 0) {
		throw error(400, 'Cannot delete repo with active sessions. Stop all sessions first.');
	}

	// Delete repo (cascades to sessions and events)
	await db.delete(repos).where(eq(repos.id, id));

	return json({ deleted: true });
};
