ALTER TABLE `prospects` ADD `install_kind` text DEFAULT 'NONE' NOT NULL;--> statement-breakpoint
ALTER TABLE `prospects` ADD `trial_started_at` integer;--> statement-breakpoint
ALTER TABLE `prospects` ADD `trial_ends_at` integer;--> statement-breakpoint
ALTER TABLE `prospects` ADD `trial_collected_at` integer;--> statement-breakpoint
CREATE INDEX `prospects_install_idx` ON `prospects` (`install_kind`);--> statement-breakpoint
CREATE INDEX `prospects_trial_ends_idx` ON `prospects` (`trial_ends_at`);--> statement-breakpoint
UPDATE `prospects` SET `install_kind` = 'SOLD' WHERE `status` = 'WON';
