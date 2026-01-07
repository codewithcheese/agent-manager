<script lang="ts">
	import type { SessionRole } from '$lib/server/db/schema';
	import { Code2, Network } from 'lucide-svelte';

	interface Props {
		role: SessionRole;
	}

	let { role }: Props = $props();

	const roleConfig: Record<SessionRole, { label: string; bgClass: string; textClass: string }> = {
		implementer: {
			label: 'Implementer',
			bgClass: 'bg-[var(--color-implementer-subtle)]',
			textClass: 'text-[var(--color-implementer)]'
		},
		orchestrator: {
			label: 'Orchestrator',
			bgClass: 'bg-[var(--color-orchestrator-subtle)]',
			textClass: 'text-[var(--color-orchestrator)]'
		}
	};

	const config = $derived(roleConfig[role]);
</script>

<span class="badge {config.bgClass} {config.textClass} text-[0.6875rem] px-2 py-0.5">
	{#if role === 'implementer'}
		<Code2 class="w-3 h-3" strokeWidth={2} />
	{:else}
		<Network class="w-3 h-3" strokeWidth={2} />
	{/if}
	{config.label}
</span>
