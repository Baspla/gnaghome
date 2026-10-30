ALTER TABLE `stored_file` ADD `status` text DEFAULT 'ready' NOT NULL;--> statement-breakpoint
ALTER TABLE `stored_file` ADD `expires_at` integer;--> statement-breakpoint
CREATE INDEX `stored_file_expiry_idx` ON `stored_file` (`status`,`expires_at`);