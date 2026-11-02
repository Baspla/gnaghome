export type InlineTextPart =
    | { kind: 'text'; value: string }
    | { kind: 'emoji'; name: string; url: string };

export type CustomEmojiReference = { name: string; url: string };

export function parseCustomEmojiText(text: string, emojis: readonly CustomEmojiReference[]): InlineTextPart[] {
    const byName = new Map(emojis.map((emoji) => [emoji.name, emoji]));
    const result: InlineTextPart[] = [];
    const tokenPattern = /:([a-z0-9][a-z0-9_-]{0,31}):/g;
    let offset = 0;

    for (const match of text.matchAll(tokenPattern)) {
        const index = match.index;
        const emoji = byName.get(match[1]!);
        if (!emoji) continue;
        if (index > offset) result.push({ kind: 'text', value: text.slice(offset, index) });
        result.push({ kind: 'emoji', name: emoji.name, url: emoji.url });
        offset = index + match[0].length;
    }

    if (offset < text.length) result.push({ kind: 'text', value: text.slice(offset) });
    if (result.length === 0) result.push({ kind: 'text', value: text });
    return result;
}