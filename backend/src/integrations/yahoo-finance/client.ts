import YahooFinance from 'yahoo-finance2';
import { createLogger } from '../../lib/logger';
import { err, ok, type InternalError, type Result } from '../../lib/result';

const logger = createLogger('yahoo-finance');
const REQUEST_TIMEOUT_MS = 10_000;
const QUOTE_FIELDS = [
    'symbol',
    'regularMarketPrice',
    'currency',
    'longName',
    'shortName',
    'regularMarketTime',
    'marketState',
] as const;

export type MarketQuote = {
    symbol: string;
    price: number;
    currency: string | null;
    name: string | null;
    marketTime: Date | null;
    marketState: string | null;
};

export type MarketCandle = {
    ts: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number | null;
};

export type MarketHistoryOptions = {
    from: Date;
    to: Date;
    interval?: '1h' | '1d';
};

export interface MarketDataClient {
    fetchQuotes(symbols: string[]): Promise<Result<MarketQuote[], InternalError>>;
    fetchQuote(symbol: string): Promise<Result<MarketQuote | null, InternalError>>;
    fetchHistory(symbol: string, options: MarketHistoryOptions): Promise<Result<MarketCandle[], InternalError>>;
}

type YahooQuoteLike = {
    symbol?: string;
    regularMarketPrice?: number;
    currency?: string;
    longName?: string;
    shortName?: string;
    regularMarketTime?: Date | number;
    marketState?: string;
};

type YahooChartLike = {
    meta?: {
        currency?: string;
        symbol?: string;
        regularMarketPrice?: number;
        regularMarketTime?: Date | number;
        longName?: string;
        shortName?: string;
    };
    quotes?: Array<{
        date: Date;
        open: number | null;
        high: number | null;
        low: number | null;
        close: number | null;
        volume: number | null;
    }>;
};

export type YahooFinanceLike = {
    quote: (
        query: string | string[],
        queryOptions?: Record<string, unknown>,
        moduleOptions?: Record<string, unknown>,
    ) => Promise<unknown>;
    chart: (
        symbol: string,
        queryOptions?: Record<string, unknown>,
        moduleOptions?: Record<string, unknown>,
    ) => Promise<unknown>;
};

function normalizeSymbol(value: string): string {
    return value.trim().toUpperCase();
}

function toDate(value: unknown): Date | null {
    if (value instanceof Date && Number.isFinite(value.getTime())) return value;
    if (typeof value === 'number' && Number.isFinite(value)) {
        return new Date(value > 1_000_000_000_000 ? value : value * 1_000);
    }
    return null;
}

function isPositivePrice(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function toQuote(value: unknown, fallbackSymbol: string): MarketQuote | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const quote = value as YahooQuoteLike;
    const symbol = typeof quote.symbol === 'string' && quote.symbol.trim()
        ? normalizeSymbol(quote.symbol)
        : fallbackSymbol;
    if (!symbol
        || typeof quote.regularMarketPrice !== 'number'
        || !Number.isFinite(quote.regularMarketPrice)
        || quote.regularMarketPrice <= 0) {
        return null;
    }
    const name = typeof quote.longName === 'string' && quote.longName.trim()
        ? quote.longName.trim()
        : typeof quote.shortName === 'string' && quote.shortName.trim()
            ? quote.shortName.trim()
            : null;
    return {
        symbol,
        price: quote.regularMarketPrice,
        currency: typeof quote.currency === 'string' && quote.currency.trim() ? quote.currency.trim() : null,
        name,
        marketTime: toDate(quote.regularMarketTime),
        marketState: typeof quote.marketState === 'string' && quote.marketState.trim()
            ? quote.marketState.trim()
            : null,
    };
}

function errorResult(message: string): Result<never, InternalError> {
    return err({ status: 500, code: 'INTERNAL_ERROR', message });
}

function moduleOptions() {
    return { fetchOptions: { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) } };
}


export class YahooFinanceMarketData implements MarketDataClient {
    constructor(
        private readonly client: YahooFinanceLike = new YahooFinance({
            suppressNotices: ['yahooSurvey'],
        }) as unknown as YahooFinanceLike,
    ) {}

    async fetchQuote(symbol: string): Promise<Result<MarketQuote | null, InternalError>> {
        const normalized = normalizeSymbol(symbol);
        if (!normalized) return ok(null);
        try {
            const result = await this.client.quote(
                normalized,
                { fields: QUOTE_FIELDS },
                moduleOptions(),
            );
            const raw = Array.isArray(result) ? result[0] : result;
            return ok(toQuote(raw, normalized));
        } catch (error) {
            logger.warn('single quote request failed', { symbol: normalized, error: String(error) });
            return errorResult('Der Kurs konnte nicht von Yahoo Finance geladen werden.');
        }
    }

    async fetchQuotes(symbols: string[]): Promise<Result<MarketQuote[], InternalError>> {
        const normalized = [...new Set(symbols.map(normalizeSymbol).filter(Boolean))];
        if (normalized.length === 0) return ok([]);

        try {
            const result = await this.client.quote(
                normalized,
                { fields: QUOTE_FIELDS },
                moduleOptions(),
            );
            const values = Array.isArray(result) ? result : [result];
            const quotes = values.flatMap((value, index) => {
                const fallback = normalized[index] ?? '';
                const quote = toQuote(value, fallback);
                return quote ? [quote] : [];
            });
            if (quotes.length > 0) return ok(quotes);
        } catch (error) {
            logger.warn('batched quote request failed; falling back to individual quotes', {
                symbolCount: normalized.length,
                error: String(error),
            });
        }

        const quotes: MarketQuote[] = [];
        const concurrency = 3;
        for (let index = 0; index < normalized.length; index += concurrency) {
            const batch = normalized.slice(index, index + concurrency);
            const results = await Promise.all(batch.map((symbol) => this.fetchQuote(symbol)));
            for (const result of results) {
                if (result.ok && result.value) quotes.push(result.value);
            }
        }
        return ok(quotes);
    }

    async fetchHistory(symbol: string, options: MarketHistoryOptions): Promise<Result<MarketCandle[], InternalError>> {
        const normalized = normalizeSymbol(symbol);
        if (!normalized) return ok([]);
        try {
            const result = await this.client.chart(
                normalized,
                {
                    period1: options.from,
                    period2: options.to,
                    interval: options.interval ?? '1h',
                    includePrePost: false,
                    return: 'array',
                },
                moduleOptions(),
            );
            const chart = (typeof result === 'object' && result !== null ? result : {}) as YahooChartLike;
            const byTimestamp = new Map<number, MarketCandle>();
            for (const point of chart.quotes ?? []) {
                if (!(point.date instanceof Date) || !Number.isFinite(point.date.getTime())) continue;
                if (!isPositivePrice(point.open)
                    || !isPositivePrice(point.high)
                    || !isPositivePrice(point.low)
                    || !isPositivePrice(point.close)) {
                    continue;
                }
                byTimestamp.set(point.date.getTime(), {
                    ts: point.date,
                    open: point.open,
                    high: point.high,
                    low: point.low,
                    close: point.close,
                    volume: typeof point.volume === 'number' && Number.isFinite(point.volume)
                        ? point.volume
                        : null,
                });
            }
            return ok([...byTimestamp.values()].sort((a, b) => a.ts.getTime() - b.ts.getTime()));
        } catch (error) {
            logger.warn('history request failed', { symbol: normalized, error: String(error) });
            return errorResult('Der Kursverlauf konnte nicht von Yahoo Finance geladen werden.');
        }
    }
}

