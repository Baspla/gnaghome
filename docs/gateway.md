# Realtime gateway

The current setup uses per-user channels (`user:<userId>`) for user-scoped events, plus explicitly authorized shared channels where an app needs group-wide updates. The counter app uses `public:counter`, which matches the configured `public` namespace. Since that namespace enables `allow_subscribe_for_client`, any connected Centrifugo client can subscribe; only publish data that is safe to expose publicly.

Events use a shared discriminated DTO union with a dedicated payload schema/type for each event. The frontend validates publications against that union before dispatching them. Publish only events the subscribed user is authorized to observe. Events are notifications that client state may have changed; persisted database records remain canonical, and clients should refetch after reconnects or missed events.

The counter app publishes `counter.changed` on `public:counter` after committing both the user's count and the global count in SQLite. The event contains only the updated global count; the user's count remains available only through the authenticated API. Counter clients refetch their own and global counts from the API when they receive the event or reconnect. Any client permitted by the `public` namespace can receive this global update.

Keep Centrifugo optional to durable business operations where practical. If it is unreachable during local development, check that Docker and the Centrifugo container are running before treating it as an application issue.