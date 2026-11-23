import { describe, expect, it } from 'bun:test';
import { mergePeopleById } from '../frontend/src/lib/components/crewnow/person-cache';

describe('mergePeopleById', () => {
	it('keeps previously fetched profile metadata when later search results omit that person', () => {
		const selectedPerson = { id: 'user-1', name: 'Alex', image: '/alex.png' };
		const otherPerson = { id: 'user-2', name: 'Morgan', image: null };

		const cached = mergePeopleById([selectedPerson], [otherPerson]);

		expect(cached).toEqual([selectedPerson, otherPerson]);
	});

	it('uses the newest profile for a person already in the cache', () => {
		const cached = mergePeopleById(
			[{ id: 'user-1', name: 'Alex', image: null }],
			[{ id: 'user-1', name: 'Alex Updated', image: '/alex-new.png' }],
		);

		expect(cached).toEqual([{ id: 'user-1', name: 'Alex Updated', image: '/alex-new.png' }]);
	});
});