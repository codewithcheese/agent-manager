<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import '../app.css';
	import { Monitor, FolderGit2, Github, ExternalLink, Cpu } from 'lucide-svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
		rel="stylesheet"
	/>
	<title>Agent Manager</title>
</svelte:head>

<div class="min-h-screen bg-[var(--color-bg)]">
	<!-- Header -->
	<header class="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-bg)]/80 backdrop-blur-lg">
		<div class="container flex items-center justify-between h-16">
			<!-- Logo -->
			<a href="/" class="flex items-center gap-3 text-lg font-semibold no-underline group">
				<div class="logo-icon flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-muted)] shadow-md group-hover:shadow-glow-accent transition-all">
					<Cpu class="w-5 h-5 text-[var(--color-void)]" strokeWidth={2} />
				</div>
				<span class="text-[var(--color-text)] group-hover:text-[var(--color-accent)] transition-colors">
					Agent Manager
				</span>
			</a>

			<!-- Navigation -->
			<nav class="flex items-center gap-1">
				<a
					href="/"
					class="px-4 py-2 text-sm font-medium rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-secondary)] transition-all no-underline"
				>
					<span class="flex items-center gap-2">
						<FolderGit2 class="w-4 h-4" strokeWidth={1.5} />
						Repositories
					</span>
				</a>
				<div class="w-px h-6 bg-[var(--color-border)] mx-2"></div>
				<a
					href="https://github.com"
					target="_blank"
					rel="noopener noreferrer"
					class="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-secondary)] transition-all no-underline"
				>
					<Github class="w-4 h-4" strokeWidth={1.5} />
					<span class="hidden sm:inline">GitHub</span>
					<ExternalLink class="w-3 h-3 opacity-50" strokeWidth={1.5} />
				</a>
			</nav>
		</div>
	</header>

	<!-- Main Content -->
	<main class="container py-8">
		{@render children()}
	</main>

	<!-- Footer -->
	<footer class="border-t border-[var(--color-border)] mt-auto">
		<div class="container py-6">
			<p class="text-center text-sm text-[var(--color-text-tertiary)]">
				Agent Manager &mdash; Manage agentic coding sessions
			</p>
		</div>
	</footer>
</div>
