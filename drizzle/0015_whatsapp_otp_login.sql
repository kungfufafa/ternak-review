CREATE TABLE `login_otps` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`whatsapp` text NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`consumed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `login_otps_owner_idx` ON `login_otps` (`owner_id`);--> statement-breakpoint
CREATE INDEX `login_otps_whatsapp_idx` ON `login_otps` (`whatsapp`);--> statement-breakpoint
CREATE TABLE `whatsapp_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`to` text NOT NULL,
	`message` text NOT NULL,
	`kind` text DEFAULT 'OTP' NOT NULL,
	`status` text DEFAULT 'QUEUED' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lease_until` integer,
	`gateway_message_id` text,
	`delivery_error` text,
	`created_at` integer NOT NULL,
	`submitted_at` integer,
	`delivered_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `whatsapp_outbox_status_idx` ON `whatsapp_outbox` (`status`);--> statement-breakpoint
CREATE INDEX `whatsapp_outbox_created_idx` ON `whatsapp_outbox` (`created_at`);--> statement-breakpoint
ALTER TABLE `owners` ADD `whatsapp` text;--> statement-breakpoint
CREATE UNIQUE INDEX `owners_whatsapp_unique` ON `owners` (`whatsapp`);