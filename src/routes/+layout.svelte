<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Agent Manager</title>
</svelte:head>

<div class="min-h-screen bg-[var(--color-bg)]">
	<header class="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
		<div class="container flex items-center justify-between py-4">
			<a href="/" class="flex items-center gap-2 text-xl font-semibold no-underline">
				<svg
					class="h-6 w-6"
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
				Agent Manager
			</a>
			<nav class="flex items-center gap-4">
				<a href="/" class="text-sm hover:text-[var(--color-primary)]">Repos</a>
				<a
					href="https://github.com"
					target="_blank"
					rel="noopener noreferrer"
					class="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
				>
					GitHub
				</a>
			</nav>
		</div>
	</header>

	<main class="container py-6">
		{@render children()}
	</main>
</div>
