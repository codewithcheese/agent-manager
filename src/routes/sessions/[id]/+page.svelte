<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import RoleBadge from '$lib/components/RoleBadge.svelte';
	import TimeAgo from '$lib/components/TimeAgo.svelte';
	import type { SessionStatus, SessionRole, EventSource } from '$lib/server/db/schema';
	import { AlertCircle, ChevronLeft, GitBranch, Clock, ChevronRight, MessageSquare, Plus, Square, Send, CheckCircle, XCircle, MessageCircle, Sparkles, Cog, User, FileText } from 'lucide-svelte';

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
					if (msg.payload.event) {
						events = [...events, msg.payload.event];
						scrollToBottom();
					}
					if (msg.payload.session) {
						session = { ...session!, ...msg.payload.session };
					}
				}
			} catch (e) {
				console.error('WebSocket message error:', e);
			}
		};

		ws.onclose = () => {
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

		if (event.source === 'runner') {
			if ('runnerEvent' in payload) {
				const re = payload.runnerEvent as Record<string, unknown>;
				if (re.data) return String(re.data);
			}
		}

		if (type === 'user.message' && payload.message) {
			return String(payload.message);
		}

		return JSON.stringify(payload, null, 2);
	}

	function getEventClass(event: StoredEvent): string {
		if (event.type === 'user.message') return 'user';
		return event.source;
	}

	function getEventIcon(source: string): { icon: string; bg: string } {
		switch (source) {
			case 'claude':
				return { icon: 'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z', bg: 'bg-[var(--color-primary)]' };
			case 'runner':
				return { icon: 'M4.5 12a7.5 7.5 0 0015 0m-15 0a7.5 7.5 0 1115 0m-15 0H3m16.5 0H21m-1.5 0H12m-8.457 3.077l1.41-.513m14.095-5.13l1.41-.513M5.106 17.785l1.15-.964m11.49-9.642l1.149-.964M7.501 19.795l.75-1.3m7.5-12.99l.75-1.3m-6.063 16.658l.26-1.477m2.605-14.772l.26-1.477m0 17.726l-.26-1.477M10.698 4.614l-.26-1.477M16.5 19.794l-.75-1.299M7.5 4.205L12 12m6.894 5.785l-1.149-.964M6.256 7.178l-1.15-.964m15.352 8.864l-1.41-.513M4.954 9.435l-1.41-.514M12.002 12l-3.75 6.495', bg: 'bg-[var(--color-success)]' };
			case 'manager':
				return { icon: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z', bg: 'bg-[var(--color-text-tertiary)]' };
			case 'user':
				return { icon: 'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z', bg: 'bg-[var(--color-warning)]' };
			default:
				return { icon: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z', bg: 'bg-[var(--color-text-tertiary)]' };
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
	<div class="flex flex-col items-center justify-center py-16">
		<div class="spinner spinner-lg"></div>
		<p class="mt-4 text-sm text-[var(--color-text-secondary)]">Loading session...</p>
	</div>
{:else if error}
	<div class="card border-[var(--color-error)]/30 bg-[var(--color-error-subtle)]">
		<div class="flex items-start gap-3">
			<AlertCircle class="w-5 h-5 text-[var(--color-error)] flex-shrink-0 mt-0.5" strokeWidth={2} />
			<div class="flex-1">
				<p class="font-medium text-[var(--color-error)]">{error}</p>
				<a href="/" class="btn btn-sm btn-secondary mt-3">
					<ChevronLeft class="w-4 h-4" strokeWidth={2} />
					Back to Repositories
				</a>
			</div>
		</div>
	</div>
{:else if session && repo}
	<div class="flex flex-col h-[calc(100vh-180px)] animate-fade-in">
		<!-- Header -->
		<div class="flex-shrink-0 mb-4">
			<div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
				<div class="flex items-start gap-3">
					<a
						href="/repos/{repo.id}"
						class="flex items-center justify-center w-8 h-8 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-secondary)] transition-all mt-0.5"
						aria-label="Back to repository"
					>
						<ChevronLeft class="w-5 h-5" strokeWidth={2} />
					</a>
					<div>
						<div class="flex items-center gap-2 flex-wrap">
							<h1 class="text-xl font-bold text-[var(--color-text)]">{repo.fullName}</h1>
							<RoleBadge role={session.role} />
							<StatusBadge status={session.status} />
						</div>
						<div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--color-text-secondary)]">
							<span class="flex items-center gap-1.5">
								<GitBranch class="w-4 h-4 text-[var(--color-text-tertiary)]" strokeWidth={2} />
								<code class="font-mono text-xs">{session.branchName}</code>
							</span>
							<span class="flex items-center gap-1.5 text-[var(--color-text-tertiary)]">
								<Clock class="w-4 h-4" strokeWidth={2} />
								Started <TimeAgo date={session.createdAt} />
							</span>
						</div>
					</div>
				</div>

				<!-- Action Buttons -->
				<div class="flex items-center gap-2 flex-wrap">
					{#if session.urls?.compare}
						<a href={session.urls.compare} target="_blank" rel="noopener" class="btn btn-secondary btn-sm">
							<ChevronRight class="w-4 h-4" strokeWidth={2} />
							Compare
						</a>
					{/if}
					{#if pr}
						<a href={pr.url} target="_blank" rel="noopener" class="btn btn-secondary btn-sm">
							<MessageSquare class="w-4 h-4" strokeWidth={2} />
							PR #{pr.number}
						</a>
					{:else if session.urls?.newPr}
						<a href={session.urls.newPr} target="_blank" rel="noopener" class="btn btn-secondary btn-sm">
							<Plus class="w-4 h-4" strokeWidth={2} />
							Create PR
						</a>
					{/if}
					{#if getIsActive()}
						<button onclick={() => stopSession()} disabled={stopping} class="btn btn-danger btn-sm">
							{#if stopping}
								<span class="spinner spinner-sm"></span>
							{:else}
								<Square class="w-4 h-4" strokeWidth={2} />
							{/if}
							Stop
						</button>
					{/if}
				</div>
			</div>
		</div>

		<!-- Timeline -->
		<div
			bind:this={eventsContainer}
			class="flex-1 overflow-y-auto card !p-4"
			onscroll={() => {
				if (eventsContainer) {
					const { scrollTop, scrollHeight, clientHeight } = eventsContainer;
					autoScroll = scrollHeight - scrollTop - clientHeight < 100;
				}
			}}
		>
			{#if events.length === 0}
				<div class="flex flex-col items-center justify-center h-full text-center py-12">
					{#if session.status === 'starting'}
						<div class="w-12 h-12 rounded-2xl bg-[var(--color-bg-secondary)] flex items-center justify-center mb-4">
							<div class="spinner"></div>
						</div>
						<p class="text-[var(--color-text-secondary)]">Session starting...</p>
						<p class="text-xs text-[var(--color-text-tertiary)] mt-1">Setting up container and workspace</p>
					{:else}
						<div class="w-12 h-12 rounded-2xl bg-[var(--color-bg-secondary)] flex items-center justify-center mb-4">
							<MessageCircle class="w-6 h-6 text-[var(--color-text-tertiary)]" strokeWidth={1.5} />
						</div>
						<p class="text-[var(--color-text-secondary)]">No events yet</p>
					{/if}
				</div>
			{:else}
				<div class="timeline">
					{#each events as event}
						{@const eventSource = event.type === 'user.message' ? 'user' : event.source}
						<div class="timeline-event {getEventClass(event)}">
							<div class="flex items-center justify-between mb-2">
								<div class="flex items-center gap-2">
									<div class="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0
										{eventSource === 'claude' ? 'bg-[var(--color-accent)]' :
										 eventSource === 'runner' ? 'bg-[var(--color-success)]' :
										 eventSource === 'user' ? 'bg-[var(--color-warning)]' :
										 'bg-[var(--color-text-tertiary)]'}">
										{#if eventSource === 'claude'}
											<Sparkles class="w-3.5 h-3.5 text-white" strokeWidth={2} />
										{:else if eventSource === 'runner'}
											<Cog class="w-3.5 h-3.5 text-white" strokeWidth={2} />
										{:else if eventSource === 'user'}
											<User class="w-3.5 h-3.5 text-white" strokeWidth={2} />
										{:else}
											<FileText class="w-3.5 h-3.5 text-white" strokeWidth={2} />
										{/if}
									</div>
									<span class="text-xs font-medium text-[var(--color-text-secondary)]">{event.type}</span>
								</div>
								<time class="text-xs text-[var(--color-text-tertiary)]">
									{new Date(event.ts).toLocaleTimeString()}
								</time>
							</div>
							<div class="pl-8 text-sm text-[var(--color-text)]">{formatEventPayload(event)}</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Input Area -->
		<div class="flex-shrink-0 mt-4">
			{#if getCanSendMessage()}
				<form
					onsubmit={(e) => {
						e.preventDefault();
						sendMessage();
					}}
					class="flex gap-3"
				>
					<div class="relative flex-1">
						<input
							type="text"
							bind:value={messageInput}
							placeholder={session.status === 'waiting' ? 'Send a message to the agent...' : 'Agent is working...'}
							disabled={sendingMessage || session.status === 'running'}
							class="input pr-12"
						/>
						{#if session.status === 'running'}
							<div class="absolute right-3 top-1/2 -translate-y-1/2">
								<div class="spinner spinner-sm"></div>
							</div>
						{/if}
					</div>
					<button
						type="submit"
						disabled={sendingMessage || !messageInput.trim() || session.status === 'running'}
						class="btn btn-primary"
					>
						{#if sendingMessage}
							<span class="spinner spinner-sm"></span>
						{:else}
							<Send class="w-4 h-4" strokeWidth={2} />
						{/if}
						Send
					</button>
				</form>
				{#if session.status === 'running'}
					<p class="text-xs text-[var(--color-text-tertiary)] mt-2 flex items-center gap-1.5">
						<span class="status-dot status-dot-running"></span>
						Agent is working. You can send a message once it's waiting for input.
					</p>
				{/if}
			{:else}
				<div class="card !py-4 text-center">
					<p class="text-sm text-[var(--color-text-secondary)] flex items-center justify-center gap-2">
						{#if session.status === 'finished'}
							<CheckCircle class="w-4 h-4 text-[var(--color-accent)]" strokeWidth={2} />
							Session completed successfully
						{:else if session.status === 'error'}
							<XCircle class="w-4 h-4 text-[var(--color-error)]" strokeWidth={2} />
							Session ended with an error
						{:else if session.status === 'stopped'}
							<Square class="w-4 h-4 text-[var(--color-text-tertiary)]" strokeWidth={2} />
							Session was stopped
						{:else}
							Session is {session.status}
						{/if}
					</p>
				</div>
			{/if}
		</div>
	</div>
{/if}
