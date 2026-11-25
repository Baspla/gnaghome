# Call it: architecture memory

**Status:** Implemented product direction confirmed by the user. Keep this document aligned with the actual behavior.

## Product concept

Call it is a virtual stock-prediction game for the friend group. Users place UP or DOWN predictions on admin-configured stock trackers for a fixed timespan. When the timespan expires, the prediction is completed and the resulting profit or loss is stored and shown.

Wagers are virtual points displayed as euro (`€`). They do not touch a wallet or pool and are only for bragging rights. Profit/loss is based on percentage change, so the tracker's own currency does not need conversion.

## Confirmed rules

- Wagers: `100`, `250`, `500`, `1000` virtual EUR points.
- Durations: `1d`, `2d`, `3d`, `5d`, `7d`, `1m` (30 calendar days).
- Directions: `UP` (Steigt) and `DOWN` (Fällt).
- Profit/loss:
  ```text
  percent = (endPrice - startPrice) / startPrice
  signedPercent = direction === 'UP' ? percent : -percent
  profitLoss = round(wager * signedPercent)
  ```
  Stored as integer virtual-EUR points.
- Start price: the latest stored tracker price if it is fresh enough; otherwise a live Yahoo Finance quote is fetched and persisted.
- End price: the first scheduled sync at or after `endsAt`. If the market is closed, this is the latest available quote/last close.
- Simultaneous active predictions per user: default `6`, globally configurable by admins between 1 and 50. Existing predictions remain active if the limit is lowered.
- Multiple predictions per user/tracker are allowed.
- Predictions are visible to all authenticated users. There is no cancellation in the first version.
- Tracker removal is a soft removal. Removed trackers cannot be selected for new predictions, but trackers with active predictions continue to be synced until those predictions resolve. History and comments remain available.
- Re-adding a removed symbol reactivates the existing tracker and reuses its discussion.
- Admins can fully remove a tracker. Full removal permanently deletes the tracker, its price history, all its predictions, prediction reactions, and the tracker discussion/comments. This cannot be undone.
- The admin UI requires a successful symbol preview before enabling the add action. Preview validates the symbol against Yahoo Finance and returns the resolved name, currency, current price, market state, 30-day daily candle history, and whether an active or removed tracker already exists for it; it persists nothing.

## Market data and price history

- Provider: `yahoo-finance2` v4 in `backend/src/integrations/yahoo-finance/client.ts`.
- The app depends on the `MarketDataClient` contract, not on Yahoo directly.
- Batched sync uses `quote(symbols, { fields })`; v4 supports multiple symbols in one request.
- Historical data is stored as OHLCV candles in `callit_price_candle` with the primary key `(tracker_id, interval, ts)` and `open`, `high`, `low`, `close`, and nullable `volume`. Supported intervals are `15m`, `1h`, and `1d`.
- Candle writes always upsert on `(tracker_id, interval, ts)` so the newest live/incomplete candle is updated instead of duplicated.
- On creation and reactivation, a tracker backfills `15m` candles for the last 30 days, `1h` candles for the last 60 days, and `1d` candles from Yahoo's full available history (`period1 = 1970-01-01`).
- `callit.sync` refreshes each interval on its own cadence: `15m` when at least 15 minutes have elapsed, and `1h`/`1d` when at least an hour has elapsed. Candle refreshes run before tracker change events so clients refetch fresh history. The first sync after startup refreshes all intervals.
- Reads use one interval per response. A 1-day range queries `interval = '15m'`; ranges up to 7 days query `interval = '1h'`; longer ranges query `interval = '1d'`. The API returns each history point as `{ observedAt, open, high, low, close }`. Line charts plot `close`; candlestick charts use the full OHLC range.
- Tracker-detail ranges up to 1825 days and the main-page tracker overview use the same interval rule. Large results are downsampled to at most 1000 detail points and 120 overview points.
- Both chart types share the same history payload and preparation pipeline. Long flat runs (identical OHLC values for more than two hours) are compacted, non-trading time is collapsed: points separated by more than two hours form separate trading sessions, every session gets an equal-width slot, consecutive sessions join at their boundary, so nights, weekends, and holidays take no horizontal space. At most 500 points are rendered per chart. Candlesticks use a candle-specific x layout that insets every session by half a candle slot, so the last candle of a session and the first candle of the next never overlap; a minimum body height keeps doji and tiny bodies visible.
- Retention matches provider availability: `15m` candles are pruned after 30 days, `1h` after 60 days, and `1d` is retained indefinitely. Cleanup runs at most once per day during `callit.sync` using the `(interval, ts)` index. Yahoo limits `15m` history to roughly 60 days and `1h` to roughly 730 days; older periods therefore use the retained daily candles.
- Prices and history are displayed in the tracker's Yahoo currency. Non-ISO Yahoo codes such as `GBp` fall back to `number + code` instead of being treated as GBP.
- Wagers and profit/loss are always displayed as virtual EUR.

