ALTER TABLE `owners` ADD `name` text;--> statement-breakpoint
ALTER TABLE `owners` ADD `role` text DEFAULT 'ADMIN' NOT NULL;--> statement-breakpoint
ALTER TABLE `owners` ADD `status` text DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE `owners` ADD `pin_hash` text;