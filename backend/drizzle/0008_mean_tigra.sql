CREATE TABLE `crewnow_preference` (
	`user_id` text PRIMARY KEY NOT NULL,
	`mirror_front_preview` integer DEFAULT true NOT NULL,
	`capture_delay_seconds` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
