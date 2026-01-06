<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import RoleBadge from '$lib/components/RoleBadge.svelte';
	import TimeAgo from '$lib/components/TimeAgo.svelte';
	import type { SessionStatus, SessionRole } from '$lib/server/db/schema';

	interface Session {
		id: string;
		role: SessionRole;
		status: SessionStatus;
		branchName: string;
		baseBranch: string;
		createdAt: string;
		updatedAt: string;
		finishedAt: string | null;
		needsInput: boolean;
		prUrl: string | null;
		urls: {
			branch?: string;
			compare?: string;
			newPr?: string;
		};
	}

	interface Repo {
		id: string;
		owner: string;
		name: string;
		fullName: string;
		defaultBranch: string;
		urls: {
			repo: string;
		};
	}

	interface Orchestrator {
		id: string;
		status: SessionStatus;
		needsInput: boolean;
	}

	let repo: Repo | null = $state(null);
	let sessions: Session[] = $state([]);
	let orchestrator: Orchestrator | null = $state(null);
	let docs: { readme: string | null; claudeMd: string | null } = $state({ readme: null, claudeMd: null });
	let loading = $state(true);
	let error = $state<string | null>(null);

	// Start Session Modal state
	let showStartModal = $state(false);
	let startingSession = $state(false);
	let sessionRole = $state<SessionRole>('implementer');
	let baseBranch = $state('');
	let goalPrompt = $state('');

	// Docs tab state
	let activeDocsTab = $state<'readme' | 'claude'>('readme');

	$effect(() => {
		const id = $page.params.id;
		if (id) {
			fetchRepoDetail(id);
		}
	});

	async function fetchRepoDetail(id: string) {
		try {
			loading = true;
			error = null;
			const res = await fetch(`/api/repos/${id}`);
			if (!res.ok) {
				if (res.status === 404) throw new Error('Repository not found');
				throw new Error('Failed to fetch repository');
			}
			const data = await res.json();
			repo = data.repo;
			sessions = data.sessions;
			orchestrator = data.orchestrator;
			docs = data.docs;
			baseBranch = repo?.defaultBranch || 'main';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unknown error';
		} finally {
			loading = false;
		}
	}

	async function startSession() {
		if (!repo) return;
		try {
			startingSession = true;
			const res = await fetch(`/api/repos/${repo.id}/sessions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					role: sessionRole,
					baseBranch,
					goalPrompt: goalPrompt || undefined
				})
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.message || 'Failed to start session');
			}
			showStartModal = false;
			sessionRole = 'implementer';
			goalPrompt = '';
			await fetchRepoDetail(repo.id);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unknown error';
		} finally {
			startingSession = false;
		}
	}

	async function openOrchestrator() {
		if (orchestrator) {
			window.location.href = `/sessions/${orchestrator.id}`;
		} else {
			sessionRole = 'orchestrator';
			showStartModal = true;
		}
	}

	const activeSessions = $derived(
		sessions.filter((s) => s.status === 'running' || s.status === 'waiting' || s.status === 'starting')
	);
	const pastSessions = $derived(
		sessions.filter((s) => s.status === 'finished' || s.status === 'stopped' || s.status === 'error')
	);
</script>

<svelte:head>
	{#if repo}
		<title>{repo.fullName} - Agent Manager</title>
	{/if}
</svelte:head>

{#if loading}
	<div class="flex flex-col items-center justify-center py-16">
		<div class="spinner spinner-lg"></div>
		<p class="mt-4 text-sm text-[var(--color-text-secondary)]">Loading repository...</p>
	</div>
{:else if error}
	<div class="card border-[var(--color-error)]/30 bg-[var(--color-error-light)]">
		<div class="flex items-start gap-3">
			<svg class="w-5 h-5 text-[var(--color-error)] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
			</svg>
			<div class="flex-1">
				<p class="font-medium text-[var(--color-error)]">{error}</p>
				<a href="/" class="btn btn-sm btn-secondary mt-3">
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
					</svg>
					Back to Repositories
				</a>
			</div>
		</div>
	</div>
{:else if repo}
	<div class="animate-fade-in">
		<!-- Page Header -->
		<div class="mb-8">
			<div class="flex items-center gap-3 mb-4">
				<a
					href="/"
					class="flex items-center justify-center w-8 h-8 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-secondary)] transition-all"
					aria-label="Back to repositories"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
					</svg>
				</a>
				<div class="flex-1 min-w-0">
					<h1 class="text-2xl font-bold text-[var(--color-text)] truncate">{repo.fullName}</h1>
					<p class="mt-1 text-sm text-[var(--color-text-secondary)] flex items-center gap-2">
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
						</svg>
						{repo.defaultBranch}
					</p>
				</div>
			</div>

			<!-- Action Buttons -->
			<div class="flex flex-wrap items-center gap-3">
				<a href={repo.urls.repo} target="_blank" rel="noopener" class="btn btn-secondary btn-sm">
					<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
						<path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"></path>
					</svg>
					View on GitHub
					<svg class="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
					</svg>
				</a>
				<button onclick={() => openOrchestrator()} class="btn btn-secondary btn-sm">
					{#if orchestrator}
						{#if orchestrator.needsInput}
							<span class="status-dot status-dot-waiting"></span>
						{:else if orchestrator.status === 'running'}
							<span class="status-dot status-dot-running"></span>
						{/if}
						Open Orchestrator
					{:else}
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
						</svg>
						Start Orchestrator
					{/if}
				</button>
				<button onclick={() => { sessionRole = 'implementer'; showStartModal = true; }} class="btn btn-primary">
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
					</svg>
					New Session
				</button>
			</div>
		</div>

		<!-- Main Content -->
		<div class="grid gap-6 lg:grid-cols-3">
			<!-- Sessions Panel -->
			<div class="lg:col-span-2 space-y-6">
				<!-- Active Sessions -->
				{#if activeSessions.length > 0}
					<div class="card">
						<div class="flex items-center gap-2 mb-4">
							<div class="w-2 h-2 rounded-full bg-[var(--color-success)] animate-pulse"></div>
							<h2 class="font-semibold text-[var(--color-text)]">Active Sessions</h2>
							<span class="badge badge-sm bg-[var(--color-success-light)] text-[var(--color-success)]">
								{activeSessions.length}
							</span>
						</div>
						<div class="space-y-3">
							{#each activeSessions as session}
								<div
									class="p-4 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)] bg-[var(--color-bg)] cursor-pointer transition-all group"
									onclick={() => goto(`/sessions/${session.id}`)}
									onkeydown={(e) => e.key === 'Enter' && goto(`/sessions/${session.id}`)}
									role="link"
									tabindex="0"
								>
									<div class="flex items-center justify-between gap-3">
										<div class="flex items-center gap-2 flex-wrap">
											<RoleBadge role={session.role} />
											<StatusBadge status={session.status} size="sm" />
										</div>
										<span class="text-xs text-[var(--color-text-tertiary)]">
											<TimeAgo date={session.updatedAt} />
										</span>
									</div>
									<div class="mt-3 flex items-center gap-2">
										<svg class="w-3.5 h-3.5 text-[var(--color-text-tertiary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
										</svg>
										<code class="text-xs text-[var(--color-text-secondary)] font-mono truncate">
											{session.branchName}
										</code>
									</div>
									{#if session.urls.compare}
										<div class="mt-3 pt-3 border-t border-[var(--color-border)] flex items-center gap-3">
											<a
												href={session.urls.compare}
												target="_blank"
												rel="noopener"
												onclick={(e) => e.stopPropagation()}
												class="text-xs text-[var(--color-primary)] hover:underline flex items-center gap-1"
											>
												<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
												</svg>
												Compare
											</a>
											{#if session.prUrl}
												<a
													href={session.prUrl}
													target="_blank"
													rel="noopener"
													onclick={(e) => e.stopPropagation()}
													class="text-xs text-[var(--color-primary)] hover:underline flex items-center gap-1"
												>
													<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"></path>
													</svg>
													View PR
												</a>
											{/if}
										</div>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Past Sessions -->
				{#if pastSessions.length > 0}
					<div class="card">
						<h2 class="font-semibold text-[var(--color-text)] mb-4">Past Sessions</h2>
						<div class="space-y-1">
							{#each pastSessions.slice(0, 10) as session}
								<a
									href="/sessions/{session.id}"
									class="flex items-center justify-between p-3 rounded-lg hover:bg-[var(--color-bg-secondary)] no-underline transition-colors"
								>
									<div class="flex items-center gap-3 min-w-0">
										<RoleBadge role={session.role} />
										<StatusBadge status={session.status} size="sm" />
										<code class="text-xs text-[var(--color-text-tertiary)] font-mono truncate hidden sm:block">
											{session.branchName}
										</code>
									</div>
									<span class="text-xs text-[var(--color-text-tertiary)] flex-shrink-0 ml-3">
										<TimeAgo date={session.finishedAt || session.updatedAt} />
									</span>
								</a>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Empty State -->
				{#if sessions.length === 0}
					<div class="card empty-state">
						<div class="w-14 h-14 rounded-2xl bg-[var(--color-bg-secondary)] flex items-center justify-center mb-4">
							<svg class="w-7 h-7 text-[var(--color-text-tertiary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
							</svg>
						</div>
						<h3 class="empty-state-title">No sessions yet</h3>
						<p class="empty-state-description">
							Start a new session to begin working with an AI agent on this repository.
						</p>
						<button onclick={() => { sessionRole = 'implementer'; showStartModal = true; }} class="btn btn-primary mt-5">
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
							</svg>
							Start First Session
						</button>
					</div>
				{/if}
			</div>

			<!-- Documentation Panel -->
			<div class="space-y-4">
				<div class="card">
					<!-- Tab Navigation -->
					<div class="flex border-b border-[var(--color-border)] -mx-5 -mt-5 px-2">
						<button
							onclick={() => (activeDocsTab = 'readme')}
							class="px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors {activeDocsTab === 'readme'
								? 'border-[var(--color-primary)] text-[var(--color-primary)]'
								: 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'}"
						>
							README
						</button>
						<button
							onclick={() => (activeDocsTab = 'claude')}
							class="px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors {activeDocsTab === 'claude'
								? 'border-[var(--color-primary)] text-[var(--color-primary)]'
								: 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'}"
						>
							CLAUDE.md
						</button>
					</div>

					<!-- Tab Content -->
					<div class="mt-4 max-h-96 overflow-y-auto">
						{#if activeDocsTab === 'readme'}
							{#if docs.readme}
								<pre class="whitespace-pre-wrap text-xs text-[var(--color-text-secondary)] font-mono leading-relaxed">{docs.readme}</pre>
							{:else}
								<div class="text-center py-8">
									<svg class="w-8 h-8 mx-auto text-[var(--color-text-tertiary)] mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
									</svg>
									<p class="text-sm text-[var(--color-text-tertiary)]">No README found</p>
								</div>
							{/if}
						{:else}
							{#if docs.claudeMd}
								<pre class="whitespace-pre-wrap text-xs text-[var(--color-text-secondary)] font-mono leading-relaxed">{docs.claudeMd}</pre>
							{:else}
								<div class="text-center py-8">
									<svg class="w-8 h-8 mx-auto text-[var(--color-text-tertiary)] mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
									</svg>
									<p class="text-sm text-[var(--color-text-tertiary)]">No CLAUDE.md found</p>
								</div>
							{/if}
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Start Session Modal -->
{#if showStartModal}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="modal-backdrop" onclick={() => (showStartModal = false)} role="presentation">
		<!-- svelte-ignore a11y_interactive_supports_focus -->
		<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="start-session-title">
			<div class="flex items-center justify-between mb-6">
				<div>
					<h2 id="start-session-title" class="text-lg font-semibold text-[var(--color-text)]">Start New Session</h2>
					<p class="mt-1 text-sm text-[var(--color-text-secondary)]">Configure and launch an agent session</p>
				</div>
				<button
					onclick={() => (showStartModal = false)}
					class="btn btn-ghost btn-icon btn-sm"
					aria-label="Close modal"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
					</svg>
				</button>
			</div>

			<div class="space-y-5">
				<!-- Role Selection -->
				<div>
					<label for="session-role" class="label">Role</label>
					<select id="session-role" bind:value={sessionRole} class="input">
						<option value="implementer">Implementer</option>
						<option value="orchestrator">Orchestrator</option>
					</select>
					<p class="mt-1.5 text-xs text-[var(--color-text-tertiary)]">
						{sessionRole === 'implementer'
							? 'Implements features and fixes bugs in the codebase'
							: 'Coordinates work across multiple implementer sessions'}
					</p>
				</div>

				<!-- Base Branch -->
				<div>
					<label for="base-branch" class="label">Base Branch</label>
					<input id="base-branch" type="text" bind:value={baseBranch} class="input" placeholder="main" />
				</div>

				<!-- Goal Prompt -->
				<div>
					<label for="goal-prompt" class="label">
						Initial Prompt
						<span class="label-hint">(optional)</span>
					</label>
					<textarea
						id="goal-prompt"
						bind:value={goalPrompt}
						class="input"
						rows="4"
						placeholder="Describe what this session should accomplish..."
					></textarea>
				</div>
			</div>

			<!-- Modal Actions -->
			<div class="modal-footer">
				<button onclick={() => (showStartModal = false)} class="btn btn-secondary">
					Cancel
				</button>
				<button onclick={() => startSession()} disabled={startingSession} class="btn btn-primary">
					{#if startingSession}
						<span class="spinner spinner-sm"></span>
						Starting...
					{:else}
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path>
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
						</svg>
						Start Session
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}
