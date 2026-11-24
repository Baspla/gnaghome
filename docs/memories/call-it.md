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
- The admin UI requires a successful symbol preview before enabling the add action. Preview validates the symbol against Yahoo Finance and returns the resolved name, currency, current price, market state, 30-day history, and whether an active or removed tracker already exists for it; it persists nothing.

## Market data and price history

- Provider: `yahoo-finance2` v4 in `backend/src/integrations/yahoo-finance/client.ts`.
- The app depends on the `MarketDataClient` contract, not on Yahoo directly.
- Batched sync uses `quote(symbols, { fields })`; v4 supports multiple symbols in one request.
- Tracker validation and the 30-day backfill use `chart(symbol, { interval: '15m' })`; the long-range backfill uses `chart(symbol, { interval: '1d' })`.
- Each tracker has persisted price history in `callit_price_snapshot` with a `(tracker_id, observed_at)` primary key and `source` of `sync`, `backfill`, `quote`, or `history`.
- Scheduled snapshots are only appended while Yahoo reports `REGULAR` market state (or when the state is unknown). Closed, pre-market, and post-market syncs still update the tracker's current price and resolve due predictions, but do not append flat history points.
- The chart additionally compacts long flat runs (more than two hours) and collapses non-trading time: points separated by more than two hours form separate trading sessions, every session gets an equal-width slot, and consecutive sessions join at their boundary, so nights, weekends, and holidays take no horizontal space. Points keep their relative time position inside a session. This keeps long ranges that mix daily and 15-minute points proportionally correct.
- New trackers backfill the last 30 days of 15-minute closes and five years of daily closes on creation. The five-year daily series covers both the 1-year and 5-year views. Reactivating a tracker refreshes the five-year series so long removal gaps are filled. Backfill failure does not fail tracker creation; the scheduled sync fills future points, and long-range views retry the long backfill lazily.
- Tracker pages read persisted history. If a range longer than 30 days is requested and the tracker has no `history`-source rows yet, the service fetches five years of daily closes once and persists them before returning; later reads use the cache. This also backfills trackers created before the long-range cache existed.
- History is currently retained indefinitely. At 15-minute intervals this is about 35k rows per tracker per year; five years of daily closes add roughly 1.3k rows per tracker, acceptable for the SQLite deployment.
- The tracker-detail API accepts ranges up to 1825 days and downsamples large ranges to at most 1000 chart points; the full snapshot history remains in SQLite.
- Prices and history are displayed in the tracker's Yahoo currency. Non-ISO Yahoo codes such as `GBp` fall back to `number + code` instead of being treated as GBP.
- Wagers and profit/loss are always displayed as virtual EUR.

## Backend ownership

- App: `backend/src/apps/callit/`
  - `schema.ts`: trackers, price snapshots, predictions, settings.
  - `service.ts`: tracker management, prediction creation, overview/user/tracker reads, price sync, resolution.
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

The task schedule uses five-field UTC cron:
- `*/5`, `*/10`, `*/15`, `*/20`, `*/30`, or `0 * * * *` for 60 minutes.
- On startup the persisted interval is read, the schedule is upserted, and one immediate sync is queued.
- Admin interval changes reschedule the task immediately.

## Realtime events

All events are thin and published on `public`:

- `callit.prediction.changed` — `entityId` = prediction ID
- `callit.user-stats.changed` — `entityId` = user ID
- `callit.tracker.changed` — `entityId` = tracker ID
- `callit.settings.changed` — `entityId` = `callit-settings`

Frontend pages match the relevant ID, refetch persisted state, and also refetch on reconnect.

## Frontend

- `/callit` — current user's active predictions, other users' active predictions, an all-time net-profit leaderboard, and a tracker section below the leaderboard with a 7-day mini price chart for every active tracker. The leaderboard includes users with at least one prediction; active-only users appear with 0 completed predictions and 0 profit.
- `/callit/users/[id]` — active and completed predictions plus stats.
- `/callit/create` — tracker/direction/duration/wager form, including the active-prediction limit and a 30-day price chart for the selected tracker.
- `/callit/trackers/[id]` — tracker price history with 1-day, 7-day, 30-day, 90-day, 1-year, and 5-year ranges, active/completed predictions, and the shared comments panel. Charts show top, bottom, and current price labels on the right edge.
- Profile page: `CallItStatsCard` shows active wager count/total, all-time profit, and a link to the per-user page.
- Admin settings: `CallItAdminSettings` in the user settings dialog, visible only for admins. Adding a tracker requires a successful preview for the current symbol (quote, market state, 30-day chart, and existing-tracker status), and each tracker row offers a soft "Entfernen" plus a destructive "Vollständig entfernen" action.
- Shared reaction UI: `frontend/src/lib/components/Reactions.svelte`, used by both CrewNow and predictions.
- Dashboard activity feed: CrewNow and Call it items show the canonical comment count of their discussion and the reaction count of their target; Call it items show the tracker discussion count and the prediction reaction count.

## Deliberately out of scope in the first version

- Wallet or balance enforcement.
- Prediction cancellation or editing.
- Automatic voiding of predictions for symbols that stop returning data.
- History pruning/retention policy.
