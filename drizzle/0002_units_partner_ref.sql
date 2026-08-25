ALTER TABLE `units` ADD `partner_ref` text;--> statement-breakpoint
CREATE INDEX `units_partner_idx` ON `units` (`partner_ref`);