## Backend ownership

- App: `backend/src/apps/callit/`
  - `schema.ts`: trackers, price candles, predictions, per-user preferences, settings.
  - `service.ts`: tracker management, prediction creation, overview/user/tracker reads, price sync, resolution.
  - `preferences.ts`: per-user chart-type preference (line or candlestick).
  - `module.ts`: authenticated `/api/v1/callit` routes and admin checks.
  - `tasks.ts`: `callit.sync` worker and `callit.price-sync` schedule.
- Integration: `backend/src/integrations/yahoo-finance/` owns provider calls and response mapping.
- Shared platform systems:
  - Reactions target type: `callit.prediction`.
  - Discussions/comments target type: `callit.tracker`.
  - Tracker rows store their canonical `discussion_id`.
  - Activity types: `callit.prediction.created` and `callit.prediction.completed`, both targeting `callit.prediction` and referencing the owning tracker's canonical `discussion_id`.
  - Notification topics: `callit.prediction.new`, `callit.prediction.completed`, and `callit.prediction.mine-completed`.

## Activity and notifications

Every newly placed prediction records one `callit.prediction.created` activity after the prediction is durably stored. The actor is the player, and the payload contains the tracker ID, tracker symbol, and direction. Predictions are visible to all authenticated users, so the feed authorizes the `callit.prediction` target through `CallItService.canViewPrediction`.

Both Call it activity types also store the owning tracker's canonical `discussion_id` (when the tracker has one). Feed reads therefore resolve two independent counts per Call it item: the comment count of the tracker discussion and the reaction count of the prediction's `callit.prediction` reaction target. This mirrors the app pages, where the tracker page shows the discussion and each prediction card shows its reactions. The feed refetches visible Call it items when a matching `reaction.changed` event arrives and when discussion messages change (the discussions platform publishes an `activity-feed.changed` collection event); reconnect recovery refetches the persisted feed.

When a scheduled sync resolves a prediction, it records one `callit.prediction.completed` activity with the player as subject and the tracker symbol, direction, and a `successful` flag (`profitLoss > 0`) in the payload. Completion activities and their notifications are best-effort: a failure is logged and does not abort the durable resolution or the rest of the sync.

Opt-in push topics:

- `callit.prediction.new` — sent to everyone except the creator when another user places a prediction.
- `callit.prediction.completed` — sent to everyone except the owner when someone else's prediction resolves.
- `callit.prediction.mine-completed` — sent to the owner when their own prediction resolves, including the result.

Creation notifications include the player name, tracker, direction, and wager and link to the tracker page. Completion notifications include the tracker, direction, result, and profit/loss; the owner notification links to their prediction page, while the others' notification links to the tracker page.

## Settings and scheduling

`callit_settings` is a singleton row with:
- `update_interval_minutes` (default 15; allowed 5, 10, 15, 20, 30, 60)
- `max_active_predictions_per_user` (default 6; allowed 1–50)
- `last_sync_at`, `last_sync_error`

Per-user display preferences are stored in `callit_preference`:
- `user_id` (primary key, cascades with the user)
- `chart_type` (`line` or `candlestick`, default `line`)
- `updated_at`

