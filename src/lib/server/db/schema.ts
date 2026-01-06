import {
	pgTable,
	uuid,
	text,
	timestamp,
	bigserial,
	bigint,
	jsonb,
	index,
	pgEnum
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const sessionRoleEnum = pgEnum('session_role', ['implementer', 'orchestrator']);
export const sessionStatusEnum = pgEnum('session_status', [
	'starting',
	'running',
	'waiting',
	'finished',
	'error',
	'stopped'
]);
export const eventSourceEnum = pgEnum('event_source', ['claude', 'runner', 'manager']);

// Repos table
export const repos = pgTable('repos', {
	id: uuid('id').primaryKey().defaultRandom(),
	owner: text('owner').notNull(),
	name: text('name').notNull(),
	defaultBranch: text('default_branch').notNull().default('main'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	lastActivityAt: timestamp('last_activity_at', { withTimezone: true })
});

// Sessions table
export const sessions = pgTable(
	'sessions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		repoId: uuid('repo_id')
			.notNull()
			.references(() => repos.id, { onDelete: 'cascade' }),
		role: sessionRoleEnum('role').notNull().default('implementer'),
		status: sessionStatusEnum('status').notNull().default('starting'),
		branchName: text('branch_name').notNull(),
		baseBranch: text('base_branch').notNull(),
		worktreePath: text('worktree_path'),
		containerId: text('container_id'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		finishedAt: timestamp('finished_at', { withTimezone: true }),
		lastEventId: bigint('last_event_id', { mode: 'bigint' }),
		lastKnownHeadSha: text('last_known_head_sha'),
		lastKnownPrUrl: text('last_known_pr_url')
	},
	(table) => [index('sessions_repo_id_idx').on(table.repoId)]
);

// Events table
export const events = pgTable(
	'events',
	{
		id: bigserial('id', { mode: 'bigint' }).primaryKey(),
		sessionId: uuid('session_id')
			.notNull()
			.references(() => sessions.id, { onDelete: 'cascade' }),
		ts: timestamp('ts', { withTimezone: true }).notNull().defaultNow(),
		source: eventSourceEnum('source').notNull(),
		type: text('type').notNull(),
		payload: jsonb('payload').notNull()
	},
	(table) => [index('events_session_id_idx').on(table.sessionId, table.id)]
);

// Relations
export const reposRelations = relations(repos, ({ many }) => ({
	sessions: many(sessions)
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
	repo: one(repos, {
		fields: [sessions.repoId],
		references: [repos.id]
	}),
	events: many(events)
}));

export const eventsRelations = relations(events, ({ one }) => ({
	session: one(sessions, {
		fields: [events.sessionId],
		references: [sessions.id]
	})
}));

// Type exports for use throughout the application
export type Repo = typeof repos.$inferSelect;
export type NewRepo = typeof repos.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;

export type SessionRole = (typeof sessionRoleEnum.enumValues)[number];
export type SessionStatus = (typeof sessionStatusEnum.enumValues)[number];
export type EventSource = (typeof eventSourceEnum.enumValues)[number];
