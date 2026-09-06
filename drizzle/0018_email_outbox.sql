CREATE TABLE `email_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text DEFAULT 'NOTICE' NOT NULL,
	`to` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`provider` text NOT NULL,
	`from_address` text NOT NULL,
	`status` text DEFAULT 'QUEUED' NOT NULL,
	`provider_message_id` text,
	`delivery_error` text,
	`created_at` integer NOT NULL,
	`sent_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `email_outbox_status_idx` ON `email_outbox` (`status`);--> statement-breakpoint
CREATE INDEX `email_outbox_created_idx` ON `email_outbox` (`created_at`);