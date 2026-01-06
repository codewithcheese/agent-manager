/**
 * API Routes for GitHub Repos
 *
 * GET /api/repos/github - List repos from GitHub (for selecting repos to add)
 * GET /api/repos/github/auth - Check GitHub auth status
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getGitHubModule } from '$lib/server/runner/github';

export const GET: RequestHandler = async ({ url }) => {
	const github = getGitHubModule();

	// Check for auth status request
	const checkAuth = url.searchParams.get('check_auth');
	if (checkAuth === 'true') {
		const authStatus = await github.checkAuth();
		return json(authStatus);
	}

	// List repos from GitHub
	const owner = url.searchParams.get('owner') || undefined;
	const limit = parseInt(url.searchParams.get('limit') || '100', 10);
	const visibility = (url.searchParams.get('visibility') || 'all') as 'public' | 'private' | 'all';

	try {
		const repos = await github.listRepos({ owner, limit, visibility });
		return json({ repos });
	} catch (err) {
		if (err instanceof Error && err.message.includes('gh')) {
			throw error(503, 'GitHub CLI not available or not authenticated. Run `gh auth login` first.');
		}
		throw error(500, err instanceof Error ? err.message : 'Failed to list GitHub repos');
	}
};
