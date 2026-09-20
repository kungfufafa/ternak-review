CREATE TABLE `prospects` (
	`id` text PRIMARY KEY NOT NULL,
	`google_place_id` text NOT NULL,
	`name` text NOT NULL,
	`formatted_address` text,
	`rating` real,
	`user_rating_count` integer,
	`google_maps_uri` text,
	`primary_type` text,
	`notes` text,
	`status` text DEFAULT 'NEW' NOT NULL,
	`partner_ref` text,
	`created_by_owner_id` text,
	`unit_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by_owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "prospects_status_check" CHECK("prospects"."status" IN ('NEW', 'CONTACTED', 'WON', 'LOST'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prospects_google_place_id_unique` ON `prospects` (`google_place_id`);--> statement-breakpoint
CREATE INDEX `prospects_status_idx` ON `prospects` (`status`);--> statement-breakpoint
CREATE INDEX `prospects_partner_idx` ON `prospects` (`partner_ref`);--> statement-breakpoint
CREATE INDEX `prospects_created_idx` ON `prospects` (`created_at`);--> statement-breakpoint
ALTER TABLE `outlets` ADD `baseline_rating` real;--> statement-breakpoint
ALTER TABLE `outlets` ADD `baseline_user_rating_count` integer;--> statement-breakpoint
ALTER TABLE `outlets` ADD `baseline_captured_at` integer;