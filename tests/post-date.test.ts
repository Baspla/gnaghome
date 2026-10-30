import { describe, expect, it } from 'bun:test';
import { formatPostDate } from '../frontend/src/lib/components/crewnow/post-date';

describe('formatPostDate', () => {
	it('returns formatted date data for a valid timestamp', () => {
		const result = formatPostDate('2026-10-30T12:00:00.000Z');
		expect(result?.datetime).toBe('2026-10-30T12:00:00.000Z');
		expect(result?.text).toContain('2026');
	});

	it('returns null for missing or invalid dates instead of throwing', () => {
		expect(formatPostDate('')).toBeNull();
		expect(formatPostDate('not-a-date')).toBeNull();
		expect(formatPostDate(undefined)).toBeNull();
	});
});