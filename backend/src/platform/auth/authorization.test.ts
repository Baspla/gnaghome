import { describe, expect, it } from 'bun:test';
import { isAdminFromGroups, parseGroupClaims } from './authorization';

describe('isAdminFromGroups', () => {
    it('recognizes an exact configured OIDC group membership', () => {
        expect(isAdminFromGroups('["a", "b"]', 'b')).toBe(true);
    });

    it('does not treat partial or differently-cased group names as admin', () => {
        expect(isAdminFromGroups('["admins-extra"]', 'admins')).toBe(false);
        expect(isAdminFromGroups('["Admins"]', 'admins')).toBe(false);
    });

    it('denies admin when the configured group is missing or blank', () => {
        expect(isAdminFromGroups('["admins"]', undefined)).toBe(false);
        expect(isAdminFromGroups('["admins"]', '  ')).toBe(false);
    });

    it('treats malformed group claims as non-admin', () => {
        expect(isAdminFromGroups('{invalid', 'admins')).toBe(false);
    });
});

describe('parseGroupClaims', () => {
    it('returns only unique, trimmed, non-empty string memberships', () => {
        expect(parseGroupClaims('["friends", " friends ", 42, "", null, "admins"]')).toEqual([
            'friends',
            'admins',
        ]);
    });

    it('treats malformed or non-array claims as no memberships', () => {
        expect(parseGroupClaims('{invalid')).toEqual([]);
        expect(parseGroupClaims(null)).toEqual([]);
        expect(parseGroupClaims(undefined)).toEqual([]);
        expect(parseGroupClaims('{"group":"admins"}')).toEqual([]);
    });
});