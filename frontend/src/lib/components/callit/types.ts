export type CallItUser = { id: string; name: string; image: string | null };

export type CallItTracker = {
    id: string;
    symbol: string;
    name: string;
    currency: string | null;
    isActive: boolean;
    lastPrice: number | null;
    lastPriceAt: string | null;
    discussionId: string | null;
};

export type CallItTrackerListItem = CallItTracker & { activePredictionCount: number };

export type CallItDirection = 'UP' | 'DOWN';
export type CallItDurationKey = '1d' | '2d' | '3d' | '5d' | '7d' | '1m';

export type CallItPrediction = {
    id: string;
    user: CallItUser;
    tracker: CallItTracker;
    direction: CallItDirection;
    durationKey: CallItDurationKey;
    wager: number;
    startPrice: number;
    startAt: string;
    endsAt: string;
    status: 'ACTIVE' | 'COMPLETED';
    endPrice: number | null;
    resolvedAt: string | null;
    profitLoss: number | null;
    priceChangePercent: number | null;
    currentPrice: number | null;
    currentPriceAt: string | null;
    unrealizedProfitLoss: number | null;
    reactionCount: number;
    reactionEmoji: string | null;
};

export type CallItStats = {
    activePredictionCount: number;
    activeWagerTotal: number;
    allTimeProfit: number;
    unrealizedProfit: number;
    completedCount: number;
    wins: number;
    losses: number;
};

export type CallItLeaderboardEntry = {
    rank: number;
    user: CallItUser;
    allTimeProfit: number;
    unrealizedProfit: number;
    activeCount: number;
    completedCount: number;
    wins: number;
    losses: number;
};

export type CallItLimits = { maxActivePredictionsPerUser: number };

export type CallItOverview = {
    myStats: CallItStats;
    limits: CallItLimits;
    myActivePredictions: CallItPrediction[];
    otherActivePredictions: CallItPrediction[];
    leaderboard: CallItLeaderboardEntry[];
};

export type CallItUserPage = {
    user: CallItUser;
    stats: CallItStats;
    limits: CallItLimits;
    activePredictions: CallItPrediction[];
    completedPredictions: CallItPrediction[];
};

export type CallItHistoryPoint = {
    observedAt: string;
    open: number;
    high: number;
    low: number;
    close: number;
};

export type CallItChartType = 'line' | 'candlestick';

export type CallItPreferences = { chartType: CallItChartType };

export type CallItTrackerOverviewItem = CallItTrackerListItem & { history: CallItHistoryPoint[] };

export type CallItTrackerPreview = {
    symbol: string;
    name: string | null;
    currency: string | null;
    price: number;
    marketTime: string | null;
    marketState: string | null;
    history: CallItHistoryPoint[];
    existingTracker: { id: string; isActive: boolean } | null;
};

export type CallItTrackerDetail = {
    tracker: CallItTracker;
    commentCount: number;
    history: CallItHistoryPoint[];
    activePredictions: CallItPrediction[];
    completedPredictions: CallItPrediction[];
};

export type CallItSettings = {
    updateIntervalMinutes: number;
    maxActivePredictionsPerUser: number;
    lastSyncAt: string | null;
    lastSyncError: string | null;
    updatedAt: string;
};
