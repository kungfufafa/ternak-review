CREATE TABLE `email_otps` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`email` text NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`consumed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `email_otps_owner_idx` ON `email_otps` (`owner_id`);--> statement-breakpoint
CREATE INDEX `email_otps_email_idx` ON `email_otps` (`email`);--> statement-breakpoint
CREATE TABLE `smtp_settings` (
	`id` text PRIMARY KEY DEFAULT 'primary' NOT NULL,
	`host` text DEFAULT '' NOT NULL,
	`port` integer DEFAULT 587 NOT NULL,
	`secure` integer DEFAULT false NOT NULL,
	`username` text,
	`password_cipher` text,
	`from_name` text,
	`from_email` text DEFAULT '' NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`verified_at` integer,
	`updated_at` integer NOT NULL
);
