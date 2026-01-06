<script lang="ts">
	import type { SessionRole } from '$lib/server/db/schema';

	interface Props {
		role: SessionRole;
	}

	let { role }: Props = $props();

	const roleConfig: Record<SessionRole, { label: string; icon: string; bgClass: string; textClass: string }> = {
		implementer: {
			label: 'Implementer',
			icon: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4',
			bgClass: 'bg-[var(--color-implementer-light)]',
			textClass: 'text-[var(--color-implementer)]'
		},
		orchestrator: {
			label: 'Orchestrator',
			icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
			bgClass: 'bg-[var(--color-orchestrator-light)]',
			textClass: 'text-[var(--color-orchestrator)]'
		}
	};

	const config = $derived(roleConfig[role]);
</script>

<span class="badge {config.bgClass} {config.textClass} text-[0.6875rem] px-2 py-0.5">
	<svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
		<path stroke-linecap="round" stroke-linejoin="round" d={config.icon}></path>
	</svg>
	{config.label}
</span>
