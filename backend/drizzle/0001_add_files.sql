CREATE TABLE `stored_file` (
	`id` text PRIMARY KEY NOT NULL,
	`storage_key` text NOT NULL,
	`uploaded_by_user_id` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`is_private` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stored_file_storage_key_unique` ON `stored_file` (`storage_key`);--> statement-breakpoint
CREATE INDEX `stored_file_uploader_idx` ON `stored_file` (`uploaded_by_user_id`);