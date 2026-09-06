CREATE TABLE `site_settings` (
	`id` text PRIMARY KEY DEFAULT 'primary' NOT NULL,
	`home_enabled` integer DEFAULT true NOT NULL,
	`affiliate_enabled` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL
);
