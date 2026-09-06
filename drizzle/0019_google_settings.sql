CREATE TABLE `google_settings` (
	`id` text PRIMARY KEY DEFAULT 'primary' NOT NULL,
	`api_key_cipher` text,
	`last4` text,
	`verified_at` integer,
	`updated_at` integer NOT NULL
);
