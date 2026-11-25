import { api } from '$lib/api';
import type { CallItChartType } from './types';

class CallItPreferencesStore {
    chartType = $state<CallItChartType>('line');
    loading = $state(false);
    saving = $state(false);
    loaded = $state(false);
    error = $state<string | null>(null);

    #inFlight: Promise<void> | null = null;

    async ensureLoaded(): Promise<void> {
        if (this.loaded) return;
        await this.refresh();
    }

    /** Coalesces concurrent loads so many charts on one page trigger a single request. */
    async refresh(): Promise<void> {
        if (this.#inFlight) return this.#inFlight;
        this.loading = true;
        this.#inFlight = (async () => {
            try {
                const response = await api.callit.preferences.get();
                if (response.error || !response.data) throw new Error('load failed');
                this.chartType = response.data.chartType;
                this.loaded = true;
                this.error = null;
            } catch {
                this.error = 'Call-it-Präferenzen konnten nicht geladen werden.';
            } finally {
                this.loading = false;
                this.#inFlight = null;
            }
        })();
        return this.#inFlight;
    }

    async setChartType(chartType: CallItChartType): Promise<boolean> {
        const previous = this.chartType;
        const changed = previous !== chartType;
        this.chartType = chartType;
        this.saving = true;
        this.error = null;
        try {
            const response = await api.callit.preferences.put({ chartType });
            if (response.error || !response.data) throw new Error('save failed');
            this.chartType = response.data.chartType;
            this.loaded = true;
            return true;
        } catch {
            this.chartType = previous;
            this.error = 'Call-it-Präferenzen konnten nicht gespeichert werden.';
            return !changed;
        } finally {
            this.saving = false;
        }
    }
}

export const callItPreferences = new CallItPreferencesStore();
