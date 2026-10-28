# Realtime gateway

Centrifugo delivers realtime platform events to connected clients. The current setup uses per-user channels (`user:<userId>`) for user-scoped events, plus explicitly authorized shared channels where an app needs group-wide updates. The counter app uses `counter:global`; only authenticated clients receive tokens that authorize this channel.

Events use a shared discriminated DTO union with a dedicated payload schema/type for each event. The frontend validates publications against that union before dispatching them. Publish only events the subscribed user is authorized to observe. Events are notifications that client state may have changed; persisted database records remain canonical, and clients should refetch after reconnects or missed events.

The counter app publishes `counter.changed` on `counter:global` after committing both the user's count and the global count in SQLite. The event contains the updated global count; counter clients refetch their own and global counts from the authenticated API when they receive the event or reconnect.

Keep Centrifugo optional to durable business operations where practical. If it is unreachable during local development, check that Docker and the Centrifugo container are running before treating it as an application issue.