<script lang="ts">
	import type { SessionStatus } from '$lib/server/db/schema';

	interface Props {
		status: SessionStatus;
		size?: 'sm' | 'md';
	}

	let { status, size = 'md' }: Props = $props();

	const statusConfig: Record<SessionStatus, { label: string; dotClass: string; bgClass: string; textClass: string }> = {
		starting: {
			label: 'Starting',
			dotClass: 'bg-[var(--color-text-tertiary)]',
			bgClass: 'bg-[var(--color-bg-tertiary)]',
			textClass: 'text-[var(--color-text-secondary)]'
		},
		running: {
			label: 'Running',
			dotClass: 'bg-[var(--color-success)] animate-pulse',
			bgClass: 'bg-[var(--color-success-light)]',
			textClass: 'text-[var(--color-success)]'
		},
		waiting: {
			label: 'Needs Input',
			dotClass: 'bg-[var(--color-warning)] animate-pulse',
			bgClass: 'bg-[var(--color-warning-light)]',
			textClass: 'text-[var(--color-warning-dark)]'
		},
		finished: {
			label: 'Finished',
			dotClass: 'bg-[var(--color-primary)]',
			bgClass: 'bg-[var(--color-primary-light)]',
			textClass: 'text-[var(--color-primary)]'
		},
		error: {
			label: 'Error',
			dotClass: 'bg-[var(--color-error)]',
			bgClass: 'bg-[var(--color-error-light)]',
			textClass: 'text-[var(--color-error)]'
		},
		stopped: {
			label: 'Stopped',
			dotClass: 'bg-[var(--color-text-tertiary)]',
			bgClass: 'bg-[var(--color-bg-tertiary)]',
			textClass: 'text-[var(--color-text-secondary)]'
		}
	};

	const config = $derived(statusConfig[status] || statusConfig.stopped);
	const sizeClasses = $derived(size === 'sm' ? 'text-[0.6875rem] px-2 py-0.5' : 'text-xs px-2.5 py-1');
	const dotSize = $derived(size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2');
</script>

<span
	class="badge {config.bgClass} {config.textClass} {sizeClasses}"
>
	{#if status === 'running' || status === 'waiting' || status === 'error'}
		<span class="rounded-full {config.dotClass} {dotSize}"></span>
	{/if}
	{config.label}
</span>
