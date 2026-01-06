import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
	plugins: [svelte({ hot: false })],

	resolve: {
		alias: {
			$lib: resolve('./src/lib'),
			'$lib/*': resolve('./src/lib/*'),
			$test: resolve('./src/test'),
			'$test/*': resolve('./src/test/*'),
			$app: resolve('./node_modules/@sveltejs/kit/src/runtime/app'),
			'$app/*': resolve('./node_modules/@sveltejs/kit/src/runtime/app/*')
		}
	},

	test: {
		include: ['src/**/*.{test,spec}.{js,ts}', 'docker/**/*.{test,spec}.{js,ts}'],
		exclude: ['src/**/*.svelte.{test,spec}.{js,ts}', 'node_modules'],
		environment: 'node',
		setupFiles: ['src/test/setup.server.ts'],
		globals: true
	}
});