`GET /callit/preferences` returns the signed-in user's preference and `PUT /callit/preferences` updates it. The preference applies to all Call it price charts, including overview cards, the prediction form preview, tracker detail, and the admin preview.

The task schedule uses five-field UTC cron:
- `*/5`, `*/10`, `*/15`, `*/20`, `*/30`, or `0 * * * *` for 60 minutes.
- On startup the persisted interval is read, the schedule is upserted, and one immediate sync is queued.
- Admin interval changes reschedule the task immediately.
- The 1-day chart updates at the sync cadence, but 15-minute candles are refreshed at most every 15 minutes.

## Realtime events

All events are thin. Prediction, user-stat, tracker, and settings events are published on `public`; the per-user chart preference is published on `user:<userId>`:

- `callit.prediction.changed` — `entityId` = prediction ID
- `callit.user-stats.changed` — `entityId` = user ID
- `callit.tracker.changed` — `entityId` = tracker ID
- `callit.settings.changed` — `entityId` = `callit-settings`
- `callit.preferences.changed` — `entityId` = `callit-preferences`, private to the owning user

Frontend pages match the relevant ID, refetch persisted state, and also refetch on reconnect.

## Frontend

- `/callit` — current user's active predictions, other users' active predictions (each card links to that user's Call-it page via "Alle ansehen"), a leaderboard, and a tracker section below the leaderboard with mini price charts. The tracker section has a symbol/name search filter and the shared 1-day/7-day/30-day/90-day/1-year/5-year range selector. Predictions, leaderboard entries, and trackers are paginated client-side with per-file page-size constants.
- Leaderboard ranking uses net profit including open predictions: completed profit plus the unrealized profit/loss of active predictions at the tracker's last price. Rows show the open count, current value, and an "Alle ansehen" link to the user's Call-it page next to the name. `CallItStats.allTimeProfit` remains completed-only, while `CallItStats.unrealizedProfit` exposes the open value shown as "Aktuell (+/-)" on the main stats row, the user page, and the profile card.
- `/callit/users/[id]` — active and completed predictions (paginated) plus stats including the current open value.
- `/callit/create` — tracker/direction/duration/wager form, including the active-prediction limit, a shared time-range selector (default 30 days) and price chart for the selected tracker, and direction buttons with up/down arrow icons.
- `/callit/trackers/[id]` — tracker price history with the shared 1-day/7-day/30-day/90-day/1-year/5-year range selector, paginated active/completed predictions, and the shared comments panel. Charts show top, bottom, and current price labels on the right edge.
- Price charts use `PriceHistoryChart`, which selects `LinePriceChart` or `CandlestickPriceChart` based on the signed-in user's preference. Both variants receive the same OHLC history array; the line chart plots closes and the candlestick chart renders open/high/low/close candles. The 1-day range uses 15-minute candles, the 7-day range uses hourly candles, and longer ranges use daily candles. Candlesticks use a candle-specific x layout so session boundaries do not overlay candles, and a minimum body height keeps tiny/doji bodies visible. The preference is editable in the settings dialog's "Präferenzen" tab and updates charts immediately.
- Every prediction card shows a direction badge with an up or down arrow.
- Profile page: `CallItStatsCard` shows active wager count/total, all-time profit, current open value, and a link to the per-user page. It refreshes on user-stat, tracker-price, and reconnect events.
- Admin settings: `CallItAdminSettings` in the user settings dialog, visible only for admins. Adding a tracker requires a successful preview for the current symbol (quote, market state, 30-day chart, and existing-tracker status), and each tracker row offers a soft "Entfernen" plus a destructive "Vollständig entfernen" action.
- Shared reaction UI: `frontend/src/lib/components/Reactions.svelte`, used by both CrewNow and predictions.
- Dashboard activity feed: CrewNow and Call it items show the canonical comment count of their discussion and the reaction count of their target; Call it items show the tracker discussion count and the prediction reaction count.

## Deliberately out of scope in the first version

- Wallet or balance enforcement.
- Prediction cancellation or editing.
- Automatic voiding of predictions for symbols that stop returning data.
- History pruning/retention policy.
