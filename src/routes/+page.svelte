<script lang="ts">
	import { onMount } from 'svelte';
	import TimeAgo from '$lib/components/TimeAgo.svelte';

	interface RepoWithStats {
		id: string;
		owner: string;
		name: string;
		fullName: string;
		defaultBranch: string;
		lastActivityAt: string | null;
		stats: {
			totalSessions: number;
			activeSessions: number;
			hasRunning: boolean;
			hasWaiting: boolean;
			hasError: boolean;
		};
	}

	interface GitHubRepo {
		owner: string;
		name: string;
		fullName: string;
		description: string | null;
		isPrivate: boolean;
	}

	let repos: RepoWithStats[] = $state([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	// Add Repo Modal state
	let showAddModal = $state(false);
	let githubRepos: GitHubRepo[] = $state([]);
	let loadingGithub = $state(false);
	let selectedRepo = $state<GitHubRepo | null>(null);
	let addingRepo = $state(false);
	let searchQuery = $state('');

	const filteredGithubRepos = $derived(
		searchQuery
			? githubRepos.filter(
					(r) =>
						r.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
						r.description?.toLowerCase().includes(searchQuery.toLowerCase())
				)
			: githubRepos
	);

	onMount(() => {
		fetchRepos();
	});

	async function fetchRepos() {
		try {
			loading = true;
			const res = await fetch('/api/repos');
			if (!res.ok) throw new Error('Failed to fetch repos');
			const data = await res.json();
			repos = data.repos;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unknown error';
		} finally {
			loading = false;
		}
	}

	async function openAddModal() {
		showAddModal = true;
		if (githubRepos.length === 0) {
			await fetchGithubRepos();
		}
	}

	async function fetchGithubRepos() {
		try {
			loadingGithub = true;
			const res = await fetch('/api/repos/github');
			if (!res.ok) throw new Error('Failed to fetch GitHub repos');
			const data = await res.json();
			githubRepos = data.repos;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unknown error';
		} finally {
			loadingGithub = false;
		}
	}

	async function addRepo(ghRepo: GitHubRepo) {
		try {
			addingRepo = true;
			selectedRepo = ghRepo;
			const res = await fetch('/api/repos', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ owner: ghRepo.owner, name: ghRepo.name })
			});
			if (!res.ok) throw new Error('Failed to add repo');
			showAddModal = false;
			await fetchRepos();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unknown error';
		} finally {
			addingRepo = false;
			selectedRepo = null;
		}
	}
</script>

<div>
	<div class="mb-6 flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold">Repositories</h1>
			<p class="text-sm text-[var(--color-text-secondary)]">
				Manage GitHub repositories and agent sessions
			</p>
		</div>
		<button onclick={() => openAddModal()} class="btn btn-primary">
			<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 4v16m8-8H4"
				></path>
			</svg>
			Add Repository
		</button>
	</div>

	{#if loading}
		<div class="flex items-center justify-center py-12">
			<div class="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-primary)] border-t-transparent"></div>
		</div>
	{:else if error}
		<div class="card border-red-200 bg-red-50 text-red-700">
			<p>{error}</p>
			<button onclick={() => fetchRepos()} class="btn btn-secondary mt-2 btn-sm">Retry</button>
		</div>
	{:else if repos.length === 0}
		<div class="card text-center py-12">
			<svg
				class="mx-auto h-12 w-12 text-[var(--color-text-secondary)]"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
				></path>
			</svg>
			<h3 class="mt-4 text-lg font-medium">No repositories yet</h3>
			<p class="mt-1 text-sm text-[var(--color-text-secondary)]">
				Add a GitHub repository to start creating agent sessions.
			</p>
			<button onclick={() => openAddModal()} class="btn btn-primary mt-4">Add Repository</button>
		</div>
	{:else}
		<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
			{#each repos as repo}
				<a href="/repos/{repo.id}" class="card card-hover no-underline block">
					<div class="flex items-start justify-between">
						<div class="min-w-0 flex-1">
							<h3 class="font-medium truncate text-[var(--color-text)]">{repo.fullName}</h3>
							<p class="mt-1 text-xs text-[var(--color-text-secondary)]">
								{repo.defaultBranch}
							</p>
						</div>
						{#if repo.stats.hasWaiting}
							<span class="ml-2 flex h-2 w-2 rounded-full bg-yellow-500" title="Needs input"></span>
						{:else if repo.stats.hasRunning}
							<span class="ml-2 flex h-2 w-2 rounded-full bg-green-500 animate-pulse" title="Running"></span>
						{:else if repo.stats.hasError}
							<span class="ml-2 flex h-2 w-2 rounded-full bg-red-500" title="Error"></span>
						{/if}
					</div>

					<div class="mt-4 flex items-center justify-between text-sm">
						<span class="text-[var(--color-text-secondary)]">
							{repo.stats.activeSessions} active / {repo.stats.totalSessions} total
						</span>
						<span class="text-[var(--color-text-secondary)]">
							<TimeAgo date={repo.lastActivityAt} />
						</span>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>

<!-- Add Repo Modal -->
{#if showAddModal}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="modal-backdrop" onclick={() => (showAddModal = false)} role="presentation">
		<!-- svelte-ignore a11y_interactive_supports_focus -->
		<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="add-repo-title">
			<div class="flex items-center justify-between mb-4">
				<h2 id="add-repo-title" class="modal-header mb-0">Add Repository</h2>
				<button
					onclick={() => (showAddModal = false)}
					class="text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
					aria-label="Close modal"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						></path>
					</svg>
				</button>
			</div>

			<input
				type="text"
				class="input mb-4"
				placeholder="Search repositories..."
				bind:value={searchQuery}
				aria-label="Search repositories"
			/>

			{#if loadingGithub}
				<div class="flex items-center justify-center py-8">
					<div class="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent"></div>
				</div>
			{:else}
				<div class="max-h-96 overflow-y-auto">
					{#each filteredGithubRepos as ghRepo}
						{@const isAdded = repos.some(
							(r) => r.owner === ghRepo.owner && r.name === ghRepo.name
						)}
						<div
							class="flex items-center justify-between py-2 px-2 rounded hover:bg-[var(--color-bg-secondary)]"
						>
							<div class="min-w-0 flex-1">
								<div class="font-medium truncate">{ghRepo.fullName}</div>
								{#if ghRepo.description}
									<div class="text-xs text-[var(--color-text-secondary)] truncate">
										{ghRepo.description}
									</div>
								{/if}
							</div>
							{#if isAdded}
								<span class="text-xs text-[var(--color-text-secondary)] ml-2">Added</span>
							{:else}
								<button
									onclick={() => addRepo(ghRepo)}
									disabled={addingRepo}
									class="btn btn-sm btn-secondary ml-2"
								>
									{#if addingRepo && selectedRepo?.fullName === ghRepo.fullName}
										<span class="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
									{:else}
										Add
									{/if}
								</button>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/if}
