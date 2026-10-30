import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

export interface FileStorage {
    write(storageKey: string, bytes: Uint8Array): Promise<void>;
    read(storageKey: string): Promise<Uint8Array>;
    delete(storageKey: string): Promise<void>;
}

export class LocalFileStorage {
    private readonly directory: string;

    constructor(directory: string) {
        this.directory = resolve(directory);
    }

    private filePath(storageKey: string): string {
        if (!/^[0-9a-f-]+\.(?:png|jpg|gif|webp|avif|apng)$/i.test(storageKey)) {
            throw new Error('Invalid internal file storage key');
        }
        const filePath = resolve(this.directory, storageKey);
        if (!filePath.startsWith(`${this.directory}${sep}`)) {
            throw new Error('Invalid internal file storage key');
        }
        return filePath;
    }

    async write(storageKey: string, bytes: Uint8Array): Promise<void> {
        await mkdir(this.directory, { recursive: true, mode: 0o750 });
        await writeFile(this.filePath(storageKey), bytes, { flag: 'wx', mode: 0o640 });
    }

    async read(storageKey: string): Promise<Uint8Array> {
        return new Uint8Array(await readFile(this.filePath(storageKey)));
    }

    async delete(storageKey: string): Promise<void> {
        await rm(this.filePath(storageKey), { force: true });
    }

}

export function storageKeyFor(mimeType: string): string {
    const extensions: Record<string, string> = {
        'image/apng': 'apng',
        'image/avif': 'avif',
        'image/gif': 'gif',
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
    };
    const extension = extensions[mimeType];
    if (!extension) throw new Error('Unsupported image type');
    return `${crypto.randomUUID()}.${extension}`;
}