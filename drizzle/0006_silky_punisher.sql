CREATE TABLE `affiliate_leads` (
	`id` text PRIMARY KEY NOT NULL,
	`nama` text NOT NULL,
	`email` text NOT NULL,
	`whatsapp` text NOT NULL,
	`platforms` text NOT NULL,
	`usernames` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `affiliate_leads_email_idx` ON `affiliate_leads` (`email`);--> statement-breakpoint
CREATE INDEX `affiliate_leads_created_idx` ON `affiliate_leads` (`created_at`);