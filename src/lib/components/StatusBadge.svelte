<script lang="ts">
	import type { SessionStatus } from '$lib/server/db/schema';

	interface Props {
		status: SessionStatus;
		size?: 'sm' | 'md';
	}

	let { status, size = 'md' }: Props = $props();

	const statusConfig: Record<SessionStatus, { label: string; color: string; bgColor: string }> = {
		starting: { label: 'Starting', color: '#6b7280', bgColor: '#f3f4f6' },
		running: { label: 'Running', color: '#059669', bgColor: '#d1fae5' },
		waiting: { label: 'Needs Input', color: '#d97706', bgColor: '#fef3c7' },
		finished: { label: 'Finished', color: '#3b82f6', bgColor: '#dbeafe' },
		error: { label: 'Error', color: '#dc2626', bgColor: '#fee2e2' },
		stopped: { label: 'Stopped', color: '#6b7280', bgColor: '#f3f4f6' }
	};

	const config = $derived(statusConfig[status] || statusConfig.stopped);
	const sizeClass = $derived(size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-sm px-2 py-1');
</script>

<span
	class="inline-flex items-center rounded-full font-medium {sizeClass}"
	style="color: {config.color}; background-color: {config.bgColor}"
>
	{#if status === 'running'}
		<span class="mr-1 h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
	{:else if status === 'waiting'}
		<span class="mr-1 h-2 w-2 rounded-full bg-yellow-500"></span>
	{:else if status === 'error'}
		<span class="mr-1 h-2 w-2 rounded-full bg-red-500"></span>
	{/if}
	{config.label}
</span>
