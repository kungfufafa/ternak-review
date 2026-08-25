CREATE TABLE `clicks` (
	`id` text PRIMARY KEY NOT NULL,
	`unit_id` text NOT NULL,
	`at` integer NOT NULL,
	`user_agent` text,
	`ip_hash` text,
	FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `clicks_unit_idx` ON `clicks` (`unit_id`);--> statement-breakpoint
CREATE INDEX `clicks_unit_at_idx` ON `clicks` (`unit_id`,`at`);--> statement-breakpoint
CREATE TABLE `magic_link_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`token_hash` text NOT NULL,
	`pending_unit_id` text,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`pending_unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `magic_link_tokens_token_hash_unique` ON `magic_link_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `magic_link_email_idx` ON `magic_link_tokens` (`email`);--> statement-breakpoint
CREATE TABLE `outlets` (
	`id` text PRIMARY KEY NOT NULL,
	`google_place_id` text NOT NULL,
	`name` text NOT NULL,
	`formatted_address` text,
	`photo_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outlets_google_place_id_unique` ON `outlets` (`google_place_id`);--> statement-breakpoint
CREATE TABLE `owners` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `owners_email_unique` ON `owners` (`email`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`bucket_key` text NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_limits_bucket_idx` ON `rate_limits` (`bucket_key`,`window_start`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_owner_idx` ON `sessions` (`owner_id`);--> statement-breakpoint
CREATE TABLE `units` (
	`id` text PRIMARY KEY NOT NULL,
	`public_id` text NOT NULL,
	`type` text DEFAULT 'QR' NOT NULL,
	`status` text DEFAULT 'IN_STOCK' NOT NULL,
	`owner_id` text,
	`outlet_id` text,
	`activated_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`outlet_id`) REFERENCES `outlets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `units_public_id_unique` ON `units` (`public_id`);--> statement-breakpoint
CREATE INDEX `units_owner_idx` ON `units` (`owner_id`);--> statement-breakpoint
CREATE INDEX `units_outlet_idx` ON `units` (`outlet_id`);--> statement-breakpoint
CREATE INDEX `units_status_idx` ON `units` (`status`);