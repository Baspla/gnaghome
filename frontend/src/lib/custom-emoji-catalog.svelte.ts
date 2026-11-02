import { api } from '$lib/api';

export type CustomEmoji = {
    name: string;
    fileId: string;
    url: string;
    mimeType: string;
    createdAt: string;
    uploadedByUserId: string;
    uploadedByName: string;
};

let catalog = $state<CustomEmoji[]>([]);

export function getCustomEmojis(): CustomEmoji[] {
    return catalog;
}

export async function refreshCustomEmojis(): Promise<boolean> {
    try {
        const response = await api['custom-emojis'].get();
        if (response.error || !response.data) return false;
        catalog = response.data.items;
        return true;
    } catch {
        return false;
    }
}