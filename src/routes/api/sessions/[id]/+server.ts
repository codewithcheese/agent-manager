/**
 * API Routes for Session Detail
 *
 * GET /api/sessions/[id] - Get session details with recent events
 * DELETE /api/sessions/[id] - Stop and cleanup session
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { sessions, events, repos } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getGitHubModule } from '$lib/server/runner/github';
import { getDockerModule } from '$lib/server/runner/docker';
import { getGitModule } from '$lib/server/runner/git';

export const GET: RequestHandler = async ({ params, url }) => {
	const { id } = params;
	const includeEvents = url.searchParams.get('events') !== 'false';
	const eventLimit = parseInt(url.searchParams.get('event_limit') || '100', 10);

	const session = await db.query.sessions.findFirst({
		where: eq(sessions.id, id),
		with: { repo: true }
	});

	if (!session) {
		throw error(404, 'Session not found');
	}

	const github = getGitHubModule();

	// Get recent events if requested
	let eventList: typeof events.$inferSelect[] = [];
	if (includeEvents) {
		eventList = await db.query.events.findMany({
			where: eq(events.sessionId, id),
			orderBy: [desc(events.id)],
			limit: eventLimit
		});
		// Reverse to chronological order
		eventList.reverse();
	}

	// Check for PR
	let prInfo = null;
	if (session.branchName && session.repo) {
		const prs = await github.findPRsForBranch(session.repo.owner, session.repo.name, session.branchName);
		if (prs.length > 0) {
			prInfo = prs[0];
			// Update cached PR URL if found
			if (prs[0].url !== session.lastKnownPrUrl) {
				await db
					.update(sessions)
					.set({ lastKnownPrUrl: prs[0].url })
					.where(eq(sessions.id, id));
			}
		}
	}

	return json({
		session: {
			id: session.id,
			role: session.role,
			status: session.status,
			branchName: session.branchName,
			baseBranch: session.baseBranch,
			worktreePath: session.worktreePath,
			containerId: session.containerId,
			createdAt: session.createdAt.toISOString(),
			updatedAt: session.updatedAt.toISOString(),
			finishedAt: session.finishedAt?.toISOString() || null,
			needsInput: session.status === 'waiting',
			lastKnownHeadSha: session.lastKnownHeadSha,
			urls: session.repo
				? github.getUrls(session.repo.owner, session.repo.name, {
						branch: session.branchName,
						baseBranch: session.baseBranch
					})
				: null
		},
		repo: session.repo
			? {
					id: session.repo.id,
					owner: session.repo.owner,
					name: session.repo.name,
					fullName: `${session.repo.owner}/${session.repo.name}`
				}
			: null,
		pr: prInfo,
		events: eventList.map((e) => ({
			id: e.id.toString(),
			ts: e.ts.toISOString(),
			source: e.source,
			type: e.type,
			payload: e.payload
		}))
	});
};

export const DELETE: RequestHandler = async ({ params }) => {
	const { id } = params;

	const session = await db.query.sessions.findFirst({
		where: eq(sessions.id, id)
	});

	if (!session) {
		throw error(404, 'Session not found');
	}

	const docker = getDockerModule();
	const git = getGitModule();

	// Stop container if running
	if (session.containerId) {
		try {
			await docker.stopContainer(session.containerId);
			await docker.removeContainer(session.containerId, true);
		} catch (err) {
			console.error(`Failed to stop container ${session.containerId}:`, err);
		}
	}

	// Update session status
	await db
		.update(sessions)
		.set({
			status: 'stopped',
			finishedAt: new Date(),
			updatedAt: new Date()
		})
		.where(eq(sessions.id, id));

	// Insert manager event
	await db.insert(events).values({
		sessionId: id,
		source: 'manager',
		type: 'session.stopped',
		payload: { stoppedBy: 'user', method: 'api' }
	});

	// Optionally clean up worktree (keep for now for debugging)
	// await git.removeWorktree(id);

	return json({ stopped: true });
};
