CREATE TABLE `user_profile` (
	`user_id` text PRIMARY KEY NOT NULL,
	`bio` text,
	`accent_color` text DEFAULT '#6366f1' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `user_profile` (`user_id`)
SELECT `id` FROM `user`;
