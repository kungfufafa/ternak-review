CREATE TABLE `owner_view_prefs` (
	`owner_id` text NOT NULL,
	`view` text NOT NULL,
	`prefs` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `view`),
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE cascade
);
