CREATE TABLE `stock_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`type` text DEFAULT 'QR' NOT NULL,
	`count` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `units` ADD `batch_id` text REFERENCES stock_batches(id);--> statement-breakpoint
ALTER TABLE `units` ADD `batch_seq` integer;--> statement-breakpoint
CREATE INDEX `units_batch_idx` ON `units` (`batch_id`);