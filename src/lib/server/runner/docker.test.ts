/**
 * Unit tests for Docker module
 *
 * Tests pure functions that don't require Docker.
 */

import { describe, it, expect } from 'vitest';
import { createDockerModule, DockerError } from './docker';

describe('Docker Module - Pure Functions', () => {
	describe('getHostUrl', () => {
		it('generates host.docker.internal URL', () => {
			const docker = createDockerModule();
			const url = docker.getHostUrl(3000);

			expect(url).toBe('http://host.docker.internal:3000');
		});

		it('handles standard HTTP port', () => {
			const docker = createDockerModule();
			const url = docker.getHostUrl(80);

			expect(url).toBe('http://host.docker.internal:80');
		});

		it('handles HTTPS port', () => {
			const docker = createDockerModule();
			const url = docker.getHostUrl(443);

			expect(url).toBe('http://host.docker.internal:443');
		});

		it('handles high port numbers', () => {
			const docker = createDockerModule();
			const url = docker.getHostUrl(65535);

			expect(url).toBe('http://host.docker.internal:65535');
		});

		it('handles common dev ports', () => {
			const docker = createDockerModule();

			expect(docker.getHostUrl(5173)).toBe('http://host.docker.internal:5173');
			expect(docker.getHostUrl(8080)).toBe('http://host.docker.internal:8080');
			expect(docker.getHostUrl(4321)).toBe('http://host.docker.internal:4321');
		});
	});
});

describe('DockerError', () => {
	it('creates error with message', () => {
		const error = new DockerError('container not found');

		expect(error.message).toBe('container not found');
		expect(error.name).toBe('DockerError');
		expect(error.exitCode).toBeUndefined();
	});

	it('creates error with exit code', () => {
		const error = new DockerError('docker daemon not running', 1);

		expect(error.message).toBe('docker daemon not running');
		expect(error.exitCode).toBe(1);
	});

	it('is instanceof Error', () => {
		const error = new DockerError('test');

		expect(error instanceof Error).toBe(true);
		expect(error instanceof DockerError).toBe(true);
	});

	it('has stack trace', () => {
		const error = new DockerError('test error');

		expect(error.stack).toBeDefined();
		expect(error.stack).toContain('DockerError');
	});
});
