CREATE TABLE `crewnow_post` (
	`id` text PRIMARY KEY NOT NULL,
	`author_user_id` text NOT NULL,
	`back_image_file_id` text NOT NULL,
	`front_image_file_id` text NOT NULL,
	`caption` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`author_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`back_image_file_id`) REFERENCES `stored_file`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`front_image_file_id`) REFERENCES `stored_file`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `crewnow_post_timeline_idx` ON `crewnow_post` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `crewnow_post_author_idx` ON `crewnow_post` (`author_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `crewnow_post_back_file_uidx` ON `crewnow_post` (`back_image_file_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `crewnow_post_front_file_uidx` ON `crewnow_post` (`front_image_file_id`);--> statement-breakpoint
CREATE TABLE `crewnow_post_tag` (
	`post_id` text NOT NULL,
	`tagged_user_id` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `crewnow_post`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tagged_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `crewnow_post_tag_post_idx` ON `crewnow_post_tag` (`post_id`,`position`);--> statement-breakpoint
CREATE INDEX `crewnow_post_tag_user_idx` ON `crewnow_post_tag` (`tagged_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `crewnow_post_tag_pair_uidx` ON `crewnow_post_tag` (`post_id`,`tagged_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `activity_feed_item_crewnow_post_uidx` ON `activity_feed_item` (`target_type`,`target_id`) WHERE "activity_feed_item"."type" = 'crewnow.image_posted';