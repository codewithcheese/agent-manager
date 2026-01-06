<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import RoleBadge from '$lib/components/RoleBadge.svelte';
	import TimeAgo from '$lib/components/TimeAgo.svelte';
	import type { SessionStatus, SessionRole, EventSource } from '$lib/server/db/schema';

	interface StoredEvent {
		id: string;
		ts: string;
		source: EventSource;
		type: string;
		payload: Record<string, unknown>;
	}

	interface Session {
		id: string;
		role: SessionRole;
		status: SessionStatus;
		branchName: string;
		baseBranch: string;
		worktreePath: string | null;
		containerId: string | null;
		createdAt: string;
		updatedAt: string;
		finishedAt: string | null;
		needsInput: boolean;
		lastKnownHeadSha: string | null;
		urls: {
			branch?: string;
			compare?: string;
			newPr?: string;
		} | null;
	}

	interface Repo {
		id: string;
		owner: string;
		name: string;
		fullName: string;
	}

	interface PR {
		number: number;
		title: string;
		state: string;
		url: string;
	}

	let session: Session | null = $state(null);
	let repo: Repo | null = $state(null);
	let pr: PR | null = $state(null);
	let events: StoredEvent[] = $state([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let messageInput = $state('');
	let sendingMessage = $state(false);
	let stopping = $state(false);

	// Auto-scroll
	let eventsContainer: HTMLDivElement | null = $state(null);
	let autoScroll = $state(true);

	// WebSocket for live updates
	let ws: WebSocket | null = $state(null);

	$effect(() => {
		const id = $page.params.id;
		if (id) {
			fetchSessionDetail(id);
		}
	});

	onMount(() => {
		// Connect WebSocket for live updates
		connectWebSocket();
	});

	onDestroy(() => {
		if (ws) {
			ws.close();
		}
	});

	function connectWebSocket() {
		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

		ws.onopen = () => {
			// Subscribe to session events
			if (session) {
				ws?.send(
					JSON.stringify({
						v: 1,
						kind: 'command',
						sessionId: session.id,
						ts: new Date().toISOString(),
						seq: Date.now(),
						payload: {
							type: 'subscribe.session',
							sessionId: session.id
						}
					})
				);
			}
		};

		ws.onmessage = (event) => {
			try {
				const msg = JSON.parse(event.data);
				if (msg.kind === 'event' && msg.sessionId === session?.id) {
					// Add new event
					if (msg.payload.event) {
						events = [...events, msg.payload.event];
						scrollToBottom();
					}
					// Update session status if changed
					if (msg.payload.session) {
						session = { ...session!, ...msg.payload.session };
					}
				}
			} catch (e) {
				console.error('WebSocket message error:', e);
			}
		};

		ws.onclose = () => {
			// Reconnect after a delay
			setTimeout(() => {
				if (session) {
					connectWebSocket();
				}
			}, 3000);
		};
	}

	async function fetchSessionDetail(id: string) {
		try {
			loading = true;
			error = null;
			const res = await fetch(`/api/sessions/${id}`);
			if (!res.ok) {
				if (res.status === 404) throw new Error('Session not found');
				throw new Error('Failed to fetch session');
			}
			const data = await res.json();
			session = data.session;
			repo = data.repo;
			pr = data.pr;
			events = data.events;

			// Subscribe via WebSocket
			if (ws?.readyState === WebSocket.OPEN) {
				ws.send(
					JSON.stringify({
						v: 1,
						kind: 'command',
						sessionId: session?.id,
						ts: new Date().toISOString(),
						seq: Date.now(),
						payload: {
							type: 'subscribe.session',
							sessionId: session?.id
						}
					})
				);
			}

			scrollToBottom();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unknown error';
		} finally {
			loading = false;
		}
	}

	async function sendMessage() {
		if (!session || !messageInput.trim()) return;

		try {
			sendingMessage = true;
			const res = await fetch(`/api/sessions/${session.id}/messages`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: messageInput })
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.message || 'Failed to send message');
			}
			messageInput = '';
			// Refetch to get updated status
			await fetchSessionDetail(session.id);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unknown error';
		} finally {
			sendingMessage = false;
		}
	}

	async function stopSession() {
		if (!session) return;

		try {
			stopping = true;
			const res = await fetch(`/api/sessions/${session.id}`, {
				method: 'DELETE'
			});
			if (!res.ok) throw new Error('Failed to stop session');
			await fetchSessionDetail(session.id);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unknown error';
		} finally {
			stopping = false;
		}
	}

	function scrollToBottom() {
		if (autoScroll && eventsContainer) {
			setTimeout(() => {
				eventsContainer?.scrollTo({ top: eventsContainer.scrollHeight, behavior: 'smooth' });
			}, 100);
		}
	}

	function formatEventPayload(event: StoredEvent): string {
		const { payload, type } = event;

		// Handle Claude messages
		if (event.source === 'claude') {
			if ('claudeMessage' in payload) {
				const msg = payload.claudeMessage as Record<string, unknown>;
				if (msg.type === 'text' && msg.text) {
					return String(msg.text);
				}
				if (msg.type === 'tool_use') {
					return `Tool: ${msg.name}\nInput: ${JSON.stringify(msg.input, null, 2)}`;
				}
				if (msg.type === 'tool_result') {
					const content = msg.content;
					if (Array.isArray(content) && content.length > 0) {
						return content.map((c: { text?: string }) => c.text || '').join('\n');
					}
					return String(content);
				}
			}
		}

		// Handle runner events
		if (event.source === 'runner') {
			if ('runnerEvent' in payload) {
				const re = payload.runnerEvent as Record<string, unknown>;
				if (re.data) return String(re.data);
			}
		}

		// Handle user messages
		if (type === 'user.message' && payload.message) {
			return String(payload.message);
		}

		// Default: show JSON
		return JSON.stringify(payload, null, 2);
	}

	function getEventClass(event: StoredEvent): string {
		if (event.type === 'user.message') return 'user';
		return event.source;
	}

	function getEventIcon(event: StoredEvent): string {
		switch (event.source) {
			case 'claude':
				return '🤖';
			case 'runner':
				return '⚙️';
			case 'manager':
				return '📋';
			default:
				return '📄';
		}
	}

	function getCanSendMessage(): boolean {
		if (!session) return false;
		return session.status === 'waiting' || session.status === 'running';
	}

	function getIsActive(): boolean {
		if (!session) return false;
		return session.status === 'running' || session.status === 'waiting' || session.status === 'starting';
	}
