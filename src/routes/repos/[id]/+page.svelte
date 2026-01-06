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
			// Navigate to existing orchestrator
			window.location.href = `/sessions/${orchestrator.id}`;
		} else {
			// Create new orchestrator
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
	<div class="flex items-center justify-center py-12">
		<div class="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-primary)] border-t-transparent"></div>
	</div>
{:else if error}
	<div class="card border-red-200 bg-red-50 text-red-700">
		<p>{error}</p>
		<a href="/" class="btn btn-secondary mt-2 btn-sm">Back to Repos</a>
	</div>
{:else if repo}
	<div>
		<!-- Header -->
		<div class="mb-6 flex items-start justify-between">
			<div>
				<div class="flex items-center gap-2">
					<a href="/" class="text-[var(--color-text-secondary)] hover:text-[var(--color-text)]" aria-label="Back to repositories">
						<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
						</svg>
					</a>
					<h1 class="text-2xl font-bold">{repo.fullName}</h1>
				</div>
				<p class="mt-1 text-sm text-[var(--color-text-secondary)]">
					Default branch: {repo.defaultBranch}
				</p>
			</div>
			<div class="flex items-center gap-2">
				<a href={repo.urls.repo} target="_blank" rel="noopener" class="btn btn-secondary btn-sm">
					<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
						<path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"></path>
					</svg>
					GitHub
				</a>
				<button onclick={() => openOrchestrator()} class="btn btn-secondary btn-sm">
					{#if orchestrator}
						{#if orchestrator.needsInput}
							<span class="h-2 w-2 rounded-full bg-yellow-500"></span>
						{:else if orchestrator.status === 'running'}
							<span class="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
						{/if}
						Open Orchestrator
					{:else}
						Start Orchestrator
					{/if}
				</button>
				<button onclick={() => { sessionRole = 'implementer'; showStartModal = true; }} class="btn btn-primary">
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
					</svg>
					New Session
				</button>
			</div>
		</div>

		<div class="grid gap-6 lg:grid-cols-3">
			<!-- Sessions Panel -->
			<div class="lg:col-span-2 space-y-6">
				<!-- Active Sessions -->
				{#if activeSessions.length > 0}
					<div class="card">
						<h2 class="font-semibold mb-4">Active Sessions</h2>
						<div class="space-y-3">
							{#each activeSessions as session}
								<div
									class="block p-3 rounded border border-[var(--color-border)] hover:border-[var(--color-primary)] cursor-pointer"
									onclick={() => goto(`/sessions/${session.id}`)}
									onkeydown={(e) => e.key === 'Enter' && goto(`/sessions/${session.id}`)}
									role="link"
									tabindex="0"
								>
									<div class="flex items-center justify-between">
										<div class="flex items-center gap-2">
											<RoleBadge role={session.role} />
											<StatusBadge status={session.status} size="sm" />
										</div>
										<TimeAgo date={session.updatedAt} />
									</div>
									<div class="mt-2 text-sm">
										<span class="font-mono text-xs text-[var(--color-text-secondary)]">
											{session.branchName}
										</span>
									</div>
									{#if session.urls.compare}
										<div class="mt-2 flex items-center gap-2 text-xs">
											<a
												href={session.urls.compare}
												target="_blank"
												rel="noopener"
												onclick={(e) => e.stopPropagation()}
												class="text-[var(--color-primary)]"
											>
												Compare
											</a>
											{#if session.prUrl}
												<a
													href={session.prUrl}
													target="_blank"
													rel="noopener"
													onclick={(e) => e.stopPropagation()}
													class="text-[var(--color-primary)]"
												>
													PR
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
						<h2 class="font-semibold mb-4">Past Sessions</h2>
						<div class="space-y-2">
							{#each pastSessions.slice(0, 10) as session}
								<a
									href="/sessions/{session.id}"
									class="block p-2 rounded hover:bg-[var(--color-bg-secondary)] no-underline"
								>
									<div class="flex items-center justify-between">
										<div class="flex items-center gap-2">
											<RoleBadge role={session.role} />
											<StatusBadge status={session.status} size="sm" />
											<span class="font-mono text-xs text-[var(--color-text-secondary)]">
												{session.branchName}
											</span>
										</div>
										<TimeAgo date={session.finishedAt || session.updatedAt} />
									</div>
								</a>
							{/each}
						</div>
					</div>
				{/if}

				{#if sessions.length === 0}
					<div class="card text-center py-8">
						<p class="text-[var(--color-text-secondary)]">No sessions yet</p>
						<button onclick={() => { sessionRole = 'implementer'; showStartModal = true; }} class="btn btn-primary mt-4">
							Start First Session
						</button>
					</div>
				{/if}
			</div>

			<!-- Docs Panel -->
			<div class="space-y-4">
				<div class="card">
					<div class="flex border-b border-[var(--color-border)] -mx-4 -mt-4 px-4">
						<button
							onclick={() => (activeDocsTab = 'readme')}
							class="px-4 py-2 text-sm font-medium border-b-2 -mb-px {activeDocsTab === 'readme' ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-[var(--color-text-secondary)]'}"
						>
							README
						</button>
						<button
							onclick={() => (activeDocsTab = 'claude')}
							class="px-4 py-2 text-sm font-medium border-b-2 -mb-px {activeDocsTab === 'claude' ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-[var(--color-text-secondary)]'}"
						>
							CLAUDE.md
						</button>
					</div>
					<div class="mt-4 prose prose-sm max-h-96 overflow-y-auto">
						{#if activeDocsTab === 'readme'}
							{#if docs.readme}
								<pre class="whitespace-pre-wrap text-xs">{docs.readme}</pre>
							{:else}
								<p class="text-[var(--color-text-secondary)]">No README found</p>
							{/if}
						{:else}
							{#if docs.claudeMd}
								<pre class="whitespace-pre-wrap text-xs">{docs.claudeMd}</pre>
							{:else}
								<p class="text-[var(--color-text-secondary)]">No CLAUDE.md found</p>
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
			<h2 id="start-session-title" class="modal-header">Start New Session</h2>

			<div class="space-y-4">
				<div>
					<label for="session-role" class="label">Role</label>
					<select id="session-role" bind:value={sessionRole} class="input">
						<option value="implementer">Implementer</option>
						<option value="orchestrator">Orchestrator</option>
					</select>
				</div>

				<div>
					<label for="base-branch" class="label">Base Branch</label>
					<input id="base-branch" type="text" bind:value={baseBranch} class="input" placeholder="main" />
				</div>

				<div>
					<label for="goal-prompt" class="label">Goal / Initial Prompt (optional)</label>
					<textarea
						id="goal-prompt"
						bind:value={goalPrompt}
						class="input min-h-24"
						placeholder="Describe what this session should accomplish..."
					></textarea>
				</div>
			</div>

			<div class="mt-6 flex justify-end gap-2">
				<button onclick={() => (showStartModal = false)} class="btn btn-secondary">
					Cancel
				</button>
				<button onclick={() => startSession()} disabled={startingSession} class="btn btn-primary">
					{#if startingSession}
						<span class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
						Starting...
					{:else}
						Start Session
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}
