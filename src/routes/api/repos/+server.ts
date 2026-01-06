/**
 * API Routes for Repos
 *
 * GET /api/repos - List all registered repos
 * POST /api/repos - Register a new repo (from GitHub)
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { repos, sessions } from '$lib/server/db/schema';
import { desc, eq } from 'drizzle-orm';
import { getGitHubModule } from '$lib/server/runner/github';

export const GET: RequestHandler = async () => {
	const repoList = await db.query.repos.findMany({
		orderBy: [desc(repos.lastActivityAt), desc(repos.updatedAt)]
	});

	// Get session counts for each repo
	const reposWithStats = await Promise.all(
		repoList.map(async (repo) => {
			const sessionList = await db.query.sessions.findMany({
				where: eq(sessions.repoId, repo.id)
			});

			const activeSessions = sessionList.filter(
				(s) => s.status === 'running' || s.status === 'waiting' || s.status === 'starting'
			);

			return {
				id: repo.id,
				owner: repo.owner,
				name: repo.name,
				fullName: `${repo.owner}/${repo.name}`,
				defaultBranch: repo.defaultBranch,
				createdAt: repo.createdAt.toISOString(),
				updatedAt: repo.updatedAt.toISOString(),
				lastActivityAt: repo.lastActivityAt?.toISOString() || null,
				stats: {
					totalSessions: sessionList.length,
					activeSessions: activeSessions.length,
					hasRunning: sessionList.some((s) => s.status === 'running'),
					hasWaiting: sessionList.some((s) => s.status === 'waiting'),
					hasError: sessionList.some((s) => s.status === 'error')
				}
			};
		})
	);

	return json({ repos: reposWithStats });
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { owner, name } = body;

	if (!owner || !name) {
		throw error(400, 'owner and name are required');
	}

	// Check if repo already exists
	const existing = await db.query.repos.findFirst({
		where: (repos, { and, eq }) => and(eq(repos.owner, owner), eq(repos.name, name))
	});

	if (existing) {
		return json({ repo: existing, created: false });
	}

	// Verify repo exists on GitHub and get details
	const github = getGitHubModule();
	const ghRepo = await github.getRepo(owner, name);

	if (!ghRepo) {
		throw error(404, `Repository ${owner}/${name} not found on GitHub`);
	}

	// Create repo record
	const [newRepo] = await db
		.insert(repos)
		.values({
			owner: ghRepo.owner,
			name: ghRepo.name,
			defaultBranch: ghRepo.defaultBranch
		})
		.returning();

	return json({ repo: newRepo, created: true }, { status: 201 });
};
