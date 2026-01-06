<script lang="ts">
	interface Props {
		date: string | Date | null;
	}

	let { date }: Props = $props();

	function formatTimeAgo(dateInput: string | Date | null): string {
		if (!dateInput) return 'Never';

		const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
		const now = new Date();
		const diffMs = now.getTime() - d.getTime();
		const diffSec = Math.floor(diffMs / 1000);
		const diffMin = Math.floor(diffSec / 60);
		const diffHour = Math.floor(diffMin / 60);
		const diffDay = Math.floor(diffHour / 24);

		if (diffSec < 60) return 'Just now';
		if (diffMin < 60) return `${diffMin}m ago`;
		if (diffHour < 24) return `${diffHour}h ago`;
		if (diffDay < 7) return `${diffDay}d ago`;

		return d.toLocaleDateString();
	}

	const formatted = $derived(formatTimeAgo(date));
</script>

<time datetime={date?.toString()} title={date?.toString()}>{formatted}</time>
