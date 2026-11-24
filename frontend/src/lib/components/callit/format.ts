import type { CallItDirection, CallItDurationKey } from './types';

const euroFormatter = new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
});

const signedEuroFormatter = new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
    signDisplay: 'exceptZero',
});

const plainNumberFormatter = new Intl.NumberFormat('de-DE', {
    maximumFractionDigits: 2,
});

const smallNumberFormatter = new Intl.NumberFormat('de-DE', {
    maximumFractionDigits: 4,
});

const percentFormatter = new Intl.NumberFormat('de-DE', {
    maximumFractionDigits: 2,
    signDisplay: 'exceptZero',
});

const dateTimeFormatter = new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Berlin',
});

const dateFormatter = new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeZone: 'Europe/Berlin',
});

export function formatEuroPoints(value: number, signed = false): string {
    return (signed ? signedEuroFormatter : euroFormatter).format(value);
}

export function formatTrackerPrice(value: number | null, currency: string | null): string {
    if (value === null || !Number.isFinite(value)) return '—';
    // Yahoo uses non-ISO codes such as GBp (pence) and ZAc (cents) for some markets.
    if (currency && /^[A-Z]{3}$/.test(currency)) {
        try {
            return new Intl.NumberFormat('de-DE', {
                style: 'currency',
                currency,
                maximumFractionDigits: value < 1 ? 4 : 2,
            }).format(value);
        } catch {
            // Fall through to a plain number with the currency suffix.
        }
    }
    const formatted = (value < 1 ? smallNumberFormatter : plainNumberFormatter).format(value);
    return currency ? `${formatted} ${currency}` : formatted;
}

export function formatPercent(value: number | null): string {
    if (value === null || !Number.isFinite(value)) return '—';
    return `${percentFormatter.format(value)} %`;
}

export function formatDateTime(value: string | Date): string {
    return dateTimeFormatter.format(new Date(value));
}

export function formatDate(value: string | Date): string {
    return dateFormatter.format(new Date(value));
}

export function historyRangeLabel(days: number): string {
    if (days === 1) return '1 Tag';
    if (days === 365) return '1 Jahr';
    if (days === 1825) return '5 Jahre';
    return `${days} Tage`;
}

export function durationLabel(key: CallItDurationKey): string {
    switch (key) {
        case '1d': return '1 Tag';
        case '2d': return '2 Tage';
        case '3d': return '3 Tage';
        case '5d': return '5 Tage';
        case '7d': return '1 Woche';
        case '1m': return '1 Monat';
    }
}

export function directionLabel(direction: CallItDirection): string {
    return direction === 'UP' ? 'Steigt' : 'Fällt';
}
