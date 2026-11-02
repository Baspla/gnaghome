CREATE TABLE `custom_emoji` (
	`name` text PRIMARY KEY NOT NULL,
	`file_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`file_id`) REFERENCES `stored_file`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `custom_emoji_file_id_unique` ON `custom_emoji` (`file_id`);--> statement-breakpoint
CREATE INDEX `custom_emoji_created_idx` ON `custom_emoji` (`created_at`,`name`);