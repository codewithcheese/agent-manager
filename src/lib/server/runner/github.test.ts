/**
 * Unit tests for GitHub module
 *
 * Tests pure functions that don't require gh CLI.
 */

import { describe, it, expect } from 'vitest';
import { createGitHubModule, GitHubError } from './github';

describe('GitHub Module - Pure Functions', () => {
	describe('getUrls', () => {
		it('generates basic repo URL', () => {
			const gh = createGitHubModule();
			const urls = gh.getUrls('owner', 'repo');

			expect(urls.repo).toBe('https://github.com/owner/repo');
			expect(urls.branch).toBeUndefined();
			expect(urls.compare).toBeUndefined();
			expect(urls.newPr).toBeUndefined();
		});

		it('generates branch URL when branch provided', () => {
			const gh = createGitHubModule();
			const urls = gh.getUrls('owner', 'repo', { branch: 'feature/test' });

			expect(urls.repo).toBe('https://github.com/owner/repo');
			expect(urls.branch).toBe('https://github.com/owner/repo/tree/feature/test');
		});

		it('returns undefined branch URL when no branch', () => {
			const gh = createGitHubModule();
			const urls = gh.getUrls('owner', 'repo');

			expect(urls.branch).toBeUndefined();
		});

		it('generates compare URL when both branches provided', () => {
			const gh = createGitHubModule();
			const urls = gh.getUrls('owner', 'repo', {
				baseBranch: 'main',
				branch: 'feature'
			});

			expect(urls.compare).toBe('https://github.com/owner/repo/compare/main...feature');
		});

		it('generates new PR URL when both branches provided', () => {
			const gh = createGitHubModule();
			const urls = gh.getUrls('owner', 'repo', {
				baseBranch: 'main',
				branch: 'feature'
			});

			expect(urls.newPr).toBe('https://github.com/owner/repo/compare/main...feature?expand=1');
		});

		it('does not generate compare/newPr without baseBranch', () => {
			const gh = createGitHubModule();
			const urls = gh.getUrls('owner', 'repo', { branch: 'feature' });

			expect(urls.branch).toBe('https://github.com/owner/repo/tree/feature');
			expect(urls.compare).toBeUndefined();
			expect(urls.newPr).toBeUndefined();
		});

		it('handles special characters in branch names', () => {
			const gh = createGitHubModule();
			const urls = gh.getUrls('owner', 'repo', {
				branch: 'feature/add-tests',
				baseBranch: 'main'
			});

			expect(urls.branch).toBe('https://github.com/owner/repo/tree/feature/add-tests');
			expect(urls.compare).toBe('https://github.com/owner/repo/compare/main...feature/add-tests');
		});

		it('handles organization repos', () => {
			const gh = createGitHubModule();
			const urls = gh.getUrls('my-org', 'my-repo', { branch: 'develop' });

			expect(urls.repo).toBe('https://github.com/my-org/my-repo');
			expect(urls.branch).toBe('https://github.com/my-org/my-repo/tree/develop');
		});

		it('handles agent branch naming pattern', () => {
			const gh = createGitHubModule();
			const urls = gh.getUrls('acme', 'webapp', {
				baseBranch: 'main',
				branch: 'agent/webapp/abc12345'
			});

			expect(urls.compare).toBe(
				'https://github.com/acme/webapp/compare/main...agent/webapp/abc12345'
			);
		});

		it('handles empty strings', () => {
			const gh = createGitHubModule();
			const urls = gh.getUrls('owner', 'repo', { branch: '', baseBranch: '' });

			// Empty branch treated as falsy - no branch URL
			expect(urls.branch).toBeUndefined();
			expect(urls.compare).toBeUndefined();
		});
	});
});

describe('GitHubError', () => {
	it('creates error with message', () => {
		const error = new GitHubError('gh command failed');

		expect(error.message).toBe('gh command failed');
		expect(error.name).toBe('GitHubError');
		expect(error.exitCode).toBeUndefined();
	});

	it('creates error with exit code', () => {
		const error = new GitHubError('authentication required', 1);

		expect(error.message).toBe('authentication required');
		expect(error.exitCode).toBe(1);
	});

	it('is instanceof Error', () => {
		const error = new GitHubError('test');

		expect(error instanceof Error).toBe(true);
		expect(error instanceof GitHubError).toBe(true);
	});
});