</script>

<svelte:head>
	{#if session && repo}
		<title>Session - {repo.fullName} - Agent Manager</title>
	{/if}
</svelte:head>

{#if loading}
	<div class="flex items-center justify-center py-12">
		<div class="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-primary)] border-t-transparent"></div>
	</div>
{:else if error}
	<div class="card border-red-200 bg-red-50 text-red-700">
		<p>{error}</p>
		<a href="/" class="btn btn-secondary mt-2 btn-sm">Back to Repos</a>
	</div>
{:else if session && repo}
	<div class="flex flex-col h-[calc(100vh-120px)]">
		<!-- Header -->
		<div class="mb-4 flex items-start justify-between flex-shrink-0">
			<div>
				<div class="flex items-center gap-2">
					<a href="/repos/{repo.id}" class="text-[var(--color-text-secondary)] hover:text-[var(--color-text)]" aria-label="Back to repository">
						<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
						</svg>
					</a>
					<h1 class="text-xl font-bold">{repo.fullName}</h1>
					<RoleBadge role={session.role} />
					<StatusBadge status={session.status} />
				</div>
				<div class="mt-1 flex items-center gap-4 text-sm text-[var(--color-text-secondary)]">
					<span class="font-mono text-xs">{session.branchName}</span>
					<span>Started <TimeAgo date={session.createdAt} /></span>
				</div>
			</div>
			<div class="flex items-center gap-2">
				{#if session.urls?.compare}
					<a href={session.urls.compare} target="_blank" rel="noopener" class="btn btn-secondary btn-sm">
						Compare
					</a>
				{/if}
				{#if pr}
					<a href={pr.url} target="_blank" rel="noopener" class="btn btn-secondary btn-sm">
						PR #{pr.number}
					</a>
				{:else if session.urls?.newPr}
					<a href={session.urls.newPr} target="_blank" rel="noopener" class="btn btn-secondary btn-sm">
						Create PR
					</a>
				{/if}
				{#if getIsActive()}
					<button onclick={() => stopSession()} disabled={stopping} class="btn btn-danger btn-sm">
						{#if stopping}
							<span class="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
						{:else}
							Stop
						{/if}
					</button>
				{/if}
			</div>
		</div>

		<!-- Timeline -->
		<div
			bind:this={eventsContainer}
			class="flex-1 overflow-y-auto card mb-4"
			onscroll={() => {
				if (eventsContainer) {
					const { scrollTop, scrollHeight, clientHeight } = eventsContainer;
					autoScroll = scrollHeight - scrollTop - clientHeight < 100;
				}
			}}
		>
			{#if events.length === 0}
				<div class="text-center py-8 text-[var(--color-text-secondary)]">
					{#if session.status === 'starting'}
						<div class="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent mx-auto mb-2"></div>
						<p>Session starting...</p>
					{:else}
						<p>No events yet</p>
					{/if}
				</div>
			{:else}
				<div class="timeline">
					{#each events as event}
						<div class="timeline-event {getEventClass(event)}">
							<div class="flex items-center justify-between mb-1 text-xs text-[var(--color-text-secondary)]">
								<span class="flex items-center gap-1">
									<span>{getEventIcon(event)}</span>
									<span class="font-medium">{event.type}</span>
								</span>
								<time>{new Date(event.ts).toLocaleTimeString()}</time>
							</div>
							<div class="text-sm">{formatEventPayload(event)}</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Input -->
		<div class="flex-shrink-0">
			{#if getCanSendMessage()}
				<form
					onsubmit={(e) => {
						e.preventDefault();
						sendMessage();
					}}
					class="flex gap-2"
				>
					<input
						type="text"
						bind:value={messageInput}
						placeholder={session.status === 'waiting' ? 'Send a message...' : 'Agent is working...'}
						disabled={sendingMessage || session.status === 'running'}
						class="input flex-1"
					/>
					<button
						type="submit"
						disabled={sendingMessage || !messageInput.trim() || session.status === 'running'}
						class="btn btn-primary"
					>
						{#if sendingMessage}
							<span class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
						{:else}
							Send
						{/if}
					</button>
				</form>
				{#if session.status === 'running'}
					<p class="text-xs text-[var(--color-text-secondary)] mt-1">
						Agent is working. Wait for it to finish before sending a message.
					</p>
				{/if}
			{:else}
				<div class="text-center py-4 text-[var(--color-text-secondary)]">
					Session is {session.status}
				</div>
			{/if}
		</div>
	</div>
{/if}
