import { describe, expect, it } from 'bun:test';
import { parseCustomEmojiText } from '../../../frontend/src/lib/custom-emoji-text';

const emojis = [
    { name: 'gnag_wave', url: '/api/v1/files/file-wave' },
    { name: 'gnag_love', url: '/api/v1/files/file-love' },
];

describe('parseCustomEmojiText', () => {
    it('replaces known tokens while preserving surrounding text', () => {
        expect(parseCustomEmojiText('Hallo :gnag_wave:!', emojis)).toEqual([
            { kind: 'text', value: 'Hallo ' },
            { kind: 'emoji', name: 'gnag_wave', url: '/api/v1/files/file-wave' },
            { kind: 'text', value: '!' },
        ]);
    });

    it('leaves unknown and malformed tokens as literal text', () => {
        expect(parseCustomEmojiText('Unbekannt :missing: :bad name:', emojis)).toEqual([
            { kind: 'text', value: 'Unbekannt :missing: :bad name:' },
        ]);
    });

    it('supports multiple tokens and adjacent tokens', () => {
        expect(parseCustomEmojiText(':gnag_wave::gnag_love:', emojis)).toEqual([
            { kind: 'emoji', name: 'gnag_wave', url: '/api/v1/files/file-wave' },
            { kind: 'emoji', name: 'gnag_love', url: '/api/v1/files/file-love' },
        ]);
    });
});