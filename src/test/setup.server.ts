/**
 * Server Test Setup
 *
 * Configures the test environment for server-side tests.
 * Sets up test database connection and cleanup hooks.
 */

import { beforeEach, afterAll, vi } from 'vitest';

// Mock SvelteKit environment modules before any imports
vi.mock('$env/dynamic/private', () => ({
	env: {
		DATABASE_URL: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
		PORT: '3000',
		WORKSPACE_ROOT: '/tmp/agent-manager-test'
	}
}));

// Mock $app modules
vi.mock('$app/environment', () => ({
	browser: false,
	dev: true,
	building: false
}));
