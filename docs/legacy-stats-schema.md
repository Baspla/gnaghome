CREATE TABLE discord_game_activity (
                timestamp INTEGER,
                discord_id TEXT,
                game_name TEXT
            , collection_interval INTEGER);
CREATE TABLE IF NOT EXISTS "discord_voice_activity"(
  timestamp,
  discord_id TEXT,
  channel_name TEXT,
  guild_id TEXT
, collection_interval INTEGER, self_deaf INTEGER DEFAULT 0, self_mute INTEGER DEFAULT 0, self_stream INTEGER DEFAULT 0, self_video INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS "discord_voice_channels"(
  timestamp,
  channel_name TEXT,
  guild_id TEXT,
  user_count,
  tracked_users
, collection_interval INTEGER);
CREATE TABLE IF NOT EXISTS "steam_game_activity"(
  timestamp,
  steam_id TEXT,
  game_name TEXT
, collection_interval INTEGER);
CREATE INDEX idx_discord_voice_activity_timestamp
            ON discord_voice_activity(timestamp)
        ;
CREATE INDEX idx_discord_voice_channels_timestamp
            ON discord_voice_channels(timestamp)
        ;
CREATE INDEX idx_discord_game_activity_timestamp
            ON discord_game_activity(timestamp)
        ;
CREATE INDEX idx_steam_game_activity_timestamp
            ON steam_game_activity(timestamp)
        ;