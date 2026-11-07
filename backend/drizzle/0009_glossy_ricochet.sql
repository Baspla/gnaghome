CREATE TABLE `reaction` (
	`id` text PRIMARY KEY NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`user_id` text NOT NULL,
	`emoji` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reaction_target_user_uidx` ON `reaction` (`target_type`,`target_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `reaction_target_idx` ON `reaction` (`target_type`,`target_id`);