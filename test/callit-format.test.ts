import { describe, expect, it } from 'bun:test';
import {
    directionAdjective,
    directionLabel,
    durationLabel,
    formatEuroPoints,
    formatPercent,
    formatTrackerPrice,
    historyRangeLabel,
    trackerSymbolPreview,
} from '../frontend/src/lib/components/callit/format';

describe('Call It formatting', () => {
    it('formats virtual points as euro with optional sign', () => {
        expect(formatEuroPoints(1000)).toContain('1.000');
        expect(formatEuroPoints(1000)).toContain('€');
        expect(formatEuroPoints(-25, true)).toContain('-');
        expect(formatEuroPoints(25, true)).toContain('+');
    });

    it('formats tracker prices in their currency and falls back for non-ISO codes', () => {
        expect(formatTrackerPrice(123.45, 'USD')).toContain('$');
        expect(formatTrackerPrice(123.45, 'JPY')).toContain('¥');
        expect(formatTrackerPrice(123.45, 'GBp')).toContain('GBp');
        expect(formatTrackerPrice(0.1234, 'USD')).toContain('0,1234');
        expect(formatTrackerPrice(null, 'USD')).toBe('—');
    });

    it('formats percentages and labels', () => {
        expect(formatPercent(1.5)).toContain('1,5');
        expect(formatPercent(-1.5)).toContain('-1,5');
        expect(durationLabel('1d')).toBe('1 Tag');
        expect(durationLabel('7d')).toBe('1 Woche');
        expect(durationLabel('1m')).toBe('1 Monat');
        expect(directionLabel('UP')).toBe('Steigt');
        expect(directionLabel('DOWN')).toBe('Fällt');
    });

    it('labels tracker history ranges including one and five years', () => {
        expect(historyRangeLabel(1)).toBe('1 Tag');
        expect(historyRangeLabel(90)).toBe('90 Tage');
        expect(historyRangeLabel(365)).toBe('1 Jahr');
        expect(historyRangeLabel(1825)).toBe('5 Jahre');
    });

    it('shortens tracker symbols to four characters and keeps direction adjectives lowercase', () => {
        expect(trackerSymbolPreview('AAPL')).toBe('AAPL');
        expect(trackerSymbolPreview('GOOGL')).toBe('GOOG…');
        expect(trackerSymbolPreview('BRK.B')).toBe('BRK…');
        expect(trackerSymbolPreview(' AAPL ')).toBe('AAPL');
        expect(directionAdjective('UP')).toBe('steigende');
        expect(directionAdjective('DOWN')).toBe('fallende');
    });
});
