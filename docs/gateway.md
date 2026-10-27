# Realtime gateway

Centrifugo delivers realtime platform events to connected clients. The current setup uses a per-user channel (`user:<userId>`) to keep subscription management simple for the expected small deployment.

Events are typed with a generic platform-event envelope, not chat-specific DTOs. Publish only events the subscribed user is authorized to observe. Events are notifications that client state may have changed; persisted database records remain canonical, and clients should refetch after reconnects or missed events.

Keep Centrifugo optional to durable business operations where practical. If it is unreachable during local development, check that Docker and the Centrifugo container are running before treating it as an application issue.