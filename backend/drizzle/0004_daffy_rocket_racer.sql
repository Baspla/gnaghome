CREATE TABLE `discussion` (
	`id` text PRIMARY KEY NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `discussion_target_uidx` ON `discussion` (`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `discussion_target_type_idx` ON `discussion` (`target_type`);--> statement-breakpoint
CREATE TABLE `discussion_message` (
	`id` text PRIMARY KEY NOT NULL,
	`discussion_id` text NOT NULL,
	`author_user_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`edited_at` integer,
	FOREIGN KEY (`discussion_id`) REFERENCES `discussion`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `discussion_message_order_idx` ON `discussion_message` (`discussion_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `discussion_message_author_idx` ON `discussion_message` (`author_user_id`);--> statement-breakpoint
ALTER TABLE `activity_feed_item` ADD `discussion_id` text REFERENCES discussion(id);--> statement-breakpoint
ALTER TABLE `crewnow_post` ADD `discussion_id` text REFERENCES discussion(id);