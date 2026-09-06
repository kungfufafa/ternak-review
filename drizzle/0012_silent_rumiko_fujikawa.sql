CREATE TABLE `review_feedbacks` (
	`id` text PRIMARY KEY NOT NULL,
	`unit_id` text NOT NULL,
	`rating` integer NOT NULL,
	`message` text NOT NULL,
	`owner_whatsapp` text NOT NULL,
	`status` text DEFAULT 'QUEUED' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lease_until` integer,
	`gateway_message_id` text,
	`delivery_error` text,
	`created_at` integer NOT NULL,
	`submitted_at` integer,
	`delivered_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `review_feedback_unit_idx` ON `review_feedbacks` (`unit_id`);--> statement-breakpoint
CREATE INDEX `review_feedback_status_idx` ON `review_feedbacks` (`status`);--> statement-breakpoint
CREATE INDEX `review_feedback_created_idx` ON `review_feedbacks` (`created_at`);--> statement-breakpoint
CREATE TABLE `whatsapp_commands` (
	`id` text PRIMARY KEY NOT NULL,
	`command` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`acknowledged_at` integer
);
--> statement-breakpoint
CREATE INDEX `whatsapp_commands_status_idx` ON `whatsapp_commands` (`status`);--> statement-breakpoint
CREATE TABLE `whatsapp_gateway_state` (
	`id` text PRIMARY KEY DEFAULT 'primary' NOT NULL,
	`status` text DEFAULT 'OFFLINE' NOT NULL,
	`worker_id` text,
	`qr` text,
	`last_heartbeat_at` integer,
	`updated_at` integer NOT NULL,
	`last_error` text
);
--> statement-breakpoint
ALTER TABLE `units` ADD `service_tier` text DEFAULT 'BASIC' NOT NULL;--> statement-breakpoint
ALTER TABLE `units` ADD `review_mode` text DEFAULT 'GOOGLE_DIRECT' NOT NULL;--> statement-breakpoint
ALTER TABLE `units` ADD `owner_whatsapp` text;--> statement-breakpoint
CREATE INDEX `units_review_mode_idx` ON `units` (`review_mode`);