CREATE TABLE `affiliate_settings` (
	`id` text PRIMARY KEY DEFAULT 'primary' NOT NULL,
	`webhook_cipher` text,
	`verified_at` integer,
	`updated_at` integer NOT NULL
);
