/**
 * Unit tests for TimeAgo component logic
 * Tests the formatTimeAgo pure function extracted from the component
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Extracted pure function matching TimeAgo.svelte implementation
 * This allows unit testing the logic without requiring Svelte component testing
 */
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

describe('formatTimeAgo', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		// Set "now" to a fixed point in time
		vi.setSystemTime(new Date('2024-01-15T12:00:00.000Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('null and invalid inputs', () => {
		it('returns "Never" for null', () => {
			expect(formatTimeAgo(null)).toBe('Never');
		});
	});

	describe('recent times (< 60 seconds)', () => {
		it('returns "Just now" for 0 seconds ago', () => {
			const now = new Date('2024-01-15T12:00:00.000Z');
			expect(formatTimeAgo(now)).toBe('Just now');
		});

		it('returns "Just now" for 30 seconds ago', () => {
			const thirtySecondsAgo = new Date('2024-01-15T11:59:30.000Z');
			expect(formatTimeAgo(thirtySecondsAgo)).toBe('Just now');
		});

		it('returns "Just now" for 59 seconds ago', () => {
			const fiftyNineSecondsAgo = new Date('2024-01-15T11:59:01.000Z');
			expect(formatTimeAgo(fiftyNineSecondsAgo)).toBe('Just now');
		});
	});

	describe('minutes ago (1-59 min)', () => {
		it('returns "1m ago" for exactly 1 minute ago', () => {
			const oneMinuteAgo = new Date('2024-01-15T11:59:00.000Z');
			expect(formatTimeAgo(oneMinuteAgo)).toBe('1m ago');
		});

		it('returns "5m ago" for 5 minutes ago', () => {
			const fiveMinutesAgo = new Date('2024-01-15T11:55:00.000Z');
			expect(formatTimeAgo(fiveMinutesAgo)).toBe('5m ago');
		});

		it('returns "30m ago" for 30 minutes ago', () => {
			const thirtyMinutesAgo = new Date('2024-01-15T11:30:00.000Z');
			expect(formatTimeAgo(thirtyMinutesAgo)).toBe('30m ago');
		});

		it('returns "59m ago" for 59 minutes ago', () => {
			const fiftyNineMinutesAgo = new Date('2024-01-15T11:01:00.000Z');
			expect(formatTimeAgo(fiftyNineMinutesAgo)).toBe('59m ago');
		});
	});

	describe('hours ago (1-23 hours)', () => {
		it('returns "1h ago" for exactly 1 hour ago', () => {
			const oneHourAgo = new Date('2024-01-15T11:00:00.000Z');
			expect(formatTimeAgo(oneHourAgo)).toBe('1h ago');
		});

		it('returns "3h ago" for 3 hours ago', () => {
			const threeHoursAgo = new Date('2024-01-15T09:00:00.000Z');
			expect(formatTimeAgo(threeHoursAgo)).toBe('3h ago');
		});

		it('returns "12h ago" for 12 hours ago', () => {
			const twelveHoursAgo = new Date('2024-01-15T00:00:00.000Z');
			expect(formatTimeAgo(twelveHoursAgo)).toBe('12h ago');
		});

		it('returns "23h ago" for 23 hours ago', () => {
			const twentyThreeHoursAgo = new Date('2024-01-14T13:00:00.000Z');
			expect(formatTimeAgo(twentyThreeHoursAgo)).toBe('23h ago');
		});
	});

	describe('days ago (1-6 days)', () => {
		it('returns "1d ago" for 1 day ago', () => {
			const oneDayAgo = new Date('2024-01-14T12:00:00.000Z');
			expect(formatTimeAgo(oneDayAgo)).toBe('1d ago');
		});

		it('returns "2d ago" for 2 days ago', () => {
			const twoDaysAgo = new Date('2024-01-13T12:00:00.000Z');
			expect(formatTimeAgo(twoDaysAgo)).toBe('2d ago');
		});

		it('returns "6d ago" for 6 days ago', () => {
			const sixDaysAgo = new Date('2024-01-09T12:00:00.000Z');
			expect(formatTimeAgo(sixDaysAgo)).toBe('6d ago');
		});
	});

	describe('older dates (7+ days)', () => {
		it('returns formatted date for 7 days ago', () => {
			const sevenDaysAgo = new Date('2024-01-08T12:00:00.000Z');
			const result = formatTimeAgo(sevenDaysAgo);
			// toLocaleDateString format depends on locale, just check it's not a relative format
			expect(result).not.toContain('ago');
			expect(result).not.toBe('Just now');
			expect(result).not.toBe('Never');
		});

		it('returns formatted date for 30 days ago', () => {
			const thirtyDaysAgo = new Date('2023-12-16T12:00:00.000Z');
			const result = formatTimeAgo(thirtyDaysAgo);
			expect(result).not.toContain('ago');
		});

		it('returns formatted date for 1 year ago', () => {
			const oneYearAgo = new Date('2023-01-15T12:00:00.000Z');
			const result = formatTimeAgo(oneYearAgo);
			expect(result).not.toContain('ago');
		});
	});

	describe('string date inputs', () => {
		it('handles ISO string format', () => {
			const isoString = '2024-01-15T11:55:00.000Z';
			expect(formatTimeAgo(isoString)).toBe('5m ago');
		});

		it('handles ISO string without milliseconds', () => {
			const isoString = '2024-01-15T11:55:00Z';
			expect(formatTimeAgo(isoString)).toBe('5m ago');
		});

		it('handles date-only string', () => {
			const dateString = '2024-01-14';
			const result = formatTimeAgo(dateString);
			// Should be some hours ago depending on timezone interpretation
			expect(result).toMatch(/(h ago|d ago)/);
		});
	});

	describe('Date object inputs', () => {
		it('handles Date object', () => {
			const date = new Date('2024-01-15T11:55:00.000Z');
			expect(formatTimeAgo(date)).toBe('5m ago');
		});

		it('handles Date.now() offset', () => {
			const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
			expect(formatTimeAgo(fiveMinutesAgo)).toBe('5m ago');
		});
	});

	describe('edge cases', () => {
		it('handles exactly 60 seconds ago (boundary to minutes)', () => {
			const sixtySecondsAgo = new Date('2024-01-15T11:59:00.000Z');
			expect(formatTimeAgo(sixtySecondsAgo)).toBe('1m ago');
		});

		it('handles exactly 60 minutes ago (boundary to hours)', () => {
			const sixtyMinutesAgo = new Date('2024-01-15T11:00:00.000Z');
			expect(formatTimeAgo(sixtyMinutesAgo)).toBe('1h ago');
		});

		it('handles exactly 24 hours ago (boundary to days)', () => {
			const twentyFourHoursAgo = new Date('2024-01-14T12:00:00.000Z');
			expect(formatTimeAgo(twentyFourHoursAgo)).toBe('1d ago');
		});

		it('handles future dates (negative diff)', () => {
			const future = new Date('2024-01-15T12:05:00.000Z');
			// With fake timers, "now" is before "future", so diff is negative
			// The function should return "Just now" for negative seconds
			expect(formatTimeAgo(future)).toBe('Just now');
		});
	});
});
