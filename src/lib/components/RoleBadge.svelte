<script lang="ts">
	import type { SessionRole } from '$lib/server/db/schema';

	interface Props {
		role: SessionRole;
	}

	let { role }: Props = $props();

	const roleConfig: Record<SessionRole, { label: string; color: string; bgColor: string }> = {
		implementer: { label: 'Implementer', color: '#7c3aed', bgColor: '#ede9fe' },
		orchestrator: { label: 'Orchestrator', color: '#0891b2', bgColor: '#cffafe' }
	};

	const config = $derived(roleConfig[role]);
</script>

<span
	class="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
	style="color: {config.color}; background-color: {config.bgColor}"
>
	{config.label}
</span>
