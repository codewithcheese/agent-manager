<script lang="ts">
	import { onMount } from 'svelte';
	import TimeAgo from '$lib/components/TimeAgo.svelte';
	import { Plus, AlertCircle, RefreshCw, FolderGit2, GitBranch, Terminal, X, Search, Check } from 'lucide-svelte';

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

	function getStatusIndicator(stats: RepoWithStats['stats']) {
		if (stats.hasWaiting) return { class: 'status-dot-waiting', label: 'Needs input' };
		if (stats.hasRunning) return { class: 'status-dot-running', label: 'Running' };
		if (stats.hasError) return { class: 'status-dot-error', label: 'Error' };
		return null;
	}
</script>

<div class="animate-fade-in">
	<!-- Page Header -->
	<div class="mb-8">
		<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
			<div>
				<h1 class="text-2xl font-bold text-[var(--color-text)]">Repositories</h1>
				<p class="mt-1 text-[var(--color-text-secondary)]">
					Manage GitHub repositories and agent sessions
				</p>
			</div>
			<button onclick={() => openAddModal()} class="btn btn-primary">
				<Plus class="w-4 h-4" strokeWidth={2} />
				Add Repository
			</button>
		</div>
	</div>

	<!-- Content -->
	{#if loading}
		<div class="flex flex-col items-center justify-center py-16">
			<div class="spinner spinner-lg"></div>
			<p class="mt-4 text-sm text-[var(--color-text-secondary)]">Loading repositories...</p>
		</div>
	{:else if error}
		<div class="card border-[var(--color-error)]/30 bg-[var(--color-error-subtle)]">
			<div class="flex items-start gap-3">
				<AlertCircle class="w-5 h-5 text-[var(--color-error)] flex-shrink-0 mt-0.5" strokeWidth={2} />
				<div class="flex-1">
					<p class="font-medium text-[var(--color-error)]">Failed to load repositories</p>
					<p class="mt-1 text-sm text-[var(--color-error)]/80">{error}</p>
					<button onclick={() => fetchRepos()} class="btn btn-sm btn-secondary mt-3">
						<RefreshCw class="w-4 h-4" strokeWidth={2} />
						Retry
					</button>
				</div>
			</div>
		</div>
	{:else if repos.length === 0}
		<div class="card empty-state">
			<div class="w-16 h-16 rounded-2xl bg-[var(--color-bg-secondary)] flex items-center justify-center mb-4">
				<FolderGit2 class="w-8 h-8 text-[var(--color-text-tertiary)]" strokeWidth={1.5} />
			</div>
			<h3 class="empty-state-title">No repositories yet</h3>
			<p class="empty-state-description">
				Add a GitHub repository to start creating agent sessions. Each session runs in an isolated container.
			</p>
			<button onclick={() => openAddModal()} class="btn btn-primary mt-6">
				<Plus class="w-4 h-4" strokeWidth={2} />
				Add Repository
			</button>
		</div>
	{:else}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each repos as repo, i}
				{@const statusIndicator = getStatusIndicator(repo.stats)}
				<a
					href="/repos/{repo.id}"
					class="card card-hover no-underline block group"
					style="animation-delay: {i * 50}ms"
				>
					<!-- Card Header -->
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<FolderGit2 class="w-4 h-4 text-[var(--color-text-tertiary)] flex-shrink-0" strokeWidth={1.5} />
								<h3 class="font-semibold truncate text-[var(--color-text)] group-hover:text-[var(--color-accent)] transition-colors">
									{repo.fullName}
								</h3>
							</div>
							<p class="mt-1.5 text-xs text-[var(--color-text-tertiary)] flex items-center gap-1.5">
								<GitBranch class="w-3 h-3" strokeWidth={2} />
								{repo.defaultBranch}
							</p>
						</div>
						{#if statusIndicator}
							<span class="status-dot {statusIndicator.class}" title={statusIndicator.label}></span>
						{/if}
					</div>

					<!-- Card Footer -->
					<div class="mt-4 pt-4 border-t border-[var(--color-border)] flex items-center justify-between text-xs">
						<div class="flex items-center gap-3">
							<span class="flex items-center gap-1.5 text-[var(--color-text-secondary)]">
								<Terminal class="w-3.5 h-3.5" strokeWidth={1.5} />
								{#if repo.stats.activeSessions > 0}
									<span class="text-[var(--color-success)] font-medium">{repo.stats.activeSessions}</span>
									<span class="text-[var(--color-text-tertiary)]">/</span>
								{/if}
								<span>{repo.stats.totalSessions} sessions</span>
							</span>
						</div>
						<span class="text-[var(--color-text-tertiary)]">
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
			<!-- Modal Header -->
			<div class="flex items-center justify-between mb-6">
				<div>
					<h2 id="add-repo-title" class="text-lg font-semibold text-[var(--color-text)]">Add Repository</h2>
					<p class="mt-1 text-sm text-[var(--color-text-secondary)]">Select a repository from your GitHub account</p>
				</div>
				<button
					onclick={() => (showAddModal = false)}
					class="btn btn-ghost btn-icon btn-sm"
					aria-label="Close modal"
				>
					<X class="w-5 h-5" strokeWidth={2} />
				</button>
			</div>

			<!-- Search Input -->
			<div class="relative mb-4">
				<Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)]" strokeWidth={2} />
				<input
					type="text"
					class="input pl-10"
					placeholder="Search repositories..."
					bind:value={searchQuery}
					aria-label="Search repositories"
				/>
			</div>

			<!-- Repository List -->
			{#if loadingGithub}
				<div class="flex flex-col items-center justify-center py-12">
					<div class="spinner"></div>
					<p class="mt-3 text-sm text-[var(--color-text-secondary)]">Loading repositories...</p>
				</div>
			{:else if filteredGithubRepos.length === 0}
				<div class="text-center py-12">
					<p class="text-[var(--color-text-secondary)]">
						{searchQuery ? 'No repositories match your search' : 'No repositories found'}
					</p>
				</div>
			{:else}
				<div class="max-h-80 overflow-y-auto -mx-4 px-4">
					<div class="space-y-1">
						{#each filteredGithubRepos as ghRepo}
							{@const isAdded = repos.some(
								(r) => r.owner === ghRepo.owner && r.name === ghRepo.name
							)}
							<div
								class="flex items-center justify-between p-3 rounded-lg hover:bg-[var(--color-bg-secondary)] transition-colors"
							>
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-2">
										<FolderGit2 class="w-4 h-4 text-[var(--color-text-tertiary)] flex-shrink-0" strokeWidth={1.5} />
										<span class="font-medium truncate text-[var(--color-text)]">{ghRepo.fullName}</span>
										{#if ghRepo.isPrivate}
											<span class="badge badge-sm bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]">
												Private
											</span>
										{/if}
									</div>
									{#if ghRepo.description}
										<p class="mt-1 text-xs text-[var(--color-text-secondary)] truncate pl-6">
											{ghRepo.description}
										</p>
									{/if}
								</div>
								<div class="ml-3 flex-shrink-0">
									{#if isAdded}
										<span class="badge bg-[var(--color-success-subtle)] text-[var(--color-success)]">
											<Check class="w-3 h-3" strokeWidth={2} />
											Added
										</span>
									{:else}
										<button
											onclick={() => addRepo(ghRepo)}
											disabled={addingRepo}
											class="btn btn-sm btn-secondary"
										>
											{#if addingRepo && selectedRepo?.fullName === ghRepo.fullName}
												<span class="spinner spinner-sm"></span>
											{:else}
												Add
											{/if}
										</button>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}
