import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

let _db: PostgresJsDatabase<typeof schema> | null = null;

function getDb(): PostgresJsDatabase<typeof schema> {
	if (!_db) {
		if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
		const client = postgres(env.DATABASE_URL);
		_db = drizzle(client, { schema });
	}
	return _db;
}

// Proxy that lazily initializes the database connection
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
	get(_, prop) {
		return getDb()[prop as keyof PostgresJsDatabase<typeof schema>];
	}
});
