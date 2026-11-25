CREATE TABLE `callit_price_candle` (
	`tracker_id` text NOT NULL,
	`interval` text NOT NULL,
	`ts` integer NOT NULL,
	`open` real NOT NULL,
	`high` real NOT NULL,
	`low` real NOT NULL,
	`close` real NOT NULL,
	`volume` integer,
	PRIMARY KEY(`tracker_id`, `interval`, `ts`),
	FOREIGN KEY (`tracker_id`) REFERENCES `callit_tracker`(`id`) ON UPDATE no action ON DELETE cascade
);
