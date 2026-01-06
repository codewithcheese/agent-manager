<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import '../app.css';

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
				<div class="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-dark)] shadow-md group-hover:shadow-lg transition-shadow">
					<svg
						class="w-5 h-5 text-white"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
						></path>
					</svg>
				</div>
				<span class="text-[var(--color-text)] group-hover:text-[var(--color-primary)] transition-colors">
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
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
						</svg>
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
					<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
						<path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"></path>
					</svg>
					<span class="hidden sm:inline">GitHub</span>
					<svg class="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
					</svg>
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
