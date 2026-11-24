import { describe, expect, it, mock } from 'bun:test';
import { YahooFinanceMarketData, type YahooFinanceLike } from './client';

function quoteValue(symbol: string, price?: number) {
    return {
        symbol,
        regularMarketPrice: price,
        currency: 'USD',
        longName: `${symbol} Incorporated`,
        regularMarketTime: new Date('2026-01-01T12:00:00.000Z'),
        marketState: 'REGULAR',
    };
}

describe('YahooFinanceMarketData', () => {
    it('maps batched quotes and ignores entries without a usable price', async () => {
        const quote = mock(async (_query: string | string[]) => [
            quoteValue('AAPL', 100),
            quoteValue('MSFT', 200),
            quoteValue('BROKEN'),
        ]);
        const client = new YahooFinanceMarketData({
            quote,
            chart: async () => ({ quotes: [] }),
        } as YahooFinanceLike);

        const result = await client.fetchQuotes(['aapl', 'msft', 'broken']);
        expect(result).toMatchObject({
            ok: true,
            value: [
                { symbol: 'AAPL', price: 100, currency: 'USD', name: 'AAPL Incorporated' },
                { symbol: 'MSFT', price: 200, currency: 'USD', name: 'MSFT Incorporated' },
            ],
        });
        expect(quote).toHaveBeenCalledTimes(1);
        expect(quote.mock.calls[0]?.[0]).toEqual(['AAPL', 'MSFT', 'BROKEN']);
    });

    it('falls back to individual quotes when the batch request fails', async () => {
        const quote = mock(async (query: string | string[]) => {
            if (Array.isArray(query)) throw new Error('batch failed');
            return quoteValue(query, query === 'AAPL' ? 100 : 200);
        });
        const client = new YahooFinanceMarketData({
            quote,
            chart: async () => ({ quotes: [] }),
        } as YahooFinanceLike);

        const result = await client.fetchQuotes(['AAPL', 'MSFT']);
        expect(result).toMatchObject({
            ok: true,
            value: [
                { symbol: 'AAPL', price: 100 },
                { symbol: 'MSFT', price: 200 },
            ],
        });
        expect(quote).toHaveBeenCalledTimes(3);
    });

    it('maps and sorts historical closes while dropping null prices', async () => {
        const client = new YahooFinanceMarketData({
            quote: async () => quoteValue('AAPL', 100),
            chart: async () => ({
                quotes: [
                    { date: new Date('2026-01-01T12:30:00.000Z'), close: 101 },
                    { date: new Date('2026-01-01T12:00:00.000Z'), close: 100 },
                    { date: new Date('2026-01-01T12:15:00.000Z'), close: null },
                ],
            }),
        } as YahooFinanceLike);

        const result = await client.fetchHistory('AAPL', {
            from: new Date('2026-01-01T00:00:00.000Z'),
            to: new Date('2026-01-02T00:00:00.000Z'),
        });
        expect(result).toMatchObject({
            ok: true,
            value: [
                { observedAt: new Date('2026-01-01T12:00:00.000Z'), price: 100 },
                { observedAt: new Date('2026-01-01T12:30:00.000Z'), price: 101 },
            ],
        });
    });

    it('forwards daily intervals for long-range history', async () => {
        const chart = mock(async (_symbol: string, _queryOptions?: Record<string, unknown>) => ({ quotes: [] }));
        const client = new YahooFinanceMarketData({
            quote: async () => quoteValue('AAPL', 100),
            chart,
        } as YahooFinanceLike);

        await client.fetchHistory('AAPL', {
            from: new Date('2021-01-01T00:00:00.000Z'),
            to: new Date('2026-01-01T00:00:00.000Z'),
            interval: '1d',
        });

        expect(chart.mock.calls[0]?.[1]).toMatchObject({
            interval: '1d',
            period1: new Date('2021-01-01T00:00:00.000Z'),
            period2: new Date('2026-01-01T00:00:00.000Z'),
        });
    });

    it('returns a service error when a single quote or history request fails', async () => {
        const client = new YahooFinanceMarketData({
            quote: async () => { throw new Error('network down'); },
            chart: async () => { throw new Error('network down'); },
        } as YahooFinanceLike);

        expect(await client.fetchQuote('AAPL')).toMatchObject({ ok: false, error: { status: 500 } });
        expect(await client.fetchHistory('AAPL', {
            from: new Date('2026-01-01T00:00:00.000Z'),
            to: new Date('2026-01-02T00:00:00.000Z'),
        })).toMatchObject({ ok: false, error: { status: 500 } });
    });
});
