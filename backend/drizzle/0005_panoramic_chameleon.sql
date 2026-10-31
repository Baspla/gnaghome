CREATE TABLE `platform_task` (
	`id` text PRIMARY KEY NOT NULL,
	`task_type` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`run_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`last_error` text,
	`source_schedule_key` text,
	`scheduled_for` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `platform_task_ready_idx` ON `platform_task` (`status`,`run_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `platform_task_type_idx` ON `platform_task` (`task_type`,`status`);--> statement-breakpoint
CREATE INDEX `platform_task_created_idx` ON `platform_task` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `platform_task_schedule_occurrence_uidx` ON `platform_task` (`source_schedule_key`,`scheduled_for`);--> statement-breakpoint
CREATE TABLE `platform_task_schedule` (
	`schedule_key` text PRIMARY KEY NOT NULL,
	`task_type` text NOT NULL,
	`payload` text NOT NULL,
	`cron_expression` text NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`next_run_at` integer NOT NULL,
	`last_run_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `platform_task_schedule_due_idx` ON `platform_task_schedule` (`enabled`,`next_run_at`);