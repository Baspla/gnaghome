CREATE TABLE `activity_feed_item` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`actor_user_id` text,
	`subject_user_id` text,
	`target_type` text,
	`target_id` text,
	`data` text DEFAULT '{}' NOT NULL,
	`occurred_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`subject_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "activity_feed_item_target_pair_check" CHECK(("activity_feed_item"."target_type" is null) = ("activity_feed_item"."target_id" is null))
);
--> statement-breakpoint
CREATE INDEX `activity_feed_item_order_idx` ON `activity_feed_item` (`occurred_at`,`id`);--> statement-breakpoint
CREATE INDEX `activity_feed_item_actor_idx` ON `activity_feed_item` (`actor_user_id`);--> statement-breakpoint
CREATE INDEX `activity_feed_item_subject_idx` ON `activity_feed_item` (`subject_user_id`);--> statement-breakpoint
CREATE INDEX `activity_feed_item_target_idx` ON `activity_feed_item` (`target_type`,`target_id`);