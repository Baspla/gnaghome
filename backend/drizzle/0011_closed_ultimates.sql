CREATE TABLE `callit_prediction` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`tracker_id` text NOT NULL,
	`direction` text NOT NULL,
	`duration_key` text NOT NULL,
	`wager` integer NOT NULL,
	`start_price` real NOT NULL,
	`start_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`end_price` real,
	`resolved_at` integer,
	`profit_loss` integer,
	`price_change_percent` real,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tracker_id`) REFERENCES `callit_tracker`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `callit_prediction_user_status_idx` ON `callit_prediction` (`user_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `callit_prediction_tracker_status_idx` ON `callit_prediction` (`tracker_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `callit_prediction_due_idx` ON `callit_prediction` (`status`,`ends_at`);--> statement-breakpoint
CREATE TABLE `callit_price_snapshot` (
	`tracker_id` text NOT NULL,
	`observed_at` integer NOT NULL,
	`price` real NOT NULL,
	`currency` text,
	`source` text DEFAULT 'sync' NOT NULL,
	`fetched_at` integer NOT NULL,
	PRIMARY KEY(`tracker_id`, `observed_at`),
	FOREIGN KEY (`tracker_id`) REFERENCES `callit_tracker`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `callit_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`update_interval_minutes` integer DEFAULT 15 NOT NULL,
	`max_active_predictions_per_user` integer DEFAULT 6 NOT NULL,
	`last_sync_at` integer,
	`last_sync_error` text,
	`updated_by_user_id` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `callit_tracker` (
	`id` text PRIMARY KEY NOT NULL,
	`symbol` text NOT NULL,
	`name` text NOT NULL,
	`currency` text,
	`is_active` integer DEFAULT true NOT NULL,
	`last_price` real,
	`last_price_at` integer,
	`discussion_id` text,
	`created_by_user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`discussion_id`) REFERENCES `discussion`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `callit_tracker_symbol_unique` ON `callit_tracker` (`symbol`);--> statement-breakpoint
CREATE INDEX `callit_tracker_active_idx` ON `callit_tracker` (`is_active`,`symbol`);--> statement-breakpoint
CREATE UNIQUE INDEX `callit_tracker_discussion_uidx` ON `callit_tracker` (`discussion_id`);