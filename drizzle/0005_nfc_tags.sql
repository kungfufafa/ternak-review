CREATE TABLE `nfc_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`public_id` text NOT NULL,
	`unit_id` text,
	`batch_id` text,
	`batch_seq` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`batch_id`) REFERENCES `stock_batches`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `nfc_tags_public_id_unique` ON `nfc_tags` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `nfc_tags_unit_id_unique` ON `nfc_tags` (`unit_id`);--> statement-breakpoint
CREATE INDEX `nfc_tags_batch_idx` ON `nfc_tags` (`batch_id`);--> statement-breakpoint
CREATE INDEX `nfc_tags_unit_idx` ON `nfc_tags` (`unit_id`);